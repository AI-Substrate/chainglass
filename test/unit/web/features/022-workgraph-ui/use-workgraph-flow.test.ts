/**
 * useWorkGraphFlow Hook Tests - Phase 2 (T001)
 *
 * Per DYK#2: Hook accepts serialized JSON data, not IWorkGraphUIInstanceCore.
 * Subscription tests deferred to Phase 4.
 *
 * Testing approach: Full TDD - write tests first (RED), implement (GREEN), refactor.
 */

import type { NodeStatus } from '@/features/022-workgraph-ui';
import {
  type WorkGraphFlowData,
  useWorkGraphFlow,
} from '@/features/022-workgraph-ui/use-workgraph-flow';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

describe('useWorkGraphFlow', () => {
  /**
   * Test: Transform UINodeState[] to React Flow Node[]
   *
   * Purpose: Proves correct mapping from serialized data to RF format
   * Quality Contribution: Ensures graph renders correctly
   * Acceptance Criteria: RF nodes have correct id, position, data
   */
  test('should transform node data to React Flow Node format', () => {
    const data: WorkGraphFlowData = {
      nodes: [
        {
          id: 'start',
          status: 'complete' as NodeStatus,
          position: { x: 100, y: 50 },
          type: 'start',
        },
        {
          id: 'nodeA',
          status: 'ready' as NodeStatus,
          position: { x: 100, y: 200 },
          unit: 'sample-input',
        },
      ],
      edges: [],
    };

    const { result } = renderHook(() => useWorkGraphFlow(data));

    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0]).toMatchObject({
      id: 'start',
      position: { x: 100, y: 50 },
      type: 'workGraphNode',
      data: {
        id: 'start',
        status: 'complete',
        type: 'start',
      },
    });
    expect(result.current.nodes[1]).toMatchObject({
      id: 'nodeA',
      position: { x: 100, y: 200 },
      type: 'workGraphNode',
      data: {
        id: 'nodeA',
        status: 'ready',
        unit: 'sample-input',
      },
    });
  });

  /**
   * Test: Transform UIEdge[] to React Flow Edge[]
   *
   * Purpose: Proves edge transformation works correctly
   * Quality Contribution: Ensures connections render correctly
   * Acceptance Criteria: RF edges have source, target, proper type
   */
  test('should transform edge data to React Flow Edge format', () => {
    const data: WorkGraphFlowData = {
      nodes: [
        { id: 'start', status: 'complete' as NodeStatus, position: { x: 0, y: 0 }, type: 'start' },
        { id: 'a', status: 'ready' as NodeStatus, position: { x: 0, y: 100 } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'a' }],
    };

    const { result } = renderHook(() => useWorkGraphFlow(data));

    expect(result.current.edges).toHaveLength(1);
    expect(result.current.edges[0]).toMatchObject({
      id: 'e1',
      source: 'start',
      target: 'a',
      type: 'default',
    });
  });

  /**
   * Test: Memoize output when data unchanged
   *
   * Purpose: Proves performance optimization via memoization
   * Quality Contribution: Prevents unnecessary re-renders
   * Acceptance Criteria: Same input = same output reference
   */
  test('should memoize output when data unchanged', () => {
    const data: WorkGraphFlowData = {
      nodes: [{ id: 'a', status: 'pending' as NodeStatus, position: { x: 0, y: 0 } }],
      edges: [],
    };

    const { result, rerender } = renderHook(({ data }) => useWorkGraphFlow(data), {
      initialProps: { data },
    });

    const firstNodes = result.current.nodes;
    const firstEdges = result.current.edges;

    // Re-render with same data object
    rerender({ data });

    expect(result.current.nodes).toBe(firstNodes);
    expect(result.current.edges).toBe(firstEdges);
  });

  /**
   * Test: Handle empty arrays gracefully
   *
   * Purpose: Proves edge case handling
   * Quality Contribution: No crashes on empty graph
   * Acceptance Criteria: Returns empty arrays, no errors
   */
  test('should handle empty arrays gracefully', () => {
    const data: WorkGraphFlowData = { nodes: [], edges: [] };

    const { result } = renderHook(() => useWorkGraphFlow(data));

    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });

  /**
   * Test: Update output when data changes
   *
   * Purpose: Proves reactivity to data changes
   * Quality Contribution: UI updates when data updates
   * Acceptance Criteria: New data = new output arrays
   */
  test('should update output when data changes', () => {
    const initialData: WorkGraphFlowData = {
      nodes: [{ id: 'a', status: 'pending' as NodeStatus, position: { x: 0, y: 0 } }],
      edges: [],
    };

    const { result, rerender } = renderHook(({ data }) => useWorkGraphFlow(data), {
      initialProps: { data: initialData },
    });

    const firstNodes = result.current.nodes;

    // Update with new data
    const newData: WorkGraphFlowData = {
      nodes: [
        { id: 'a', status: 'complete' as NodeStatus, position: { x: 0, y: 0 } },
        { id: 'b', status: 'ready' as NodeStatus, position: { x: 0, y: 100 } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    };

    rerender({ data: newData });

    expect(result.current.nodes).not.toBe(firstNodes);
    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0].data.status).toBe('complete');
    expect(result.current.edges).toHaveLength(1);
  });

  /**
   * Test: Include all node properties in data
   *
   * Purpose: Proves complete data transfer to React Flow
   * Quality Contribution: All status info available for rendering
   * Acceptance Criteria: questionId, errorMessage, unit all present
   */
  test('should include all node properties in React Flow node data', () => {
    const data: WorkGraphFlowData = {
      nodes: [
        {
          id: 'waiting',
          status: 'waiting-question' as NodeStatus,
          position: { x: 0, y: 0 },
          unit: 'user-input',
          questionId: 'q123',
        },
        {
          id: 'error',
          status: 'blocked-error' as NodeStatus,
          position: { x: 0, y: 100 },
          unit: 'sample-coder',
          errorMessage: 'API timeout',
        },
      ],
      edges: [],
    };

    const { result } = renderHook(() => useWorkGraphFlow(data));

    expect(result.current.nodes[0].data).toMatchObject({
      id: 'waiting',
      status: 'waiting-question',
      unit: 'user-input',
      questionId: 'q123',
    });
    expect(result.current.nodes[1].data).toMatchObject({
      id: 'error',
      status: 'blocked-error',
      unit: 'sample-coder',
      errorMessage: 'API timeout',
    });
  });

  /**
   * Test: Handle all 6 status types
   *
   * Purpose: Proves all statuses transform correctly
   * Quality Contribution: AC-5 status visualization support
   * Acceptance Criteria: All statuses pass through correctly
   */
  test('should handle all 6 status types', () => {
    const statuses: NodeStatus[] = [
      'pending',
      'ready',
      'running',
      'waiting-question',
      'blocked-error',
      'complete',
    ];

    const data: WorkGraphFlowData = {
      nodes: statuses.map((status, i) => ({
        id: `node-${status}`,
        status,
        position: { x: 0, y: i * 100 },
      })),
      edges: [],
    };

    const { result } = renderHook(() => useWorkGraphFlow(data));

    expect(result.current.nodes).toHaveLength(6);
    statuses.forEach((status, i) => {
      expect(result.current.nodes[i].data.status).toBe(status);
    });
  });
});
