/**
 * IWorkNodeService Contract Tests.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeWorkNodeService and real implementation pass the same behavioral tests.
 *
 * Per Plan 021 (DYK#1): Contract tests stubbed with ctx parameter during Phase 1.
 * Full ctx behavioral testing will be added in Phase 5.
 *
 * Usage:
 * ```typescript
 * import { workNodeServiceContractTests } from '@test/contracts/worknode-service.contract';
 *
 * workNodeServiceContractTests('FakeWorkNodeService', () => new FakeWorkNodeService());
 * workNodeServiceContractTests('WorkNodeService', () => new WorkNodeService(...));
 * ```
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type { IWorkNodeService } from '@chainglass/workgraph/interfaces';
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
 * Contract tests for IWorkNodeService implementations.
 */
export function workNodeServiceContractTests(name: string, createService: () => IWorkNodeService) {
  describe(`${name} implements IWorkNodeService contract`, () => {
    let service: IWorkNodeService;
    let ctx: WorkspaceContext;

    beforeEach(() => {
      service = createService();
      ctx = createStubContext();
    });

    describe('canRun()', () => {
      it('should return CanRunResult with canRun flag', async () => {
        /*
        Test Doc:
        - Why: Contract requires canRun() returns execution readiness
        - Contract: canRun(ctx, graph, node) returns { canRun, reason?, blockingNodes?, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for run check
        - Worked Example: canRun(ctx, 'graph', 'node') → { canRun: true, errors: [] }
        */
        const result = await service.canRun(ctx, 'test-graph', 'test-node');

        expect(result).toHaveProperty('canRun');
        expect(result).toHaveProperty('errors');
        expect(typeof result.canRun).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should include reason when canRun is false', async () => {
        const result = await service.canRun(ctx, 'test-graph', 'blocked-node');

        if (!result.canRun) {
          // When blocked, should include reason or blocking nodes
          const hasReason = result.reason !== undefined;
          const hasBlockingNodes =
            result.blockingNodes !== undefined && result.blockingNodes.length > 0;
          expect(hasReason || hasBlockingNodes || result.errors.length > 0).toBe(true);
        }
      });
    });

    describe('start()', () => {
      it('should return StartResult with nodeId and status', async () => {
        /*
        Test Doc:
        - Why: Contract requires start() returns execution start info
        - Contract: start(ctx, graph, node) returns { nodeId, status, startedAt, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for execution start
        - Worked Example: start(ctx, 'graph', 'node') → { nodeId: 'node', status: 'running', startedAt: '...', errors: [] }
        */
        const result = await service.start(ctx, 'test-graph', 'test-node');

        expect(result).toHaveProperty('nodeId');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('startedAt');
        expect(result).toHaveProperty('errors');
        expect(result.nodeId).toBe('test-node');
        expect(result.status).toBe('running');
      });
    });

    describe('end()', () => {
      it('should return EndResult with nodeId and status', async () => {
        /*
        Test Doc:
        - Why: Contract requires end() returns execution end info
        - Contract: end(ctx, graph, node) returns { nodeId, status, completedAt, missingOutputs?, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for execution end
        - Worked Example: end(ctx, 'graph', 'node') → { nodeId: 'node', status: 'complete', completedAt: '...', errors: [] }
        */
        const result = await service.end(ctx, 'test-graph', 'test-node');

        expect(result).toHaveProperty('nodeId');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('completedAt');
        expect(result).toHaveProperty('errors');
        expect(result.nodeId).toBe('test-node');
        expect(result.status).toBe('complete');
      });

      it('should include missingOutputs when validation fails', async () => {
        const result = await service.end(ctx, 'test-graph', 'incomplete-node');

        if (result.missingOutputs) {
          expect(Array.isArray(result.missingOutputs)).toBe(true);
        }
      });
    });

    describe('getInputData()', () => {
      it('should return GetInputDataResult with nodeId and inputName', async () => {
        /*
        Test Doc:
        - Why: Contract requires getInputData() returns input value
        - Contract: getInputData(ctx, graph, node, input) returns { nodeId, inputName, value?, fromNode?, fromOutput?, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for input retrieval
        - Worked Example: getInputData(ctx, 'graph', 'node', 'topic') → { nodeId: 'node', inputName: 'topic', value: '...', errors: [] }
        */
        const result = await service.getInputData(ctx, 'test-graph', 'test-node', 'topic');

        expect(result).toHaveProperty('nodeId');
        expect(result).toHaveProperty('inputName');
        expect(result).toHaveProperty('errors');
        expect(result.nodeId).toBe('test-node');
        expect(result.inputName).toBe('topic');
      });

      it('should return error E117 when input not available', async () => {
        const result = await service.getInputData(ctx, 'test-graph', 'test-node', 'missing-input');

        if (result.errors.length > 0 && result.value === undefined) {
          expect(result.errors[0].code).toBe('E117');
        }
      });
    });

    describe('saveOutputData()', () => {
      it('should return SaveOutputDataResult with saved flag', async () => {
        /*
        Test Doc:
        - Why: Contract requires saveOutputData() returns save result
        - Contract: saveOutputData(ctx, graph, node, output, value) returns { nodeId, outputName, saved, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for output saving
        - Worked Example: saveOutputData(ctx, 'graph', 'node', 'poem', 'content') → { nodeId: 'node', outputName: 'poem', saved: true, errors: [] }
        */
        const result = await service.saveOutputData(
          ctx,
          'test-graph',
          'test-node',
          'poem',
          'My poem content'
        );

        expect(result).toHaveProperty('nodeId');
        expect(result).toHaveProperty('outputName');
        expect(result).toHaveProperty('saved');
        expect(result).toHaveProperty('errors');
        expect(result.nodeId).toBe('test-node');
        expect(result.outputName).toBe('poem');
        expect(typeof result.saved).toBe('boolean');
      });

      it('should accept various value types', async () => {
        const values = ['string value', 42, true, { json: 'object' }, ['array', 'values']];

        for (const value of values) {
          const result = await service.saveOutputData(
            ctx,
            'test-graph',
            'test-node',
            'output',
            value
          );
          expect(result).toHaveProperty('errors');
          expect(Array.isArray(result.errors)).toBe(true);
        }
      });
    });
  });
}
