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

async function writeState(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  graphSlug: string,
  state: Record<string, unknown>
): Promise<void> {
  const graphDir = `/workspace/my-project/.chainglass/data/workflows/${graphSlug}`;
  await fs.writeFile(pathResolver.join(graphDir, 'state.json'), JSON.stringify(state));
}

// WorkUnit definitions — no inputs needed for canRun tests
const simpleUnit: NarrowWorkUnit = {
  slug: 'simple-task',
  type: 'agent',
  inputs: [],
  outputs: [{ name: 'result', type: 'data', required: true }],
};

describe('PositionalGraphService — canRun (via getNodeStatus)', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader([simpleUnit]);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();
  });

  // ============================================
  // Gate 1: Preceding lines complete
  // ============================================

  describe('Gate 1: preceding lines complete', () => {
    it('line 0 node is ready (no preceding lines)', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');

      const status = await service.getNodeStatus(ctx, 'test-graph', node.nodeId as string);

      expect(status.status).toBe('ready');
      expect(status.readyDetail.precedingLinesComplete).toBe(true);
    });

    it('line 1 node is pending when line 0 is not complete', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', line1, 'simple-task');

      const status = await service.getNodeStatus(ctx, 'test-graph', node1.nodeId as string);

      expect(status.status).toBe('pending');
      expect(status.readyDetail.precedingLinesComplete).toBe(false);
    });

    it('line 1 node is ready when all line 0 nodes are complete', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const node0 = await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', line1, 'simple-task');

      // Mark line 0 node complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [node0.nodeId as string]: {
            status: 'complete',
            completed_at: new Date().toISOString(),
          },
        },
        transitions: {},
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', node1.nodeId as string);

      expect(status.status).toBe('ready');
      expect(status.readyDetail.precedingLinesComplete).toBe(true);
    });

    it('empty line is trivially complete', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      // Line 0 stays empty
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const node1 = await service.addNode(ctx, 'test-graph', line1, 'simple-task');

      const status = await service.getNodeStatus(ctx, 'test-graph', node1.nodeId as string);

      expect(status.status).toBe('ready');
      expect(status.readyDetail.precedingLinesComplete).toBe(true);
    });
  });

  // ============================================
  // Gate 2: Transition gate
  // ============================================

  describe('Gate 2: transition gate', () => {
    it('manual transition blocks until triggered', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      // Set line 0 to manual transition
      await service.updateLineOrchestratorSettings(ctx, 'test-graph', line0, {
        transition: 'manual',
      });

      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const node0 = await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', line1, 'simple-task');

      // Mark line 0 complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [node0.nodeId as string]: {
            status: 'complete',
            completed_at: new Date().toISOString(),
          },
        },
        transitions: {},
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', node1.nodeId as string);

      expect(status.status).toBe('pending');
      expect(status.readyDetail.precedingLinesComplete).toBe(true);
      expect(status.readyDetail.transitionOpen).toBe(false);
    });

    it('manual transition passes after trigger', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      await service.updateLineOrchestratorSettings(ctx, 'test-graph', line0, {
        transition: 'manual',
      });

      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const node0 = await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', line1, 'simple-task');

      // Mark line 0 complete AND trigger transition
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [node0.nodeId as string]: {
            status: 'complete',
            completed_at: new Date().toISOString(),
          },
        },
        transitions: {
          [line0]: { triggered: true, triggered_at: new Date().toISOString() },
        },
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', node1.nodeId as string);

      expect(status.status).toBe('ready');
      expect(status.readyDetail.transitionOpen).toBe(true);
    });
  });

  // ============================================
  // Gate 3: Serial left neighbor
  // ============================================

  describe('Gate 3: serial left neighbor', () => {
    it('serial node waits for left neighbor to complete', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');

      const node0 = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      // Both default to serial

      // node0 not complete — node1 should be pending
      const status = await service.getNodeStatus(ctx, 'test-graph', node1.nodeId as string);

      expect(status.status).toBe('pending');
      expect(status.readyDetail.serialNeighborComplete).toBe(false);
    });

    it('parallel node skips Gate 3', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');

      await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', lineId, 'simple-task', {
        orchestratorSettings: { execution: 'parallel' },
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', node1.nodeId as string);

      expect(status.status).toBe('ready');
      expect(status.readyDetail.serialNeighborComplete).toBe(true); // n/a for parallel
    });

    it('position 0 serial node has no left neighbor (always passes Gate 3)', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node0 = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');

      const status = await service.getNodeStatus(ctx, 'test-graph', node0.nodeId as string);

      expect(status.readyDetail.serialNeighborComplete).toBe(true);
    });
  });

  // ============================================
  // Gate 4: Input availability
  // ============================================

  describe('Gate 4: input availability', () => {
    it('node with unavailable required inputs is pending', async () => {
      const coderUnit: NarrowWorkUnit = {
        slug: 'needs-input',
        type: 'agent',
        inputs: [{ name: 'spec', type: 'data', required: true }],
        outputs: [],
      };
      const loader = createFakeUnitLoader([simpleUnit, coderUnit]);
      service = createTestService(fs, pathResolver, loader);

      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'needs-input');

      // Don't wire the required input
      const status = await service.getNodeStatus(ctx, 'test-graph', node.nodeId as string);

      expect(status.status).toBe('pending');
      expect(status.readyDetail.inputsAvailable).toBe(false);
    });
  });

  // ============================================
  // Stored status
  // ============================================

  describe('stored status', () => {
    it('uses stored agent-accepted status from state.json', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = node.nodeId as string;

      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [nodeId]: { status: 'agent-accepted', started_at: new Date().toISOString() },
        },
        transitions: {},
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', nodeId);

      expect(status.status).toBe('agent-accepted');
    });

    it('uses stored complete status from state.json', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = node.nodeId as string;

      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [nodeId]: { status: 'complete', completed_at: new Date().toISOString() },
        },
        transitions: {},
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', nodeId);

      expect(status.status).toBe('complete');
    });
  });

  // ============================================
  // Gate 5: contextFrom ready (target node must be complete)
  // ============================================

  /**
   * Test Doc:
   * - Why: A node with contextFrom must not start until its target completes.
   *   Without this gate, ONBAS could dispatch the node before the context source
   *   session exists, causing invalid inheritance or silent data loss.
   * - Contract: canRun() Gate 5 checks nodeConfig.orchestratorSettings.contextFrom.
   *   If set, the target must appear in state.nodes with status='complete'.
   *   If not set, the gate is transparent (always passes).
   * - Usage Notes: Uses full service integration (not bare canRun) via getNodeStatus.
   *   Requires writeState() to set target node status in state.json.
   * - Quality Contribution: Prevents race condition where context engine receives
   *   an incomplete/nonexistent target — belt-and-suspenders with getContextSource R2 guard.
   * - Worked Example: Node R with contextFrom='S', S status='starting' →
   *   getNodeStatus(R).ready=false, readyDetail.contextFromReady=false.
   *   After S completes → getNodeStatus(R).ready=true, readyDetail.contextFromReady=true.
   */
  describe('Gate 5: contextFromReady', () => {
    it('node with contextFrom targeting incomplete node is NOT ready', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const target = await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const targetId = target.nodeId as string;
      const dependent = await service.addNode(ctx, 'test-graph', line1, 'simple-task', {
        orchestratorSettings: { contextFrom: targetId },
      });
      const depId = dependent.nodeId as string;

      // Target is starting (not complete)
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: { [targetId]: { status: 'starting' } },
        transitions: {},
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', depId);
      expect(status.ready).toBe(false);
      expect(status.readyDetail.contextFromReady).toBe(false);
    });

    it('node with contextFrom targeting complete node IS ready', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const target = await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const targetId = target.nodeId as string;
      const dependent = await service.addNode(ctx, 'test-graph', line1, 'simple-task', {
        orchestratorSettings: { contextFrom: targetId },
      });
      const depId = dependent.nodeId as string;

      // Target is complete → preceding line also complete
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: { [targetId]: { status: 'complete', completed_at: new Date().toISOString() } },
        transitions: {},
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', depId);
      expect(status.readyDetail.contextFromReady).toBe(true);
    });

    it('node without contextFrom always passes gate', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');

      const status = await service.getNodeStatus(ctx, 'test-graph', node.nodeId as string);
      expect(status.readyDetail.contextFromReady).toBe(true);
    });

    it('node with contextFrom targeting nonexistent node is NOT ready', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const dependent = await service.addNode(ctx, 'test-graph', line1, 'simple-task', {
        orchestratorSettings: { contextFrom: 'ghost-node-does-not-exist' },
      });
      const depId = dependent.nodeId as string;

      // Mark line 0 node complete so preceding gate passes
      const line0Status = await service.getStatus(ctx, 'test-graph');
      const node0Id = line0Status.lines[0].nodes[0].nodeId;
      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: { [node0Id]: { status: 'complete', completed_at: new Date().toISOString() } },
        transitions: {},
      });

      const status = await service.getNodeStatus(ctx, 'test-graph', depId);
      expect(status.ready).toBe(false);
      expect(status.readyDetail.contextFromReady).toBe(false);
    });
  });
});
