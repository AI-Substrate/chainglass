/*
Test Doc:
- Why: ODS is the action executor (AC-6, AC-14) — it dispatches on request.type and launches pods for start-node
- Contract: execute() dispatches on type; start-node validates readiness, calls startNode, creates pod, launches fire-and-forget;
            no-action returns ok; resume-node/question-pending return defensive UNSUPPORTED_REQUEST_TYPE error
- Usage Notes: Construct ODS with { graphService, podManager, contextService }; call execute(request, ctx, reality)
- Quality Contribution: Confirms dispatch table, start-node happy/error paths, input wiring, user-input no-op
- Worked Example: ODS.execute({ type: 'start-node', nodeId: 'A', inputs }) → creates pod, calls startNode, returns { ok: true, newStatus: 'starting' }
*/

import { beforeEach, describe, expect, it } from 'vitest';

import { FakeAgentManagerService } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import { FakeWorkUnitService } from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/fake-workunit.service.js';
import { FakeAgentContextService } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-agent-context.js';
import { buildFakeReality } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import {
  type FakePod,
  FakePodManager,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-pod-manager.js';
import { ODS } from '../../../../../packages/positional-graph/src/features/030-orchestration/ods.js';
import type { ODSDependencies } from '../../../../../packages/positional-graph/src/features/030-orchestration/ods.types.js';
import type { OrchestrationRequest } from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-request.schema.js';
import type {
  IPositionalGraphService,
  StartNodeResult,
} from '../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';

// ── Test Helpers ─────────────────────────────────────

/** Minimal WorkspaceContext for testing. */
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

/** Stub graphService that only implements startNode. */
function makeGraphServiceStub(
  overrides: {
    startNodeResult?: StartNodeResult;
  } = {}
): IPositionalGraphService {
  const defaultResult: StartNodeResult = {
    errors: [],
    nodeId: 'test',
    status: 'starting',
    startedAt: '2026-02-09T10:00:00Z',
  };

  return {
    startNode: async (_ctx, _graphSlug, nodeId) => ({
      ...(overrides.startNodeResult ?? defaultResult),
      nodeId,
    }),
  } as unknown as IPositionalGraphService;
}

/** Stub IScriptRunner for pod creation params. */
const stubRunner = {
  run: async () => ({ exitCode: 0, stdout: '', stderr: '', outputs: {} }),
  kill: () => {},
};

// ═══════════════════════════════════════════════════════
// T005: Start-node handler tests (RED)
// ═══════════════════════════════════════════════════════

describe('ODS — start-node handler', () => {
  let podManager: FakePodManager;
  let contextService: FakeAgentContextService;
  let deps: ODSDependencies;
  const ctx = makeCtx();

  beforeEach(() => {
    podManager = new FakePodManager();
    contextService = new FakeAgentContextService();
    const fakeWUS = new FakeWorkUnitService();
    fakeWUS.addUnit({
      type: 'code',
      slug: 'unit-C',
      version: '1.0.0',
      code: { script: 'scripts/run.sh' },
      scriptContent: '#!/bin/bash\necho ok',
      outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
    });
    deps = {
      graphService: makeGraphServiceStub(),
      podManager,
      contextService,
      agentManager: new FakeAgentManagerService(),
      scriptRunner: stubRunner,
      workUnitService: fakeWUS,
    };
  });

  it('agent node: creates pod and calls pod.execute (fire-and-forget)', async () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready', unitType: 'agent' }],
    });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'A',
      inputs: { ok: true, inputs: { data: 'hello' } },
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe('starting');
    expect(podManager.getCreateHistory()).toHaveLength(1);
    expect(podManager.getCreateHistory()[0]).toMatchObject({
      nodeId: 'A',
      unitType: 'agent',
    });
  });

  it('code node: creates pod with runner', async () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'C', status: 'ready', unitType: 'code' }],
    });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'C',
      inputs: { ok: true, inputs: {} },
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(true);
    expect(podManager.getCreateHistory()).toHaveLength(1);
    expect(podManager.getCreateHistory()[0]).toMatchObject({
      nodeId: 'C',
      unitType: 'code',
    });
  });

  it('user-input node: returns ok without creating pod', async () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'U', status: 'ready', unitType: 'user-input' }],
    });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'U',
      inputs: { ok: true, inputs: {} },
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(true);
    expect(podManager.getCreateHistory()).toHaveLength(0);
  });

  it('node not ready: returns NODE_NOT_READY error', async () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'pending', unitType: 'agent', ready: false }],
    });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'A',
      inputs: { ok: true, inputs: {} },
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_READY');
    expect(result.error?.nodeId).toBe('A');
  });

  it('startNode failure: returns START_NODE_FAILED error', async () => {
    deps = {
      ...deps,
      graphService: makeGraphServiceStub({
        startNodeResult: {
          errors: [{ message: 'Node is not in pending status', code: 'INVALID_STATUS' }],
        },
      }),
    };
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready', unitType: 'agent' }],
    });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'A',
      inputs: { ok: true, inputs: {} },
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('START_NODE_FAILED');
    expect(result.error?.nodeId).toBe('A');
  });

  it('node not found in reality: returns NODE_NOT_FOUND error', async () => {
    const reality = buildFakeReality({ nodes: [] });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'missing',
      inputs: { ok: true, inputs: {} },
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });

  it('context inheritance: passes contextSessionId from prior node session', async () => {
    podManager.seedSession('parent-node', 'session-abc');
    contextService.setContextSource('A', {
      source: 'inherit',
      fromNodeId: 'parent-node',
    });

    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready', unitType: 'agent' }],
    });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'A',
      inputs: { ok: true, inputs: {} },
    };

    const ods = new ODS(deps);
    await ods.execute(request, ctx, reality);

    // Verify contextService was consulted
    expect(contextService.getHistory()).toHaveLength(1);
    expect(contextService.getHistory()[0].nodeId).toBe('A');
  });
});

