import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type {
  IPositionalGraphService,
  IWorkUnitLoader,
} from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

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

const stubWorkUnitLoader: IWorkUnitLoader = {
  async load() {
    return { unit: { slug: 'stub', inputs: [], outputs: [] }, errors: [] };
  },
};

function createTestService(fs: FakeFileSystem, pathResolver: FakePathResolver) {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, stubWorkUnitLoader);
}

describe('PositionalGraphService — Line Operations', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
    // Create a graph for line operation tests
    await service.create(ctx, 'test-graph');
  });

  // ============================================
  // addLine
  // ============================================

  describe('addLine', () => {
    it('appends line to end (no options)', async () => {
      const result = await service.addLine(ctx, 'test-graph');

      expect(result.errors).toEqual([]);
      expect(result.lineId).toMatch(/^line-[0-9a-f]{3}$/);
      expect(result.index).toBe(1); // After the initial line

      // Verify graph now has 2 lines
      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines).toHaveLength(2);
    });

    it('inserts at specific index (atIndex)', async () => {
      // Add a second line first
      await service.addLine(ctx, 'test-graph');
      // Insert at index 1 (between first and second)
      const result = await service.addLine(ctx, 'test-graph', { atIndex: 1 });

      expect(result.errors).toEqual([]);
      expect(result.index).toBe(1);

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines).toHaveLength(3);
      expect(showResult.lines?.[1].id).toBe(result.lineId);
    });

    it('inserts after specified line ID (afterLineId)', async () => {
      const createResult = await service.create(ctx, 'after-test');
      const firstLineId = createResult.lineId;

      const result = await service.addLine(ctx, 'after-test', { afterLineId: firstLineId });

      expect(result.errors).toEqual([]);
      expect(result.index).toBe(1);

      const showResult = await service.show(ctx, 'after-test');
      expect(showResult.lines?.[0].id).toBe(firstLineId);
      expect(showResult.lines?.[1].id).toBe(result.lineId);
    });

    it('inserts before specified line ID (beforeLineId)', async () => {
      const createResult = await service.create(ctx, 'before-test');
      const firstLineId = createResult.lineId;

      const result = await service.addLine(ctx, 'before-test', { beforeLineId: firstLineId });

      expect(result.errors).toEqual([]);
      expect(result.index).toBe(0);

      const showResult = await service.show(ctx, 'before-test');
      expect(showResult.lines?.[0].id).toBe(result.lineId);
      expect(showResult.lines?.[1].id).toBe(firstLineId);
    });

    it('applies label, description, orchestratorSettings options', async () => {
      const result = await service.addLine(ctx, 'test-graph', {
        label: 'Processing',
        description: 'Main processing line',
        orchestratorSettings: { transition: 'manual' },
      });

      expect(result.errors).toEqual([]);

      const showResult = await service.show(ctx, 'test-graph');
      const newLine = showResult.lines?.find((l) => l.id === result.lineId);
      expect(newLine).toBeTruthy();
      expect(newLine?.label).toBe('Processing');
      expect(newLine?.description).toBe('Main processing line');
      expect(newLine?.transition).toBe('manual');
    });

    it('returns error for conflicting positioning options (DYK-P3-I3)', async () => {
      const createResult = await service.create(ctx, 'conflict-test');
      const result = await service.addLine(ctx, 'conflict-test', {
        afterLineId: createResult.lineId,
        atIndex: 0,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E152');
      expect(result.errors[0].message).toContain('Conflicting positioning options');
    });

    it('returns error for invalid afterLineId (E150)', async () => {
      const result = await service.addLine(ctx, 'test-graph', {
        afterLineId: 'line-nonexistent',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E150');
    });

    it('returns error for nonexistent graph', async () => {
      const result = await service.addLine(ctx, 'nonexistent');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E157');
    });
  });

  // ============================================
  // removeLine
  // ============================================

  describe('removeLine', () => {
    it('removes empty line', async () => {
      // Add a second line so we can remove one
      const addResult = await service.addLine(ctx, 'test-graph');
      const result = await service.removeLine(ctx, 'test-graph', addResult.lineId as string);

      expect(result.errors).toEqual([]);

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines).toHaveLength(1);
    });

    it('returns error for non-empty line (E151, no cascade DYK-P3-I4)', async () => {
      // To make a line non-empty, we need to manually write a graph with nodes in a line
      const loadResult = await service.load(ctx, 'test-graph');
      const def = loadResult.definition as NonNullable<typeof loadResult.definition>;
      def.lines[0].nodes = ['some-node-abc'];

      // Persist manually
      const yamlParser = new YamlParserAdapter();
      const graphDir = '/workspace/my-project/.chainglass/data/workflows/test-graph';
      await fs.writeFile(pathResolver.join(graphDir, 'graph.yaml'), yamlParser.stringify(def));

      // Add another line so the non-empty one isn't the last
      await service.addLine(ctx, 'test-graph');

      const result = await service.removeLine(ctx, 'test-graph', def.lines[0].id);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E151');
    });

    it('returns error when removing last line (E156)', async () => {
      const loadResult = await service.load(ctx, 'test-graph');
      const lineId = loadResult.definition?.lines[0].id;

      const result = await service.removeLine(ctx, 'test-graph', lineId);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E156');
    });

    it('returns error for nonexistent line (E150)', async () => {
      const result = await service.removeLine(ctx, 'test-graph', 'line-nonexistent');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E150');
    });
  });

  // ============================================
  // moveLine
  // ============================================

  describe('moveLine', () => {
    it('moves line to new index', async () => {
      // Create a graph with 3 lines
      const loadResult = await service.load(ctx, 'test-graph');
      const firstLineId = loadResult.definition?.lines[0].id;

      const add1 = await service.addLine(ctx, 'test-graph', { label: 'Second' });
      const add2 = await service.addLine(ctx, 'test-graph', { label: 'Third' });

      // Move first line to index 2 (end)
      const result = await service.moveLine(ctx, 'test-graph', firstLineId, 2);
      expect(result.errors).toEqual([]);

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines?.[0].id).toBe(add1.lineId);
      expect(showResult.lines?.[1].id).toBe(add2.lineId);
      expect(showResult.lines?.[2].id).toBe(firstLineId);
    });

    it('returns error for invalid index (E152)', async () => {
      const loadResult = await service.load(ctx, 'test-graph');
      const lineId = loadResult.definition?.lines[0].id;

      const result = await service.moveLine(ctx, 'test-graph', lineId, 5);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E152');
    });

    it('returns error for nonexistent line (E150)', async () => {
      const result = await service.moveLine(ctx, 'test-graph', 'line-nonexistent', 0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E150');
    });
  });

  // ============================================
  // updateLineOrchestratorSettings
  // ============================================

  describe('updateLineOrchestratorSettings', () => {
    it('sets transition to manual', async () => {
      const loadResult = await service.load(ctx, 'test-graph');
      const lineId = loadResult.definition?.lines[0].id;

      const result = await service.updateLineOrchestratorSettings(
        ctx,
        'test-graph',
        lineId as string,
        {
          transition: 'manual',
        }
      );
      expect(result.errors).toEqual([]);

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines?.[0].transition).toBe('manual');
    });

    it('sets transition to auto', async () => {
      const loadResult = await service.load(ctx, 'test-graph');
      const lineId = loadResult.definition?.lines[0].id;

      // Set to manual first, then back to auto
      await service.updateLineOrchestratorSettings(ctx, 'test-graph', lineId as string, {
        transition: 'manual',
      });
      const result = await service.updateLineOrchestratorSettings(
        ctx,
        'test-graph',
        lineId as string,
        {
          transition: 'auto',
        }
      );
      expect(result.errors).toEqual([]);

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines?.[0].transition).toBe('auto');
    });

    it('returns error for nonexistent line (E150)', async () => {
      const result = await service.updateLineOrchestratorSettings(
        ctx,
        'test-graph',
        'line-nonexistent',
        { transition: 'manual' }
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E150');
    });
  });

  // ============================================
  // setLineLabel
  // ============================================

  describe('setLineLabel', () => {
    it('sets label', async () => {
      const loadResult = await service.load(ctx, 'test-graph');
      const lineId = loadResult.definition?.lines[0].id;

      const result = await service.setLineLabel(ctx, 'test-graph', lineId, 'Research');
      expect(result.errors).toEqual([]);

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines?.[0].label).toBe('Research');
    });

    it('returns error for nonexistent line (E150)', async () => {
      const result = await service.setLineLabel(ctx, 'test-graph', 'line-nonexistent', 'Label');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E150');
    });
  });

  // ============================================
  // setLineDescription
  // ============================================

  describe('setLineDescription', () => {
    it('sets description', async () => {
      const loadResult = await service.load(ctx, 'test-graph');
      const lineId = loadResult.definition?.lines[0].id;

      const result = await service.setLineDescription(
        ctx,
        'test-graph',
        lineId,
        'Research and gather data'
      );
      expect(result.errors).toEqual([]);

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines?.[0].description).toBe('Research and gather data');
    });

    it('returns error for nonexistent line (E150)', async () => {
      const result = await service.setLineDescription(
        ctx,
        'test-graph',
        'line-nonexistent',
        'Description'
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E150');
    });
  });

  // ============================================
  // Invariant edge cases (T011)
  // ============================================

  describe('invariants', () => {
    it('ordering is contiguous after add+remove+move sequence', async () => {
      // Start: 1 line (from create)
      // Add 3 more lines
      const add1 = await service.addLine(ctx, 'test-graph', { label: 'Line B' });
      const add2 = await service.addLine(ctx, 'test-graph', { label: 'Line C' });
      const add3 = await service.addLine(ctx, 'test-graph', { label: 'Line D' });

      // Remove Line C (index 2)
      await service.removeLine(ctx, 'test-graph', add2.lineId as string);

      // Move Line D to index 0
      await service.moveLine(ctx, 'test-graph', add3.lineId as string, 0);

      // Verify: 3 lines, contiguous indices, no gaps
      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines).toHaveLength(3);

      // All line IDs should be unique
      const ids = showResult.lines?.map((l) => l.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('line IDs remain unique after multiple operations', async () => {
      // Add 10 lines
      for (let i = 0; i < 10; i++) {
        await service.addLine(ctx, 'test-graph');
      }

      const showResult = await service.show(ctx, 'test-graph');
      const ids = showResult.lines?.map((l) => l.id);
      expect(new Set(ids).size).toBe(11); // 1 from create + 10 added
    });

    it('invalid line index returns E152 for addLine', async () => {
      const result = await service.addLine(ctx, 'test-graph', { atIndex: 100 });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E152');
    });

    it('duplicate line ID prevention via generateLineId', async () => {
      // Generate many lines — all should have unique IDs
      const lineIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        const result = await service.addLine(ctx, 'test-graph');
        expect(result.errors).toEqual([]);
        lineIds.push(result.lineId as string);
      }

      // All unique
      expect(new Set(lineIds).size).toBe(lineIds.length);
    });
  });
});
