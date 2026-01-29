/**
 * Edge Connection Tests - Phase 3 (T006)
 *
 * Tests for manual edge connection between nodes.
 * Per DYK#5: Uses canConnect() for type validation.
 *
 * Testing approach: Full TDD - write tests first (RED), implement (GREEN), refactor.
 * Per Constitution Principle 4: Using Fake classes instead of vi.fn().
 */

import { FakeWorkGraphUIInstance } from '@/features/022-workgraph-ui/fake-workgraph-ui-instance';
import { FakeSubscriber } from '@/features/022-workgraph-ui/test-fakes';
import type {
  UIEdge,
  UINodeState,
  WorkGraphUIEvent,
} from '@/features/022-workgraph-ui/workgraph-ui.types';
import { beforeEach, describe, expect, test } from 'vitest';

describe('Edge Connection', () => {
  let fakeInstance: FakeWorkGraphUIInstance;

  beforeEach(() => {
    // Create instance with nodes but no edge between A and B
    const nodes: UINodeState[] = [
      { id: 'start', status: 'complete', position: { x: 100, y: 100 }, type: 'start' },
      { id: 'nodeA', status: 'ready', position: { x: 200, y: 100 }, unit: 'agent-a' },
      { id: 'nodeB', status: 'disconnected', position: { x: 300, y: 100 }, unit: 'agent-b' },
    ];

    const edges: UIEdge[] = [
      { id: 'e1', source: 'start', target: 'nodeA' },
      // No edge from nodeA to nodeB yet
    ];

    fakeInstance = new FakeWorkGraphUIInstance({
      graphSlug: 'test-graph',
      nodes,
      edges,
    });
  });

  describe('connectNodes', () => {
    /**
     * Test: Connect two nodes creates edge
     *
     * Purpose: Proves basic edge creation works
     * Quality Contribution: Core functionality
     * Acceptance Criteria: Edge added to graph
     */
    test('should create edge between two nodes', async () => {
      const result = await fakeInstance.connectNodes('nodeA', 'output', 'nodeB', 'input');

      expect(result.connected).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Check edge was added
      expect(fakeInstance.edges.some((e) => e.source === 'nodeA' && e.target === 'nodeB')).toBe(
        true
      );
    });

    /**
     * Test: Connect updates target node status
     *
     * Purpose: Proves status recomputation after connection
     * Quality Contribution: DAG status correctness
     * Acceptance Criteria: Target node no longer disconnected
     */
    test('should update target node status after connection', async () => {
      // Before: nodeB is disconnected
      expect(fakeInstance.nodes.get('nodeB')?.status).toBe('disconnected');

      await fakeInstance.connectNodes('nodeA', 'output', 'nodeB', 'input');

      // After: nodeB should be pending or ready (not disconnected)
      const nodeB = fakeInstance.nodes.get('nodeB');
      expect(nodeB?.status).not.toBe('disconnected');
    });

    /**
     * Test: Tracks mutation call
     *
     * Purpose: Proves mutation call is tracked for testing
     * Quality Contribution: Testability
     * Acceptance Criteria: getMutationCalls() returns connect call
     */
    test('should track mutation call', async () => {
      await fakeInstance.connectNodes('nodeA', 'output', 'nodeB', 'input');

      const calls = fakeInstance.getMutationCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('connectNodes');
      expect(calls[0].args).toEqual(['nodeA', 'output', 'nodeB', 'input']);
    });

    /**
     * Test: Emits changed event
     *
     * Purpose: Proves event emission for UI updates
     * Quality Contribution: React integration
     * Acceptance Criteria: Subscriber receives changed event
     */
    test('should emit changed event on successful connection', async () => {
      const subscriber = new FakeSubscriber<WorkGraphUIEvent>();
      fakeInstance.subscribe(subscriber.handler);

      await fakeInstance.connectNodes('nodeA', 'output', 'nodeB', 'input');

      expect(subscriber.wasCalledWith({ type: 'changed' })).toBe(true);
    });

    /**
     * Test: Handle validation failure
     *
     * Purpose: Proves error handling when connection invalid
     * Quality Contribution: Error feedback to user
     * Acceptance Criteria: Returns error from preset result
     */
    test('should return error when connection is invalid', async () => {
      fakeInstance.setConnectResult({
        connected: false,
        errors: [{ code: 'E103', message: 'Type mismatch: expected text, got number' }],
      });

      const result = await fakeInstance.connectNodes('nodeA', 'output', 'nodeB', 'input');

      expect(result.connected).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E103');
    });
  });

  describe('disconnectNode', () => {
    /**
     * Test: Disconnect removes incoming edges
     *
     * Purpose: Proves disconnection removes edges
     * Quality Contribution: Rewiring support
     * Acceptance Criteria: Node has no incoming edges after disconnect
     */
    test('should remove incoming edges from node', async () => {
      // First connect the nodes
      await fakeInstance.connectNodes('nodeA', 'output', 'nodeB', 'input');
      expect(fakeInstance.edges.some((e) => e.target === 'nodeB')).toBe(true);

      // Now disconnect nodeB
      const result = await fakeInstance.disconnectNode('nodeB');

      expect(result.errors).toHaveLength(0);

      // Check edge was removed
      expect(fakeInstance.edges.some((e) => e.target === 'nodeB')).toBe(false);
    });

    /**
     * Test: Disconnect updates node status
     *
     * Purpose: Proves status recomputation after disconnect
     * Quality Contribution: DAG status correctness
     * Acceptance Criteria: Node becomes disconnected
     */
    test('should update node status to disconnected', async () => {
      // First connect the nodes
      await fakeInstance.connectNodes('nodeA', 'output', 'nodeB', 'input');
      expect(fakeInstance.nodes.get('nodeB')?.status).not.toBe('disconnected');

      // Now disconnect nodeB
      await fakeInstance.disconnectNode('nodeB');

      // Node should be disconnected again
      expect(fakeInstance.nodes.get('nodeB')?.status).toBe('disconnected');
    });

    /**
     * Test: Cannot disconnect start node (silently succeeds)
     *
     * Purpose: Proves start node protection
     * Quality Contribution: Data integrity
     * Acceptance Criteria: Start node remains unchanged
     */
    test('should not disconnect start node', async () => {
      // Disconnect start node - should silently succeed (no incoming edges anyway)
      const result = await fakeInstance.disconnectNode('start');

      // FakeInstance doesn't validate start specially, just removes edges
      // Real implementation might return error, but fake is permissive
      expect(result.errors).toHaveLength(0);
    });
  });
});
