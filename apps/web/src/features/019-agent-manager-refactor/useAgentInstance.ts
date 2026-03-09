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

import { useChannelCallback } from '@/lib/sse';
import type { MultiplexedSSEMessage } from '@/lib/sse';
import type {
  AgentInstanceStatus,
  AgentRunOptions,
  AgentStoredEvent,
  AgentType,
} from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

  // Subscribe to agent events via multiplexed SSE (FX001, Plan 072)
  // DYK-1: Mux delivers all events via onmessage with msg.type, not named event listeners
  // DYK-4: agent_event unwrap pattern preserved exactly from original
  const { isConnected } = useChannelCallback('agents', (msg: MultiplexedSSEMessage) => {
    if (!subscribeToSSE) return;

    const data = msg as unknown as AgentSSEEvent;
    const eventType = data.type ?? 'unknown';

    // Filter events for this specific agent (client-side per ADR-0007)
    if (data.agentId !== agentId) return;

    // Only refetch on status/intent changes, NOT on every event.
    // During streaming, the onAgentEvent callback + streamingContent overlay
    // handles real-time display. Refetching on every text_delta would cause
    // the content to double up (server events + streaming overlay).
    if (eventType === 'agent_status' || eventType === 'agent_intent') {
      queryClient.invalidateQueries({ queryKey: [AGENT_QUERY_KEY, agentId] });
    }

    // Call callback if provided, preserving agent_event unwrap (DYK-4)
    if (onAgentEvent) {
      if (eventType === 'agent_event') {
        // Unwrap the inner event type for the callback
        // Server sends: { type: 'agent_event', agentId, event: { type: 'text_delta', data: {...} } }
        const innerEvent = (data as { event?: { type?: string; data?: Record<string, unknown> } })
          .event;
        const innerType = innerEvent?.type ? `agent_${innerEvent.type}` : eventType;
        onAgentEvent(innerType, { agentId, ...innerEvent?.data } as AgentSSEEvent);
      } else {
        onAgentEvent(eventType, data);
      }
    }
  });

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
    error: queryError ?? null,
    isConnected,
    run: runMutation.mutateAsync,
    refetch,
  };
}
