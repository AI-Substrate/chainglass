/**
 * Real Agent Orchestration Wiring Tests
 *
 * Plan 035, Phase 4: Proves the ODS → AgentManagerService → IAgentInstance
 * → real adapter chain works end-to-end with both Claude Code and Copilot SDK.
 *
 * These tests use `describe.skip` (hardcoded) — they never run automatically.
 * To run manually, remove `.skip` and ensure the agent CLI/SDK is authenticated.
 *
 * Structural assertions only — no content assertions on LLM output.
 *
 * Run manually:
 *   npx vitest run test/integration/orchestration-wiring-real.test.ts --no-file-parallelism
 *
 * Acceptance Criteria: AC-50 through AC-55
 *
 * @see Workshop 01: E2E Wiring with Real Agents
 * @see Workshop 02: Multi-Turn Session Durability Test
 */

import type { AgentEvent } from '@chainglass/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  AgentContextService,
  FakeScriptRunner,
  ODS,
  ONBAS,
  OrchestrationService,
  PodManager,
} from '@chainglass/positional-graph/features/030-orchestration';

import {
  EventHandlerService,
  FakeNodeEventRegistry,
  NodeEventService,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';

import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { NodeFileSystemAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import {
  createTestServiceStack,
} from '../helpers/positional-graph-e2e-helpers.js';

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

/** Poll pod.sessionId until truthy or timeout. */
async function waitForPodSession(
  pod: { readonly sessionId: string | undefined },
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (!pod.sessionId && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!pod.sessionId) {
    throw new Error(`Pod did not acquire sessionId within ${timeoutMs}ms`);
  }
}

/**
 * Build a real orchestration stack with a real AgentManagerService
 * and real adapter (Claude Code or Copilot SDK).
 *
 * Uses dynamic imports per Plan 034 pattern — avoids loading adapter
 * classes in unit test context.
 */
async function createRealOrchestrationStack(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  adapterType: 'claude-code' | 'copilot'
) {
  const shared = await import('@chainglass/shared');
  const { AgentManagerService, UnixProcessManager, FakeLogger } = shared;

  let adapterFactory: (type: string) => InstanceType<typeof shared.ClaudeCodeAdapter>;
  if (adapterType === 'claude-code') {
    const { ClaudeCodeAdapter } = shared;
    const logger = new FakeLogger();
    const processManager = new UnixProcessManager(logger);
    adapterFactory = () => new ClaudeCodeAdapter(processManager, { logger });
  } else {
    // Copilot requires separate dynamic import for ESM-only modules
    const copilotModule = await import('@chainglass/shared/adapters');
    const { CopilotClient } = await import('@github/copilot-sdk');
    const { SdkCopilotAdapter } = copilotModule;
    const client = new CopilotClient();
    adapterFactory = () => new SdkCopilotAdapter(client) as never;
  }

  const agentManager = new AgentManagerService(adapterFactory);

  // Event system
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const handlerRegistry = createEventHandlerRegistry(service, ctx);
  const nes = new NodeEventService(
    { loadState: async (slug) => service.loadGraphState(ctx, slug), persistState: async (slug, state) => service.persistGraphState(ctx, slug, state) },
    handlerRegistry
  );
  const eventHandlerService = new EventHandlerService(nes);

  // Orchestration components
  const nodeFs = new NodeFileSystemAdapter();
  const onbas = new ONBAS();
  const contextService = new AgentContextService();
  const podManager = new PodManager(nodeFs);
  const scriptRunner = new FakeScriptRunner();
  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentManager,
    scriptRunner,
  });

  const orchestrationService = new OrchestrationService({
    graphService: service,
    onbas,
    ods,
    eventHandlerService,
  });

  return { orchestrationService, agentManager, podManager, eventHandlerService };
}

// ════════════════════════════════════════════════════════════════════
// CLAUDE CODE WIRING TESTS (AC-51, AC-52, AC-53)
// ════════════════════════════════════════════════════════════════════

