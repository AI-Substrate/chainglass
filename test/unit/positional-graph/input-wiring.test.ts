import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type {
  IPositionalGraphService,
  IWorkUnitLoader,
  NarrowWorkUnit,
} from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ============================================
// Test Helpers
// ============================================

function createTestContext(worktreePath = '/workspace/my-project'): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: 'main',
    isMainWorktree: true,
  };
}

/**
 * Creates a fake unit loader with declared inputs/outputs per WorkUnit.
 * Phase 5 extension of createFakeUnitLoader from Phase 4.
 */
function createFakeUnitLoader(units: NarrowWorkUnit[]): IWorkUnitLoader {
  const unitMap = new Map(units.map((u) => [u.slug, u]));
  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unit = unitMap.get(slug);
      if (unit) {
        return { unit, errors: [] };
      }
      return { errors: [{ code: 'E120', message: `Unit '${slug}' not found` } as ResultError] };
    },
  };
}

function createTestService(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  loader: IWorkUnitLoader
) {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

// WorkUnit definitions for testing
const sampleInput: NarrowWorkUnit = {
  slug: 'sample-input',
  inputs: [],
  outputs: [
    { name: 'spec', type: 'data', required: true },
    { name: 'notes', type: 'data', required: false },
  ],
};

const sampleCoder: NarrowWorkUnit = {
  slug: 'sample-coder',
  inputs: [
    { name: 'spec', type: 'data', required: true },
    { name: 'config', type: 'data', required: false },
  ],
  outputs: [{ name: 'code', type: 'data', required: true }],
};

describe('PositionalGraphService — Input Wiring', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader([sampleInput, sampleCoder]);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();
  });

  // ============================================
  // setInput
  // ============================================

  describe('setInput', () => {
    it('wires a from_unit input and persists in node.yaml', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
      expect(addResult.errors).toEqual([]);
      const nodeId = addResult.nodeId as string;

      const result = await service.setInput(ctx, 'test-graph', nodeId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      expect(result.errors).toEqual([]);

      // Verify node.yaml has the input wiring
      const showResult = await service.showNode(ctx, 'test-graph', nodeId);
      expect(showResult.inputs).toEqual({
        spec: { from_unit: 'sample-input', from_output: 'spec' },
      });
    });

    it('wires a from_node input and persists in node.yaml', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const inputNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-input');
      const coderNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
      expect(inputNode.errors).toEqual([]);
      expect(coderNode.errors).toEqual([]);

      const result = await service.setInput(ctx, 'test-graph', coderNode.nodeId as string, 'spec', {
        from_node: inputNode.nodeId as string,
        from_output: 'spec',
      });

      expect(result.errors).toEqual([]);

      const showResult = await service.showNode(ctx, 'test-graph', coderNode.nodeId as string);
      expect(showResult.inputs?.spec).toEqual({
        from_node: inputNode.nodeId,
        from_output: 'spec',
      });
    });

    it('overwrites existing input wiring', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const nodeId = (await service.addNode(ctx, 'test-graph', lineId, 'sample-coder'))
        .nodeId as string;

      // Wire spec to sample-input
      await service.setInput(ctx, 'test-graph', nodeId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      // Overwrite spec to from_node
      await service.setInput(ctx, 'test-graph', nodeId, 'spec', {
        from_node: 'some-node-id',
        from_output: 'notes',
      });

      const showResult = await service.showNode(ctx, 'test-graph', nodeId);
      expect(showResult.inputs?.spec).toEqual({
        from_node: 'some-node-id',
        from_output: 'notes',
      });
    });

    it('wires multiple inputs on the same node', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const nodeId = (await service.addNode(ctx, 'test-graph', lineId, 'sample-coder'))
        .nodeId as string;

      await service.setInput(ctx, 'test-graph', nodeId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });
      await service.setInput(ctx, 'test-graph', nodeId, 'config', {
        from_unit: 'sample-input',
        from_output: 'notes',
      });

      const showResult = await service.showNode(ctx, 'test-graph', nodeId);
      expect(Object.keys(showResult.inputs ?? {})).toHaveLength(2);
      expect(showResult.inputs?.spec).toBeTruthy();
      expect(showResult.inputs?.config).toBeTruthy();
    });

    it('returns E160 when input name is not declared on WorkUnit', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const nodeId = (await service.addNode(ctx, 'test-graph', lineId, 'sample-coder'))
        .nodeId as string;

      const result = await service.setInput(ctx, 'test-graph', nodeId, 'nonexistent-input', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E160');
    });

    it('returns E153 when node not found', async () => {
      await service.create(ctx, 'test-graph');

      const result = await service.setInput(ctx, 'test-graph', 'nonexistent-node', 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E153');
    });

    it('returns E157 when graph not found', async () => {
      const result = await service.setInput(ctx, 'nonexistent-graph', 'some-node', 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E157');
    });
  });

  // ============================================
  // removeInput
  // ============================================

  describe('removeInput', () => {
    it('removes a wired input from node.yaml', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const nodeId = (await service.addNode(ctx, 'test-graph', lineId, 'sample-coder'))
        .nodeId as string;

      // Wire it first
      await service.setInput(ctx, 'test-graph', nodeId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      // Remove it
      const result = await service.removeInput(ctx, 'test-graph', nodeId, 'spec');
      expect(result.errors).toEqual([]);

      // Verify gone
      const showResult = await service.showNode(ctx, 'test-graph', nodeId);
      expect(showResult.inputs?.spec).toBeUndefined();
    });

    it('returns E153 when node not found', async () => {
      await service.create(ctx, 'test-graph');

      const result = await service.removeInput(ctx, 'test-graph', 'nonexistent-node', 'spec');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E153');
    });
  });
});
