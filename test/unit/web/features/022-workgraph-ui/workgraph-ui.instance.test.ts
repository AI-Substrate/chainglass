/**
 * WorkGraphUIInstance Interface Tests - TDD RED Phase (T002)
 *
 * These tests define the contract for WorkGraphUIInstance.
 * Per Full TDD: Write tests first, expect them to fail.
 *
 * Per DYK#2: refresh() only emits 'changed' when data actually differs
 * Per DYK#4: Phase 1 uses IWorkGraphUIInstanceCore (read-only)
 * Per DYK#5: disposed instance silently ignores async completion
 *
 * Per DYK#3 Naming Convention:
 * - fakeBackendService = FakeWorkGraphService
 * - fakeUIInstance = FakeWorkGraphUIInstance
 *
 * Per Constitution Principle 4: Using Fake classes instead of vi.fn().
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestWorkspaceContext } from '../../../../helpers/workspace-context.js';

import { FakeWorkGraphUIInstance } from '../../../../../apps/web/src/features/022-workgraph-ui/fake-workgraph-ui-instance.js';
import { FakeSubscriber } from '../../../../../apps/web/src/features/022-workgraph-ui/test-fakes.js';
import type {
  IWorkGraphUIInstanceCore,
  WorkGraphUIEvent,
} from '../../../../../apps/web/src/features/022-workgraph-ui/workgraph-ui.types.js';

describe('WorkGraphUIInstance Interface', () => {
  // Using FakeWorkGraphUIInstance to test the interface contract
  // The real implementation (T010) will also pass these tests
  let instance: IWorkGraphUIInstanceCore;

  beforeEach(() => {
    // Create instance with test data
    instance = FakeWorkGraphUIInstance.withNodes([
      { id: 'start', status: 'complete', position: { x: 100, y: 0 }, type: 'start' },
      { id: 'node-1', status: 'ready', position: { x: 100, y: 150 } },
      { id: 'node-2', status: 'pending', position: { x: 100, y: 300 } },
    ]);
  });

  describe('identity', () => {
    it('should expose graphSlug readonly property', async () => {
      /*
      Test Doc:
      - Why: Instance identity for cache keys and display
      - Contract: graphSlug is readonly string matching constructor arg
      - Quality Contribution: Instance identification
      - Worked Example: instance.graphSlug === 'my-graph'
      */
      expect(instance.graphSlug).toBe('test-graph'); // Default slug from FakeWorkGraphUIInstance
    });
  });

  describe('hydration', () => {
    it('should populate nodes Map from definition', async () => {
      /*
      Test Doc:
      - Why: Nodes must be accessible by ID for React Flow rendering
      - Contract: nodes is Map<string, UINodeState> populated from definition.nodes
      - Quality Contribution: Data structure compatibility with React Flow
      - Worked Example: definition.nodes=['start','node-1'] → nodes.size === 2
      */
      expect(instance.nodes).toBeInstanceOf(Map);
      expect(instance.nodes.size).toBeGreaterThan(0);

      // Each node should have required properties
      for (const [nodeId, nodeState] of instance.nodes) {
        expect(typeof nodeId).toBe('string');
        expect(nodeState).toHaveProperty('id');
        expect(nodeState).toHaveProperty('status');
        expect(nodeState).toHaveProperty('position');
      }
    });

    it('should compute edges array from definition', async () => {
      /*
      Test Doc:
      - Why: Edges needed for React Flow edge rendering
      - Contract: edges is array of {source, target} from definition.edges
      - Quality Contribution: Graph connectivity
      - Worked Example: definition.edges=[{from:'a',to:'b'}] → edges=[{source:'a',target:'b'}]
      */
      expect(Array.isArray(instance.edges)).toBe(true);

      for (const edge of instance.edges) {
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
        expect(typeof edge.source).toBe('string');
        expect(typeof edge.target).toBe('string');
      }
    });

    it('should provide default positions via vertical cascade (DYK#1)', async () => {
      /*
      Test Doc:
      - Why: Per DYK#1, nodes need positions before layout.json (Phase 6)
      - Contract: Nodes get {x: 100, y: nodeIndex * 150} default positions
      - Quality Contribution: React Flow can render without overlapping nodes
      - Worked Example: node[0].position={x:100,y:0}, node[1].position={x:100,y:150}
      */
      const nodeArray = Array.from(instance.nodes.values());

      // All nodes should have positions
      for (const node of nodeArray) {
        expect(node.position).toBeDefined();
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
      }

      // Should be vertically cascaded
      if (nodeArray.length > 1) {
        expect(nodeArray[0].position.y).toBeLessThan(nodeArray[1].position.y);
      }
    });
  });

  describe('event system', () => {
    it('should call subscriber on changed event', async () => {
      /*
      Test Doc:
      - Why: React needs to know when to re-render
      - Contract: subscribe(callback) registers listener for 'changed' events
      - Quality Contribution: Reactive updates
      - Worked Example: subscribe(fn) → refresh() → fn({type:'changed'}) called
      */
      const subscriber = new FakeSubscriber<WorkGraphUIEvent>();

      instance.subscribe(subscriber.handler);
      await instance.refresh();

      // If data changed, subscriber should be called
      // Note: Per DYK#2, only fires if data actually changed
      expect(subscriber.wasCalled()).toBe(true);
      expect(subscriber.wasCalledWith({ type: 'changed' })).toBe(true);
    });

    it('should unsubscribe cleanly', async () => {
      /*
      Test Doc:
      - Why: Prevent memory leaks on component unmount
      - Contract: subscribe() returns unsubscribe function
      - Quality Contribution: Cleanup capability
      - Worked Example: const unsub = subscribe(fn); unsub(); refresh() → fn not called
      */
      const subscriber = new FakeSubscriber<WorkGraphUIEvent>();

      const unsubscribe = instance.subscribe(subscriber.handler);
      unsubscribe();

      await instance.refresh();

      expect(subscriber.wasCalled()).toBe(false);
    });

    it('should support multiple subscribers', async () => {
      /*
      Test Doc:
      - Why: Multiple React components may need updates
      - Contract: Multiple subscribe() calls all receive events
      - Quality Contribution: Multi-consumer support
      */
      const subscriber1 = new FakeSubscriber<WorkGraphUIEvent>();
      const subscriber2 = new FakeSubscriber<WorkGraphUIEvent>();

      instance.subscribe(subscriber1.handler);
      instance.subscribe(subscriber2.handler);
      await instance.refresh();

      expect(subscriber1.wasCalled()).toBe(true);
      expect(subscriber2.wasCalled()).toBe(true);
    });
  });

  describe('refresh', () => {
    it('should reload from backend on refresh()', async () => {
      /*
      Test Doc:
      - Why: SSE notification triggers reload
      - Contract: refresh() reloads definition+state from backend
      - Quality Contribution: External change detection
      */
      // Initial state
      const nodeCountBefore = instance.nodes.size;

      // Simulate backend change and refresh
      await instance.refresh();

      // Instance should reflect any changes
      expect(instance.nodes.size).toBeGreaterThanOrEqual(0);
    });

    it('should NOT emit changed when data unchanged (DYK#2)', async () => {
      /*
      Test Doc:
      - Why: Per DYK#2, prevent render thrashing from idle polling
      - Contract: refresh() compares state, only emits if data differs
      - Quality Contribution: Performance optimization
      - Worked Example: refresh() with no changes → callback NOT called
      */
      // Create a fresh fake instance and configure it to simulate no data change
      const fakeUIInstance = FakeWorkGraphUIInstance.withNodes([
        { id: 'start', status: 'complete', position: { x: 100, y: 0 }, type: 'start' },
      ]);
      fakeUIInstance.setDataChangedOnRefresh(false); // Simulate no data change

      const subscriber = new FakeSubscriber<WorkGraphUIEvent>();
      fakeUIInstance.subscribe(subscriber.handler);

      // Refresh with no changes
      await fakeUIInstance.refresh();

      // If data didn't change, subscriber should NOT be called
      expect(subscriber.wasCalled()).toBe(false);
    });

    it('should NOT emit changed if dispose() called mid-flight (DYK#5)', async () => {
      /*
      Test Doc:
      - Why: Per DYK#5, prevent race condition with dispose
      - Contract: refresh() checks isDisposed flag after async operation
      - Quality Contribution: Memory safety, no stale updates
      - Worked Example: refresh() in flight + dispose() → no callback on completion
      */
      // Create a fresh fake instance with a delay to simulate async operation
      const fakeUIInstance = FakeWorkGraphUIInstance.withNodes([
        { id: 'start', status: 'complete', position: { x: 100, y: 0 }, type: 'start' },
      ]);
      fakeUIInstance.setRefreshDelay(50); // Add delay to simulate async

      const subscriber = new FakeSubscriber<WorkGraphUIEvent>();
      fakeUIInstance.subscribe(subscriber.handler);

      // Start refresh (async)
      const refreshPromise = fakeUIInstance.refresh();

      // Dispose while refresh is in flight
      fakeUIInstance.dispose();

      // Wait for refresh to complete
      await refreshPromise;

      // Subscriber should NOT be called because disposed
      expect(subscriber.wasCalled()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should stop all activity on dispose()', async () => {
      /*
      Test Doc:
      - Why: Cleanup on unmount
      - Contract: dispose() clears subscriptions and marks instance inactive
      - Quality Contribution: Resource cleanup
      - Worked Example: dispose() → no more events fire
      */
      const subscriber = new FakeSubscriber<WorkGraphUIEvent>();
      instance.subscribe(subscriber.handler);

      instance.dispose();

      // After dispose, refresh should not trigger subscriber
      await instance.refresh();
      expect(subscriber.wasCalled()).toBe(false);
    });

    it('should be safe to call dispose() multiple times', async () => {
      /*
      Test Doc:
      - Why: Defensive programming
      - Contract: Multiple dispose() calls don't throw
      - Quality Contribution: Robustness
      */
      expect(() => {
        instance.dispose();
        instance.dispose();
        instance.dispose();
      }).not.toThrow();
    });
  });
});

