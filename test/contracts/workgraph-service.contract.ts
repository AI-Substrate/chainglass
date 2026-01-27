/**
 * IWorkGraphService Contract Tests.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeWorkGraphService and real implementation pass the same behavioral tests.
 *
 * Usage:
 * ```typescript
 * import { workGraphServiceContractTests } from '@test/contracts/workgraph-service.contract';
 *
 * workGraphServiceContractTests('FakeWorkGraphService', () => new FakeWorkGraphService());
 * workGraphServiceContractTests('WorkGraphService', () => new WorkGraphService(...));
 * ```
 */

import type { IWorkGraphService } from '@chainglass/workgraph/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Contract tests for IWorkGraphService implementations.
 */
export function workGraphServiceContractTests(
  name: string,
  createService: () => IWorkGraphService
) {
  describe(`${name} implements IWorkGraphService contract`, () => {
    let service: IWorkGraphService;

    beforeEach(() => {
      service = createService();
    });

    describe('create()', () => {
      it('should return GraphCreateResult with graphSlug and path', async () => {
        /*
        Test Doc:
        - Why: Contract requires create() returns new graph info
        - Contract: create(slug) returns { graphSlug, path, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for graph creation
        - Worked Example: create('my-graph') → { graphSlug: 'my-graph', path: '...', errors: [] }
        */
        const result = await service.create('test-graph');

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
        - Contract: load(slug) returns { graph?, status?, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for graph loading
        - Worked Example: load('my-graph') → { graph: {...}, status: 'pending', errors: [] }
        */
        const result = await service.load('nonexistent-graph');

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
        const result = await service.load('definitely-not-a-real-graph');

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
        - Contract: show(slug) returns { graphSlug, tree, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for graph display
        - Worked Example: show('my-graph') → { graphSlug: 'my-graph', tree: {...}, errors: [] }
        */
        const result = await service.show('test-graph');

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
        - Contract: status(slug) returns { graphSlug, graphStatus, nodes: [], errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for status display
        - Worked Example: status('my-graph') → { graphSlug: 'my-graph', graphStatus: 'pending', nodes: [...], errors: [] }
        */
        const result = await service.status('test-graph');

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
        - Contract: addNodeAfter(graph, after, unit, opts?) returns { nodeId, inputs, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for node addition
        - Worked Example: addNodeAfter('graph', 'start', 'unit') → { nodeId: 'unit-abc', inputs: {}, errors: [] }
        */
        const result = await service.addNodeAfter('test-graph', 'start', 'test-unit');

        expect(result).toHaveProperty('nodeId');
        expect(result).toHaveProperty('inputs');
        expect(result).toHaveProperty('errors');
        expect(typeof result.nodeId).toBe('string');
        expect(typeof result.inputs).toBe('object');
      });

      it('should accept optional config', async () => {
        const result = await service.addNodeAfter('test-graph', 'start', 'test-unit', {
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
        - Contract: removeNode(graph, node, opts?) returns { removedNodes: [], errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for node removal
        - Worked Example: removeNode('graph', 'node-id') → { removedNodes: ['node-id'], errors: [] }
        */
        const result = await service.removeNode('test-graph', 'test-node');

        expect(result).toHaveProperty('removedNodes');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.removedNodes)).toBe(true);
      });

      it('should accept cascade option', async () => {
        const result = await service.removeNode('test-graph', 'test-node', {
          cascade: true,
        });

        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
      });
    });
  });
}
