/*
Test Doc:
- Why: Validate drive() polling loop correctness before CLI integration
- Contract: drive() calls run() repeatedly, emits events, persists sessions, exits on terminal state
- Usage Notes: Configure FakeONBAS.setActions() to queue run() responses. Use actionDelayMs:0/idleDelayMs:0 for fast tests.
- Quality Contribution: Catches loop logic errors, event emission gaps, session persistence bugs
- Worked Example: FakeONBAS returns start-node then graph-complete → drive() returns {exitReason:'complete', iterations:2, totalActions:1}
*/

import { beforeEach, describe, expect, it } from 'vitest';

import type { DriveEvent, DriveOptions } from '@chainglass/positional-graph';
import type { WorkspaceContext } from '@chainglass/workflow';

import { FakeODS } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-ods.js';
import { FakeONBAS } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { FakePodManager } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-pod-manager.js';
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

function makeState(): State {
  return { graph_slug: 'test-graph', version: '1.0.0', nodes: {}, questions: [] };
}

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

function makeGraphServiceStub(): IPositionalGraphService {
  return {
    getStatus: async () => makeStatusResult(),
    loadGraphState: async () => makeState(),
    load: async () => ({ ok: true, errors: [], definition: { orchestratorSettings: {} } }),
    persistGraphState: async () => {},
  } as unknown as IPositionalGraphService;
}

interface DriveDeps {
  graphService: IPositionalGraphService;
  onbas: FakeONBAS;
  ods: FakeODS;
  ehs: FakeEventHandlerService;
  podManager: FakePodManager;
}

function makeDeps(overrides: Partial<DriveDeps> = {}): DriveDeps {
  return {
    graphService: overrides.graphService ?? makeGraphServiceStub(),
    onbas: overrides.onbas ?? new FakeONBAS(),
    ods: overrides.ods ?? new FakeODS(),
    ehs: overrides.ehs ?? new FakeEventHandlerService(),
    podManager: overrides.podManager ?? new FakePodManager(),
  };
}

function makeDriveHandle(deps: DriveDeps): GraphOrchestration {
  return new GraphOrchestration({
    graphSlug: 'test-graph',
    ctx: makeCtx(),
    graphService: deps.graphService,
    onbas: deps.onbas,
    ods: deps.ods,
    eventHandlerService: deps.ehs,
    podManager: deps.podManager,
  });
}

const emptyInputPack = { inputs: {}, ok: true };

function startNode(nodeId: string): OrchestrationRequest {
  return {
    type: 'start-node',
    graphSlug: 'test-graph',
    nodeId,
    inputs: emptyInputPack,
  } as OrchestrationRequest;
}

function noAction(reason: string): OrchestrationRequest {
  return { type: 'no-action', graphSlug: 'test-graph', reason } as OrchestrationRequest;
}

const FAST_OPTS: DriveOptions = { actionDelayMs: 0, idleDelayMs: 0 };

// ── Happy Path Tests (T001) ─────────────────────────

