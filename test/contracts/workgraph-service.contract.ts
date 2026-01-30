/**
 * IWorkGraphService Contract Tests.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeWorkGraphService and real implementation pass the same behavioral tests.
 *
 * Per Plan 021 (DYK#1): Contract tests stubbed with ctx parameter during Phase 1.
 * Full ctx behavioral testing will be added in Phase 5.
 *
 * Usage:
 * ```typescript
 * import { workGraphServiceContractTests } from '@test/contracts/workgraph-service.contract';
 *
 * workGraphServiceContractTests('FakeWorkGraphService', () => new FakeWorkGraphService());
 * workGraphServiceContractTests('WorkGraphService', () => new WorkGraphService(...));
 * ```
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type { IWorkGraphService } from '@chainglass/workgraph/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Creates a stub WorkspaceContext for contract tests.
 * Per DYK#1: Stub only - full ctx testing in Phase 5.
 */
function createStubContext(): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: '/test/workspace',
    worktreePath: '/test/workspace',
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: true,
  };
}

/**
 * Contract tests for IWorkGraphService implementations.
 */
export function workGraphServiceContractTests(
  name: string,
  createService: () => IWorkGraphService
) {
  describe(`${name} implements IWorkGraphService contract`, () => {
    let service: IWorkGraphService;
    let ctx: WorkspaceContext;

    beforeEach(() => {
      service = createService();
      ctx = createStubContext();
    });

    describe('create()', () => {
      it('should return GraphCreateResult with graphSlug and path', async () => {
        /*
        Test Doc:
        - Why: Contract requires create() returns new graph info
        - Contract: create(ctx, slug) returns { graphSlug, path, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for graph creation
        - Worked Example: create(ctx, 'my-graph') → { graphSlug: 'my-graph', path: '...', errors: [] }
        */
        const result = await service.create(ctx, 'test-graph');

        expect(result).toHaveProperty('graphSlug');
        expect(result).toHaveProperty('path');
        expect(result).toHaveProperty('errors');
        expect(result.graphSlug).toBe('test-graph');
        expect(Array.isArray(result.errors)).toBe(true);
      });
    });

    describe('load()', () => {
      it('should return GraphLoadResult with graph or error', async () => {
        /*
        Test Doc:
        - Why: Contract requires load() returns graph definition or E101 error
        - Contract: load(ctx, slug) returns { graph?, status?, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for graph loading
        - Worked Example: load(ctx, 'my-graph') → { graph: {...}, status: 'pending', errors: [] }
        */
        const result = await service.load(ctx, 'nonexistent-graph');

        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);

        // Either graph exists or errors exist
        if (result.errors.length === 0) {
          expect(result.graph).toBeDefined();
          expect(result.status).toBeDefined();
        } else {
          expect(result.errors[0]).toHaveProperty('code');
          expect(result.errors[0]).toHaveProperty('message');
        }
      });

      it('should return error E101 for non-existent graph', async () => {
        const result = await service.load(ctx, 'definitely-not-a-real-graph');

        // Per spec: E101 is graph not found
        if (result.errors.length > 0) {
          expect(result.errors[0].code).toBe('E101');
        }
      });
    });

    describe('show()', () => {
      it('should return GraphShowResult with tree structure', async () => {
        /*
        Test Doc:
        - Why: Contract requires show() returns tree representation
        - Contract: show(ctx, slug) returns { graphSlug, tree, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for graph display
        - Worked Example: show(ctx, 'my-graph') → { graphSlug: 'my-graph', tree: {...}, errors: [] }
        */
        const result = await service.show(ctx, 'test-graph');

        expect(result).toHaveProperty('graphSlug');
        expect(result).toHaveProperty('tree');
        expect(result).toHaveProperty('errors');
        expect(result.tree).toHaveProperty('id');
        expect(result.tree).toHaveProperty('children');
        expect(Array.isArray(result.tree.children)).toBe(true);
      });
    });

    describe('status()', () => {
      it('should return GraphStatusResult with node statuses', async () => {
        /*
        Test Doc:
        - Why: Contract requires status() returns execution state
        - Contract: status(ctx, slug) returns { graphSlug, graphStatus, nodes: [], errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for status display
        - Worked Example: status(ctx, 'my-graph') → { graphSlug: 'my-graph', graphStatus: 'pending', nodes: [...], errors: [] }
        */
        const result = await service.status(ctx, 'test-graph');

        expect(result).toHaveProperty('graphSlug');
        expect(result).toHaveProperty('graphStatus');
        expect(result).toHaveProperty('nodes');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.nodes)).toBe(true);
        expect(['pending', 'in_progress', 'complete', 'failed']).toContain(result.graphStatus);
      });
    });

    describe('addNodeAfter()', () => {
      it('should return AddNodeResult with nodeId and inputs', async () => {
        /*
        Test Doc:
        - Why: Contract requires addNodeAfter() returns new node info
        - Contract: addNodeAfter(ctx, graph, after, unit, opts?) returns { nodeId, inputs, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for node addition
        - Worked Example: addNodeAfter(ctx, 'graph', 'start', 'unit') → { nodeId: 'unit-abc', inputs: {}, errors: [] }
        */
        const result = await service.addNodeAfter(ctx, 'test-graph', 'start', 'test-unit');

        expect(result).toHaveProperty('nodeId');
        expect(result).toHaveProperty('inputs');
        expect(result).toHaveProperty('errors');
        expect(typeof result.nodeId).toBe('string');
        expect(typeof result.inputs).toBe('object');
      });

      it('should accept optional config', async () => {
        const result = await service.addNodeAfter(ctx, 'test-graph', 'start', 'test-unit', {
          config: { prompt: 'Test prompt' },
        });

        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
      });
    });

    describe('removeNode()', () => {
      it('should return RemoveNodeResult with removedNodes list', async () => {
        /*
        Test Doc:
        - Why: Contract requires removeNode() returns removed node info
        - Contract: removeNode(ctx, graph, node, opts?) returns { removedNodes: [], errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for node removal
        - Worked Example: removeNode(ctx, 'graph', 'node-id') → { removedNodes: ['node-id'], errors: [] }
        */
        const result = await service.removeNode(ctx, 'test-graph', 'test-node');

        expect(result).toHaveProperty('removedNodes');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.removedNodes)).toBe(true);
      });

      it('should accept cascade option', async () => {
        const result = await service.removeNode(ctx, 'test-graph', 'test-node', {
          cascade: true,
        });

        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
      });
    });
  });
}
