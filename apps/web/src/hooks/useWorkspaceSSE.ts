'use client';

/**
 * useWorkspaceSSE - Workspace-scoped Server-Sent Events primitive
 *
 * Per DYK-04 (Plan 018 Phase 3): EXEMPLAR for all workspace-scoped SSE connections.
 * This shared primitive constructs workspace-scoped URLs and manages SSE lifecycle.
 *
 * Architecture:
 * - Domain hooks (useServerSession, future useSampleEvents) → useWorkspaceSSE → base SSE
 * - Constructs URLs as `/api/workspaces/${workspaceSlug}/${path}`
 * - Manages EventSource lifecycle with proper cleanup
 *
 * Per ADR-0009 (seed): Notification-fetch pattern where storage is truth, SSE is hint.
 *
 * @example
 * // In useServerSession:
 * const { eventSource, isConnected } = useWorkspaceSSE({
 *   workspaceSlug: 'my-project',
 *   path: `agents/${sessionId}/events`,
 *   onEvent: (event) => handleSessionEvent(event),
 * });
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ============ Types ============

/**
 * Configuration options for useWorkspaceSSE hook.
 */
export interface UseWorkspaceSSEOptions {
  /** Workspace slug for URL construction */
  workspaceSlug: string;
  /** Path within workspace (e.g., 'agents/123/events') */
  path: string;
  /** Enable SSE connection (default: true) */
  enabled?: boolean;
  /** Named event types to listen for (default: all via 'message') */
  eventTypes?: string[];
  /** Generic event handler */
  onEvent?: (eventType: string, data: unknown) => void;
  /** Error handler */
  onError?: (error: Event) => void;
  /** Connection state change handler */
  onConnectionChange?: (isConnected: boolean) => void;
}

/**
 * Return type for useWorkspaceSSE hook.
 */
export interface UseWorkspaceSSEReturn {
  /** SSE connection status */
  isConnected: boolean;
  /** Last error (if any) */
  error: Error | null;
  /** Reconnect to SSE */
  reconnect: () => void;
  /** Disconnect from SSE */
  disconnect: () => void;
}

// ============ Hook ============

/**
 * Hook for workspace-scoped Server-Sent Events.
 *
 * Constructs URLs using the pattern `/api/workspaces/${workspaceSlug}/${path}`.
 * Manages EventSource lifecycle with proper cleanup on unmount or param changes.
 *
 * @param options - SSE configuration options
 * @returns SSE state and control functions
 *
 * @example
 * // Basic usage
 * const { isConnected } = useWorkspaceSSE({
 *   workspaceSlug: 'my-project',
 *   path: 'agents/123/events/stream',
 *   onEvent: (type, data) => console.log(type, data),
 * });
 *
 * @example
 * // With specific event types
 * const { isConnected, reconnect } = useWorkspaceSSE({
 *   workspaceSlug: 'my-project',
 *   path: 'agents/events',
 *   eventTypes: ['session_updated', 'tool_call'],
 *   onEvent: (type, data) => {
 *     if (type === 'session_updated') handleSessionUpdate(data);
 *   },
 * });
 */
export function useWorkspaceSSE(options: UseWorkspaceSSEOptions): UseWorkspaceSSEReturn {
  const {
    workspaceSlug,
    path,
    enabled = true,
    eventTypes = [],
    onEvent,
    onError,
    onConnectionChange,
  } = options;

  // Refs to keep callbacks stable
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onEventRef.current = onEvent;
  onErrorRef.current = onError;
  onConnectionChangeRef.current = onConnectionChange;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // EventSource ref for manual control
  const eventSourceRef = useRef<EventSource | null>(null);

  // Construct workspace-scoped URL
  const url = `/api/workspaces/${encodeURIComponent(workspaceSlug)}/${path}`;

  // Connection function
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Connection opened
    eventSource.addEventListener('open', () => {
      setIsConnected(true);
      setError(null);
      onConnectionChangeRef.current?.(true);
    });

    // Connection error
    eventSource.addEventListener('error', (event) => {
      console.warn(`[useWorkspaceSSE] SSE connection error for ${url}`);
      setIsConnected(false);
      setError(new Error('SSE connection error'));
      onConnectionChangeRef.current?.(false);
      onErrorRef.current?.(event);
      // Close on error to prevent reconnection attempts
      eventSource.close();
    });

    // Generic message handler (for events without specific type)
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        onEventRef.current?.('message', data);
      } catch {
        // Non-JSON data, pass as-is
        onEventRef.current?.('message', event.data);
      }
    };
    eventSource.addEventListener('message', handleMessage);

    // Named event handlers
    for (const eventType of eventTypes) {
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          onEventRef.current?.(eventType, data);
        } catch {
          onEventRef.current?.(eventType, event.data);
        }
      };
      eventSource.addEventListener(eventType, handler);
    }

    return eventSource;
  }, [url, eventTypes]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      onConnectionChangeRef.current?.(false);
    }
  }, []);

  // Reconnect function
  const reconnect = useCallback(() => {
    disconnect();
    if (enabled && workspaceSlug && path) {
      connect();
    }
  }, [disconnect, connect, enabled, workspaceSlug, path]);

  // Effect to manage connection lifecycle
  useEffect(() => {
    if (!enabled || !workspaceSlug || !path) {
      disconnect();
      return;
    }

    connect();

    return () => {
      disconnect();
    };
  }, [enabled, workspaceSlug, path, connect, disconnect]);

  return {
    isConnected,
    error,
    reconnect,
    disconnect,
  };
}
