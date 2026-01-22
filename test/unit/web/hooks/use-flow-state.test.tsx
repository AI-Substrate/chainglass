/**
 * useFlowState Tests - TDD RED Phase
 *
 * Tests for the ReactFlow state management hook.
 * Following TDD approach: write tests first, expect them to fail.
 *
 * DYK-05: Requires ReactFlowProvider context wrapper - not truly "headless"
 * but accepts this coupling for the simplicity of wrapping useReactFlow().
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React, { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { DEMO_FLOW, EMPTY_FLOW, type WorkflowNode } from '../../../../apps/web/src/data/fixtures';
import { useFlowState } from '../../../../apps/web/src/hooks/useFlowState';

/**
 * Wrapper component that provides ReactFlow context for hook testing.
 * DYK-05: This is required because useFlowState wraps useReactFlow().
 */
function ReactFlowWrapper({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe('useFlowState', () => {
  describe('initialization', () => {
    it('should initialize with provided flow state', () => {
      /*
      Test Doc:
      - Why: Hook must accept and preserve initial flow state
      - Contract: useFlowState(initialFlow) returns { nodes, edges } matching initial state
      - Usage Notes: Requires ReactFlowProvider wrapper
      - Quality Contribution: Catches initialization bugs
      - Worked Example: useFlowState(DEMO_FLOW) → 5 nodes, 4 edges
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      expect(result.current.nodes).toHaveLength(5);
      expect(result.current.edges).toHaveLength(4);
      expect(result.current.nodes[0].id).toBe('node-1');
    });

    it('should initialize with empty flow', () => {
      /*
      Test Doc:
      - Why: Hook must handle empty flows for fresh starts
      - Contract: useFlowState(emptyFlow) returns empty nodes/edges arrays
      - Usage Notes: Empty arrays are valid initial state
      - Quality Contribution: Catches null pointer errors
      - Worked Example: useFlowState(EMPTY_FLOW) → 0 nodes, 0 edges
      */
      const { result } = renderHook(() => useFlowState(EMPTY_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      expect(result.current.nodes).toHaveLength(0);
      expect(result.current.edges).toHaveLength(0);
    });
  });

  describe('addNode', () => {
    it('should add a new node to the flow', () => {
      /*
      Test Doc:
      - Why: Users add workflow steps to the canvas
      - Contract: addNode(node) adds node to nodes array
      - Usage Notes: Node requires id, position, data.label
      - Quality Contribution: Validates node creation
      - Worked Example: addNode(newNode) → nodes.length + 1
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      const newNode: WorkflowNode = {
        id: 'node-new',
        type: 'default',
        position: { x: 100, y: 100 },
        data: { label: 'New Step' },
      };

      act(() => {
        result.current.addNode(newNode);
      });

      expect(result.current.nodes).toHaveLength(6);
      expect(result.current.nodes.find((n) => n.id === 'node-new')).toBeDefined();
    });

    it('should add node to empty flow', () => {
      /*
      Test Doc:
      - Why: First node addition must work on empty canvas
      - Contract: addNode works on empty flows
      - Usage Notes: First node has no edges
      - Quality Contribution: Catches empty array edge cases
      - Worked Example: addNode on empty → 1 node
      */
      const { result } = renderHook(() => useFlowState(EMPTY_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      const newNode: WorkflowNode = {
        id: 'first-node',
        type: 'default',
        position: { x: 0, y: 0 },
        data: { label: 'First Step' },
      };

      act(() => {
        result.current.addNode(newNode);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('first-node');
    });
  });

  describe('removeNode', () => {
    it('should remove a node from the flow', () => {
      /*
      Test Doc:
      - Why: Users delete workflow steps
      - Contract: removeNode(nodeId) removes node from array
      - Usage Notes: Also removes connected edges
      - Quality Contribution: Validates node deletion with edge cleanup
      - Worked Example: removeNode('node-3') → 4 nodes
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      act(() => {
        result.current.removeNode('node-3');
      });

      expect(result.current.nodes).toHaveLength(4);
      expect(result.current.nodes.find((n) => n.id === 'node-3')).toBeUndefined();
    });

    it('should remove connected edges when removing a node', () => {
      /*
      Test Doc:
      - Why: Orphan edges cause render errors
      - Contract: removeNode also removes edges connected to the node
      - Usage Notes: Checks both source and target connections
      - Quality Contribution: Prevents dangling edge references
      - Worked Example: removeNode('node-2') removes edge-1-2, edge-2-3, edge-2-4
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      // node-2 has edge-1-2 (target), edge-2-3 (source), edge-2-4 (source)
      act(() => {
        result.current.removeNode('node-2');
      });

      // Should remove 3 edges: edge-1-2, edge-2-3, edge-2-4
      expect(result.current.edges).toHaveLength(1); // Only edge-3-5 remains
      expect(result.current.edges.find((e) => e.id === 'edge-3-5')).toBeDefined();
    });

    it('should handle removing non-existent node gracefully', () => {
      /*
      Test Doc:
      - Why: Invalid node IDs shouldn't crash
      - Contract: removeNode with invalid nodeId is no-op
      - Usage Notes: Silent failure for missing nodes
      - Quality Contribution: Prevents crashes from race conditions
      - Worked Example: removeNode('ghost') → no change
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      const originalNodes = result.current.nodes.length;

      act(() => {
        result.current.removeNode('non-existent-node');
      });

      expect(result.current.nodes).toHaveLength(originalNodes);
    });
  });

  describe('updateNode', () => {
    it('should update node data', () => {
      /*
      Test Doc:
      - Why: Users modify workflow step properties
      - Contract: updateNode(nodeId, updates) merges updates into node
      - Usage Notes: Partial updates supported
      - Quality Contribution: Validates immutable update pattern
      - Worked Example: updateNode('node-1', { data: { label: 'Updated' } })
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      act(() => {
        result.current.updateNode('node-1', {
          data: { label: 'Updated Label', status: 'running' },
        });
      });

      const updatedNode = result.current.nodes.find((n) => n.id === 'node-1');
      expect(updatedNode?.data.label).toBe('Updated Label');
      expect(updatedNode?.data.status).toBe('running');
    });

    it('should update node position', () => {
      /*
      Test Doc:
      - Why: Users drag nodes on canvas
      - Contract: updateNode can update position without affecting data
      - Usage Notes: Position is { x, y }
      - Quality Contribution: Validates position-only updates
      - Worked Example: updateNode('node-1', { position: { x: 500, y: 300 } })
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      act(() => {
        result.current.updateNode('node-1', {
          position: { x: 500, y: 300 },
        });
      });

      const updatedNode = result.current.nodes.find((n) => n.id === 'node-1');
      expect(updatedNode?.position).toEqual({ x: 500, y: 300 });
      // Data should be unchanged
      expect(updatedNode?.data.label).toBe('Source Code');
    });
  });

  describe('addEdge', () => {
    it('should add a new edge connecting two nodes', () => {
      /*
      Test Doc:
      - Why: Users connect workflow steps
      - Contract: addEdge(source, target) creates edge
      - Usage Notes: Returns generated edge ID
      - Quality Contribution: Validates edge creation
      - Worked Example: addEdge('node-4', 'node-5') → 5 edges
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      act(() => {
        result.current.addEdge('node-4', 'node-5');
      });

      expect(result.current.edges).toHaveLength(5);
      const newEdge = result.current.edges.find(
        (e) => e.source === 'node-4' && e.target === 'node-5'
      );
      expect(newEdge).toBeDefined();
    });

    it('should not add edge with non-existent source node (FIX-002)', () => {
      /*
      Test Doc:
      - Why: Prevents orphaned edges pointing to non-existent nodes
      - Contract: addEdge with invalid source is no-op
      - Usage Notes: Logs warning, does not crash
      - Quality Contribution: Validates edge validation logic
      - Worked Example: addEdge('ghost', 'node-1') → no new edge
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });
      const originalEdgeCount = result.current.edges.length;

      act(() => {
        result.current.addEdge('non-existent', 'node-1');
      });

      expect(result.current.edges).toHaveLength(originalEdgeCount);
    });

    it('should not add edge with non-existent target node (FIX-002)', () => {
      /*
      Test Doc:
      - Why: Prevents orphaned edges pointing to non-existent nodes
      - Contract: addEdge with invalid target is no-op
      - Usage Notes: Logs warning, does not crash
      - Quality Contribution: Validates edge validation logic
      - Worked Example: addEdge('node-1', 'ghost') → no new edge
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });
      const originalEdgeCount = result.current.edges.length;

      act(() => {
        result.current.addEdge('node-1', 'non-existent');
      });

      expect(result.current.edges).toHaveLength(originalEdgeCount);
    });

    it('should not add duplicate edges (FIX-005)', () => {
      /*
      Test Doc:
      - Why: Duplicate edges create visual clutter and logic bugs
      - Contract: addEdge with existing source→target is no-op
      - Usage Notes: Checks by source+target, not edge id
      - Quality Contribution: Prevents duplicate connections
      - Worked Example: addEdge('node-1', 'node-2') twice → only 1 edge
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });
      // edge-1-2 already exists in DEMO_FLOW
      const originalEdgeCount = result.current.edges.length;

      act(() => {
        result.current.addEdge('node-1', 'node-2');
      });

      expect(result.current.edges).toHaveLength(originalEdgeCount);
    });
  });

  describe('removeEdge', () => {
    it('should remove an edge from the flow', () => {
      /*
      Test Doc:
      - Why: Users disconnect workflow steps
      - Contract: removeEdge(edgeId) removes edge from array
      - Usage Notes: Does not affect nodes
      - Quality Contribution: Validates edge deletion
      - Worked Example: removeEdge('edge-1-2') → 3 edges
      */
      const { result } = renderHook(() => useFlowState(DEMO_FLOW), {
        wrapper: ReactFlowWrapper,
      });

      act(() => {
        result.current.removeEdge('edge-1-2');
      });

      expect(result.current.edges).toHaveLength(3);
      expect(result.current.edges.find((e) => e.id === 'edge-1-2')).toBeUndefined();
    });
  });
});
