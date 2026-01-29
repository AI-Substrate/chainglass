/**
 * useAgentSSE - SSE hook for agent streaming events
 *
 * @deprecated This hook is deprecated as of Plan 019: Agent Manager Refactor.
 * Use `useAgentManager` or `useAgentInstance` from `@/features/019-agent-manager-refactor` instead.
 *
 * New hooks provide:
 * - Single SSE channel at /api/agents/events (per ADR-0007)
 * - React Query integration for agent state
 * - Unified agent management across workspaces
 *
 * Migration guide:
 * - For agent list + SSE: Use `useAgentManager()`
 * - For single agent operations: Use `useAgentInstance(agentId)`
 *
 * See: apps/web/src/features/019-agent-manager-refactor/
 *
 * Specialized hook for handling agent-specific SSE events (text_delta, status, usage, error).
 * Unlike useSSE which handles generic onmessage events, this hook listens to named event types
 * as broadcast by the /api/agents/run endpoint.
 *
 * Per DYK-01 (Connect-First Pattern): Hook auto-connects on mount. Ensure this hook
 * is mounted BEFORE calling the API to avoid missing events.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat, Subtask 001)
 */

import type {
  AgentErrorEvent,
  AgentSessionStatusEvent,
  AgentTextDeltaEvent,
  AgentUsageUpdateEvent,
} from '@/lib/schemas/agent-events.schema';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Factory type for creating EventSource instances (for testing).
 */
export type EventSourceFactory = (url: string) => EventSource;

/**
 * Default factory using browser's EventSource.
 */
const defaultEventSourceFactory: EventSourceFactory = (url) => {
  // Guard for SSR/test environments where EventSource may not exist
  console.log(`[useAgentSSE] EventSource defined: ${typeof EventSource !== 'undefined'}`);
  if (typeof EventSource === 'undefined') {
    console.log('[useAgentSSE] Using no-op EventSource (SSR/test mode)');
    // Return a minimal no-op implementation
    return {
      close: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      onopen: null,
      onmessage: null,
      onerror: null,
      readyState: 0,
      url: url,
      withCredentials: false,
      CONNECTING: 0,
      OPEN: 1,
      CLOSED: 2,
      dispatchEvent: () => false,
    } as unknown as EventSource;
  }
  return new EventSource(url);
};

/**
 * Options for the agent SSE hook.
 */
export interface UseAgentSSEOptions {
  /** Whether to auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (default: 3) */
  maxReconnectAttempts?: number;
  /** Factory for creating EventSource (inject for testing) */
  eventSourceFactory?: EventSourceFactory;
}

/**
 * Callbacks for handling different agent event types.
 */
export interface AgentSSECallbacks {
  /** Called when text delta arrives (streaming content) */
  onTextDelta?: (delta: string, sessionId: string) => void;
  /** Called when status changes */
  onStatusChange?: (status: string, sessionId: string) => void;
  /** Called when usage info arrives */
  onUsageUpdate?: (
    usage: { tokensUsed: number; tokensTotal: number; tokensLimit?: number },
    sessionId: string
  ) => void;
  /** Called when an error occurs */
  onError?: (message: string, sessionId: string, code?: string) => void;
}

/**
 * Return type for the agent SSE hook.
 */
export interface UseAgentSSEReturn {
  /** Whether connected to SSE endpoint */
  isConnected: boolean;
  /** Current connection error, if any */
  error: Error | null;
  /** Manually connect to SSE */
  connect: () => void;
  /** Manually disconnect from SSE */
  disconnect: () => void;
}

/**
 * Hook for managing agent-specific SSE connections.
 *
 * @param channel - SSE channel name (e.g., 'agent-session-123')
 * @param callbacks - Event callbacks for different event types
 * @param options - Connection options
 * @returns Connection state and control functions
 *
 * @example
 * const { isConnected, error } = useAgentSSE(
 *   `agent-${sessionId}`,
 *   {
 *     onTextDelta: (delta) => dispatch({ type: 'APPEND_DELTA', delta }),
 *     onStatusChange: (status) => dispatch({ type: 'UPDATE_STATUS', status }),
 *     onError: (message) => dispatch({ type: 'SET_ERROR', error: { message } }),
 *   }
 * );
 */
