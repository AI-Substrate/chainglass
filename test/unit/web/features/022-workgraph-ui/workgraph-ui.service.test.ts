/**
 * WorkGraphUIService Interface Tests - TDD RED Phase (T001)
 *
 * These tests define the contract for WorkGraphUIService.
 * Per Full TDD: Write tests first, expect them to fail.
 *
 * Per DYK#3 Naming Convention:
 * - fakeBackendService = FakeWorkGraphService (existing backend)
 * - fakeUIService = FakeWorkGraphUIService (what we're testing against)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestWorkspaceContext } from '../../../../helpers/workspace-context.js';

import { FakeWorkGraphUIService } from '../../../../../apps/web/src/features/022-workgraph-ui/fake-workgraph-ui-service.js';
import type { IWorkGraphUIService } from '../../../../../apps/web/src/features/022-workgraph-ui/workgraph-ui.types.js';

describe('WorkGraphUIService Interface', () => {
  // Using FakeWorkGraphUIService to test the interface contract
  // The real implementation (T008) will also pass these tests
  let service: IWorkGraphUIService;

  beforeEach(() => {
    // Using fake to verify interface contract
    service = new FakeWorkGraphUIService();
  });

  describe('getInstance', () => {
    it('should return same instance for same workspace+slug (caching)', async () => {
      /*
      Test Doc:
      - Why: Instance caching prevents duplicate instances and preserves subscriptions
      - Contract: getInstance(ctx, slug) returns cached instance for same (worktreePath, slug) key
      - Usage Notes: Cache key is `${ctx.worktreePath}|${slug}`
      - Quality Contribution: Memory efficiency, subscription preservation
      - Worked Example: getInstance(ctx, 'graph-a') twice → same object reference
      */
      const ctx = createTestWorkspaceContext('/workspace');

      const instance1 = await service.getInstance(ctx, 'my-graph');
      const instance2 = await service.getInstance(ctx, 'my-graph');

      expect(instance1).toBe(instance2); // Same reference
    });

    it('should return different instances for different slugs', async () => {
      /*
      Test Doc:
      - Why: Each graph needs its own state
      - Contract: Different slugs produce different instances
      - Quality Contribution: Isolation between graphs
      - Worked Example: getInstance(ctx, 'graph-a') !== getInstance(ctx, 'graph-b')
      */
      const ctx = createTestWorkspaceContext('/workspace');

      const instanceA = await service.getInstance(ctx, 'graph-a');
      const instanceB = await service.getInstance(ctx, 'graph-b');

      expect(instanceA).not.toBe(instanceB);
      expect(instanceA.graphSlug).toBe('graph-a');
      expect(instanceB.graphSlug).toBe('graph-b');
    });

    it('should return different instances for different workspaces', async () => {
      /*
      Test Doc:
      - Why: Workspace isolation - same slug in different workspaces are distinct
      - Contract: Different worktreePath means different cache key
      - Quality Contribution: Multi-workspace support
      - Worked Example: wsA/graph !== wsB/graph
      */
      const ctxA = createTestWorkspaceContext('/workspace-a');
      const ctxB = createTestWorkspaceContext('/workspace-b');

      const instanceA = await service.getInstance(ctxA, 'shared-graph');
      const instanceB = await service.getInstance(ctxB, 'shared-graph');

      expect(instanceA).not.toBe(instanceB);
    });
  });

  describe('listGraphs', () => {
    it('should list graphs from backend service', async () => {
      /*
      Test Doc:
      - Why: UI needs to display available graphs
      - Contract: listGraphs(ctx) returns array of graph slugs from backend
      - Quality Contribution: Graph discovery
      - Worked Example: listGraphs(ctx) → ['graph-a', 'graph-b']
      */
      const ctx = createTestWorkspaceContext('/workspace');

      const result = await service.listGraphs(ctx);

      expect(result.errors).toHaveLength(0);
      expect(Array.isArray(result.graphSlugs)).toBe(true);
    });
  });

  describe('createGraph', () => {
    it('should create graph via backend and return instance', async () => {
      /*
      Test Doc:
      - Why: UI needs to create new graphs
      - Contract: createGraph(ctx, slug) creates via backend, returns cached instance
      - Quality Contribution: Graph creation flow
      - Worked Example: createGraph(ctx, 'new-graph') → instance with graphSlug='new-graph'
      */
      const ctx = createTestWorkspaceContext('/workspace');

      const result = await service.createGraph(ctx, 'new-graph');

      expect(result.errors).toHaveLength(0);
      expect(result.instance).toBeDefined();
      expect(result.instance?.graphSlug).toBe('new-graph');

      // Should be cached now
      const cached = await service.getInstance(ctx, 'new-graph');
      expect(cached).toBe(result.instance);
    });

    it('should return error for duplicate slug', async () => {
      /*
      Test Doc:
      - Why: Prevent accidental overwrites
      - Contract: Creating existing graph returns error
      - Quality Contribution: Data integrity
      - Worked Example: createGraph(ctx, 'existing') → errors: [E102]
      */
      const ctx = createTestWorkspaceContext('/workspace');

      // Create first time
      await service.createGraph(ctx, 'existing-graph');

      // Try to create again
      const result = await service.createGraph(ctx, 'existing-graph');

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('deleteGraph', () => {
    it('should delete graph via backend and remove from cache', async () => {
      /*
      Test Doc:
      - Why: UI needs to delete graphs
      - Contract: deleteGraph(ctx, slug) deletes via backend, removes from cache
      - Quality Contribution: Graph cleanup
      - Worked Example: deleteGraph(ctx, 'old-graph') → removed from backend and cache
      */
      const ctx = createTestWorkspaceContext('/workspace');

      // First create and cache
      await service.createGraph(ctx, 'to-delete');
      const instance = await service.getInstance(ctx, 'to-delete');

      // Delete
      const result = await service.deleteGraph(ctx, 'to-delete');

      expect(result.errors).toHaveLength(0);
      expect(result.deleted).toBe(true);

      // Instance should be disposed
      // Getting again should create new instance (not same reference)
      const newInstance = await service.getInstance(ctx, 'to-delete');
      expect(newInstance).not.toBe(instance);
    });
  });

  describe('disposeAll', () => {
    it('should dispose all cached instances on disposeAll()', async () => {
      /*
      Test Doc:
      - Why: Cleanup on page unmount
      - Contract: disposeAll() disposes and clears all cached instances
      - Quality Contribution: Memory management
      - Worked Example: disposeAll() → all instances disposed, cache cleared
      */
      const ctx = createTestWorkspaceContext('/workspace');

      // Create several instances
      const instance1 = await service.getInstance(ctx, 'graph-1');
      const instance2 = await service.getInstance(ctx, 'graph-2');

      // Dispose all
      service.disposeAll();

      // Getting again should create new instances
      const newInstance1 = await service.getInstance(ctx, 'graph-1');
      const newInstance2 = await service.getInstance(ctx, 'graph-2');

      expect(newInstance1).not.toBe(instance1);
      expect(newInstance2).not.toBe(instance2);
    });
  });
});

// ============================================
// T007: Real WorkGraphUIService Tests
// ============================================

import { FakeWorkGraphService } from '@chainglass/workgraph/fakes';
import { WorkGraphUIService } from '../../../../../apps/web/src/features/022-workgraph-ui/workgraph-ui.service.js';

describe('WorkGraphUIService Real Implementation (T007)', () => {
  let fakeBackendService: FakeWorkGraphService;
  let service: WorkGraphUIService;

  beforeEach(() => {
    // Per DYK#3: fakeBackendService for the existing backend fake
    fakeBackendService = new FakeWorkGraphService();
    service = new WorkGraphUIService(fakeBackendService);
  });

  describe('getInstance with backend', () => {
    it('should load from backend and cache instance', async () => {
      /*
      Test Doc:
      - Why: Verify real service loads from backend
      - Contract: getInstance calls backend.load() and backend.status()
      - Quality Contribution: Backend integration
      */
      const ctx = createTestWorkspaceContext('/workspace');

      // Configure backend to return a valid graph
      fakeBackendService.setPresetLoadResult(ctx, 'test-graph', {
        graph: {
          slug: 'test-graph',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          nodes: ['start'],
          edges: [],
        },
        status: 'pending',
        errors: [],
      });

      fakeBackendService.setPresetStatusResult(ctx, 'test-graph', {
        graphSlug: 'test-graph',
        graphStatus: 'pending',
        nodes: [{ id: 'start', status: 'ready' }],
        errors: [],
      });

      // Get instance
      const instance = await service.getInstance(ctx, 'test-graph');

      // Verify backend was called
      expect(fakeBackendService.getLoadCalls()).toHaveLength(1);
      expect(fakeBackendService.getStatusCalls()).toHaveLength(1);

      // Verify instance properties
      expect(instance.graphSlug).toBe('test-graph');
      expect(instance.nodes.size).toBe(1);
      expect(instance.nodes.get('start')?.status).toBe('ready');
    });

    it('should return cached instance without calling backend again', async () => {
      /*
      Test Doc:
      - Why: Caching prevents redundant backend calls
      - Contract: Second getInstance returns cached instance
      */
      const ctx = createTestWorkspaceContext('/workspace');

      fakeBackendService.setPresetLoadResult(ctx, 'cached-test', {
        graph: {
          slug: 'cached-test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          nodes: ['start'],
          edges: [],
        },
        status: 'pending',
        errors: [],
      });

      fakeBackendService.setPresetStatusResult(ctx, 'cached-test', {
        graphSlug: 'cached-test',
        graphStatus: 'pending',
        nodes: [],
        errors: [],
      });

      // First call
      const instance1 = await service.getInstance(ctx, 'cached-test');
      const loadCallsAfterFirst = fakeBackendService.getLoadCalls().length;

      // Second call (should use cache)
      const instance2 = await service.getInstance(ctx, 'cached-test');
      const loadCallsAfterSecond = fakeBackendService.getLoadCalls().length;

      // Same instance
      expect(instance1).toBe(instance2);
      // No additional backend calls
      expect(loadCallsAfterSecond).toBe(loadCallsAfterFirst);
    });

    it('should throw on backend error', async () => {
      /*
      Test Doc:
      - Why: Error handling for missing graphs
      - Contract: Backend errors propagate correctly
      */
      const ctx = createTestWorkspaceContext('/workspace');

      // Backend returns error (default behavior for missing graph)
      await expect(service.getInstance(ctx, 'nonexistent')).rejects.toThrow(/not found/i);
    });
  });

  describe('createGraph with backend', () => {
    it('should create via backend and return instance', async () => {
      /*
      Test Doc:
      - Why: Graph creation flow
      - Contract: createGraph calls backend.create(), then getInstance
      */
      const ctx = createTestWorkspaceContext('/workspace');

      // Configure backend create result
      fakeBackendService.setPresetCreateResult(ctx, 'new-graph', {
        graphSlug: 'new-graph',
        path: '.chainglass/data/work-graphs/new-graph',
        errors: [],
      });

      // Configure load result for the created graph
      fakeBackendService.setPresetLoadResult(ctx, 'new-graph', {
        graph: {
          slug: 'new-graph',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          nodes: ['start'],
          edges: [],
        },
        status: 'pending',
        errors: [],
      });

      fakeBackendService.setPresetStatusResult(ctx, 'new-graph', {
        graphSlug: 'new-graph',
        graphStatus: 'pending',
        nodes: [],
        errors: [],
      });

      // Create graph
      const result = await service.createGraph(ctx, 'new-graph');

      expect(result.errors).toHaveLength(0);
      expect(result.graphSlug).toBe('new-graph');
      expect(result.instance).toBeDefined();
      expect(result.instance?.graphSlug).toBe('new-graph');

      // Backend create was called
      expect(fakeBackendService.getCreateCalls()).toHaveLength(1);
    });
  });

  describe('disposeAll', () => {
    it('should dispose all instances and clear cache', async () => {
      /*
      Test Doc:
      - Why: Resource cleanup
      - Contract: disposeAll clears all cached instances
      */
      const ctx = createTestWorkspaceContext('/workspace');

      // Setup backend for two graphs
      for (const slug of ['graph-1', 'graph-2']) {
        fakeBackendService.setPresetLoadResult(ctx, slug, {
          graph: {
            slug,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            nodes: ['start'],
            edges: [],
          },
          status: 'pending',
          errors: [],
        });
        fakeBackendService.setPresetStatusResult(ctx, slug, {
          graphSlug: slug,
          graphStatus: 'pending',
          nodes: [],
          errors: [],
        });
      }

      // Get instances
      const instance1 = await service.getInstance(ctx, 'graph-1');
      await service.getInstance(ctx, 'graph-2');

      expect(service.getCacheSize()).toBe(2);

      // Dispose all
      service.disposeAll();

      expect(service.getCacheSize()).toBe(0);
      expect(instance1.isDisposed).toBe(true);
    });
  });
});
