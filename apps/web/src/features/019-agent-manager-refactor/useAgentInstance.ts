'use client';

/**
 * useAgentInstance - React hook for single agent operations
 *
 * Per Plan 019 AC-07, AC-09, AC-10: Web can run prompts, get events, and subscribe to updates.
 * Per DYK-19: Returns { agent: null } on 404; caller decides whether to create, redirect, or show empty state.
 * Per DYK-17: New hook for Plan 019; part of unified agent management system.
 *
 * Features:
 * - Fetch single agent with event history
 * - Subscribe to agent-specific events via SSE (filtered by agentId)
 * - Run prompts on agent
 * - Real-time status/intent updates
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 4: Web Integration)
 */

import type {
  AgentInstanceStatus,
  AgentRunOptions,
  AgentStoredEvent,
  AgentType,
} from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

// ============ Types ============

/**
 * Agent data with events from API.
 */
export interface AgentInstanceData {
  id: string;
  name: string;
  type: AgentType;
  workspace: string;
  status: AgentInstanceStatus;
  intent: string;
  sessionId: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  events: AgentStoredEvent[];
}

/**
 * Agent event payload from SSE.
 */
export interface AgentSSEEvent {
  agentId: string;
  [key: string]: unknown;
}

/**
 * Options for useAgentInstance hook.
 */
export interface UseAgentInstanceOptions {
  /** Enable SSE subscription (default: true) */
  subscribeToSSE?: boolean;
  /** Callback when agent event arrives */
  onAgentEvent?: (eventType: string, data: AgentSSEEvent) => void;
}

/**
 * Return type for useAgentInstance hook.
 */
export interface UseAgentInstanceReturn {
  /** Agent data (null if not found, undefined while loading) */
  agent: AgentInstanceData | null | undefined;
  /** Current status (shortcut to agent.status) */
  status: AgentInstanceStatus | null;
  /** Current intent (shortcut to agent.intent) */
  intent: string | null;
  /** Event history (shortcut to agent.events) */
  events: AgentStoredEvent[];
  /** Whether agent is currently working */
  isWorking: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** SSE connection state */
  isConnected: boolean;
  /** Run prompt on agent */
  run: (options: AgentRunOptions) => Promise<void>;
  /** Refetch agent data */
  refetch: () => void;
}

// ============ Constants ============

const AGENT_QUERY_KEY = 'agent';
const SSE_ENDPOINT = '/api/agents/events';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ============ Hook Implementation ============

/**
 * Hook for managing a single agent instance.
 *
 * Per DYK-19: Returns { agent: null } on 404; caller decides response.
 */
export function useAgentInstance(
  agentId: string,
  options: UseAgentInstanceOptions = {}
): UseAgentInstanceReturn {
  const { subscribeToSSE = true, onAgentEvent } = options;

  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch agent from API
  const {
    data: agent,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<AgentInstanceData | null>({
    queryKey: [AGENT_QUERY_KEY, agentId],
    queryFn: async () => {
      const response = await fetch(`/api/agents/${agentId}`);
      if (response.status === 404) {
        // Per DYK-19: Return null on 404, caller decides what to do
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch agent: ${response.statusText}`);
      }
      return response.json();
    },
    // Poll when SSE is disabled so overlay still gets updates
    refetchInterval: subscribeToSSE ? undefined : 2000,
  });

  // Run prompt mutation
  const runMutation = useMutation({
    mutationFn: async (options: AgentRunOptions): Promise<void> => {
      const response = await fetch(`/api/agents/${agentId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });

      if (response.status === 409) {
        throw new Error('Agent is already running');
      }

      if (response.status === 404) {
        throw new Error('Agent not found');
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to run agent: ${response.statusText}`);
      }
    },
    onSuccess: () => {
      // Invalidate agent query to refetch (status will change to 'working')
      queryClient.invalidateQueries({ queryKey: [AGENT_QUERY_KEY, agentId] });
    },
  });

  // SSE connection management
  const connectSSE = useCallback(() => {
    if (!subscribeToSSE || typeof EventSource === 'undefined') {
      return;
    }

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(SSE_ENDPOINT);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();

      // Attempt reconnection
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connectSSE();
        }, RECONNECT_DELAY);
      } else {
        setError(new Error('SSE connection failed after max reconnect attempts'));
      }
    };

    // Listen to SSE event types broadcast by AgentNotifierService
    const eventTypes = ['agent_status', 'agent_intent', 'agent_event'];

    for (const eventType of eventTypes) {
      eventSource.addEventListener(eventType, (event) => {
        const data = JSON.parse(event.data) as AgentSSEEvent;

        // Filter events for this specific agent (client-side per ADR-0007)
        if (data.agentId !== agentId) {
          return;
        }

        // Only refetch on status/intent changes, NOT on every event.
        // During streaming, the onAgentEvent callback + streamingContent overlay
        // handles real-time display. Refetching on every text_delta would cause
        // the content to double up (server events + streaming overlay).
        if (eventType !== 'agent_event') {
          queryClient.invalidateQueries({ queryKey: [AGENT_QUERY_KEY, agentId] });
        }

        // Call callback if provided
        if (onAgentEvent) {
          if (eventType === 'agent_event') {
            // Unwrap the inner event type for the callback
            // Server sends: { type: 'agent_event', agentId, event: { type: 'text_delta', data: {...} } }
            const innerEvent = (
              data as { event?: { type?: string; data?: Record<string, unknown> } }
            ).event;
            const innerType = innerEvent?.type ? `agent_${innerEvent.type}` : eventType;
            onAgentEvent(innerType, { agentId, ...innerEvent?.data } as AgentSSEEvent);
          } else {
            onAgentEvent(eventType, data);
          }
        }
      });
    }
  }, [subscribeToSSE, agentId, queryClient, onAgentEvent]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connectSSE]);

  // Compute derived values
  const status = agent?.status ?? null;
  const intent = agent?.intent ?? null;
  const events = agent?.events ?? [];
  const isWorking = status === 'working';

  return {
    agent,
    status,
    intent,
    events,
    isWorking,
    isLoading,
    error: queryError || error,
    isConnected,
    run: runMutation.mutateAsync,
    refetch,
  };
}
