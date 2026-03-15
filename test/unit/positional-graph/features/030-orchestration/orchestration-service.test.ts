/*
Test Doc:
- Why: OrchestrationService.get() is the singleton factory that creates/caches per-graph handles (AC-10)
- Contract: compound key (worktreePath|graphSlug) for caching; per-handle PodManager+ODS isolation;
            same ctx+slug returns same handle; different worktreePath+same slug returns different handles
- Usage Notes: Construct OrchestrationService with createPerHandleDeps factory
- Quality Contribution: Proves caching semantics + multi-worktree isolation + concurrent safety
- Worked Example: svc.get(ctx, 'a') === svc.get(ctx, 'a') → true; svc.get(ctx, 'a') !== svc.get(ctx, 'b') → true
*/

import { beforeEach, describe, expect, it } from 'vitest';

import type { WorkspaceContext } from '@chainglass/workflow';

import { FakeODS } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-ods.js';
import { FakeONBAS } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { FakePodManager } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-pod-manager.js';
import {
  OrchestrationService,
  type PerHandleDeps,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-service.js';
import type { IScriptRunner } from '../../../../../packages/positional-graph/src/features/030-orchestration/script-runner.types.js';
import { FakeEventHandlerService } from '../../../../../packages/positional-graph/src/features/032-node-event-system/fake-event-handler-service.js';
import type { IPositionalGraphService } from '../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';

// ── Test Helpers ─────────────────────────────────────

function makeCtx(worktreePath = '/tmp/test'): WorkspaceContext {
  return {
    workspaceSlug: 'test-ws',
    workspaceName: 'Test Workspace',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: false,
  };
}

function makeGraphServiceStub(): IPositionalGraphService {
  return {
    getStatus: async () => ({
      graphSlug: 'test',
      version: '1.0.0',
      status: 'pending',
      totalNodes: 0,
      completedNodes: 0,
      lines: [],
      readyNodes: [],
      runningNodes: [],
      waitingQuestionNodes: [],
      blockedNodes: [],
      completedNodeIds: [],
    }),
    loadGraphState: async () => ({
      graph_slug: 'test',
      version: '1.0.0',
      nodes: {},
      questions: [],
    }),
  } as unknown as IPositionalGraphService;
}

function makeCreatePerHandleDeps(): {
  factory: () => PerHandleDeps;
  instances: PerHandleDeps[];
} {
  const instances: PerHandleDeps[] = [];
  const factory = () => {
    const deps = { podManager: new FakePodManager(), ods: new FakeODS() };
    instances.push(deps);
    return deps;
  };
  return { factory, instances };
}

// ═══════════════════════════════════════════════════════
// T008: Service caching tests (original)
// ═══════════════════════════════════════════════════════

describe('OrchestrationService — get() caching', () => {
  let svc: OrchestrationService;
  const ctx = makeCtx();

  beforeEach(() => {
    const { factory } = makeCreatePerHandleDeps();
    svc = new OrchestrationService({
      graphService: makeGraphServiceStub(),
      onbas: new FakeONBAS(),
      eventHandlerService: new FakeEventHandlerService(),
      createPerHandleDeps: factory,
    });
  });

  it('same slug returns same handle', async () => {
    const h1 = await svc.get(ctx, 'my-graph');
    const h2 = await svc.get(ctx, 'my-graph');
    expect(h1).toBe(h2);
  });

  it('different slug returns different handles', async () => {
    const h1 = await svc.get(ctx, 'graph-a');
    const h2 = await svc.get(ctx, 'graph-b');
    expect(h1).not.toBe(h2);
  });

  it('handle has correct graphSlug', async () => {
    const handle = await svc.get(ctx, 'test-pipeline');
    expect(handle.graphSlug).toBe('test-pipeline');
  });
});

// ═══════════════════════════════════════════════════════
// Plan 074 T007: Compound cache key
// ═══════════════════════════════════════════════════════

describe('OrchestrationService — compound cache key (T007)', () => {
  it('different worktreePath + same slug → different handles', async () => {
    const { factory } = makeCreatePerHandleDeps();
    const svc = new OrchestrationService({
      graphService: makeGraphServiceStub(),
      onbas: new FakeONBAS(),
      eventHandlerService: new FakeEventHandlerService(),
      createPerHandleDeps: factory,
    });

    const ctxA = makeCtx('/worktree-a');
    const ctxB = makeCtx('/worktree-b');

    const handleA = await svc.get(ctxA, 'my-graph');
    const handleB = await svc.get(ctxB, 'my-graph');

    expect(handleA).not.toBe(handleB);
  });

  it('same worktreePath + same slug → same handle', async () => {
    const { factory } = makeCreatePerHandleDeps();
    const svc = new OrchestrationService({
      graphService: makeGraphServiceStub(),
      onbas: new FakeONBAS(),
      eventHandlerService: new FakeEventHandlerService(),
      createPerHandleDeps: factory,
    });

    const ctx1 = makeCtx('/same-path');
    const ctx2 = makeCtx('/same-path');

    const h1 = await svc.get(ctx1, 'my-graph');
    const h2 = await svc.get(ctx2, 'my-graph');

    expect(h1).toBe(h2);
  });
});

// ═══════════════════════════════════════════════════════
// Plan 074 T008: Per-handle PodManager + ODS isolation
// ═══════════════════════════════════════════════════════

describe('OrchestrationService — per-handle isolation (T008)', () => {
  it('each handle gets its own PodManager and ODS', async () => {
    const { factory, instances } = makeCreatePerHandleDeps();
    const svc = new OrchestrationService({
      graphService: makeGraphServiceStub(),
      onbas: new FakeONBAS(),
      eventHandlerService: new FakeEventHandlerService(),
      createPerHandleDeps: factory,
    });

    await svc.get(makeCtx('/wt-a'), 'graph-1');
    await svc.get(makeCtx('/wt-b'), 'graph-1');

    // Factory should have been called twice (one per handle)
    expect(instances).toHaveLength(2);
    // Each instance should be distinct
    expect(instances[0].podManager).not.toBe(instances[1].podManager);
    expect(instances[0].ods).not.toBe(instances[1].ods);
  });

  it('factory not called for cached handle', async () => {
    const { factory, instances } = makeCreatePerHandleDeps();
    const svc = new OrchestrationService({
      graphService: makeGraphServiceStub(),
      onbas: new FakeONBAS(),
      eventHandlerService: new FakeEventHandlerService(),
      createPerHandleDeps: factory,
    });

    const ctx = makeCtx('/wt-a');
    await svc.get(ctx, 'graph-1');
    await svc.get(ctx, 'graph-1'); // cache hit

    // Factory called only once
    expect(instances).toHaveLength(1);
  });

  it('destroyPod on handle A does not affect handle B', async () => {
    const { factory, instances } = makeCreatePerHandleDeps();
    const svc = new OrchestrationService({
      graphService: makeGraphServiceStub(),
      onbas: new FakeONBAS(),
      eventHandlerService: new FakeEventHandlerService(),
      createPerHandleDeps: factory,
    });

    await svc.get(makeCtx('/wt-a'), 'graph-1');
    await svc.get(makeCtx('/wt-b'), 'graph-1');

    const pmA = instances[0].podManager as FakePodManager;
    const pmB = instances[1].podManager as FakePodManager;

    // Seed a pod in each
    pmA.createPod('node-1', {
      unitType: 'code',
      unitSlug: 'u1',
      runner: {} as unknown as IScriptRunner,
      scriptPath: '/s',
    });
    pmB.createPod('node-1', {
      unitType: 'code',
      unitSlug: 'u1',
      runner: {} as unknown as IScriptRunner,
      scriptPath: '/s',
    });

    // Destroy in A
    pmA.destroyPod('node-1');

    // B's pod should still exist
    expect(pmA.getPod('node-1')).toBeUndefined();
    expect(pmB.getPod('node-1')).toBeDefined();
  });
});