describe.skip('Claude Code orchestration wiring', { timeout: 180_000 }, () => {
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let stack: Awaited<ReturnType<typeof createRealOrchestrationStack>>;

  beforeAll(async () => {
    const testStack = await createTestServiceStack('wiring-claude');
    service = testStack.service;
    ctx = testStack.ctx;
    stack = await createRealOrchestrationStack(service, ctx, 'claude-code');
  });

  it('single-node wiring: ODS creates pod, real agent spawns, sessionId acquired (AC-51)', async () => {
    const graphSlug = 'claude-single-node';
    await service.create(ctx, graphSlug);
    const lineId = (await service.getStatus(ctx, graphSlug)).lines[0].lineId;
    const addResult = await service.addNode(ctx, graphSlug, lineId, 'spec-builder');
    const nodeId = addResult.nodeId!;

    // Run orchestration — ONBAS dispatches start-node, ODS fires pod
    await stack.orchestrationService.run(ctx, graphSlug);

    // Get the pod (ODS created it)
    const pod = stack.podManager.getPod(nodeId);
    expect(pod).toBeDefined();
    expect(pod!.unitType).toBe('agent');

    // Wait for real agent to complete (fire-and-forget, poll)
    await waitForPodSession(pod!, 120_000);

    // Structural assertions
    expect(pod!.sessionId).toBeTruthy();
    const agents = stack.agentManager.getAgents();
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents[0].status).toBe('stopped');
  });

  it('session inheritance: node-b inherits node-a session, fork produces different sessionId (AC-52)', async () => {
    const graphSlug = 'claude-inheritance';
    await service.create(ctx, graphSlug);
    const lineId = (await service.getStatus(ctx, graphSlug)).lines[0].lineId;
    await service.addNode(ctx, graphSlug, lineId, 'spec-builder');
    const addB = await service.addNode(ctx, graphSlug, lineId, 'spec-reviewer');
    const nodeBId = addB.nodeId!;

    // Run first iteration — starts node-a
    await stack.orchestrationService.run(ctx, graphSlug);

    // Wait for node-a to get sessionId
    const status = await service.getStatus(ctx, graphSlug);
    const nodeAId = status.lines[0].nodes[0].nodeId;
    const podA = stack.podManager.getPod(nodeAId);
    await waitForPodSession(podA!, 120_000);
    const sessionA = podA!.sessionId!;

    // Manually complete node-a (agent doesn't know WF protocol yet)
    await service.completeNode(ctx, graphSlug, nodeAId, {});

    // Run again — node-b should inherit node-a's session
    await stack.orchestrationService.run(ctx, graphSlug);

    const podB = stack.podManager.getPod(nodeBId);
    await waitForPodSession(podB!, 120_000);

    // Session inheritance: fork produces different sessionId
    expect(podB!.sessionId).toBeTruthy();
    expect(podB!.sessionId).not.toBe(sessionA);
  });

  it('event pass-through: real adapter events reach instance handlers (AC-53)', async () => {
    const events: AgentEvent[] = [];
    const graphSlug = 'claude-events';
    await service.create(ctx, graphSlug);
    const lineId = (await service.getStatus(ctx, graphSlug)).lines[0].lineId;
    const addResult = await service.addNode(ctx, graphSlug, lineId, 'spec-builder');
    const nodeId = addResult.nodeId!;

    // Attach event handler to the instance AFTER ODS creates it
    await stack.orchestrationService.run(ctx, graphSlug);

    const agents = stack.agentManager.getAgents();
    expect(agents.length).toBeGreaterThanOrEqual(1);
    agents[0].addEventHandler((e: AgentEvent) => events.push(e));

    // Wait for completion
    const pod = stack.podManager.getPod(nodeId);
    await waitForPodSession(pod!, 120_000);

    // Events should have flowed through
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'text_delta' || e.type === 'message')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// COPILOT SDK WIRING TESTS (AC-51, AC-52, AC-53)
// ════════════════════════════════════════════════════════════════════

describe.skip('Copilot SDK orchestration wiring', { timeout: 180_000 }, () => {
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let stack: Awaited<ReturnType<typeof createRealOrchestrationStack>>;

  beforeAll(async () => {
    const testStack = await createTestServiceStack('wiring-copilot');
    service = testStack.service;
    ctx = testStack.ctx;
    stack = await createRealOrchestrationStack(service, ctx, 'copilot');
  });

  it('single-node wiring: ODS creates pod, real Copilot runs, sessionId acquired (AC-51)', async () => {
    const graphSlug = 'copilot-single-node';
    await service.create(ctx, graphSlug);
    const lineId = (await service.getStatus(ctx, graphSlug)).lines[0].lineId;
    const addResult = await service.addNode(ctx, graphSlug, lineId, 'spec-builder');
    const nodeId = addResult.nodeId!;

    await stack.orchestrationService.run(ctx, graphSlug);

    const pod = stack.podManager.getPod(nodeId);
    expect(pod).toBeDefined();
    await waitForPodSession(pod!, 120_000);
    expect(pod!.sessionId).toBeTruthy();
  });

  it('session inheritance: node-b inherits node-a session (AC-52)', async () => {
    const graphSlug = 'copilot-inheritance';
    await service.create(ctx, graphSlug);
    const lineId = (await service.getStatus(ctx, graphSlug)).lines[0].lineId;
    await service.addNode(ctx, graphSlug, lineId, 'spec-builder');
    const addB = await service.addNode(ctx, graphSlug, lineId, 'spec-reviewer');
    const nodeBId = addB.nodeId!;

    await stack.orchestrationService.run(ctx, graphSlug);

    const status = await service.getStatus(ctx, graphSlug);
    const nodeAId = status.lines[0].nodes[0].nodeId;
    const podA = stack.podManager.getPod(nodeAId);
    await waitForPodSession(podA!, 120_000);
    const sessionA = podA!.sessionId!;

    await service.completeNode(ctx, graphSlug, nodeAId, {});
    await stack.orchestrationService.run(ctx, graphSlug);

    const podB = stack.podManager.getPod(nodeBId);
    await waitForPodSession(podB!, 120_000);
    expect(podB!.sessionId).toBeTruthy();
    expect(podB!.sessionId).not.toBe(sessionA);
  });

  it('event pass-through: real Copilot events reach instance handlers (AC-53)', async () => {
    const events: AgentEvent[] = [];
    const graphSlug = 'copilot-events';
    await service.create(ctx, graphSlug);
    const lineId = (await service.getStatus(ctx, graphSlug)).lines[0].lineId;
    const addResult = await service.addNode(ctx, graphSlug, lineId, 'spec-builder');
    const nodeId = addResult.nodeId!;

    await stack.orchestrationService.run(ctx, graphSlug);

    const agents = stack.agentManager.getAgents();
    expect(agents.length).toBeGreaterThanOrEqual(1);
    agents[0].addEventHandler((e: AgentEvent) => events.push(e));

    const pod = stack.podManager.getPod(nodeId);
    await waitForPodSession(pod!, 120_000);

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'text_delta' || e.type === 'message')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// CROSS-ADAPTER PARITY (AC-54)
// ════════════════════════════════════════════════════════════════════

describe.skip('Cross-adapter parity', { timeout: 300_000 }, () => {
  it('both adapters produce sessionId and emit text events through same wiring chain (AC-54)', async () => {
    const testStack = await createTestServiceStack('wiring-parity');
    const { service, ctx } = testStack;

    const results: Array<{ type: string; sessionId: string | undefined; hasEvents: boolean }> = [];

    for (const adapterType of ['claude-code', 'copilot'] as const) {
      const stack = await createRealOrchestrationStack(service, ctx, adapterType);
      const graphSlug = `parity-${adapterType}`;
      await service.create(ctx, graphSlug);
      const lineId = (await service.getStatus(ctx, graphSlug)).lines[0].lineId;
      const addResult = await service.addNode(ctx, graphSlug, lineId, 'spec-builder');
      const nodeId = addResult.nodeId!;

      const events: AgentEvent[] = [];

      await stack.orchestrationService.run(ctx, graphSlug);

      const agents = stack.agentManager.getAgents();
      if (agents.length > 0) {
        agents[0].addEventHandler((e: AgentEvent) => events.push(e));
      }

      const pod = stack.podManager.getPod(nodeId);
      await waitForPodSession(pod!, 120_000);

      results.push({
        type: adapterType,
        sessionId: pod!.sessionId,
        hasEvents: events.some((e) => e.type === 'text_delta' || e.type === 'message'),
      });
    }

    // Both produce sessionId
    expect(results[0].sessionId).toBeTruthy();
    expect(results[1].sessionId).toBeTruthy();

    // Both emit text events
    expect(results[0].hasEvents).toBe(true);
    expect(results[1].hasEvents).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// MULTI-TURN SESSION DURABILITY — POEM → COMPACT → RECALL (Workshop 02)
// Claude only (Copilot has no /compact command)
// ════════════════════════════════════════════════════════════════════

describe.skip('Session durability: poem → compact → recall', { timeout: 180_000 }, () => {
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let stack: Awaited<ReturnType<typeof createRealOrchestrationStack>>;

  beforeAll(async () => {
    const testStack = await createTestServiceStack('wiring-durability');
    service = testStack.service;
    ctx = testStack.ctx;
    stack = await createRealOrchestrationStack(service, ctx, 'claude-code');
  });

  it('session survives compact: full-stack setup → poem → compact → recall', async () => {
    // ── SETUP: Full-stack ODS → pod → real agent ──
    const graphSlug = 'durability-test';
    await service.create(ctx, graphSlug);
    const lineId = (await service.getStatus(ctx, graphSlug)).lines[0].lineId;
    const addResult = await service.addNode(ctx, graphSlug, lineId, 'spec-builder');
    const nodeId = addResult.nodeId!;

    await stack.orchestrationService.run(ctx, graphSlug);

    const pod = stack.podManager.getPod(nodeId);
    expect(pod).toBeDefined();

    // Wait for pod to complete with real agent (starter prompt)
    await waitForPodSession(pod!, 120_000);
    expect(pod!.sessionId).toBeTruthy();

    // Verify manager tracks instances
    expect(stack.agentManager.getAgents().length).toBeGreaterThanOrEqual(1);

    // ── Get THIS pod's instance via session lookup ──
    const sessionId = stack.podManager.getSessionId(nodeId)!;
    const instance = stack.agentManager.getWithSessionId(sessionId, {
      name: 'spec-builder',
      type: 'claude-code',
      workspace: ctx.worktreePath,
    });

    // Same-instance guarantee (Plan 034)
    expect(instance.name).toBe('spec-builder');
    expect(instance.sessionId).toBe(sessionId);

    // ── TURN 1: Write a poem (custom prompt via instance) ──
    const turn1Events: AgentEvent[] = [];
    const turn1Result = await instance.run({
      prompt:
        'Write a 4-line poem about a random subject. State the subject clearly in the first line.',
      cwd: ctx.worktreePath,
      onEvent: (e: AgentEvent) => turn1Events.push(e),
    });

    expect(turn1Result.status).toBe('completed');
    expect(turn1Events.some((e) => e.type === 'text_delta')).toBe(true);

    // ── TURN 2: Compact ──
    const compactResult = await instance.compact();
    expect(compactResult.status).toBe('completed');
    expect(compactResult.sessionId).toBe(sessionId); // same session

    // ── TURN 3: Recall the subject ──
    const turn3Events: AgentEvent[] = [];
    const turn3Result = await instance.run({
      prompt:
        'What was the subject of the poem you wrote? Reply with just the subject, one word.',
      cwd: ctx.worktreePath,
      onEvent: (e: AgentEvent) => turn3Events.push(e),
    });

    expect(turn3Result.status).toBe('completed');
    expect(turn3Result.sessionId).toBe(sessionId); // still same session
    expect(turn3Result.output.length).toBeGreaterThan(0);
    expect(turn3Events.some((e) => e.type === 'text_delta')).toBe(true);
  });
});