describe('drive() happy path', () => {
  let deps: DriveDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('completes after single-node graph', async () => {
    deps.onbas.setActions([startNode('n1'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const result = await handle.drive(FAST_OPTS);

    expect(result.exitReason).toBe('complete');
    expect(result.iterations).toBe(1); // one run() call consumes start + complete
    expect(result.totalActions).toBe(1);
  });

  it('completes multi-node serial graph', async () => {
    deps.onbas.setActions([startNode('n1'), startNode('n2'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const result = await handle.drive(FAST_OPTS);

    expect(result.exitReason).toBe('complete');
    expect(result.iterations).toBe(1); // one run() call consumes all actions + complete
    expect(result.totalActions).toBe(2);
  });

  it('counts totalActions from run() actions (parallel nodes in one run)', async () => {
    // ONBAS returns 3 start-nodes then no-action in first run() call = 3 actions in 1 iteration
    deps.onbas.setActions([
      startNode('a'),
      startNode('b'),
      startNode('c'),
      noAction('all-waiting'),
      noAction('graph-complete'),
    ]);
    const handle = makeDriveHandle(deps);

    const result = await handle.drive(FAST_OPTS);

    expect(result.exitReason).toBe('complete');
    expect(result.totalActions).toBe(3);
  });

  it('exits immediately when graph already complete', async () => {
    deps.onbas.setNextAction(noAction('graph-complete'));
    const handle = makeDriveHandle(deps);

    const result = await handle.drive(FAST_OPTS);

    expect(result.exitReason).toBe('complete');
    expect(result.iterations).toBe(1);
    expect(result.totalActions).toBe(0);
  });
});

// ── Failure Path Tests (T002) ───────────────────────

describe('drive() failure paths', () => {
  let deps: DriveDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('exits with failed on graph-failed', async () => {
    deps.onbas.setActions([startNode('n1'), noAction('graph-failed')]);
    const handle = makeDriveHandle(deps);

    const result = await handle.drive(FAST_OPTS);

    expect(result.exitReason).toBe('failed');
  });

  it('exits with failed when graph already failed', async () => {
    deps.onbas.setNextAction(noAction('graph-failed'));
    const handle = makeDriveHandle(deps);

    const result = await handle.drive(FAST_OPTS);

    expect(result.exitReason).toBe('failed');
    expect(result.iterations).toBe(1);
    expect(result.totalActions).toBe(0);
  });

  it('exits with max-iterations when limit exceeded', async () => {
    deps.onbas.setNextAction(noAction('all-waiting'));
    const handle = makeDriveHandle(deps);

    const result = await handle.drive({ ...FAST_OPTS, maxIterations: 3 });

    expect(result.exitReason).toBe('max-iterations');
    expect(result.iterations).toBe(3);
  });

  it('exits with failed when run() throws', async () => {
    const throwingService = {
      ...makeGraphServiceStub(),
      loadGraphState: async () => {
        throw new Error('disk failure');
      },
    } as unknown as IPositionalGraphService;
    const handle = makeDriveHandle({ ...deps, graphService: throwingService });

    const events: DriveEvent[] = [];
    const result = await handle.drive({ ...FAST_OPTS, onEvent: async (e) => events.push(e) });

    expect(result.exitReason).toBe('failed');
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});

// ── Delay Strategy Tests (T003) ─────────────────────

describe('drive() delay strategy', () => {
  it('emits iteration event after action-producing run', async () => {
    const deps = makeDeps();
    deps.onbas.setActions([startNode('n1'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const events: DriveEvent[] = [];
    await handle.drive({ ...FAST_OPTS, onEvent: async (e) => events.push(e) });

    expect(events.some((e) => e.type === 'iteration')).toBe(true);
  });

  it('emits idle event after no-action run', async () => {
    const deps = makeDeps();
    deps.onbas.setActions([noAction('all-waiting'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const events: DriveEvent[] = [];
    await handle.drive({ ...FAST_OPTS, onEvent: async (e) => events.push(e) });

    expect(events.some((e) => e.type === 'idle')).toBe(true);
  });
});

// ── Event Emission Tests (T004) ─────────────────────

describe('drive() event emission', () => {
  it('emits status event with formatGraphStatus output after each iteration', async () => {
    const deps = makeDeps();
    deps.onbas.setActions([startNode('n1'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const events: DriveEvent[] = [];
    await handle.drive({ ...FAST_OPTS, onEvent: async (e) => events.push(e) });

    const statusEvents = events.filter((e) => e.type === 'status');
    expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    expect(statusEvents[0].message).toContain('Graph:');
  });

  it('emits status on terminal iteration too', async () => {
    const deps = makeDeps();
    deps.onbas.setNextAction(noAction('graph-complete'));
    const handle = makeDriveHandle(deps);

    const events: DriveEvent[] = [];
    await handle.drive({ ...FAST_OPTS, onEvent: async (e) => events.push(e) });

    const statusEvents = events.filter((e) => e.type === 'status');
    expect(statusEvents).toHaveLength(1);
  });

  it('iteration event carries OrchestrationRunResult data', async () => {
    const deps = makeDeps();
    deps.onbas.setActions([startNode('n1'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const events: DriveEvent[] = [];
    await handle.drive({ ...FAST_OPTS, onEvent: async (e) => events.push(e) });

    const iterEvent = events.find((e) => e.type === 'iteration');
    expect(iterEvent).toBeDefined();
    if (iterEvent?.type === 'iteration') {
      expect(iterEvent.data).toBeDefined();
      expect(iterEvent.data.stopReason).toBeDefined();
    }
  });

  it('awaits async onEvent callback', async () => {
    const deps = makeDeps();
    deps.onbas.setActions([startNode('n1'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const order: string[] = [];
    await handle.drive({
      ...FAST_OPTS,
      onEvent: async (e) => {
        await new Promise((r) => setTimeout(r, 5));
        order.push(e.type);
      },
    });

    expect(order.length).toBeGreaterThan(0);
  });

  it('no agent events emitted', async () => {
    const deps = makeDeps();
    deps.onbas.setActions([startNode('n1'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const events: DriveEvent[] = [];
    await handle.drive({ ...FAST_OPTS, onEvent: async (e) => events.push(e) });

    const types = new Set(events.map((e) => e.type));
    // Only orchestration event types — no agent/pod types
    for (const t of types) {
      expect(['iteration', 'idle', 'status', 'error']).toContain(t);
    }
  });
});

// ── Session Persistence Tests (T005) ────────────────

describe('drive() session persistence', () => {
  it('calls loadSessions once at start', async () => {
    const deps = makeDeps();
    deps.onbas.setNextAction(noAction('graph-complete'));
    const handle = makeDriveHandle(deps);

    await handle.drive(FAST_OPTS);

    expect(deps.podManager.loadSessionsCalls).toBe(1);
  });

  it('calls persistSessions after action-producing iterations', async () => {
    const deps = makeDeps();
    // Two separate run() calls: first starts n1 (then idle), second starts n2 (then complete)
    deps.onbas.setActions([
      startNode('n1'),
      noAction('all-waiting'), // run() 1: action + idle exit
      startNode('n2'),
      noAction('graph-complete'), // run() 2: action + complete exit
    ]);
    const handle = makeDriveHandle(deps);

    await handle.drive(FAST_OPTS);

    expect(deps.podManager.persistSessionsCalls).toBe(2);
  });

  it('calls persistSessions every iteration including no-action', async () => {
    const deps = makeDeps();
    deps.onbas.setActions([noAction('all-waiting'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    await handle.drive(FAST_OPTS);

    // Persist every iteration so fire-and-forget .then() settlements are captured
    expect(deps.podManager.persistSessionsCalls).toBe(2);
  });

  it('works without podManager (optional chaining)', async () => {
    const deps = makeDeps();
    deps.onbas.setNextAction(noAction('graph-complete'));
    // Create handle WITHOUT podManager
    const handle = new GraphOrchestration({
      graphSlug: 'test-graph',
      ctx: makeCtx(),
      graphService: deps.graphService,
      onbas: deps.onbas,
      ods: deps.ods,
      eventHandlerService: deps.ehs,
    });

    // Should not throw
    const result = await handle.drive(FAST_OPTS);
    expect(result.exitReason).toBe('complete');
  });
});

// ── Abort Signal Tests (Plan 074 T004) ──────────────

describe('drive() abort signal', () => {
  let deps: DriveDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('returns stopped when signal aborts during idle sleep', async () => {
    // ONBAS returns no-action forever (idle polling)
    deps.onbas.setNextAction(noAction('all-waiting'));
    const handle = makeDriveHandle(deps);
    const controller = new AbortController();

    // Abort after 50ms — drive() should exit instead of sleeping full idleDelayMs
    setTimeout(() => controller.abort(), 50);

    const start = Date.now();
    const result = await handle.drive({
      ...FAST_OPTS,
      idleDelayMs: 10_000,
      signal: controller.signal,
    });
    const elapsed = Date.now() - start;

    expect(result.exitReason).toBe('stopped');
    expect(elapsed).toBeLessThan(500); // not 10s
  });

  it('returns stopped immediately with already-aborted signal', async () => {
    deps.onbas.setNextAction(noAction('all-waiting'));
    const handle = makeDriveHandle(deps);
    const controller = new AbortController();
    controller.abort();

    const start = Date.now();
    const result = await handle.drive({
      ...FAST_OPTS,
      signal: controller.signal,
    });
    const elapsed = Date.now() - start;

    expect(result.exitReason).toBe('stopped');
    expect(result.iterations).toBe(0);
    expect(elapsed).toBeLessThan(50);
  });

  it('emits status event with stopped message on abort', async () => {
    deps.onbas.setNextAction(noAction('all-waiting'));
    const handle = makeDriveHandle(deps);
    const controller = new AbortController();
    controller.abort();

    const events: DriveEvent[] = [];
    await handle.drive({
      ...FAST_OPTS,
      signal: controller.signal,
      onEvent: async (e) => events.push(e),
    });

    const statusEvents = events.filter((e) => e.type === 'status');
    expect(statusEvents.some((e) => e.message.includes('stopped'))).toBe(true);
  });

  it('without signal behaves normally (backwards compatible)', async () => {
    deps.onbas.setActions([startNode('n1'), noAction('graph-complete')]);
    const handle = makeDriveHandle(deps);

    const result = await handle.drive(FAST_OPTS);

    expect(result.exitReason).toBe('complete');
    expect(result.iterations).toBe(1);
  });

  it('aborts during action delay sleep', async () => {
    // ONBAS returns one action then keeps returning all-waiting
    deps.onbas.setActions([startNode('n1'), noAction('all-waiting')]);
    const handle = makeDriveHandle(deps);
    const controller = new AbortController();

    // Abort after 50ms — should exit during action delay
    setTimeout(() => controller.abort(), 50);

    const result = await handle.drive({
      actionDelayMs: 10_000,
      idleDelayMs: 10_000,
      signal: controller.signal,
    });

    expect(result.exitReason).toBe('stopped');
    expect(result.totalActions).toBe(1); // first action completed before abort
  });

  it('persists sessions before returning stopped', async () => {
    deps.onbas.setNextAction(noAction('all-waiting'));
    const handle = makeDriveHandle(deps);
    const controller = new AbortController();

    // Let at least one iteration happen before abort
    setTimeout(() => controller.abort(), 50);

    await handle.drive({
      ...FAST_OPTS,
      idleDelayMs: 10_000,
      signal: controller.signal,
    });

    // Sessions should be persisted at least once (during the iteration)
    expect(deps.podManager.persistSessionsCalls).toBeGreaterThanOrEqual(1);
  });
});