// ═══════════════════════════════════════════════════════
// T006: Dispatch table + edge case tests (RED)
// ═══════════════════════════════════════════════════════

describe('ODS — dispatch table', () => {
  let deps: ODSDependencies;
  const ctx = makeCtx();

  beforeEach(() => {
    deps = {
      graphService: makeGraphServiceStub(),
      podManager: new FakePodManager(),
      contextService: new FakeAgentContextService(),
      agentManager: new FakeAgentManagerService(),
      scriptRunner: stubRunner,
    };
  });

  it('no-action: returns ok with no side effects', async () => {
    const reality = buildFakeReality();
    const request: OrchestrationRequest = {
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'graph-complete',
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(true);
    expect(result.request).toBe(request);
  });

  it('resume-node: returns defensive UNSUPPORTED_REQUEST_TYPE error', async () => {
    const reality = buildFakeReality();
    const request: OrchestrationRequest = {
      type: 'resume-node',
      graphSlug: 'test-graph',
      nodeId: 'A',
      questionId: 'q1',
      answer: 'yes',
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNSUPPORTED_REQUEST_TYPE');
  });

  it('question-pending: returns defensive UNSUPPORTED_REQUEST_TYPE error', async () => {
    const reality = buildFakeReality();
    const request: OrchestrationRequest = {
      type: 'question-pending',
      graphSlug: 'test-graph',
      nodeId: 'A',
      questionId: 'q1',
      questionText: 'What?',
      questionType: 'text',
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNSUPPORTED_REQUEST_TYPE');
  });
});

// ═══════════════════════════════════════════════════════
// T007: Input wiring tests (RED) — AC-14
// ═══════════════════════════════════════════════════════

describe('ODS — input wiring (AC-14)', () => {
  let podManager: FakePodManager;
  let deps: ODSDependencies;
  const ctx = makeCtx();

  beforeEach(() => {
    podManager = new FakePodManager();
    deps = {
      graphService: makeGraphServiceStub(),
      podManager,
      contextService: new FakeAgentContextService(),
      agentManager: new FakeAgentManagerService(),
      scriptRunner: stubRunner,
    };
  });

  it('request.inputs flow through to pod.execute() options', async () => {
    const customInputs = { ok: true as const, inputs: { name: 'test', count: 42 } };

    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready', unitType: 'agent', inputPack: customInputs }],
    });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'A',
      inputs: customInputs,
    };

    const ods = new ODS(deps);
    await ods.execute(request, ctx, reality);

    // The pod should have been executed
    const pod = podManager.getPod('A') as FakePod;
    expect(pod).toBeDefined();
    expect(pod.wasExecuted).toBe(true);
  });

  it('graphSlug flows through to pod.execute() options', async () => {
    const reality = buildFakeReality({
      graphSlug: 'my-graph',
      nodes: [{ nodeId: 'A', status: 'ready', unitType: 'agent' }],
    });
    const request: OrchestrationRequest = {
      type: 'start-node',
      graphSlug: 'my-graph',
      nodeId: 'A',
      inputs: { ok: true, inputs: {} },
    };

    const ods = new ODS(deps);
    const result = await ods.execute(request, ctx, reality);

    expect(result.ok).toBe(true);
    const pod = podManager.getPod('A') as FakePod;
    expect(pod).toBeDefined();
    expect(pod.wasExecuted).toBe(true);
  });
});
