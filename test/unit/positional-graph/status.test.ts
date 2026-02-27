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

const simpleUnit: NarrowWorkUnit = {
  slug: 'simple-task',
  type: 'agent',
  inputs: [],
  outputs: [{ name: 'result', type: 'data', required: true }],
};

const userInputUnit: NarrowWorkUnit = {
  slug: 'get-requirements',
  type: 'user-input',
  inputs: [],
  outputs: [{ name: 'requirements', type: 'data', required: true }],
  userInput: {
    prompt: 'Describe your requirements',
    questionType: 'text',
  },
};

describe('PositionalGraphService — Status API', () => {
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
  // getLineStatus
  // ============================================

  describe('getLineStatus', () => {
    it('returns line status with convenience buckets', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node0 = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', lineId, 'simple-task', {
        execution: 'parallel',
      });

      // node0 complete, node1 ready
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

      const lineStatus = await service.getLineStatus(ctx, 'test-graph', lineId);

      expect(lineStatus.lineId).toBe(lineId);
      expect(lineStatus.nodes).toHaveLength(2);
      expect(lineStatus.completedNodes).toContain(node0.nodeId);
      expect(lineStatus.readyNodes).toContain(node1.nodeId);
      expect(lineStatus.complete).toBe(false); // not all nodes complete
    });

    it('reports empty line as trivially complete', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      // Line has no nodes

      const lineStatus = await service.getLineStatus(ctx, 'test-graph', lineId);

      expect(lineStatus.empty).toBe(true);
      expect(lineStatus.complete).toBe(true);
    });

    it('identifies starter nodes correctly', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      // [S, S, P, S] → starters at pos 0 and pos 2
      await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      await service.addNode(ctx, 'test-graph', lineId, 'simple-task', {
        orchestratorSettings: { execution: 'parallel' },
      });
      await service.addNode(ctx, 'test-graph', lineId, 'simple-task');

      const lineStatus = await service.getLineStatus(ctx, 'test-graph', lineId);

      expect(lineStatus.starterNodes).toHaveLength(2);
      expect(lineStatus.starterNodes[0].position).toBe(0);
      expect(lineStatus.starterNodes[1].position).toBe(2);
    });
  });

  // ============================================
  // getStatus (graph-level)
  // ============================================

  describe('getStatus', () => {
    it('returns pending for fresh graph', async () => {
      await service.create(ctx, 'test-graph');

      const status = await service.getStatus(ctx, 'test-graph');

      expect(status.status).toBe('pending');
      expect(status.totalNodes).toBe(0);
      expect(status.completedNodes).toBe(0);
      expect(status.lines).toHaveLength(1);
    });

    it('returns in_progress when some nodes running', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');

      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {
          [node.nodeId as string]: {
            status: 'agent-accepted',
            started_at: new Date().toISOString(),
          },
        },
        transitions: {},
      });

      const status = await service.getStatus(ctx, 'test-graph');

      expect(status.status).toBe('in_progress');
      expect(status.runningNodes).toContain(node.nodeId);
    });

    it('returns complete when all nodes complete', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');

      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'complete',
        updated_at: new Date().toISOString(),
        nodes: {
          [node.nodeId as string]: {
            status: 'complete',
            completed_at: new Date().toISOString(),
          },
        },
        transitions: {},
      });

      const status = await service.getStatus(ctx, 'test-graph');

      expect(status.status).toBe('complete');
      expect(status.completedNodes).toBe(1);
      expect(status.completedNodeIds).toContain(node.nodeId);
    });

    it('returns failed when a node has blocked-error', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');

      await writeState(fs, pathResolver, 'test-graph', {
        graph_status: 'failed',
        updated_at: new Date().toISOString(),
        nodes: {
          [node.nodeId as string]: {
            status: 'blocked-error',
            started_at: new Date().toISOString(),
          },
        },
        transitions: {},
      });

      const status = await service.getStatus(ctx, 'test-graph');

      expect(status.status).toBe('failed');
      expect(status.blockedNodes).toContain(node.nodeId);
    });

    it('includes readyNodes across all lines', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const node0 = await service.addNode(ctx, 'test-graph', line0, 'simple-task');

      const status = await service.getStatus(ctx, 'test-graph');

      // node0 on line 0, no preceding lines, no inputs → ready
      expect(status.readyNodes).toContain(node0.nodeId);
    });

    it('handles multi-line graph with mixed states', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const node0 = await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', line1, 'simple-task');

      // node0 complete, node1 should be ready
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

      const status = await service.getStatus(ctx, 'test-graph');

      expect(status.status).toBe('in_progress');
      expect(status.lines).toHaveLength(2);
      expect(status.completedNodeIds).toContain(node0.nodeId);
      expect(status.readyNodes).toContain(node1.nodeId);
    });

    it('triggerTransition reflected in status', async () => {
      const { lineId: line0 } = await service.create(ctx, 'test-graph');
      await service.updateLineOrchestratorSettings(ctx, 'test-graph', line0, {
        transition: 'manual',
      });

      const addLine1 = await service.addLine(ctx, 'test-graph');
      const line1 = addLine1.lineId as string;

      const node0 = await service.addNode(ctx, 'test-graph', line0, 'simple-task');
      const node1 = await service.addNode(ctx, 'test-graph', line1, 'simple-task');

      // Complete line 0 and trigger transition
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

      const status = await service.getStatus(ctx, 'test-graph');

      // node1 should be ready (transition triggered)
      expect(status.readyNodes).toContain(node1.nodeId);
      expect(status.lines[1].transitionTriggered).toBe(true);
    });
  });

  // ============================================
  // Discriminated NodeStatusResult (Plan 054)
  // ============================================

  describe('discriminated NodeStatusResult', () => {
    it('returns UserInputNodeStatus with userInput config for user-input units', async () => {
      const loader = createFakeUnitLoader([userInputUnit]);
      const svc = createTestService(fs, pathResolver, loader);

      const { lineId } = await svc.create(ctx, 'test-graph');
      const node = await svc.addNode(ctx, 'test-graph', lineId, 'get-requirements');
      const nodeId = node.nodeId as string;

      const status = await svc.getNodeStatus(ctx, 'test-graph', nodeId);

      expect(status.unitType).toBe('user-input');
      if (status.unitType === 'user-input') {
        expect(status.userInput).toBeDefined();
        expect(status.userInput.prompt).toBe('Describe your requirements');
        expect(status.userInput.questionType).toBe('text');
      }
    });

    it('returns AgentNodeStatus without userInput for agent units', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const node = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = node.nodeId as string;

      const status = await service.getNodeStatus(ctx, 'test-graph', nodeId);

      expect(status.unitType).toBe('agent');
      expect('userInput' in status).toBe(false);
    });
  });
});
