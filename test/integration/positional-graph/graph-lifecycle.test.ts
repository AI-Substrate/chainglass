/**
 * Integration Test: Full Graph Lifecycle
 *
 * Exercises the complete positional graph lifecycle through the real
 * PositionalGraphService with FakeFileSystem. Tests sequences of operations
 * that span multiple service methods and verify cumulative state.
 *
 * Per Phase 7 T001: create -> add lines -> add nodes -> move nodes ->
 * set properties -> wire inputs -> collate -> getNodeStatus -> getLineStatus ->
 * getStatus -> triggerTransition -> delete
 *
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

// ============================================
// WorkUnit definitions (DYK-P7-I4: outputs must match from_output in wiring)
// ============================================

const producer = createTestUnit('sample-producer', {
  inputs: [],
  outputs: [
    { name: 'result', type: 'data', required: true },
    { name: 'metadata', type: 'data', required: false },
  ],
});

const consumer = createTestUnit('sample-consumer', {
  inputs: [
    { name: 'data', type: 'data', required: true },
    { name: 'config', type: 'data', required: false },
  ],
  outputs: [{ name: 'output', type: 'data', required: true }],
});

const worker = createTestUnit('sample-worker', {
  inputs: [],
  outputs: [{ name: 'work', type: 'data', required: true }],
});

// ============================================
// Tests
// ============================================

describe('PositionalGraph — Full Graph Lifecycle Integration', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  const GRAPH = 'lifecycle-test';
  const WORKSPACE = '/workspace/test-project';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader([producer, consumer, worker]);
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

  it('should exercise full graph lifecycle: create -> lines -> nodes -> move -> wire -> status -> delete', async () => {
    /*
    Test Doc:
    - Why: Integration tests catch bugs that unit tests miss — interaction effects
      between operations, state accumulation, filesystem consistency.
    - Contract: Full lifecycle from create to delete completes without errors,
      with correct intermediate state at every step.
    - Quality Contribution: Validates that 6 phases of service implementation
      work together as a cohesive system.
    */

    // ── Step 1: Create graph ──
    const createResult = await service.create(ctx, GRAPH);
    expect(createResult.errors).toHaveLength(0);
    expect(createResult.graphSlug).toBe(GRAPH);
    expect(createResult.lineId).toBeTruthy();

    const initialLineId = createResult.lineId;

    // Verify initial structure: 1 empty line
    const showAfterCreate = await service.show(ctx, GRAPH);
    expect(showAfterCreate.errors).toHaveLength(0);
    expect(showAfterCreate.lines).toHaveLength(1);
    expect(showAfterCreate.lines[0].nodeCount).toBe(0);
    expect(showAfterCreate.totalNodeCount).toBe(0);

    // Verify graph appears in listing
    const listResult = await service.list(ctx);
    expect(listResult.errors).toHaveLength(0);
    expect(listResult.slugs).toContain(GRAPH);

    // ── Step 2: Add lines ──

    // Append a second line
    const line2 = await service.addLine(ctx, GRAPH);
    expect(line2.errors).toHaveLength(0);
    expect(line2.lineId).toBeTruthy();
    expect(line2.index).toBe(1);

    // Insert a third line at index 1 (between initial and line2)
    const line1Inserted = await service.addLine(ctx, GRAPH, { atIndex: 1, label: 'Processing' });
    expect(line1Inserted.errors).toHaveLength(0);
    expect(line1Inserted.index).toBe(1);

    // Verify 3 lines in correct order
    const showAfterLines = await service.show(ctx, GRAPH);
    expect(showAfterLines.lines).toHaveLength(3);
    expect(showAfterLines.lines[0].id).toBe(initialLineId);
    expect(showAfterLines.lines[1].id).toBe(line1Inserted.lineId);
    expect(showAfterLines.lines[1].label).toBe('Processing');
    expect(showAfterLines.lines[2].id).toBe(line2.lineId);

    // ── Step 3: Add nodes to lines ──

    // Add producer to line 0
    const producerNode = await service.addNode(ctx, GRAPH, initialLineId, 'sample-producer');
    expect(producerNode.errors).toHaveLength(0);
    expect(producerNode.nodeId).toBeTruthy();
    expect(producerNode.lineId).toBe(initialLineId);

    // Add consumer to line 1 (Processing)
    const consumerNode = await service.addNode(
      ctx,
      GRAPH,
      line1Inserted.lineId as string,
      'sample-consumer'
    );
    expect(consumerNode.errors).toHaveLength(0);
    expect(consumerNode.lineId).toBe(line1Inserted.lineId);

    // Add worker to line 2
    const workerNode = await service.addNode(ctx, GRAPH, line2.lineId as string, 'sample-worker');
    expect(workerNode.errors).toHaveLength(0);

    // Add a second worker to line 2
    const worker2Node = await service.addNode(ctx, GRAPH, line2.lineId as string, 'sample-worker');
    expect(worker2Node.errors).toHaveLength(0);

    // Verify node counts
    const showAfterNodes = await service.show(ctx, GRAPH);
    expect(showAfterNodes.totalNodeCount).toBe(4);
    expect(showAfterNodes.lines[0].nodeCount).toBe(1); // producer
    expect(showAfterNodes.lines[1].nodeCount).toBe(1); // consumer
    expect(showAfterNodes.lines[2].nodeCount).toBe(2); // 2 workers

    // ── Step 4: Move node between lines ──

    // Move worker2 from line 2 to line 1 (Processing)
    const moveResult = await service.moveNode(ctx, GRAPH, worker2Node.nodeId as string, {
      toLineId: line1Inserted.lineId as string,
    });
    expect(moveResult.errors).toHaveLength(0);

    // Verify: line 1 now has 2 nodes, line 2 has 1
    const showAfterMove = await service.show(ctx, GRAPH);
    expect(showAfterMove.lines[1].nodeCount).toBe(2);
    expect(showAfterMove.lines[2].nodeCount).toBe(1);

    // ── Step 5: Set line properties ──

    // Set transition to manual on line 0
    const transResult = await service.updateLineOrchestratorSettings(ctx, GRAPH, initialLineId, {
      transition: 'manual',
    });
    expect(transResult.errors).toHaveLength(0);

    // Set label and description on line 0
    const labelResult = await service.setLineLabel(ctx, GRAPH, initialLineId, 'Input');
    expect(labelResult.errors).toHaveLength(0);

    const descResult = await service.setLineDescription(
      ctx,
      GRAPH,
      initialLineId,
      'Collects initial input'
    );
    expect(descResult.errors).toHaveLength(0);

    // Verify line properties persisted
    const showAfterProps = await service.show(ctx, GRAPH);
    expect(showAfterProps.lines[0].label).toBe('Input');
    expect(showAfterProps.lines[0].transition).toBe('manual');

    // ── Step 6: Set node execution mode ──

    const execResult = await service.updateNodeOrchestratorSettings(
      ctx,
      GRAPH,
      worker2Node.nodeId as string,
      { execution: 'parallel' }
    );
    expect(execResult.errors).toHaveLength(0);

    // Verify via showNode
    const nodeShow = await service.showNode(ctx, GRAPH, worker2Node.nodeId as string);
    expect(nodeShow.errors).toHaveLength(0);
    expect(nodeShow.execution).toBe('parallel');
    expect(nodeShow.lineId).toBe(line1Inserted.lineId); // after move

    // ── Step 7: Wire input ──

    // Wire consumer's 'data' input from producer's 'result' output (via from_unit)
    const wireResult = await service.setInput(ctx, GRAPH, consumerNode.nodeId as string, 'data', {
      from_unit: 'sample-producer',
      from_output: 'result',
    });
    expect(wireResult.errors).toHaveLength(0);

    // Verify input on node
    const consumerShow = await service.showNode(ctx, GRAPH, consumerNode.nodeId as string);
    expect(consumerShow.inputs).toBeDefined();
    expect(consumerShow.inputs.data).toEqual({
      from_unit: 'sample-producer',
      from_output: 'result',
    });

    // ── Step 8: collateInputs — expect waiting (producer not complete) ──

    const inputPack = await service.collateInputs(ctx, GRAPH, consumerNode.nodeId as string);
    expect(inputPack.ok).toBe(false);
    expect(inputPack.inputs.data).toBeDefined();
    expect(inputPack.inputs.data.status).toBe('waiting');

    // ── Step 9: Simulate producer completion ──

    // Write state.json to mark producer as complete
    // Must match StateSchema: graph_status, updated_at, nodes (NodeStateEntrySchema), transitions
    const graphDir = `${WORKSPACE}/.chainglass/data/workflows/${GRAPH}`;
    const stateContent = JSON.stringify({
      graph_status: 'in_progress',
      updated_at: new Date().toISOString(),
      nodes: {
        [producerNode.nodeId as string]: {
          status: 'complete',
          completed_at: new Date().toISOString(),
        },
      },
      transitions: {},
    });
    await fs.writeFile(pathResolver.join(graphDir, 'state.json'), stateContent);

    // Write data.json for producer
    const nodeDataDir = pathResolver.join(graphDir, 'nodes', producerNode.nodeId as string, 'data');
    await fs.mkdir(nodeDataDir, { recursive: true });
    await fs.writeFile(
      pathResolver.join(nodeDataDir, 'data.json'),
      JSON.stringify({ result: { value: 'test-data' } })
    );

    // ── Step 10: collateInputs — now expect available ──

    const inputPack2 = await service.collateInputs(ctx, GRAPH, consumerNode.nodeId as string);
    expect(inputPack2.ok).toBe(true);
    expect(inputPack2.inputs.data.status).toBe('available');
    if (inputPack2.inputs.data.status === 'available') {
      expect(inputPack2.inputs.data.detail.sources).toHaveLength(1);
      expect(inputPack2.inputs.data.detail.sources[0].sourceNodeId).toBe(producerNode.nodeId);
      expect(inputPack2.inputs.data.detail.sources[0].data).toEqual({ value: 'test-data' });
    }

    // ── Step 11: Status API — getNodeStatus ──

    // Line 0 producer: complete (from state.json)
    const producerStatus = await service.getNodeStatus(ctx, GRAPH, producerNode.nodeId as string);
    expect(producerStatus.status).toBe('complete');
    expect(producerStatus.lineId).toBe(initialLineId);

    // Consumer: pending (line 0 has manual transition, not triggered)
    const consumerStatus = await service.getNodeStatus(ctx, GRAPH, consumerNode.nodeId as string);
    expect(consumerStatus.status).toBe('pending');
    expect(consumerStatus.ready).toBe(false);
    // Transition gate is closed because line 0 has manual transition
    expect(consumerStatus.readyDetail.transitionOpen).toBe(false);

    // ── Step 12: getLineStatus ──

    const line0Status = await service.getLineStatus(ctx, GRAPH, initialLineId);
    expect(line0Status.complete).toBe(true); // producer is complete
    expect(line0Status.completedNodes).toContain(producerNode.nodeId);

    const line1Status = await service.getLineStatus(ctx, GRAPH, line1Inserted.lineId as string);
    expect(line1Status.canRun).toBe(false); // manual transition gate closed
    expect(line1Status.transitionOpen).toBe(false);

    // ── Step 13: getStatus (graph-level) ──

    const graphStatus = await service.getStatus(ctx, GRAPH);
    expect(graphStatus.totalNodes).toBe(4);
    expect(graphStatus.completedNodes).toBe(1); // only producer
    expect(graphStatus.status).toBe('in_progress');
    expect(graphStatus.completedNodeIds).toContain(producerNode.nodeId);

    // ── Step 14: triggerTransition ──

    const triggerResult = await service.triggerTransition(ctx, GRAPH, initialLineId);
    expect(triggerResult.errors).toHaveLength(0);

    // After triggering, transition gate should be open
    const consumerStatusAfterTrigger = await service.getNodeStatus(
      ctx,
      GRAPH,
      consumerNode.nodeId as string
    );
    expect(consumerStatusAfterTrigger.readyDetail.transitionOpen).toBe(true);
    // Consumer should now be ready (preceding line complete + transition open + inputs available)
    expect(consumerStatusAfterTrigger.ready).toBe(true);
    expect(consumerStatusAfterTrigger.status).toBe('ready');

    // ── Step 15: Delete graph ──

    const deleteResult = await service.delete(ctx, GRAPH);
    expect(deleteResult.errors).toHaveLength(0);

    // Verify graph no longer in listing
    const listAfterDelete = await service.list(ctx);
    expect(listAfterDelete.slugs).not.toContain(GRAPH);

    // Verify load fails
    const loadAfterDelete = await service.load(ctx, GRAPH);
    expect(loadAfterDelete.errors.length).toBeGreaterThan(0);
  });
});
