/*
Test Doc:
- Why: GraphOrchestration.run() is the core orchestration loop (AC-11) that composes Settle → Decide → Act
- Contract: run() iterates: EHS settle → build reality → ONBAS decide → exit check → ODS execute → record → repeat;
            stops on no-action/graph-complete/graph-failed; maps NoActionReason to OrchestrationStopReason;
            max iteration guard prevents infinite loops; actions recorded with timestamps; getReality() returns fresh snapshot
- Usage Notes: Construct with graphSlug, ctx, and all internal deps (graphService, onbas, ods, eventHandlerService);
            call run() to advance, getReality() for read-only state
- Quality Contribution: Proves the full orchestration loop works with fake collaborators
- Worked Example: ONBAS returns start-node then no-action → run() returns 1 action, stopReason 'no-action'
*/

import { beforeEach, describe, expect, it } from 'vitest';

import type { WorkspaceContext } from '@chainglass/workflow';

import { FakeODS } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-ods.js';
import { buildFakeReality } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { FakeONBAS } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { GraphOrchestration } from '../../../../../packages/positional-graph/src/features/030-orchestration/graph-orchestration.js';
import type { OrchestrationRequest } from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-request.schema.js';
import { FakeEventHandlerService } from '../../../../../packages/positional-graph/src/features/032-node-event-system/fake-event-handler-service.js';
import type {
  GraphStatusResult,
  IPositionalGraphService,
} from '../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';
import type { State } from '../../../../../packages/positional-graph/src/schemas/state.schema.js';

// ── Test Helpers ─────────────────────────────────────

function makeCtx(): WorkspaceContext {
  return {
    workspaceSlug: 'test-ws',
    workspaceName: 'Test Workspace',
    workspacePath: '/tmp/test',
    worktreePath: '/tmp/test',
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: false,
  };
}

/** Minimal State for EHS processGraph. */
function makeState(): State {
  return {
    graph_slug: 'test-graph',
    version: '1.0.0',
    nodes: {},
    questions: [],
  };
}

/** Minimal GraphStatusResult for buildPositionalGraphReality. */
function makeStatusResult(overrides: Partial<GraphStatusResult> = {}): GraphStatusResult {
  return {
    graphSlug: 'test-graph',
    version: '1.0.0',
    status: 'in_progress',
    totalNodes: 0,
    completedNodes: 0,
    lines: [],
    readyNodes: [],
    runningNodes: [],
    waitingQuestionNodes: [],
    blockedNodes: [],
    completedNodeIds: [],
    ...overrides,
  };
}

/** Stub graphService that returns configurable status + state and tracks persist calls. */
function makeGraphServiceStub(
  overrides: {
    statusResult?: GraphStatusResult;
    state?: State;
    persistCalls?: State[];
  } = {}
): IPositionalGraphService {
  const persistCalls = overrides.persistCalls ?? [];
  return {
    getStatus: async () => overrides.statusResult ?? makeStatusResult(),
    loadGraphState: async () => overrides.state ?? makeState(),
    load: async () => ({ ok: true, errors: [], definition: { orchestratorSettings: {} } }),
    persistGraphState: async (_ctx: WorkspaceContext, _slug: string, state: State) => {
      persistCalls.push(structuredClone(state));
    },
  } as unknown as IPositionalGraphService;
}

interface LoopDeps {
  graphService: IPositionalGraphService;
  onbas: FakeONBAS;
  ods: FakeODS;
  ehs: FakeEventHandlerService;
}

function makeDeps(overrides: Partial<LoopDeps> = {}): LoopDeps {
  return {
    graphService: overrides.graphService ?? makeGraphServiceStub(),
    onbas: overrides.onbas ?? new FakeONBAS(),
    ods: overrides.ods ?? new FakeODS(),
    ehs: overrides.ehs ?? new FakeEventHandlerService(),
  };
}

function makeHandle(deps: LoopDeps, opts: { maxIterations?: number } = {}): GraphOrchestration {
  return new GraphOrchestration({
    graphSlug: 'test-graph',
    ctx: makeCtx(),
    graphService: deps.graphService,
    onbas: deps.onbas,
    ods: deps.ods,
    eventHandlerService: deps.ehs,
    maxIterations: opts.maxIterations,
  });
}

// ═══════════════════════════════════════════════════════
// T006: Loop tests (RED)
// ═══════════════════════════════════════════════════════

