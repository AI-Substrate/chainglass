/**
 * Test Doc
 * Why: Proves real agents can drive graph orchestration end-to-end — Plan 038 (Spec C).
 * Contract: Real Copilot/Claude Code agents accept assignments, read inputs, save outputs,
 *   and complete nodes via CLI commands, driven by the orchestration engine.
 * Usage Notes: describe.skip tests require real agent CLI authenticated. Non-skipped fixture
 *   validation tests run in CI. Run manually: remove .skip, ensure agents authenticated,
 *   `pnpm test -- --run test/integration/real-agent-orchestration.test.ts`
 * Quality Contribution: Final proof that the orchestration system works with real LLM agents,
 *   not just simulation scripts. Validates session inheritance and parallel execution.
 * Worked Example: withTestGraph('real-agent-serial') → create graph → complete setup →
 *   drive with real agent → spec-writer completes → reviewer inherits session → graph complete.
 */

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertGraphComplete,
  assertNodeComplete,
  assertOutputExists,
} from '../../dev/test-graphs/shared/assertions.js';
import {
  buildDiskWorkUnitService,
  withTestGraph,
} from '../../dev/test-graphs/shared/graph-test-runner.js';
import { completeUserInputNode, ensureGraphsDir } from '../../dev/test-graphs/shared/helpers.js';

