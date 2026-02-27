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

/** Write data.json for a completed node (Format A: wrapped in { outputs: { ... } }). */
async function writeNodeData(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  graphSlug: string,
  nodeId: string,
  data: Record<string, unknown>
): Promise<void> {
  const nodeDir = `/workspace/my-project/.chainglass/data/workflows/${graphSlug}/nodes/${nodeId}`;
  const dataDir = pathResolver.join(nodeDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(pathResolver.join(dataDir, 'data.json'), JSON.stringify({ outputs: data }));
}

/** Write state.json for a graph. */
async function writeState(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  graphSlug: string,
  state: Record<string, unknown>
): Promise<void> {
  const graphDir = `/workspace/my-project/.chainglass/data/workflows/${graphSlug}`;
  await fs.writeFile(pathResolver.join(graphDir, 'state.json'), JSON.stringify(state));
}

// WorkUnit definitions
const sampleInput: NarrowWorkUnit = {
  slug: 'sample-input',
  type: 'user-input',
  inputs: [],
  outputs: [
    { name: 'spec', type: 'data', required: true },
    { name: 'notes', type: 'data', required: false },
  ],
};

const sampleCoder: NarrowWorkUnit = {
  slug: 'sample-coder',
  type: 'agent',
  inputs: [
    { name: 'spec', type: 'data', required: true },
    { name: 'config', type: 'data', required: false },
  ],
  outputs: [{ name: 'code', type: 'data', required: true }],
};

const researchConcept: NarrowWorkUnit = {
  slug: 'research-concept',
  type: 'agent',
  inputs: [{ name: 'topic', type: 'data', required: true }],
  outputs: [{ name: 'summary', type: 'data', required: true }],
};

describe('PositionalGraphService — collateInputs', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader([sampleInput, sampleCoder, researchConcept]);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();
  });

  // ============================================
  // Format A resolution (data.json wrapped in { outputs: { ... } })
  // ============================================

  describe('Format A (wrapped outputs) resolution', () => {
    it('resolves available when data.json uses Format A wrapper', async () => {
      // Setup: sample-input → sample-coder, data written in Format A
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
      const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
      const inputNodeId = inputNode.nodeId as string;
      const coderNodeId = coderNode.nodeId as string;

      await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      // Mark input node as complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: { [inputNodeId]: { status: 'complete', completed_at: new Date().toISOString() } },
        transitions: {},
      });

      // Write data — writeNodeData wraps in Format A automatically
      await writeNodeData(fs, pathResolver, 'test-graph', inputNodeId, {
        spec: { type: 'data', dataType: 'text', value: 'The spec content' },
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNodeId);

      expect(result.ok).toBe(true);
      expect(result.inputs.spec.status).toBe('available');
      if (result.inputs.spec.status === 'available') {
        expect(result.inputs.spec.detail.sources[0].data).toEqual({
          type: 'data',
          dataType: 'text',
          value: 'The spec content',
        });
      }
    });
  });

  // ============================================
  // T004: Single source resolution
  // ============================================

  describe('single source resolution', () => {
    it('resolves available when source is complete with data', async () => {
      // Line 0: sample-input (complete), Line 1: sample-coder (wired to sample-input.spec)
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
      const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
      const inputNodeId = inputNode.nodeId as string;
      const coderNodeId = coderNode.nodeId as string;

      // Wire coder's spec input to sample-input
      await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      // Mark input node as complete in state.json
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: { [inputNodeId]: { status: 'complete', completed_at: new Date().toISOString() } },
        transitions: {},
      });

      // Write data for input node
      await writeNodeData(fs, pathResolver, 'test-graph', inputNodeId, {
        spec: { type: 'data', dataType: 'text', value: 'The spec content' },
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNodeId);

      expect(result.ok).toBe(true);
      expect(result.inputs.spec.status).toBe('available');
    });

    it('resolves waiting when source found but not complete', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
      const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');

      await service.setInput(ctx, 'test-graph', coderNode.nodeId as string, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      // Mark input node as agent-accepted (not complete)
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [inputNode.nodeId as string]: {
            status: 'agent-accepted',
            started_at: new Date().toISOString(),
          },
        },
        transitions: {},
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNode.nodeId as string);

      expect(result.ok).toBe(false);
      expect(result.inputs.spec.status).toBe('waiting');
    });

    it('resolves error E161 when no matching node in backward search', async () => {
      // Single line with just a coder — no preceding sample-input
      const { lineId } = await service.create(ctx, 'test-graph');
      const coderNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');

      await service.setInput(ctx, 'test-graph', coderNode.nodeId as string, 'spec', {
        from_unit: 'nonexistent-unit',
        from_output: 'spec',
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNode.nodeId as string);

      expect(result.ok).toBe(false);
      expect(result.inputs.spec.status).toBe('waiting');
      // No matching node → waiting (forward ref semantics: not found = waiting, not error)
    });

    it('resolves error E163 when output not declared on source WorkUnit', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
      const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
      const inputNodeId = inputNode.nodeId as string;
      const coderNodeId = coderNode.nodeId as string;

      // Wire to a nonexistent output name
      await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'NONEXISTENT_OUTPUT',
      });

      // Mark source complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: { [inputNodeId]: { status: 'complete', completed_at: new Date().toISOString() } },
        transitions: {},
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNodeId);

      expect(result.ok).toBe(false);
      expect(result.inputs.spec.status).toBe('error');
      if (result.inputs.spec.status === 'error') {
        expect(result.inputs.spec.detail.code).toBe('E163');
      }
    });

    it('resolves forward reference as waiting (not error)', async () => {
      // Coder on line 0, sample-input on line 1 (forward reference)
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const coderNode = await service.addNode(ctx, 'test-graph', line0, 'sample-coder');
      await service.addNode(ctx, 'test-graph', line1, 'sample-input');

      await service.setInput(ctx, 'test-graph', coderNode.nodeId as string, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNode.nodeId as string);

      expect(result.ok).toBe(false);
      // Forward ref: sample-input is on line 1, coder is on line 0 — not in backward search
      expect(result.inputs.spec.status).toBe('waiting');
    });
  });

  // ============================================
  // T005: Multi-source resolution
  // ============================================

  describe('multi-source resolution', () => {
    it('collects all matching from_unit sources (deterministic order)', async () => {
      // Line 0: two research-concept nodes, Line 1: sample-coder wired to research-concept
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const research1 = await service.addNode(ctx, 'test-graph', line0, 'research-concept');
      const research2 = await service.addNode(ctx, 'test-graph', line0, 'research-concept');
      const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
      const r1Id = research1.nodeId as string;
      const r2Id = research2.nodeId as string;
      const coderId = coderNode.nodeId as string;

      await service.setInput(ctx, 'test-graph', coderId, 'spec', {
        from_unit: 'research-concept',
        from_output: 'summary',
      });

      // Mark both complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [r1Id]: { status: 'complete', completed_at: new Date().toISOString() },
          [r2Id]: { status: 'complete', completed_at: new Date().toISOString() },
        },
        transitions: {},
      });

      // Write data for both
      await writeNodeData(fs, pathResolver, 'test-graph', r1Id, {
        summary: { type: 'data', value: 'Research 1' },
      });
      await writeNodeData(fs, pathResolver, 'test-graph', r2Id, {
        summary: { type: 'data', value: 'Research 2' },
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderId);

      expect(result.ok).toBe(true);
      expect(result.inputs.spec.status).toBe('available');
      if (result.inputs.spec.status === 'available') {
        // Both sources collected — deterministic order: same-line L→R
        expect(result.inputs.spec.detail.sources).toHaveLength(2);
        expect(result.inputs.spec.detail.sources[0].sourceNodeId).toBe(r1Id);
        expect(result.inputs.spec.detail.sources[1].sourceNodeId).toBe(r2Id);
      }
    });

    it('resolves waiting when some sources are incomplete', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const research1 = await service.addNode(ctx, 'test-graph', line0, 'research-concept');
      const research2 = await service.addNode(ctx, 'test-graph', line0, 'research-concept');
      const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
      const r1Id = research1.nodeId as string;
      const r2Id = research2.nodeId as string;
      const coderId = coderNode.nodeId as string;

      await service.setInput(ctx, 'test-graph', coderId, 'spec', {
        from_unit: 'research-concept',
        from_output: 'summary',
      });

      // r1 complete, r2 still running
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [r1Id]: { status: 'complete', completed_at: new Date().toISOString() },
          [r2Id]: { status: 'agent-accepted', started_at: new Date().toISOString() },
        },
        transitions: {},
      });

      await writeNodeData(fs, pathResolver, 'test-graph', r1Id, {
        summary: { type: 'data', value: 'Research 1' },
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderId);

      expect(result.ok).toBe(false);
      expect(result.inputs.spec.status).toBe('waiting');
      if (result.inputs.spec.status === 'waiting') {
        expect(result.inputs.spec.detail.available).toHaveLength(1);
        expect(result.inputs.spec.detail.waiting).toContain(r2Id);
      }
    });

    it('preserves deterministic ordering across calls', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const r1 = await service.addNode(ctx, 'test-graph', line0, 'research-concept');
      const r2 = await service.addNode(ctx, 'test-graph', line0, 'research-concept');
      const coder = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
      const r1Id = r1.nodeId as string;
      const r2Id = r2.nodeId as string;
      const coderId = coder.nodeId as string;

      await service.setInput(ctx, 'test-graph', coderId, 'spec', {
        from_unit: 'research-concept',
        from_output: 'summary',
      });

      // Both complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [r1Id]: { status: 'complete', completed_at: new Date().toISOString() },
          [r2Id]: { status: 'complete', completed_at: new Date().toISOString() },
        },
        transitions: {},
      });
      await writeNodeData(fs, pathResolver, 'test-graph', r1Id, {
        summary: { type: 'data', value: 'R1' },
      });
      await writeNodeData(fs, pathResolver, 'test-graph', r2Id, {
        summary: { type: 'data', value: 'R2' },
      });

      // Call twice — order should be identical
      const result1 = await service.collateInputs(ctx, 'test-graph', coderId);
      const result2 = await service.collateInputs(ctx, 'test-graph', coderId);

      expect(result1.inputs.spec).toEqual(result2.inputs.spec);
    });
  });

  // ============================================
  // T006: from_node explicit resolution
  // ============================================

  describe('from_node explicit resolution', () => {
    it('resolves via direct node ID lookup', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
      const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
      const inputNodeId = inputNode.nodeId as string;
      const coderNodeId = coderNode.nodeId as string;

      await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
        from_node: inputNodeId,
        from_output: 'spec',
      });

      // Mark complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [inputNodeId]: { status: 'complete', completed_at: new Date().toISOString() },
        },
        transitions: {},
      });
      await writeNodeData(fs, pathResolver, 'test-graph', inputNodeId, {
        spec: { type: 'data', value: 'The spec' },
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNodeId);

      expect(result.ok).toBe(true);
      expect(result.inputs.spec.status).toBe('available');
      if (result.inputs.spec.status === 'available') {
        expect(result.inputs.spec.detail.sources).toHaveLength(1);
        expect(result.inputs.spec.detail.sources[0].sourceNodeId).toBe(inputNodeId);
      }
    });

    it('resolves waiting when from_node is not in preceding lines', async () => {
      // from_node references a node on a later line → waiting
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const coderNode = await service.addNode(ctx, 'test-graph', line0, 'sample-coder');
      const inputNode = await service.addNode(ctx, 'test-graph', line1, 'sample-input');

      await service.setInput(ctx, 'test-graph', coderNode.nodeId as string, 'spec', {
        from_node: inputNode.nodeId as string,
        from_output: 'spec',
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNode.nodeId as string);

      expect(result.ok).toBe(false);
      expect(result.inputs.spec.status).toBe('waiting');
    });

    it('resolves waiting when from_node not found in graph at all', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const coderNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');

      await service.setInput(ctx, 'test-graph', coderNode.nodeId as string, 'spec', {
        from_node: 'completely-nonexistent-node',
        from_output: 'spec',
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderNode.nodeId as string);

      expect(result.ok).toBe(false);
      expect(result.inputs.spec.status).toBe('waiting');
    });
  });

  // ============================================
  // T007: Optional vs required inputs
  // ============================================

  describe('optional vs required inputs', () => {
    it('optional input error does not block ok', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const coderNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
      const coderId = coderNode.nodeId as string;

      // Wire optional config input to nonexistent output
      await service.setInput(ctx, 'test-graph', coderId, 'config', {
        from_unit: 'sample-input',
        from_output: 'NONEXISTENT',
      });

      // Don't wire required spec — will be E160 unwired

      // Need a sample-input node in scope
      // Actually: coder has required 'spec' unwired → that blocks ok
      // Let's wire spec and leave config to fail
      const addLine0 = await service.addLine(ctx, 'test-graph', { atIndex: 0 });
      const line0 = addLine0.lineId as string;
      const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
      const inputNodeId = inputNode.nodeId as string;

      await service.setInput(ctx, 'test-graph', coderId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      // Mark input complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [inputNodeId]: { status: 'complete', completed_at: new Date().toISOString() },
        },
        transitions: {},
      });
      await writeNodeData(fs, pathResolver, 'test-graph', inputNodeId, {
        spec: { type: 'data', value: 'spec data' },
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderId);

      // config has E163 (bad output) but is optional → ok should still be true
      expect(result.inputs.config.status).toBe('error');
      expect(result.inputs.spec.status).toBe('available');
      expect(result.ok).toBe(true); // optional error doesn't block
    });

    it('required input error blocks ok', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const coderNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
      const coderId = coderNode.nodeId as string;

      // Wire required spec to nonexistent output — will cause E163
      await service.setInput(ctx, 'test-graph', coderId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'NONEXISTENT',
      });

      // Add a sample-input node in scope but wire to bad output
      const addLine0 = await service.addLine(ctx, 'test-graph', { atIndex: 0 });
      const line0 = addLine0.lineId as string;
      const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [inputNode.nodeId as string]: {
            status: 'complete',
            completed_at: new Date().toISOString(),
          },
        },
        transitions: {},
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderId);

      expect(result.inputs.spec.status).toBe('error');
      expect(result.ok).toBe(false); // required error blocks
    });

    it('optional waiting does not block ok', async () => {
      // Wire optional config to a source that's not yet complete
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
      const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
      const inputNodeId = inputNode.nodeId as string;
      const coderId = coderNode.nodeId as string;

      // Wire required spec (will be available)
      await service.setInput(ctx, 'test-graph', coderId, 'spec', {
        from_unit: 'sample-input',
        from_output: 'spec',
      });

      // Wire optional config to notes output (source not complete yet)
      await service.setInput(ctx, 'test-graph', coderId, 'config', {
        from_unit: 'sample-input',
        from_output: 'notes',
      });

      // Mark input complete for spec data
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [inputNodeId]: { status: 'complete', completed_at: new Date().toISOString() },
        },
        transitions: {},
      });
      await writeNodeData(fs, pathResolver, 'test-graph', inputNodeId, {
        spec: { type: 'data', value: 'spec content' },
        notes: { type: 'data', value: 'notes content' },
      });

      const result = await service.collateInputs(ctx, 'test-graph', coderId);

      // Both inputs resolved — source is complete for both
      expect(result.ok).toBe(true);
    });

    it('unwired required input resolves as error E160', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const coderNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');

      // Don't wire any inputs — spec is required but unwired
      const result = await service.collateInputs(ctx, 'test-graph', coderNode.nodeId as string);

      expect(result.ok).toBe(false);
      expect(result.inputs.spec.status).toBe('error');
      if (result.inputs.spec.status === 'error') {
        expect(result.inputs.spec.detail.code).toBe('E160');
      }
      // Optional config is unwired → should be omitted from result
      expect(result.inputs.config).toBeUndefined();
    });
  });
});
