'use client';

/**
 * useAgentManager - React hook for agent list and global SSE subscription
 *
 * Per Plan 019 AC-08, AC-09, AC-24: Web can list agents and subscribe to all agent events.
 * Per ADR-0007: Single SSE channel at /api/agents/events with client-side agentId filtering.
 * Per DYK-17: New hook for Plan 019; replaces legacy useAgentSSE pattern.
 *
 * Features:
 * - Fetch agent list via React Query
 * - Subscribe to global 'agents' SSE channel
 * - Auto-invalidate query on agent events
 * - Create new agents via mutation
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 4: Web Integration)
 */

import { useChannelCallback } from '@/lib/sse';
import type { MultiplexedSSEMessage } from '@/lib/sse';
import type {
  AgentInstanceStatus,
  AgentType,
} from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import type { CreateAgentParams } from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.interface';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ============ Types ============

/**
 * Agent data shape returned from API.
 */
export interface AgentData {
  id: string;
  name: string;
  type: AgentType;
  workspace: string;
  status: AgentInstanceStatus;
  intent: string;
  sessionId: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * Agent event payload from SSE.
 * Per ADR-0007: All events include agentId for client-side filtering.
 */
export interface AgentSSEEvent {
  agentId: string;
  [key: string]: unknown;
}

/**
 * Options for useAgentManager hook.
 */
export interface UseAgentManagerOptions {
  /** Workspace filter (optional) */
  workspace?: string;
  /** Enable SSE subscription (default: true) */
  subscribeToSSE?: boolean;
  /** Callback when any agent event arrives */
  onAgentEvent?: (eventType: string, data: AgentSSEEvent) => void;
}

/**
 * Return type for useAgentManager hook.
 */
export interface UseAgentManagerReturn {
  /** List of agents (undefined while loading, empty array if none) */
  agents: AgentData[] | undefined;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** SSE connection state */
  isConnected: boolean;
  /** Create new agent */
  createAgent: (params: CreateAgentParams) => Promise<AgentData>;
  /** Refetch agent list */
  refetch: () => void;
}

// ============ Constants ============

const AGENTS_QUERY_KEY = 'agents';

// ============ Hook Implementation ============

/**
 * Hook for managing agent list with SSE subscription.
 *
 * Per DYK-17: New hook replacing legacy useAgentSSE for Plan 019.
 */
export function useAgentManager(options: UseAgentManagerOptions = {}): UseAgentManagerReturn {
  const { workspace, subscribeToSSE = true, onAgentEvent } = options;

  const queryClient = useQueryClient();

  // Subscribe to agent events via multiplexed SSE (FX001, Plan 072)
  // DYK-1: Mux delivers all events via onmessage with msg.type, not named event listeners
  const { isConnected } = useChannelCallback('agents', (msg: MultiplexedSSEMessage) => {
    if (!subscribeToSSE) return;

    const eventType = msg.type ?? 'unknown';

    // List-affecting events → invalidate query
    if (['agent_status', 'agent_intent', 'agent_created', 'agent_terminated'].includes(eventType)) {
      queryClient.invalidateQueries({ queryKey: [AGENTS_QUERY_KEY] });
    }

    // Forward all events to optional callback
    if (onAgentEvent) {
      onAgentEvent(eventType, msg as unknown as AgentSSEEvent);
    }
  });

  // Fetch agents from API
  const {
    data: agents,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<AgentData[]>({
    queryKey: [AGENTS_QUERY_KEY, workspace],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workspace) {
        params.set('workspace', workspace);
      }
      const url = `/api/agents${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch agents: ${response.statusText}`);
      }
      return response.json();
    },
    // Poll when SSE is disabled so chip bar stays fresh
    refetchInterval: subscribeToSSE ? undefined : 5000,
  });

  // Create agent mutation
  const createMutation = useMutation({
    mutationFn: async (params: CreateAgentParams): Promise<AgentData> => {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create agent: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate agents query to refetch list
      queryClient.invalidateQueries({ queryKey: [AGENTS_QUERY_KEY] });
    },
  });

  return {
    agents,
    isLoading,
    error: queryError ?? null,
    isConnected,
    createAgent: createMutation.mutateAsync,
    refetch,
  };
}
