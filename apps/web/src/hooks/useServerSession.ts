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

import type { AgentStoredEvent, SessionMetadata } from '@chainglass/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

// ============ Types ============

/**
 * Stored event type - matches IAgentEventAdapter return type.
 * AgentStoredEvent from shared, extended with id field.
 */
export type StoredEvent = AgentStoredEvent & { id: string };

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
  /** Workspace slug for workspace-scoped sessions (optional for backwards compat) */
  workspaceSlug?: string;
  /** Worktree path for workspace context (required when workspaceSlug is provided) */
  worktreePath?: string;
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
 * Per DYK-04: Include workspaceSlug in key for proper caching.
 */
export const sessionQueryKey = (sessionId: string, workspaceSlug?: string) =>
  workspaceSlug
    ? (['session', workspaceSlug, sessionId] as const)
    : (['session', sessionId] as const);

// ============ Fetch Function ============

/**
 * Fetch session data from server.
 * Per DYK-04: Uses workspace-scoped URL when workspaceSlug is provided.
 */
async function fetchSession(
  sessionId: string,
  workspaceSlug?: string,
  worktreePath?: string
): Promise<ServerSession> {
  // Construct URL based on workspace context
  let eventsUrl: string;
  if (workspaceSlug) {
    const params = new URLSearchParams();
    if (worktreePath) {
      params.set('worktree', worktreePath);
    }
    eventsUrl = `/api/workspaces/${encodeURIComponent(workspaceSlug)}/agents/${encodeURIComponent(sessionId)}/events${params.toString() ? `?${params.toString()}` : ''}`;
  } else {
    eventsUrl = `/api/agents/sessions/${sessionId}/events`;
  }

  // Fetch events from server storage
  const eventsRes = await fetch(eventsUrl);

  if (!eventsRes.ok) {
    throw new Error(`Failed to fetch session events: ${eventsRes.status}`);
  }

  const eventsData = (await eventsRes.json()) as {
    events: StoredEvent[];
    count?: number;
    sessionId?: string;
  };

  // Construct minimal metadata from sessionId (server-side metadata not required for event display)
  const metadata: SessionMetadata = {
    id: sessionId,
    name: `Session ${sessionId.slice(-6)}`,
    agentType: 'claude-code',
    status: 'idle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { metadata, events: eventsData.events };
}

// ============ Hook ============

/**
 * Hook for managing server-backed session state.
 *
 * Uses React Query for caching and SSE for real-time updates.
 * Per DYK-04: Supports optional workspaceSlug for workspace-scoped sessions.
 *
 * @param sessionId - Unique session identifier
 * @param options - Hook options (including optional workspaceSlug)
 * @returns Session state and utilities
 *
 * @example
 * // Legacy (non-workspace-scoped)
 * const { session, isLoading, error, isConnected } = useServerSession('sess-123');
 *
 * // Workspace-scoped
 * const { session, isLoading } = useServerSession('sess-123', { workspaceSlug: 'my-project' });
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
  const { subscribeToUpdates = true, onSessionUpdated, workspaceSlug, worktreePath } = options;
  const queryClient = useQueryClient();
  const onSessionUpdatedRef = useRef(onSessionUpdated);
  onSessionUpdatedRef.current = onSessionUpdated;

  // COR-001: Track SSE connection status with single EventSource (no dual connections)
  const [isConnected, setIsConnected] = useState(false);

  // React Query for session data - per DYK-04: include workspaceSlug in query key
  const {
    data: session,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: sessionQueryKey(sessionId, workspaceSlug),
    queryFn: () => fetchSession(sessionId, workspaceSlug, worktreePath),
    enabled: !!sessionId,
  });

  // Callback to handle SSE notification
  const handleSessionUpdatedCallback = useCallback(
    (notifiedSessionId: string) => {
      if (notifiedSessionId === sessionId) {
        // Invalidate cache → triggers refetch - per DYK-04: include workspaceSlug in key
        queryClient.invalidateQueries({ queryKey: sessionQueryKey(sessionId, workspaceSlug) });
        onSessionUpdatedRef.current?.(sessionId);
      }
    },
    [sessionId, workspaceSlug, queryClient]
  );

  // Custom SSE listener for session_updated notifications
  // COR-001: Single EventSource (removed unused useAgentSSE)
  // COR-002: Added error handler to prevent memory leaks
  // COR-003: Use global 'agents' channel since run route broadcasts there
  // COR-004: SSE named events don't include type in data; check sessionId directly
  // DYK-04: Use workspace-scoped SSE endpoint when workspaceSlug is provided
  useEffect(() => {
    if (!subscribeToUpdates || !sessionId) return;

    // Construct SSE URL - workspace-scoped or legacy
    const sseUrl = workspaceSlug
      ? `/api/workspaces/${encodeURIComponent(workspaceSlug)}/agents/events`
      : '/api/events/agents';

    // Connect to appropriate channel
    const eventSource = new EventSource(sseUrl);

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

    // Handler for session_updated named events (SSE event type is 'session_updated')
    // COR-004: For named events, the type is in the event name, not in data.type
    const handleSessionUpdated = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        // Filter by sessionId - only handle updates for this specific session
        if (data.data?.sessionId === sessionId) {
          handleSessionUpdatedCallback(sessionId);
        }
      } catch {
        // Ignore parse errors
      }
    };

    // Listen for the named 'session_updated' event
    eventSource.addEventListener('session_updated', handleSessionUpdated);

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [subscribeToUpdates, sessionId, workspaceSlug, handleSessionUpdatedCallback]);

  return {
    session: session ?? null,
    isLoading,
    error: error as Error | null,
    refetch: () => refetch(),
    isConnected,
  };
}
