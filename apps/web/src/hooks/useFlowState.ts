/**
 * useFlowState - ReactFlow state management hook
 *
 * Wrapper around ReactFlow's useReactFlow() hook providing CRUD operations
 * for nodes and edges.
 *
 * DYK-02: Wrapper pattern - uses ReactFlow's internal state, no separate Zustand store.
 * DYK-05: Requires ReactFlowProvider context - not truly "headless".
 */

import { useCallback, useState } from 'react';

import type { WorkflowEdge, WorkflowNode } from '../data/fixtures';

export interface UseFlowStateReturn {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  addNode: (node: WorkflowNode) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void;
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
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => [...initialFlow.nodes]);
  const [edges, setEdges] = useState<WorkflowEdge[]>(() => [...initialFlow.edges]);

  /**
   * Add a new node to the flow.
   */
  const addNode = useCallback((node: WorkflowNode) => {
    setNodes((prev) => [...prev, node]);
  }, []);

  /**
   * Remove a node and all its connected edges from the flow.
   */
  const removeNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    // Also remove edges connected to this node
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  /**
   * Update a node's properties (partial update supported).
   */
  const updateNode = useCallback((nodeId: string, updates: Partial<WorkflowNode>) => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;

        // Deep merge for data property
        const updatedData = updates.data ? { ...node.data, ...updates.data } : node.data;

        return {
          ...node,
          ...updates,
          data: updatedData,
        };
      })
    );
  }, []);

  /**
   * Add a new edge connecting two nodes.
   */
  const addEdge = useCallback((source: string, target: string) => {
    const newEdge: WorkflowEdge = {
      id: `edge-${source}-${target}`,
      source,
      target,
    };
    setEdges((prev) => [...prev, newEdge]);
  }, []);

  /**
   * Remove an edge from the flow.
   */
  const removeEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  return {
    nodes,
    edges,
    addNode,
    removeNode,
    updateNode,
    addEdge,
    removeEdge,
  };
}
