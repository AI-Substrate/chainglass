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

import type {
  AgentInstanceStatus,
  AgentType,
} from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import type { CreateAgentParams } from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.interface';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

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
const SSE_ENDPOINT = '/api/agents/events';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ============ Hook Implementation ============

/**
 * Hook for managing agent list with SSE subscription.
 *
 * Per DYK-17: New hook replacing legacy useAgentSSE for Plan 019.
 */
export function useAgentManager(options: UseAgentManagerOptions = {}): UseAgentManagerReturn {
  const { workspace, subscribeToSSE = true, onAgentEvent } = options;

  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // Listen to all agent event types
    const eventTypes = [
      'agent_status',
      'agent_intent',
      'agent_text_delta',
      'agent_text_replace',
      'agent_text_append',
      'agent_question',
      'agent_created',
      'agent_terminated',
    ];

    for (const eventType of eventTypes) {
      eventSource.addEventListener(eventType, (event) => {
        const data = JSON.parse(event.data) as AgentSSEEvent;

        // Invalidate queries to refetch agent list
        queryClient.invalidateQueries({ queryKey: [AGENTS_QUERY_KEY] });

        // Call callback if provided
        if (onAgentEvent) {
          onAgentEvent(eventType, data);
        }
      });
    }
  }, [subscribeToSSE, queryClient, onAgentEvent]);

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

  return {
    agents,
    isLoading,
    error: queryError || error,
    isConnected,
    createAgent: createMutation.mutateAsync,
    refetch,
  };
}
