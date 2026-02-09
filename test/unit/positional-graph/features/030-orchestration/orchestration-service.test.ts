/*
Test Doc:
- Why: OrchestrationService.get() is the singleton factory that creates/caches per-graph handles (AC-10)
- Contract: same slug returns same handle (identity equality); different slug returns different handles;
            handle has correct graphSlug
- Usage Notes: Construct OrchestrationService with all deps; call get(ctx, slug) to obtain a handle
- Quality Contribution: Proves caching semantics — consumers get the same handle instance for the same graph
- Worked Example: svc.get(ctx, 'a') === svc.get(ctx, 'a') → true; svc.get(ctx, 'a') !== svc.get(ctx, 'b') → true
*/

import { beforeEach, describe, expect, it } from 'vitest';

import type { WorkspaceContext } from '@chainglass/workflow';

import { FakeODS } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-ods.js';
import { FakeONBAS } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { OrchestrationService } from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-service.js';
import { FakeEventHandlerService } from '../../../../../packages/positional-graph/src/features/032-node-event-system/fake-event-handler-service.js';
import type { IPositionalGraphService } from '../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';

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

// ═══════════════════════════════════════════════════════
// T008: Service caching tests (RED)
// ═══════════════════════════════════════════════════════

describe('OrchestrationService — get() caching', () => {
  let svc: OrchestrationService;
  const ctx = makeCtx();

  beforeEach(() => {
    svc = new OrchestrationService({
      graphService: makeGraphServiceStub(),
      onbas: new FakeONBAS(),
      ods: new FakeODS(),
      eventHandlerService: new FakeEventHandlerService(),
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
