/**
 * useWorkGraphAPI Hook - Phase 3 Client-Side API Integration
 *
 * Provides a client-side interface matching IWorkGraphUIInstance
 * that makes API calls for graph mutations.
 *
 * This bridges the gap between the canvas (which expects instance methods)
 * and the REST API endpoints.
 *
 * @module features/022-workgraph-ui/use-workgraph-api
 */

'use client';

import { useCallback, useMemo } from 'react';
import type { IWorkGraphUIInstance, MutationResult, Position } from './workgraph-ui.types';

/**
 * Props for useWorkGraphAPI hook.
 */
export interface UseWorkGraphAPIProps {
  /** Workspace slug for API calls */
  workspaceSlug: string;
  /** Graph slug for API calls */
  graphSlug: string;
  /** Optional worktree path */
  worktreePath?: string;
  /** Callback when graph data changes (to trigger reload) */
  onMutation?: () => void;
}

/**
 * Build API URL with optional worktree query param.
 */
function buildApiUrl(
  workspaceSlug: string,
  graphSlug: string,
  endpoint: string,
  worktreePath?: string
): string {
  const base = `/api/workspaces/${workspaceSlug}/workgraphs/${graphSlug}${endpoint}`;
  if (worktreePath) {
    return `${base}?worktree=${encodeURIComponent(worktreePath)}`;
  }
  return base;
}

/**
 * Hook that provides IWorkGraphUIInstance-like methods backed by API calls.
 *
 * @example
 * ```tsx
 * const api = useWorkGraphAPI({
 *   workspaceSlug: 'my-workspace',
 *   graphSlug: 'my-graph',
 *   onMutation: () => router.refresh(),
 * });
 *
 * <WorkGraphCanvas instance={api} editable />
 * ```
 */
export function useWorkGraphAPI({
  workspaceSlug,
  graphSlug,
  worktreePath,
  onMutation,
}: UseWorkGraphAPIProps): IWorkGraphUIInstance {
  /**
   * Add an unconnected node at a position (UI drag-drop pattern).
   */
  const addUnconnectedNode = useCallback(
    async (unitSlug: string, position: Position): Promise<MutationResult> => {
      try {
        const url = buildApiUrl(workspaceSlug, graphSlug, '/nodes', worktreePath);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitSlug, position }),
        });

        const data = await response.json();

        if (!response.ok || (data.errors && data.errors.length > 0)) {
          return {
            success: false,
            errors: data.errors ?? [{ code: 'E500', message: 'Failed to add node' }],
          };
        }

        onMutation?.();
        return { success: true, errors: [] };
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              code: 'E500',
              message: error instanceof Error ? error.message : 'Network error',
            },
          ],
        };
      }
    },
    [workspaceSlug, graphSlug, worktreePath, onMutation]
  );

  /**
   * Add a node after another node (CLI/agent pattern).
   */
  const addNodeAfter = useCallback(
    async (afterNodeId: string, unitSlug: string): Promise<MutationResult> => {
      try {
        const url = buildApiUrl(workspaceSlug, graphSlug, '/nodes', worktreePath);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ afterNodeId, unitSlug }),
        });

        const data = await response.json();

        if (!response.ok || (data.errors && data.errors.length > 0)) {
          return {
            success: false,
            errors: data.errors ?? [{ code: 'E500', message: 'Failed to add node' }],
          };
        }

        onMutation?.();
        return { success: true, errors: [] };
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              code: 'E500',
              message: error instanceof Error ? error.message : 'Network error',
            },
          ],
        };
      }
    },
    [workspaceSlug, graphSlug, worktreePath, onMutation]
  );

  /**
   * Remove a node from the graph.
   */
  const removeNode = useCallback(
    async (nodeId: string): Promise<MutationResult> => {
      try {
        const baseUrl = buildApiUrl(workspaceSlug, graphSlug, '/nodes', worktreePath);
        const url = baseUrl.includes('?')
          ? `${baseUrl}&nodeId=${encodeURIComponent(nodeId)}`
          : `${baseUrl}?nodeId=${encodeURIComponent(nodeId)}`;

        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();

        if (!response.ok || (data.errors && data.errors.length > 0)) {
          return {
            success: false,
            errors: data.errors ?? [{ code: 'E500', message: 'Failed to remove node' }],
          };
        }

        onMutation?.();
        return { success: true, errors: [] };
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              code: 'E500',
              message: error instanceof Error ? error.message : 'Network error',
            },
          ],
        };
      }
    },
    [workspaceSlug, graphSlug, worktreePath, onMutation]
  );

  /**
   * Connect two nodes with an edge.
   */
  const connectNodes = useCallback(
    async (
      sourceNodeId: string,
      sourceHandle: string,
      targetNodeId: string,
      targetHandle: string
    ): Promise<MutationResult> => {
      try {
        const url = buildApiUrl(workspaceSlug, graphSlug, '/edges', worktreePath);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: sourceNodeId,
            sourceHandle,
            target: targetNodeId,
            targetHandle,
          }),
        });

        const data = await response.json();

        if (!response.ok || (data.errors && data.errors.length > 0)) {
          return {
            success: false,
            errors: data.errors ?? [{ code: 'E500', message: 'Failed to connect nodes' }],
          };
        }

        onMutation?.();
        return { success: true, errors: [] };
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              code: 'E500',
              message: error instanceof Error ? error.message : 'Network error',
            },
          ],
        };
      }
    },
    [workspaceSlug, graphSlug, worktreePath, onMutation]
  );

  /**
   * Disconnect a node's input edge.
   */
  const disconnectNode = useCallback(
    async (targetNodeId: string, inputName: string): Promise<MutationResult> => {
      try {
        const baseUrl = buildApiUrl(workspaceSlug, graphSlug, '/edges', worktreePath);
        const url = baseUrl.includes('?')
          ? `${baseUrl}&targetNodeId=${encodeURIComponent(targetNodeId)}&inputName=${encodeURIComponent(inputName)}`
          : `${baseUrl}?targetNodeId=${encodeURIComponent(targetNodeId)}&inputName=${encodeURIComponent(inputName)}`;

        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();

        if (!response.ok || (data.errors && data.errors.length > 0)) {
          return {
            success: false,
            errors: data.errors ?? [{ code: 'E500', message: 'Failed to disconnect nodes' }],
          };
        }

        onMutation?.();
        return { success: true, errors: [] };
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              code: 'E500',
              message: error instanceof Error ? error.message : 'Network error',
            },
          ],
        };
      }
    },
    [workspaceSlug, graphSlug, worktreePath, onMutation]
  );

  /**
   * Update node layout position (for drag).
   * Note: This is a no-op for now as layout persistence isn't implemented.
   */
  const updateNodeLayout = useCallback(
    async (_nodeId: string, _position: Position): Promise<MutationResult> => {
      // Layout persistence is Phase 6 - for now just succeed silently
      return { success: true, errors: [] };
    },
    []
  );

  // Return instance-like object
  return useMemo(
    () => ({
      // Required by IWorkGraphUIInstance but not used by canvas
      graphSlug,
      nodes: new Map(),
      edges: [],
      isDisposed: false,
      dispose: () => {},

      // Mutation methods used by canvas
      addUnconnectedNode,
      addNodeAfter,
      removeNode,
      connectNodes,
      disconnectNode,
      updateNodeLayout,
    }),
    [
      graphSlug,
      addUnconnectedNode,
      addNodeAfter,
      removeNode,
      connectNodes,
      disconnectNode,
      updateNodeLayout,
    ]
  );
}
