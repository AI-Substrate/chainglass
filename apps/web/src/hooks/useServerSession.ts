'use client';

/**
 * useServerSession - Server-backed session state management
 *
 * Implements notification-fetch pattern for session data:
 * 1. Fetch full session state from server on mount
 * 2. Subscribe to SSE for `session_updated` notifications
 * 3. On notification, invalidate React Query cache → refetch
 *
 * This replaces localStorage-based useAgentSession for cross-browser support.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 3)
 */

import type { SessionMetadata, StoredEvent } from '@chainglass/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

// ============ Types ============

/**
 * Full session data from server.
 */
export interface ServerSession {
  metadata: SessionMetadata;
  events: StoredEvent[];
}

/**
 * Options for useServerSession hook.
 */
export interface UseServerSessionOptions {
  /** Enable SSE subscription (default: true) */
  subscribeToUpdates?: boolean;
  /** Callback when session is updated via SSE */
  onSessionUpdated?: (sessionId: string) => void;
}

/**
 * Return type for useServerSession hook.
 */
export interface UseServerSessionReturn {
  /** Session data (null if loading or error) */
  session: ServerSession | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch session data */
  refetch: () => void;
  /** SSE connection status */
  isConnected: boolean;
}

// ============ Query Key ============

/**
 * Query key for session data.
 */
export const sessionQueryKey = (sessionId: string) => ['session', sessionId] as const;

// ============ Fetch Function ============

/**
 * Fetch session data from server.
 */
async function fetchSession(sessionId: string): Promise<ServerSession> {
  // Fetch metadata and events in parallel
  const [metadataRes, eventsRes] = await Promise.all([
    fetch(`/api/agents/sessions/${sessionId}`),
    fetch(`/api/agents/sessions/${sessionId}/events`),
  ]);

  if (!metadataRes.ok) {
    throw new Error(`Failed to fetch session metadata: ${metadataRes.status}`);
  }
  if (!eventsRes.ok) {
    throw new Error(`Failed to fetch session events: ${eventsRes.status}`);
  }

  const metadata = (await metadataRes.json()) as SessionMetadata;
  const events = (await eventsRes.json()) as StoredEvent[];

  return { metadata, events };
}

// ============ Hook ============

/**
 * Hook for managing server-backed session state.
 *
 * Uses React Query for caching and SSE for real-time updates.
 *
 * @param sessionId - Unique session identifier
 * @param options - Hook options
 * @returns Session state and utilities
 *
 * @example
 * const { session, isLoading, error, isConnected } = useServerSession('sess-123');
 *
 * if (isLoading) return <Spinner />;
 * if (error) return <Error message={error.message} />;
 *
 * return (
 *   <div>
 *     <h1>{session.metadata.name}</h1>
 *     <span>Status: {session.metadata.status}</span>
 *     <span>{isConnected ? '🟢' : '🔴'} SSE</span>
 *     <EventList events={session.events} />
 *   </div>
 * );
 */
export function useServerSession(
  sessionId: string,
  options: UseServerSessionOptions = {}
): UseServerSessionReturn {
  const { subscribeToUpdates = true, onSessionUpdated } = options;
  const queryClient = useQueryClient();
  const onSessionUpdatedRef = useRef(onSessionUpdated);
  onSessionUpdatedRef.current = onSessionUpdated;

  // COR-001: Track SSE connection status with single EventSource (no dual connections)
  const [isConnected, setIsConnected] = useState(false);

  // React Query for session data
  const {
    data: session,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: sessionQueryKey(sessionId),
    queryFn: () => fetchSession(sessionId),
    enabled: !!sessionId,
  });

  // Callback to handle SSE notification
  const handleSessionUpdated = useCallback(
    (notifiedSessionId: string) => {
      if (notifiedSessionId === sessionId) {
        // Invalidate cache → triggers refetch
        queryClient.invalidateQueries({ queryKey: sessionQueryKey(sessionId) });
        onSessionUpdatedRef.current?.(sessionId);
      }
    },
    [sessionId, queryClient]
  );

  // Custom SSE listener for session_updated notifications
  // COR-001: Single EventSource (removed unused useAgentSSE)
  // COR-002: Added error handler to prevent memory leaks
  useEffect(() => {
    if (!subscribeToUpdates || !sessionId) return;

    // Create EventSource directly for session_updated notifications
    const channel = `agent-${sessionId}`;
    const eventSource = new EventSource(`/api/sse?channel=${channel}`);

    // Track connection open
    eventSource.addEventListener('open', () => {
      setIsConnected(true);
    });

    // COR-002: Error handler to prevent memory leaks and track connection state
    eventSource.addEventListener('error', () => {
      console.warn(`[useServerSession] SSE connection error for session ${sessionId}`);
      setIsConnected(false);
      eventSource.close();
    });

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'session_updated' && data.data?.sessionId === sessionId) {
          handleSessionUpdated(sessionId);
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.addEventListener('session_updated', handleMessage);
    eventSource.addEventListener('message', handleMessage);

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [subscribeToUpdates, sessionId, handleSessionUpdated]);

  return {
    session: session ?? null,
    isLoading,
    error: error as Error | null,
    refetch: () => refetch(),
    isConnected,
  };
}