describe('GraphOrchestration — run() loop', () => {
  let deps: LoopDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('single iteration: start-node then no-action', async () => {
    deps.onbas.setActions([
      {
        type: 'start-node',
        graphSlug: 'test-graph',
        nodeId: 'A',
        inputs: { ok: true, inputs: {} },
      },
      { type: 'no-action', graphSlug: 'test-graph', reason: 'all-running' },
    ]);

    const handle = makeHandle(deps);
    const result = await handle.run();

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].request.type).toBe('start-node');
    expect(result.stopReason).toBe('no-action');
    expect(result.iterations).toBe(2);
  });

  it('multi-iteration: start 2 nodes then no-action', async () => {
    deps.onbas.setActions([
      {
        type: 'start-node',
        graphSlug: 'test-graph',
        nodeId: 'A',
        inputs: { ok: true, inputs: {} },
      },
      {
        type: 'start-node',
        graphSlug: 'test-graph',
        nodeId: 'B',
        inputs: { ok: true, inputs: {} },
      },
      { type: 'no-action', graphSlug: 'test-graph', reason: 'all-running' },
    ]);

    const handle = makeHandle(deps);
    const result = await handle.run();

    expect(result.actions).toHaveLength(2);
    expect(result.stopReason).toBe('no-action');
    expect(result.iterations).toBe(3);
  });

  it('stops on no-action immediately (0 actions)', async () => {
    deps.onbas.setActions([{ type: 'no-action', graphSlug: 'test-graph', reason: 'all-waiting' }]);

    const handle = makeHandle(deps);
    const result = await handle.run();

    expect(result.actions).toHaveLength(0);
    expect(result.stopReason).toBe('no-action');
    expect(result.iterations).toBe(1);
  });

  it('stops on graph-complete', async () => {
    deps.onbas.setActions([
      { type: 'no-action', graphSlug: 'test-graph', reason: 'graph-complete' },
    ]);

    const handle = makeHandle(deps);
    const result = await handle.run();

    expect(result.stopReason).toBe('graph-complete');
  });

  it('stops on graph-failed', async () => {
    deps.onbas.setActions([{ type: 'no-action', graphSlug: 'test-graph', reason: 'graph-failed' }]);

    const handle = makeHandle(deps);
    const result = await handle.run();

    expect(result.stopReason).toBe('graph-failed');
  });

  it('all-running maps to no-action stop reason (DYK #4)', async () => {
    deps.onbas.setActions([{ type: 'no-action', graphSlug: 'test-graph', reason: 'all-running' }]);

    const handle = makeHandle(deps);
    const result = await handle.run();

    expect(result.stopReason).toBe('no-action');
  });

  it('max iteration guard stops the loop', async () => {
    // ONBAS always returns start-node — without guard, loop would be infinite
    deps.onbas.setActions([
      {
        type: 'start-node',
        graphSlug: 'test-graph',
        nodeId: 'A',
        inputs: { ok: true, inputs: {} },
      },
    ]);

    const handle = makeHandle(deps, { maxIterations: 3 });
    const result = await handle.run();

    expect(result.iterations).toBe(3);
    expect(result.stopReason).toBe('no-action');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('MAX_ITERATIONS');
  });

  it('actions have ISO 8601 timestamps', async () => {
    deps.onbas.setActions([
      {
        type: 'start-node',
        graphSlug: 'test-graph',
        nodeId: 'A',
        inputs: { ok: true, inputs: {} },
      },
      { type: 'no-action', graphSlug: 'test-graph', reason: 'graph-complete' },
    ]);

    const handle = makeHandle(deps);
    const result = await handle.run();

    expect(result.actions).toHaveLength(1);
    // ISO 8601 pattern: 2026-02-09T...Z or similar
    expect(result.actions[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('EHS settle called each iteration', async () => {
    deps.onbas.setActions([
      {
        type: 'start-node',
        graphSlug: 'test-graph',
        nodeId: 'A',
        inputs: { ok: true, inputs: {} },
      },
      { type: 'no-action', graphSlug: 'test-graph', reason: 'graph-complete' },
    ]);

    const handle = makeHandle(deps);
    await handle.run();

    // 2 iterations = 2 EHS settle calls
    expect(deps.ehs.getHistory()).toHaveLength(2);
  });

  it('getReality() returns fresh snapshot', async () => {
    const handle = makeHandle(deps);
    const reality = await handle.getReality();

    expect(reality).toBeDefined();
    expect(reality.graphSlug).toBe('test-graph');
  });

  it('graphSlug property is set', () => {
    const handle = makeHandle(deps);
    expect(handle.graphSlug).toBe('test-graph');
  });

  it('persists state after EHS settle each iteration', async () => {
    const persistCalls: State[] = [];
    const graphService = makeGraphServiceStub({ persistCalls });

    deps = makeDeps({ graphService });
    deps.onbas.setActions([
      {
        type: 'start-node',
        graphSlug: 'test-graph',
        nodeId: 'A',
        inputs: { ok: true, inputs: {} },
      },
      { type: 'no-action', graphSlug: 'test-graph', reason: 'graph-complete' },
    ]);

    const handle = makeHandle(deps);
    await handle.run();

    // 2 iterations = 2 persist calls (one per settle)
    expect(persistCalls).toHaveLength(2);
  });
});
