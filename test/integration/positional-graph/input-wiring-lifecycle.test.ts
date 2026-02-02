/**
 * Integration Test: Input Wiring Lifecycle
 *
 * Exercises named input resolution end-to-end through the real
 * PositionalGraphService with FakeFileSystem. Tests from_unit and from_node
 * wiring, multi-source collection, forward references, optional vs required
 * input semantics, and the waiting -> available state transition.
 *
 * Per Phase 7 T002: Wire -> resolve -> multi-source -> status
 * Per DYK-P7-I4: createTestUnit() factory ensures declared outputs match
 * from_output wiring to avoid E163 false failures.
 */

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

function createTestUnit(
  slug: string,
  opts: {
    inputs?: Array<{ name: string; type: 'data' | 'file'; required: boolean }>;
    outputs?: Array<{ name: string; type: 'data' | 'file'; required: boolean }>;
  } = {}
): NarrowWorkUnit {
  return {
    slug,
    inputs: opts.inputs ?? [],
    outputs: opts.outputs ?? [],
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
): IPositionalGraphService {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

/** Write schema-compliant state.json for a graph. */
async function writeState(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  workspace: string,
  graphSlug: string,
  nodeStates: Record<string, { status: string; completed_at?: string }>
): Promise<void> {
  const graphDir = `${workspace}/.chainglass/data/workflows/${graphSlug}`;
  const state = {
    graph_status: 'in_progress',
    updated_at: new Date().toISOString(),
    nodes: Object.fromEntries(
      Object.entries(nodeStates).map(([id, entry]) => [
        id,
        {
          status: entry.status,
          ...(entry.completed_at ? { completed_at: entry.completed_at } : {}),
        },
      ])
    ),
    transitions: {},
  };
  await fs.writeFile(pathResolver.join(graphDir, 'state.json'), JSON.stringify(state));
}

/** Write data.json for a completed node's output. */
async function writeNodeData(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  workspace: string,
  graphSlug: string,
  nodeId: string,
  data: Record<string, unknown>
): Promise<void> {
  const nodeDir = `${workspace}/.chainglass/data/workflows/${graphSlug}/nodes/${nodeId}`;
  const dataDir = pathResolver.join(nodeDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(pathResolver.join(dataDir, 'data.json'), JSON.stringify(data));
}

// ============================================
// WorkUnit definitions (DYK-P7-I4: outputs must match from_output in wiring)
// ============================================

const dataProducer = createTestUnit('data-producer', {
  inputs: [],
  outputs: [
    { name: 'result', type: 'data', required: true },
    { name: 'notes', type: 'data', required: false },
  ],
});

const dataConsumer = createTestUnit('data-consumer', {
  inputs: [
    { name: 'primary', type: 'data', required: true },
    { name: 'secondary', type: 'data', required: false },
  ],
  outputs: [{ name: 'output', type: 'data', required: true }],
});

const researcher = createTestUnit('researcher', {
  inputs: [{ name: 'topic', type: 'data', required: true }],
  outputs: [{ name: 'findings', type: 'data', required: true }],
});

// ============================================
// Tests
// ============================================

describe('PositionalGraph — Input Wiring Lifecycle Integration', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  const GRAPH = 'wiring-test';
  const WORKSPACE = '/workspace/test-project';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader([dataProducer, dataConsumer, researcher]);
    service = createTestService(fs, pathResolver, loader);
    ctx = {
      workspaceSlug: 'test-workspace',
      workspaceName: 'Test Workspace',
      workspacePath: WORKSPACE,
      worktreePath: WORKSPACE,
      worktreeBranch: 'main',
      isMainWorktree: true,
      hasGit: true,
    };
  });

  it('should exercise input wiring lifecycle: wire -> resolve -> complete -> available', async () => {
    /*
    Test Doc:
    - Why: Input resolution is the most complex algorithm in the positional graph.
      Integration tests catch wiring/resolution interaction bugs that unit tests miss.
    - Contract: from_unit wiring resolves through backward search, transitioning
      from waiting to available when source nodes complete.
    - Quality Contribution: Validates collateInputs + canRun algorithms work with
      real service state accumulated across multiple operations.
    */

    // ── Setup: 3-line graph ──
    // Line 0: producer (data-producer)
    // Line 1: (empty initially)
    // Line 2: consumer (data-consumer) — wired to producer

    const createResult = await service.create(ctx, GRAPH);
    expect(createResult.errors).toHaveLength(0);
    const line0Id = createResult.lineId;

    const line1 = await service.addLine(ctx, GRAPH);
    expect(line1.errors).toHaveLength(0);

    const line2 = await service.addLine(ctx, GRAPH);
    expect(line2.errors).toHaveLength(0);

    // Add producer on line 0
    const producerNode = await service.addNode(ctx, GRAPH, line0Id, 'data-producer');
    expect(producerNode.errors).toHaveLength(0);

    // Add consumer on line 2 (skipping line 1)
    const consumerNode = await service.addNode(ctx, GRAPH, line2.lineId as string, 'data-consumer');
    expect(consumerNode.errors).toHaveLength(0);

    // ── Wire: from_unit ──

    // Wire consumer's required 'primary' input from producer's 'result' output
    const wireResult = await service.setInput(
      ctx,
      GRAPH,
      consumerNode.nodeId as string,
      'primary',
      {
        from_unit: 'data-producer',
        from_output: 'result',
      }
    );
    expect(wireResult.errors).toHaveLength(0);

    // ── Resolve: expect waiting (producer not complete) ──

    const pack1 = await service.collateInputs(ctx, GRAPH, consumerNode.nodeId as string);
    expect(pack1.ok).toBe(false);
    expect(pack1.inputs.primary).toBeDefined();
    expect(pack1.inputs.primary.status).toBe('waiting');
    if (pack1.inputs.primary.status === 'waiting') {
      expect(pack1.inputs.primary.detail.waiting).toContain(producerNode.nodeId);
    }

    // ── Simulate producer completion ──

    await writeState(fs, pathResolver, WORKSPACE, GRAPH, {
      [producerNode.nodeId as string]: {
        status: 'complete',
        completed_at: new Date().toISOString(),
      },
    });

    await writeNodeData(fs, pathResolver, WORKSPACE, GRAPH, producerNode.nodeId as string, {
      result: { analysis: 'test-analysis' },
    });

    // ── Resolve: expect available ──

    const pack2 = await service.collateInputs(ctx, GRAPH, consumerNode.nodeId as string);
    expect(pack2.ok).toBe(true);
    expect(pack2.inputs.primary.status).toBe('available');
    if (pack2.inputs.primary.status === 'available') {
      expect(pack2.inputs.primary.detail.sources).toHaveLength(1);
      expect(pack2.inputs.primary.detail.sources[0].sourceNodeId).toBe(producerNode.nodeId);
      expect(pack2.inputs.primary.detail.sources[0].data).toEqual({ analysis: 'test-analysis' });
    }
  });

  it('should handle from_node explicit wiring', async () => {
    /*
    Test Doc:
    - Why: from_node is an alternative to from_unit — targets a specific node ID.
    - Contract: from_node wiring resolves to the exact source node.
    */

    const createResult = await service.create(ctx, GRAPH);
    const line0Id = createResult.lineId;
    const line1 = await service.addLine(ctx, GRAPH);

    const producerNode = await service.addNode(ctx, GRAPH, line0Id, 'data-producer');
    const consumerNode = await service.addNode(ctx, GRAPH, line1.lineId as string, 'data-consumer');

    // Wire via from_node (explicit node ID)
    const wireResult = await service.setInput(
      ctx,
      GRAPH,
      consumerNode.nodeId as string,
      'primary',
      {
        from_node: producerNode.nodeId as string,
        from_output: 'result',
      }
    );
    expect(wireResult.errors).toHaveLength(0);

    // Simulate completion
    await writeState(fs, pathResolver, WORKSPACE, GRAPH, {
      [producerNode.nodeId as string]: {
        status: 'complete',
        completed_at: new Date().toISOString(),
      },
    });
    await writeNodeData(fs, pathResolver, WORKSPACE, GRAPH, producerNode.nodeId as string, {
      result: 'direct-value',
    });

    const pack = await service.collateInputs(ctx, GRAPH, consumerNode.nodeId as string);
    expect(pack.ok).toBe(true);
    expect(pack.inputs.primary.status).toBe('available');
    if (pack.inputs.primary.status === 'available') {
      expect(pack.inputs.primary.detail.sources[0].sourceNodeId).toBe(producerNode.nodeId);
      expect(pack.inputs.primary.detail.sources[0].data).toBe('direct-value');
    }
  });

  it('should collect multiple sources with from_unit (collect-all)', async () => {
    /*
    Test Doc:
    - Why: from_unit collects ALL matching nodes in backward search order.
    - Contract: Two researcher nodes on the same line both resolve as sources
      when both are complete.
    */

    const createResult = await service.create(ctx, GRAPH);
    const line0Id = createResult.lineId;
    const line1 = await service.addLine(ctx, GRAPH);

    // Add 2 researcher nodes on line 0
    const r1 = await service.addNode(ctx, GRAPH, line0Id, 'researcher');
    const r2 = await service.addNode(ctx, GRAPH, line0Id, 'researcher');

    // Add consumer on line 1
    const consumerNode = await service.addNode(ctx, GRAPH, line1.lineId as string, 'data-consumer');

    // Wire consumer's primary from researcher's findings (from_unit collects all)
    await service.setInput(ctx, GRAPH, consumerNode.nodeId as string, 'primary', {
      from_unit: 'researcher',
      from_output: 'findings',
    });

    // Complete both researchers
    await writeState(fs, pathResolver, WORKSPACE, GRAPH, {
      [r1.nodeId as string]: { status: 'complete', completed_at: new Date().toISOString() },
      [r2.nodeId as string]: { status: 'complete', completed_at: new Date().toISOString() },
    });
    await writeNodeData(fs, pathResolver, WORKSPACE, GRAPH, r1.nodeId as string, {
      findings: 'research-1',
    });
    await writeNodeData(fs, pathResolver, WORKSPACE, GRAPH, r2.nodeId as string, {
      findings: 'research-2',
    });

    const pack = await service.collateInputs(ctx, GRAPH, consumerNode.nodeId as string);
    expect(pack.ok).toBe(true);
    expect(pack.inputs.primary.status).toBe('available');
    if (pack.inputs.primary.status === 'available') {
      // Collect-all: both sources
      expect(pack.inputs.primary.detail.sources).toHaveLength(2);
      const sourceNodeIds = pack.inputs.primary.detail.sources.map((s) => s.sourceNodeId);
      expect(sourceNodeIds).toContain(r1.nodeId);
      expect(sourceNodeIds).toContain(r2.nodeId);
    }
  });

  it('should handle optional inputs without blocking ok', async () => {
    /*
    Test Doc:
    - Why: Optional inputs should not block collateInputs.ok.
    - Contract: When required input is available but optional input is unwired,
      ok is true.
    */

    const createResult = await service.create(ctx, GRAPH);
    const line0Id = createResult.lineId;
    const line1 = await service.addLine(ctx, GRAPH);

    const producerNode = await service.addNode(ctx, GRAPH, line0Id, 'data-producer');
    const consumerNode = await service.addNode(ctx, GRAPH, line1.lineId as string, 'data-consumer');

    // Wire only the required input, leave optional 'secondary' unwired
    await service.setInput(ctx, GRAPH, consumerNode.nodeId as string, 'primary', {
      from_unit: 'data-producer',
      from_output: 'result',
    });

    // Complete producer
    await writeState(fs, pathResolver, WORKSPACE, GRAPH, {
      [producerNode.nodeId as string]: {
        status: 'complete',
        completed_at: new Date().toISOString(),
      },
    });
    await writeNodeData(fs, pathResolver, WORKSPACE, GRAPH, producerNode.nodeId as string, {
      result: 'data',
    });

    const pack = await service.collateInputs(ctx, GRAPH, consumerNode.nodeId as string);
    // ok should be true — secondary is optional and unwired (omitted from result)
    expect(pack.ok).toBe(true);
    // Only 'primary' should appear in inputs (optional unwired inputs are omitted)
    expect(Object.keys(pack.inputs)).toEqual(['primary']);
  });

  it('should resolve forward reference as waiting (not error)', async () => {
    /*
    Test Doc:
    - Why: Per CD-03 (no cycle detection), forward references are legal and
      resolve as 'waiting'.
    - Contract: from_node pointing to a node on a later line resolves as waiting.
    */

    const createResult = await service.create(ctx, GRAPH);
    const line0Id = createResult.lineId;
    const line1 = await service.addLine(ctx, GRAPH);

    // Consumer on line 0, producer on line 1 — forward reference
    const consumerNode = await service.addNode(ctx, GRAPH, line0Id, 'data-consumer');
    const producerNode = await service.addNode(ctx, GRAPH, line1.lineId as string, 'data-producer');

    // Wire consumer to producer via from_node (forward reference)
    await service.setInput(ctx, GRAPH, consumerNode.nodeId as string, 'primary', {
      from_node: producerNode.nodeId as string,
      from_output: 'result',
    });

    const pack = await service.collateInputs(ctx, GRAPH, consumerNode.nodeId as string);
    expect(pack.ok).toBe(false);
    expect(pack.inputs.primary.status).toBe('waiting');
    if (pack.inputs.primary.status === 'waiting') {
      // Forward ref: the target is not in scope
      expect(pack.inputs.primary.detail.hint).toContain('not in scope');
    }
  });

  it('should verify status convenience buckets reflect wiring state', async () => {
    /*
    Test Doc:
    - Why: getStatus provides convenience buckets (readyNodes, completedNodeIds, etc.)
      that should reflect the actual wiring state.
    - Contract: After wiring and completing prerequisites, getStatus shows correct
      node distribution across buckets.
    */

    const createResult = await service.create(ctx, GRAPH);
    const line0Id = createResult.lineId;
    const line1 = await service.addLine(ctx, GRAPH);

    const producerNode = await service.addNode(ctx, GRAPH, line0Id, 'data-producer');
    const consumerNode = await service.addNode(ctx, GRAPH, line1.lineId as string, 'data-consumer');

    // Wire consumer
    await service.setInput(ctx, GRAPH, consumerNode.nodeId as string, 'primary', {
      from_unit: 'data-producer',
      from_output: 'result',
    });

    // Before completion: producer is ready (line 0, no predecessors), consumer is pending
    const status1 = await service.getStatus(ctx, GRAPH);
    expect(status1.readyNodes).toContain(producerNode.nodeId);
    expect(status1.readyNodes).not.toContain(consumerNode.nodeId);

    // Complete producer
    await writeState(fs, pathResolver, WORKSPACE, GRAPH, {
      [producerNode.nodeId as string]: {
        status: 'complete',
        completed_at: new Date().toISOString(),
      },
    });
    await writeNodeData(fs, pathResolver, WORKSPACE, GRAPH, producerNode.nodeId as string, {
      result: 'done',
    });

    // After completion: producer complete, consumer ready (inputs available, preceding line complete)
    const status2 = await service.getStatus(ctx, GRAPH);
    expect(status2.completedNodeIds).toContain(producerNode.nodeId);
    expect(status2.readyNodes).toContain(consumerNode.nodeId);
    expect(status2.status).toBe('in_progress');
  });
});