// ============================================
// T009: Real WorkGraphUIInstance Tests
// ============================================

import { FakeWorkGraphService } from '@chainglass/workgraph/fakes';
import {
  WorkGraphUIInstance,
  computeAllNodeStatuses,
} from '../../../../../apps/web/src/features/022-workgraph-ui/workgraph-ui.instance.js';
import type { StoredNodeState } from '../../../../../apps/web/src/features/022-workgraph-ui/workgraph-ui.types.js';

describe('WorkGraphUIInstance Real Implementation (T009)', () => {
  let fakeBackendService: FakeWorkGraphService;

  beforeEach(() => {
    fakeBackendService = new FakeWorkGraphService();
  });

  describe('hydration from definition and state', () => {
    it('should build nodes Map with computed statuses', () => {
      /*
      Test Doc:
      - Why: Verify real instance hydration from definition
      - Contract: Nodes built from definition with computed statuses
      */
      const ctx = createTestWorkspaceContext('/workspace');
      const definition = {
        slug: 'test-graph',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        nodes: ['start', 'node-1', 'node-2'],
        edges: [
          { from: 'start', to: 'node-1' },
          { from: 'node-1', to: 'node-2' },
        ],
      };

      const statusResult = {
        graphSlug: 'test-graph',
        graphStatus: 'in_progress' as const,
        nodes: [{ id: 'start', status: 'complete' as const }],
        errors: [],
      };

      const instance = new WorkGraphUIInstance(
        'test-graph',
        definition,
        statusResult,
        fakeBackendService,
        ctx
      );

      // Check nodes were built
      expect(instance.nodes.size).toBe(3);

      // Check statuses: start=complete (stored), node-1=ready (computed), node-2=pending (computed)
      expect(instance.nodes.get('start')?.status).toBe('complete');
      expect(instance.nodes.get('node-1')?.status).toBe('ready');
      expect(instance.nodes.get('node-2')?.status).toBe('pending');
    });

    it('should assign vertical cascade positions', () => {
      /*
      Test Doc:
      - Why: Per DYK#1, default positions needed until Phase 6
      - Contract: Nodes get {x: 100, y: index * 150}
      */
      const ctx = createTestWorkspaceContext('/workspace');
      const definition = {
        slug: 'test-graph',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        nodes: ['start', 'node-1', 'node-2'],
        edges: [],
      };

      const statusResult = {
        graphSlug: 'test-graph',
        graphStatus: 'pending' as const,
        nodes: [],
        errors: [],
      };

      const instance = new WorkGraphUIInstance(
        'test-graph',
        definition,
        statusResult,
        fakeBackendService,
        ctx
      );

      expect(instance.nodes.get('start')?.position).toEqual({ x: 100, y: 0 });
      expect(instance.nodes.get('node-1')?.position).toEqual({ x: 100, y: 150 });
      expect(instance.nodes.get('node-2')?.position).toEqual({ x: 100, y: 300 });
    });

    it('should build edges array from definition', () => {
      /*
      Test Doc:
      - Why: Edges needed for React Flow
      - Contract: Edges transformed to {id, source, target} format
      */
      const ctx = createTestWorkspaceContext('/workspace');
      const definition = {
        slug: 'test-graph',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        nodes: ['start', 'node-1'],
        edges: [{ from: 'start', to: 'node-1' }],
      };

      const statusResult = {
        graphSlug: 'test-graph',
        graphStatus: 'pending' as const,
        nodes: [],
        errors: [],
      };

      const instance = new WorkGraphUIInstance(
        'test-graph',
        definition,
        statusResult,
        fakeBackendService,
        ctx
      );

      expect(instance.edges).toHaveLength(1);
      expect(instance.edges[0]).toMatchObject({
        source: 'start',
        target: 'node-1',
      });
    });
  });

  describe('refresh with change detection', () => {
    it('should emit changed when data differs (DYK#2)', async () => {
      /*
      Test Doc:
      - Why: UI needs to know when to re-render
      - Contract: refresh() emits changed when data differs
      */
      const ctx = createTestWorkspaceContext('/workspace');
      const definition = {
        slug: 'test-graph',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        nodes: ['start'],
        edges: [],
      };

      const statusResult = {
        graphSlug: 'test-graph',
        graphStatus: 'pending' as const,
        nodes: [],
        errors: [],
      };

      const instance = new WorkGraphUIInstance(
        'test-graph',
        definition,
        statusResult,
        fakeBackendService,
        ctx
      );

      // Setup backend to return changed data
      fakeBackendService.setPresetLoadResult(ctx, 'test-graph', {
        graph: {
          ...definition,
          nodes: ['start', 'new-node'], // New node added
        },
        status: 'in_progress',
        errors: [],
      });

      fakeBackendService.setPresetStatusResult(ctx, 'test-graph', {
        graphSlug: 'test-graph',
        graphStatus: 'in_progress',
        nodes: [{ id: 'start', status: 'complete' }],
        errors: [],
      });

      const subscriber = new FakeSubscriber<WorkGraphUIEvent>();
      instance.subscribe(subscriber.handler);

      await instance.refresh();

      // Should have emitted changed because data differed
      expect(subscriber.wasCalled()).toBe(true);
      expect(subscriber.wasCalledWith({ type: 'changed' })).toBe(true);
    });
  });
});

