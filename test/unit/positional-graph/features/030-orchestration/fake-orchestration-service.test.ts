/*
Test Doc:
- Why: FakeOrchestrationService and FakeGraphOrchestration enable downstream testing without real collaborators (AC-10)
- Contract: configureGraph() sets up per-graph handles; run() returns queued results in FIFO order; getReality() returns configured state;
            getGetHistory() tracks .get() calls; unconfigured graph throws; reset() clears all state
- Usage Notes: Call configureGraph(slug, config) before get(ctx, slug); FakeGraphConfig provides runResults + reality
- Quality Contribution: Proves fake doubles are reliable for consumers who depend on IOrchestrationService
- Worked Example: svc.configureGraph('g', { runResults: [result], reality }); const h = await svc.get(ctx, 'g'); await h.run() → result
*/

import { beforeEach, describe, expect, it } from 'vitest';

import type { WorkspaceContext } from '@chainglass/workflow';

import { buildFakeReality } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import {
  FakeGraphOrchestration,
  FakeOrchestrationService,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.js';
import type {
  FakeGraphConfig,
  OrchestrationRunResult,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-service.types.js';

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

function makeRunResult(overrides: Partial<OrchestrationRunResult> = {}): OrchestrationRunResult {
  return {
    errors: [],
    actions: [],
    stopReason: 'no-action',
    finalReality: buildFakeReality(),
    iterations: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// T004: Fake tests (RED)
// ═══════════════════════════════════════════════════════

describe('FakeOrchestrationService', () => {
  let svc: FakeOrchestrationService;
  const ctx = makeCtx();

  beforeEach(() => {
    svc = new FakeOrchestrationService();
  });

  it('configureGraph() + get() returns handle with correct graphSlug', async () => {
    const reality = buildFakeReality({ graphSlug: 'my-graph' });
    const config: FakeGraphConfig = { runResults: [makeRunResult()], reality };
    svc.configureGraph('my-graph', config);

    const handle = await svc.get(ctx, 'my-graph');
    expect(handle.graphSlug).toBe('my-graph');
  });

  it('run() returns queued results in FIFO order', async () => {
    const r1 = makeRunResult({ stopReason: 'no-action', iterations: 1 });
    const r2 = makeRunResult({ stopReason: 'graph-complete', iterations: 5 });
    const r3 = makeRunResult({ stopReason: 'graph-failed', iterations: 2 });

    svc.configureGraph('g', {
      runResults: [r1, r2, r3],
      reality: buildFakeReality(),
    });

    const handle = await svc.get(ctx, 'g');
    expect(await handle.run()).toBe(r1);
    expect(await handle.run()).toBe(r2);
    expect(await handle.run()).toBe(r3);
    // Last repeats
    expect(await handle.run()).toBe(r3);
  });

  it('getReality() returns configured reality', async () => {
    const reality = buildFakeReality({ graphSlug: 'pipeline' });
    svc.configureGraph('pipeline', { runResults: [makeRunResult()], reality });

    const handle = await svc.get(ctx, 'pipeline');
    expect(await handle.getReality()).toBe(reality);
  });

  it('getGetHistory() tracks get() calls', async () => {
    svc.configureGraph('a', { runResults: [makeRunResult()], reality: buildFakeReality() });
    svc.configureGraph('b', { runResults: [makeRunResult()], reality: buildFakeReality() });

    await svc.get(ctx, 'a');
    await svc.get(ctx, 'b');

    const history = svc.getGetHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ ctx, graphSlug: 'a' });
    expect(history[1]).toEqual({ ctx, graphSlug: 'b' });
  });

  it('unconfigured graph throws', async () => {
    await expect(svc.get(ctx, 'missing')).rejects.toThrow();
  });

  it('reset() clears all state', async () => {
    svc.configureGraph('g', { runResults: [makeRunResult()], reality: buildFakeReality() });
    await svc.get(ctx, 'g');

    svc.reset();

    expect(svc.getGetHistory()).toHaveLength(0);
    await expect(svc.get(ctx, 'g')).rejects.toThrow();
  });
});

describe('FakeGraphOrchestration', () => {
  it('graphSlug is set from construction', () => {
    const handle = new FakeGraphOrchestration('my-graph', {
      runResults: [makeRunResult()],
      reality: buildFakeReality(),
    });
    expect(handle.graphSlug).toBe('my-graph');
  });
});