// Orchestration stack imports (inline wiring for real agents — DYK deviation from ADR-0004)
import {
  AgentContextService,
  ODS,
  ONBAS,
  OrchestrationService,
  PodManager,
  ScriptRunner,
} from '@chainglass/positional-graph/features/030-orchestration';
import type { DriveEvent } from '@chainglass/positional-graph/features/030-orchestration';
import {
  EventHandlerService,
  FakeNodeEventRegistry,
  NodeEventService,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { NodeFileSystemAdapter } from '@chainglass/shared';
import type { IAgentManagerService } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

/** Drive options tuned for real agents (10-60s per node). */
const REAL_AGENT_DRIVE_OPTIONS = {
  maxIterations: 50,
  actionDelayMs: 1000,
  idleDelayMs: 5000,
  onEvent: (event: DriveEvent) => {
    console.log(`  [drive] ${event.type}: ${event.message ?? ''}`);
  },
};

/** Build orchestration stack with a provided agent manager (real or fake). */
function buildOrchestrationStack(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  agentManager: IAgentManagerService,
  workUnitService: ReturnType<typeof buildDiskWorkUnitService>
) {
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const handlerRegistry = createEventHandlerRegistry();
  const nes = new NodeEventService(
    {
      registry: eventRegistry,
      loadState: async (slug: string) => service.loadGraphState(ctx, slug),
      persistState: async (slug: string, state: unknown) =>
        service.persistGraphState(ctx, slug, state),
    },
    handlerRegistry
  );
  const eventHandlerService = new EventHandlerService(nes);
  const nodeFs = new NodeFileSystemAdapter();
  const podManager = new PodManager(nodeFs);
  const contextService = new AgentContextService();
  const scriptRunner = new ScriptRunner();

  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentManager,
    scriptRunner,
    workUnitService,
  });

  const orchestrationService = new OrchestrationService({
    graphService: service,
    onbas: new ONBAS(),
    ods,
    eventHandlerService,
    podManager,
  });

  return { orchestrationService, podManager };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Non-skipped: Fixture validation (DYK#1 — catches broken agent units in CI)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Real agent fixture validation', () => {
  it('real-agent-serial units are valid on disk (agent type with prompt_template)', async () => {
    await withTestGraph('real-agent-serial', async (tgc) => {
      const { lineId } = await tgc.service.create(tgc.ctx, 'validation-serial');
      const line1 = await tgc.service.addLine(tgc.ctx, 'validation-serial');

      const getSpec = await tgc.service.addNode(tgc.ctx, 'validation-serial', lineId, 'get-spec');
      expect(getSpec.errors).toEqual([]);

      const specWriter = await tgc.service.addNode(
        tgc.ctx,
        'validation-serial',
        line1.lineId as string,
        'spec-writer'
      );
      expect(specWriter.errors).toEqual([]);

      const reviewer = await tgc.service.addNode(
        tgc.ctx,
        'validation-serial',
        line1.lineId as string,
        'reviewer'
      );
      expect(reviewer.errors).toEqual([]);
    });
  }, 30_000);

  it('real-agent-parallel units are valid on disk (agent type with prompt_template)', async () => {
    await withTestGraph('real-agent-parallel', async (tgc) => {
      const { lineId } = await tgc.service.create(tgc.ctx, 'validation-parallel');
      const line1 = await tgc.service.addLine(tgc.ctx, 'validation-parallel');

      const getSpec = await tgc.service.addNode(tgc.ctx, 'validation-parallel', lineId, 'get-spec');
      expect(getSpec.errors).toEqual([]);

      const workerA = await tgc.service.addNode(
        tgc.ctx,
        'validation-parallel',
        line1.lineId as string,
        'worker-a',
        { orchestratorSettings: { execution: 'parallel' } }
      );
      expect(workerA.errors).toEqual([]);

      const workerB = await tgc.service.addNode(
        tgc.ctx,
        'validation-parallel',
        line1.lineId as string,
        'worker-b',
        { orchestratorSettings: { execution: 'parallel' } }
      );
      expect(workerB.errors).toEqual([]);
    });
  }, 30_000);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// describe.skip: Real agent tests (AC-38 — manual only, not CI)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MANUAL: To run these tests:
// 1. Remove .skip from the describe below
// 2. Ensure `@github/copilot --version` works (Copilot authenticated)
// 3. Ensure `claude --version` works (Claude Code authenticated)
// 4. Run: pnpm test -- --run test/integration/real-agent-orchestration.test.ts
// 5. Put .skip back after running

describe.skip('Real Agent Orchestration', () => {
  describe('Copilot — serial pipeline with session inheritance (AC-34, AC-35, AC-36)', () => {
    it('drives get-spec → spec-writer → reviewer to completion', async () => {
      // Dynamic import (DYK#5: avoid loading SDK at collection time)
      const { AgentManagerService } = await import('@chainglass/shared/features/034-agentic-cli');
      const { SdkCopilotAdapter } = await import('@chainglass/shared');
      const { CopilotClient } = await import('@github/copilot-sdk');

      const client = new CopilotClient();
      const agentManager = new AgentManagerService(
        () => new SdkCopilotAdapter(client)
      ) as unknown as IAgentManagerService;

      await withTestGraph('real-agent-serial', async (tgc) => {
        const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
        const { orchestrationService, podManager } = buildOrchestrationStack(
          tgc.service,
          tgc.ctx,
          agentManager,
          workUnitService
        );

        const SLUG = 'copilot-serial';
        const { lineId: line0 } = await tgc.service.create(tgc.ctx, SLUG);
        await ensureGraphsDir(tgc.workspacePath, SLUG);
        // Default agentType is 'copilot' — no settings change needed

        const line1 = await tgc.service.addLine(tgc.ctx, SLUG);
        const getSpec = await tgc.service.addNode(tgc.ctx, SLUG, line0, 'get-spec');
        const specWriter = await tgc.service.addNode(
          tgc.ctx,
          SLUG,
          line1.lineId as string,
          'spec-writer'
        );
        const reviewer = await tgc.service.addNode(
          tgc.ctx,
          SLUG,
          line1.lineId as string,
          'reviewer'
        );

        // Wire inputs
        await tgc.service.setInput(tgc.ctx, SLUG, specWriter.nodeId as string, 'spec', {
          from_node: getSpec.nodeId as string,
          from_output: 'spec',
        });
        await tgc.service.setInput(tgc.ctx, SLUG, reviewer.nodeId as string, 'summary', {
          from_node: specWriter.nodeId as string,
          from_output: 'summary',
        });

        // Complete user-input
        await completeUserInputNode(tgc.service, tgc.ctx, SLUG, getSpec.nodeId as string, {
          spec: 'Write a function that adds two numbers',
        });

        // Drive with real Copilot agents
        const handle = await orchestrationService.get(tgc.ctx, SLUG);
        const result = await handle.drive(REAL_AGENT_DRIVE_OPTIONS);
        console.log(`  [result] exitReason=${result.exitReason}, iterations=${result.iterations}`);

        // Structural assertions only (AC-39)
        expect(result.exitReason).toBe('complete');
        await assertGraphComplete(tgc.service, tgc.ctx, SLUG);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, specWriter.nodeId as string);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, reviewer.nodeId as string);
        await assertOutputExists(
          tgc.service,
          tgc.ctx,
          SLUG,
          specWriter.nodeId as string,
          'summary'
        );
        await assertOutputExists(tgc.service, tgc.ctx, SLUG, reviewer.nodeId as string, 'decision');

        // Session inheritance: both have sessions (AC-36)
        const writerSession = podManager.getSessionId(specWriter.nodeId as string);
        const reviewerSession = podManager.getSessionId(reviewer.nodeId as string);
        console.log(`  [sessions] writer=${writerSession}, reviewer=${reviewerSession}`);
        expect(writerSession).toBeTruthy();
        expect(reviewerSession).toBeTruthy();
      });
    }, 180_000);
  });

  describe('Copilot — parallel execution with independent sessions (AC-37)', () => {
    it('drives worker-a + worker-b in parallel', async () => {
      const { AgentManagerService } = await import('@chainglass/shared/features/034-agentic-cli');
      const { SdkCopilotAdapter } = await import('@chainglass/shared');
      const { CopilotClient } = await import('@github/copilot-sdk');

      const client = new CopilotClient();
      const agentManager = new AgentManagerService(
        () => new SdkCopilotAdapter(client)
      ) as unknown as IAgentManagerService;

      await withTestGraph('real-agent-parallel', async (tgc) => {
        const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
        const { orchestrationService, podManager } = buildOrchestrationStack(
          tgc.service,
          tgc.ctx,
          agentManager,
          workUnitService
        );

        const SLUG = 'copilot-parallel';
        const { lineId: line0 } = await tgc.service.create(tgc.ctx, SLUG);
        await ensureGraphsDir(tgc.workspacePath, SLUG);

        const line1 = await tgc.service.addLine(tgc.ctx, SLUG);
        const getSpec = await tgc.service.addNode(tgc.ctx, SLUG, line0, 'get-spec');
        const workerA = await tgc.service.addNode(
          tgc.ctx,
          SLUG,
          line1.lineId as string,
          'worker-a',
          {
            orchestratorSettings: { execution: 'parallel' },
          }
        );
        const workerB = await tgc.service.addNode(
          tgc.ctx,
          SLUG,
          line1.lineId as string,
          'worker-b',
          {
            orchestratorSettings: { execution: 'parallel' },
          }
        );

        await tgc.service.setInput(tgc.ctx, SLUG, workerA.nodeId as string, 'spec', {
          from_node: getSpec.nodeId as string,
          from_output: 'spec',
        });
        await tgc.service.setInput(tgc.ctx, SLUG, workerB.nodeId as string, 'spec', {
          from_node: getSpec.nodeId as string,
          from_output: 'spec',
        });

        await completeUserInputNode(tgc.service, tgc.ctx, SLUG, getSpec.nodeId as string, {
          spec: 'Describe the color blue',
        });

        const handle = await orchestrationService.get(tgc.ctx, SLUG);
        const result = await handle.drive(REAL_AGENT_DRIVE_OPTIONS);
        console.log(`  [result] exitReason=${result.exitReason}, iterations=${result.iterations}`);

        expect(result.exitReason).toBe('complete');
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, workerA.nodeId as string);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, workerB.nodeId as string);

        // Parallel = independent sessions (AC-37)
        const sessionA = podManager.getSessionId(workerA.nodeId as string);
        const sessionB = podManager.getSessionId(workerB.nodeId as string);
        console.log(`  [sessions] A=${sessionA}, B=${sessionB}`);
        expect(sessionA).toBeTruthy();
        expect(sessionB).toBeTruthy();
        expect(sessionA).not.toBe(sessionB);
      });
    }, 180_000);
  });

  describe('Claude Code — serial pipeline (AC-34, AC-35)', () => {
    it('drives get-spec → spec-writer → reviewer with claude-code', async () => {
      const { AgentManagerService } = await import('@chainglass/shared/features/034-agentic-cli');
      const { ClaudeCodeAdapter, UnixProcessManager, FakeLogger } = await import(
        '@chainglass/shared'
      );

      const logger = new FakeLogger();
      const processManager = new UnixProcessManager(logger);
      const agentManager = new AgentManagerService(
        () => new ClaudeCodeAdapter(processManager, { logger })
      ) as unknown as IAgentManagerService;

      await withTestGraph('real-agent-serial', async (tgc) => {
        const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
        const { orchestrationService, podManager } = buildOrchestrationStack(
          tgc.service,
          tgc.ctx,
          agentManager,
          workUnitService
        );

        const SLUG = 'claude-serial';
        const { lineId: line0 } = await tgc.service.create(tgc.ctx, SLUG);
        await ensureGraphsDir(tgc.workspacePath, SLUG);

        // Set agentType to 'claude-code' (not default)
        await tgc.service.updateGraphOrchestratorSettings(tgc.ctx, SLUG, {
          agentType: 'claude-code',
        });

        const line1 = await tgc.service.addLine(tgc.ctx, SLUG);
        const getSpec = await tgc.service.addNode(tgc.ctx, SLUG, line0, 'get-spec');
        const specWriter = await tgc.service.addNode(
          tgc.ctx,
          SLUG,
          line1.lineId as string,
          'spec-writer'
        );
        const reviewer = await tgc.service.addNode(
          tgc.ctx,
          SLUG,
          line1.lineId as string,
          'reviewer'
        );

        await tgc.service.setInput(tgc.ctx, SLUG, specWriter.nodeId as string, 'spec', {
          from_node: getSpec.nodeId as string,
          from_output: 'spec',
        });
        await tgc.service.setInput(tgc.ctx, SLUG, reviewer.nodeId as string, 'summary', {
          from_node: specWriter.nodeId as string,
          from_output: 'summary',
        });

        await completeUserInputNode(tgc.service, tgc.ctx, SLUG, getSpec.nodeId as string, {
          spec: 'Write a function that multiplies two numbers',
        });

        const handle = await orchestrationService.get(tgc.ctx, SLUG);
        const result = await handle.drive(REAL_AGENT_DRIVE_OPTIONS);
        console.log(`  [result] exitReason=${result.exitReason}, iterations=${result.iterations}`);

        expect(result.exitReason).toBe('complete');
        await assertGraphComplete(tgc.service, tgc.ctx, SLUG);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, specWriter.nodeId as string);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, reviewer.nodeId as string);

        const writerSession = podManager.getSessionId(specWriter.nodeId as string);
        const reviewerSession = podManager.getSessionId(reviewer.nodeId as string);
        console.log(`  [sessions] writer=${writerSession}, reviewer=${reviewerSession}`);
        expect(writerSession).toBeTruthy();
        expect(reviewerSession).toBeTruthy();
      });
    }, 180_000);
  });
});