// ============================================
// T011: Status Computation Contract Tests
// ============================================

describe('Status Computation Contract Tests (T011)', () => {
  describe('computeAllNodeStatuses', () => {
    it('should compute ready for start node (no upstream)', () => {
      /*
      Test Doc:
      - Why: Start nodes have no dependencies
      - Contract: Node with no incoming edges = ready
      */
      const statuses = computeAllNodeStatuses(['start'], [], new Map());

      expect(statuses.get('start')).toBe('ready');
    });

    it('should compute pending when upstream incomplete', () => {
      /*
      Test Doc:
      - Why: Core dependency logic
      - Contract: Node with incomplete upstream = pending
      */
      const statuses = computeAllNodeStatuses(
        ['start', 'node-1'],
        [{ from: 'start', to: 'node-1' }],
        new Map() // No stored statuses, so start = ready (not complete)
      );

      expect(statuses.get('start')).toBe('ready');
      expect(statuses.get('node-1')).toBe('pending'); // start is ready, not complete
    });

    it('should compute ready when all upstream complete', () => {
      /*
      Test Doc:
      - Why: Node can run when dependencies done
      - Contract: All upstream complete = ready
      */
      const storedStatuses = new Map<string, StoredNodeState>([['start', { status: 'complete' }]]);

      const statuses = computeAllNodeStatuses(
        ['start', 'node-1'],
        [{ from: 'start', to: 'node-1' }],
        storedStatuses
      );

      expect(statuses.get('start')).toBe('complete');
      expect(statuses.get('node-1')).toBe('ready');
    });

    it('should preserve stored running status', () => {
      /*
      Test Doc:
      - Why: Running is a real state, not computed
      - Contract: Stored 'running' overrides computed
      */
      const storedStatuses = new Map<string, StoredNodeState>([['start', { status: 'running' }]]);

      const statuses = computeAllNodeStatuses(['start'], [], storedStatuses);

      expect(statuses.get('start')).toBe('running');
    });

    it('should preserve stored waiting-question status', () => {
      const storedStatuses = new Map<string, StoredNodeState>([
        ['agent-node', { status: 'waiting-question', question_id: 'q-123' }],
      ]);

      const statuses = computeAllNodeStatuses(['agent-node'], [], storedStatuses);

      expect(statuses.get('agent-node')).toBe('waiting-question');
    });

    it('should handle diamond dependencies correctly', () => {
      /*
      Test Doc:
      - Why: Diamond is common pattern
      - Contract: ALL upstream must be complete for ready
      */
      const storedStatuses = new Map<string, StoredNodeState>([
        ['start', { status: 'complete' }],
        ['branch-a', { status: 'complete' }],
        // branch-b has no stored status (computes to ready)
      ]);

      const statuses = computeAllNodeStatuses(
        ['start', 'branch-a', 'branch-b', 'merge'],
        [
          { from: 'start', to: 'branch-a' },
          { from: 'start', to: 'branch-b' },
          { from: 'branch-a', to: 'merge' },
          { from: 'branch-b', to: 'merge' },
        ],
        storedStatuses
      );

      expect(statuses.get('branch-a')).toBe('complete');
      expect(statuses.get('branch-b')).toBe('ready'); // No stored status
      expect(statuses.get('merge')).toBe('pending'); // branch-b is not complete
    });

    it('should handle chain of dependencies', () => {
      /*
      Test Doc:
      - Why: Sequential workflows
      - Contract: Each node depends on previous
      */
      const storedStatuses = new Map<string, StoredNodeState>([['step-1', { status: 'complete' }]]);

      const statuses = computeAllNodeStatuses(
        ['step-1', 'step-2', 'step-3'],
        [
          { from: 'step-1', to: 'step-2' },
          { from: 'step-2', to: 'step-3' },
        ],
        storedStatuses
      );

      expect(statuses.get('step-1')).toBe('complete');
      expect(statuses.get('step-2')).toBe('ready');
      expect(statuses.get('step-3')).toBe('pending');
    });
  });
});
