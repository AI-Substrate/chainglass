/**
 * useFlowState - ReactFlow state management hook
 *
 * Wrapper around ReactFlow's useReactFlow() hook providing CRUD operations
 * for nodes and edges.
 *
 * DYK-02: Wrapper pattern - uses ReactFlow's internal state, no separate Zustand store.
 * DYK-05: Requires ReactFlowProvider context - not truly "headless".
 *
 * FIX-001/FIX-002: Uses combined state object to avoid race conditions and
 * enable node validation in addEdge.
 */

import { useCallback, useState } from 'react';

import type { WorkflowEdge, WorkflowNode, WorkflowNodeData } from '../data/fixtures';

export interface UseFlowStateReturn {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  addNode: (node: WorkflowNode) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (
    nodeId: string,
    updates: { data?: Partial<WorkflowNodeData> } & Omit<Partial<WorkflowNode>, 'data'>
  ) => void;
  addEdge: (source: string, target: string) => void;
  removeEdge: (edgeId: string) => void;
}

export interface FlowState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/**
 * Hook for managing ReactFlow state with node and edge CRUD operations.
 *
 * @param initialFlow - Initial flow state with nodes and edges
 * @returns Flow state and mutation functions
 *
 * @example
 * const { nodes, edges, addNode, removeNode } = useFlowState(DEMO_FLOW);
 * addNode({ id: 'new', position: { x: 0, y: 0 }, data: { label: 'New' } });
 */
export function useFlowState(initialFlow: FlowState): UseFlowStateReturn {
  // Combined state to avoid race conditions (FIX-001)
  const [flow, setFlow] = useState<FlowState>(() => ({
    nodes: [...initialFlow.nodes],
    edges: [...initialFlow.edges],
  }));

  /**
   * Add a new node to the flow.
   */
  const addNode = useCallback((node: WorkflowNode) => {
    setFlow((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
  }, []);

  /**
   * Remove a node and all its connected edges from the flow.
   * Atomic update prevents race conditions between node and edge removal.
   */
  const removeNode = useCallback((nodeId: string) => {
    setFlow((prev) => ({
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
  }, []);

  /**
   * Update a node's properties (partial update supported).
   */
  const updateNode = useCallback(
    (
      nodeId: string,
      updates: { data?: Partial<WorkflowNodeData> } & Omit<Partial<WorkflowNode>, 'data'>
    ) => {
      setFlow((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => {
          if (node.id !== nodeId) return node;

          // Deep merge for data property
          const updatedData = updates.data ? { ...node.data, ...updates.data } : node.data;

          return {
            ...node,
            ...updates,
            data: updatedData,
          };
        }),
      }));
    },
    []
  );

  /**
   * Add a new edge connecting two nodes.
   * Validates that both source and target nodes exist (FIX-002).
   * Prevents duplicate edges (FIX-005).
   */
  const addEdge = useCallback((source: string, target: string) => {
    setFlow((prev) => {
      // Validate both nodes exist (FIX-002)
      const sourceExists = prev.nodes.some((n) => n.id === source);
      const targetExists = prev.nodes.some((n) => n.id === target);
      if (!sourceExists || !targetExists) {
        console.warn(
          `addEdge: Invalid nodes - source=${source} (exists=${sourceExists}), target=${target} (exists=${targetExists})`
        );
        return prev;
      }

      // Prevent duplicate edges (FIX-005)
      const exists = prev.edges.some((e) => e.source === source && e.target === target);
      if (exists) {
        return prev;
      }

      const newEdge: WorkflowEdge = {
        id: `edge-${source}-${target}`,
        source,
        target,
      };
      return { ...prev, edges: [...prev.edges, newEdge] };
    });
  }, []);

  /**
   * Remove an edge from the flow.
   */
  const removeEdge = useCallback((edgeId: string) => {
    setFlow((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId),
    }));
  }, []);

  return {
    nodes: flow.nodes,
    edges: flow.edges,
    addNode,
    removeNode,
    updateNode,
    addEdge,
    removeEdge,
  };
}