export function useAgentSSE(
  channel: string | null,
  callbacks: AgentSSECallbacks,
  options: UseAgentSSEOptions = {}
): UseAgentSSEReturn {
  const {
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 3,
    eventSourceFactory = defaultEventSourceFactory,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in ref to avoid re-subscribing on every callback change
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Store event handler references for cleanup - MEM-001
  const handlersRef = useRef<{
    textDelta?: (event: MessageEvent) => void;
    status?: (event: MessageEvent) => void;
    usage?: (event: MessageEvent) => void;
    error?: (event: MessageEvent) => void;
  }>({});

  /**
   * Connect to the SSE endpoint.
   */
  const connect = useCallback(() => {
    console.log(`[useAgentSSE] connect() called, channel=${channel}`);
    if (!channel) {
      console.log('[useAgentSSE] No channel, skipping connect');
      return;
    }

    // Clear pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection and remove old listeners - MEM-001
    if (eventSourceRef.current) {
      const es = eventSourceRef.current;
      const handlers = handlersRef.current;
      if (handlers.textDelta) es.removeEventListener('agent_text_delta', handlers.textDelta);
      if (handlers.status) es.removeEventListener('agent_session_status', handlers.status);
      if (handlers.usage) es.removeEventListener('agent_usage_update', handlers.usage);
      if (handlers.error) es.removeEventListener('agent_error', handlers.error);
      handlersRef.current = {};
      es.close();
    }

    const url = `/api/events/${channel}`;
    console.log(`[useAgentSSE] Creating EventSource for: ${url}`);
    const eventSource = eventSourceFactory(url);
    console.log(`[useAgentSSE] EventSource created, readyState=${eventSource.readyState}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[useAgentSSE] Connected to channel: ${channel}`);
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    // Listen for agent-specific event types - MEM-001: store handlers for cleanup
    const handleTextDelta = (event: MessageEvent) => {
      console.log('[useAgentSSE] Received text_delta event');
      try {
        const parsed = JSON.parse(event.data) as AgentTextDeltaEvent;
        callbacksRef.current.onTextDelta?.(parsed.data.delta, parsed.data.sessionId);
      } catch (e) {
        console.warn('useAgentSSE: Failed to parse text_delta event:', e);
      }
    };
    eventSource.addEventListener('agent_text_delta', handleTextDelta);
    handlersRef.current.textDelta = handleTextDelta;

    const handleStatus = (event: MessageEvent) => {
      console.log('[useAgentSSE] Received session_status event:', event.data);
      try {
        const parsed = JSON.parse(event.data) as AgentSessionStatusEvent;
        callbacksRef.current.onStatusChange?.(parsed.data.status, parsed.data.sessionId);
      } catch (e) {
        console.warn('useAgentSSE: Failed to parse session_status event:', e);
      }
    };
    eventSource.addEventListener('agent_session_status', handleStatus);
    handlersRef.current.status = handleStatus;

    const handleUsage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as AgentUsageUpdateEvent;
        callbacksRef.current.onUsageUpdate?.(
          {
            tokensUsed: parsed.data.tokensUsed,
            tokensTotal: parsed.data.tokensTotal,
            tokensLimit: parsed.data.tokensLimit,
          },
          parsed.data.sessionId
        );
      } catch (e) {
        console.warn('useAgentSSE: Failed to parse usage_update event:', e);
      }
    };
    eventSource.addEventListener('agent_usage_update', handleUsage);
    handlersRef.current.usage = handleUsage;

    const handleError = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as AgentErrorEvent;
        callbacksRef.current.onError?.(
          parsed.data.message,
          parsed.data.sessionId,
          parsed.data.code
        );
      } catch (e) {
        console.warn('useAgentSSE: Failed to parse error event:', e);
      }
    };
    eventSource.addEventListener('agent_error', handleError);
    handlersRef.current.error = handleError;

    eventSource.onerror = (err) => {
      console.log('[useAgentSSE] Connection error:', err);
      setIsConnected(false);
      setError(new Error('Agent SSE connection error'));
      eventSource.close();

      // Attempt reconnection
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    };
  }, [channel, reconnectDelay, maxReconnectAttempts, eventSourceFactory]);

  /**
   * Disconnect from SSE endpoint.
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      // Remove event listeners before closing - MEM-001
      const es = eventSourceRef.current;
      const handlers = handlersRef.current;
      if (handlers.textDelta) es.removeEventListener('agent_text_delta', handlers.textDelta);
      if (handlers.status) es.removeEventListener('agent_session_status', handlers.status);
      if (handlers.usage) es.removeEventListener('agent_usage_update', handlers.usage);
      if (handlers.error) es.removeEventListener('agent_error', handlers.error);
      handlersRef.current = {};
      es.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Auto-connect when channel changes
  useEffect(() => {
    if (autoConnect && channel) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, channel, connect, disconnect]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
  };
}
