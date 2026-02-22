/**
 * Test Doc
 * Why: Proves the full orchestration pipeline works end-to-end — Plan 037 Phase 3.
 * Contract: drive() executes real scripts via ScriptRunner that call CLI commands to progress graphs.
 * Usage Notes: Requires `cg` CLI built and on PATH. Tests use real filesystem, real subprocess execution.
 *   Run: `pnpm test -- --run test/integration/orchestration-drive.test.ts`
 * Quality Contribution: Validates that orchestration, CodePod, ScriptRunner, and CLI all work together.
 * Worked Example: withTestGraph('simple-serial') → create graph → complete setup → drive() → graph complete.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DriveEvent } from '@chainglass/positional-graph/features/030-orchestration';
import { describe, expect, it } from 'vitest';
import {
  assertGraphComplete,
  assertNodeComplete,
  assertNodeFailed,
  assertNodeWaitingQuestion,
  assertOutputExists,
} from '../../dev/test-graphs/shared/assertions.js';
import {
  buildDiskWorkUnitService,
  createTestOrchestrationStack,
  withTestGraph,
} from '../../dev/test-graphs/shared/graph-test-runner.js';
import {
  answerNodeQuestion,
  clearErrorAndRestart,
  completeUserInputNode,
  ensureGraphsDir,
} from '../../dev/test-graphs/shared/helpers.js';

/** Resolve CLI path relative to repo root (portable across machines). */
const CLI_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../apps/cli/dist/cli.cjs'
);

const CLI_EXISTS = await fs
  .stat(CLI_PATH)
  .then(() => true)
  .catch(() => false);

/** Shared drive options tuned for integration tests (Workshop 08). */
const TEST_DRIVE_OPTIONS = {
  maxIterations: 100,
  actionDelayMs: 50,
  idleDelayMs: 1500,
  onEvent: (event: DriveEvent) => {
    if (event.type !== 'status') {
      console.log(`  [drive] ${event.type}: ${event.message ?? ''}`);
    }
  },
};

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';

describe.skipIf(!CLI_EXISTS || !RUN_INTEGRATION)('Orchestration Drive Integration Tests', () => {
  describe('simple-serial', () => {
    it('drives a two-node graph to completion', async () => {
      await withTestGraph('simple-serial', async (tgc) => {
        // Build shared work unit service (Workshop 09)
        const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);

        // Build orchestration stack with real ScriptRunner
        const { orchestrationService } = createTestOrchestrationStack(
          tgc.service,
          tgc.ctx,
          workUnitService
        );

        // Create graph with one line
        const { lineId } = await tgc.service.create(tgc.ctx, 'simple-serial');
        expect(lineId).toBeTruthy();
        await ensureGraphsDir(tgc.workspacePath, 'simple-serial');

        // Add nodes: setup (user-input) and worker (code) on same line
        const setup = await tgc.service.addNode(tgc.ctx, 'simple-serial', lineId, 'setup');
        expect(setup.errors).toEqual([]);
        const worker = await tgc.service.addNode(tgc.ctx, 'simple-serial', lineId, 'worker');
        expect(worker.errors).toEqual([]);

        // Wire input: worker.task ← setup.instructions
        await tgc.service.setInput(tgc.ctx, 'simple-serial', worker.nodeId, 'task', {
          from_node: setup.nodeId,
          from_output: 'instructions',
        });

        // Complete user-input node programmatically
        await completeUserInputNode(tgc.service, tgc.ctx, 'simple-serial', setup.nodeId, {
          instructions: 'Build the widget',
        });

        // Drive the graph — ScriptRunner spawns simulate.sh → CLI commands progress state
        const handle = await orchestrationService.get(tgc.ctx, 'simple-serial');
        const result = await handle.drive(TEST_DRIVE_OPTIONS);

        console.log(
          `  [result] exitReason=${result.exitReason}, iterations=${result.iterations}, actions=${result.totalActions}`
        );

        // Assert complete
        expect(result.exitReason).toBe('complete');
        await assertGraphComplete(tgc.service, tgc.ctx, 'simple-serial');
        await assertNodeComplete(tgc.service, tgc.ctx, 'simple-serial', setup.nodeId);
        await assertNodeComplete(tgc.service, tgc.ctx, 'simple-serial', worker.nodeId);
      });
    }, 60_000);
  });

  describe('parallel-fan-out', () => {
    it('drives 3 parallel workers + combiner to completion', async () => {
      await withTestGraph('parallel-fan-out', async (tgc) => {
        const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
        const { orchestrationService } = createTestOrchestrationStack(
          tgc.service,
          tgc.ctx,
          workUnitService
        );

        const SLUG = 'parallel-fan-out';

        // Line 0: setup (user-input)
        const { lineId: line0 } = await tgc.service.create(tgc.ctx, SLUG);
        await ensureGraphsDir(tgc.workspacePath, SLUG);
        const setup = await tgc.service.addNode(tgc.ctx, SLUG, line0, 'setup');

        // Line 1: 3 parallel code workers
        const line1Result = await tgc.service.addLine(tgc.ctx, SLUG);
        const line1 = line1Result.lineId as string;
        const p1 = await tgc.service.addNode(tgc.ctx, SLUG, line1, 'parallel-1', {
          orchestratorSettings: { execution: 'parallel' },
        });
        const p2 = await tgc.service.addNode(tgc.ctx, SLUG, line1, 'parallel-2', {
          orchestratorSettings: { execution: 'parallel' },
        });
        const p3 = await tgc.service.addNode(tgc.ctx, SLUG, line1, 'parallel-3', {
          orchestratorSettings: { execution: 'parallel' },
        });

        // Line 2: combiner
        const line2Result = await tgc.service.addLine(tgc.ctx, SLUG);
        const line2 = line2Result.lineId as string;
        const combiner = await tgc.service.addNode(tgc.ctx, SLUG, line2, 'combiner');

        // Wire inputs: parallel workers get config from setup
        for (const p of [p1, p2, p3]) {
          await tgc.service.setInput(tgc.ctx, SLUG, p.nodeId as string, 'config', {
            from_node: setup.nodeId as string,
            from_output: 'config',
          });
        }
        // Combiner gets results from all 3
        await tgc.service.setInput(tgc.ctx, SLUG, combiner.nodeId as string, 'result_1', {
          from_node: p1.nodeId as string,
          from_output: 'result',
        });
        await tgc.service.setInput(tgc.ctx, SLUG, combiner.nodeId as string, 'result_2', {
          from_node: p2.nodeId as string,
          from_output: 'result',
        });
        await tgc.service.setInput(tgc.ctx, SLUG, combiner.nodeId as string, 'result_3', {
          from_node: p3.nodeId as string,
          from_output: 'result',
        });

        // Complete setup
        await completeUserInputNode(tgc.service, tgc.ctx, SLUG, setup.nodeId as string, {
          config: 'run all',
        });

        // Drive — all 3 parallel nodes + combiner should complete
        const handle = await orchestrationService.get(tgc.ctx, SLUG);
        const result = await handle.drive(TEST_DRIVE_OPTIONS);
        console.log(
          `  [result] exitReason=${result.exitReason}, iterations=${result.iterations}, actions=${result.totalActions}`
        );

        expect(result.exitReason).toBe('complete');
        await assertGraphComplete(tgc.service, tgc.ctx, SLUG);
        for (const nodeId of [
          setup.nodeId as string,
          p1.nodeId as string,
          p2.nodeId as string,
          p3.nodeId as string,
          combiner.nodeId as string,
        ]) {
          await assertNodeComplete(tgc.service, tgc.ctx, SLUG, nodeId);
        }
        await assertOutputExists(tgc.service, tgc.ctx, SLUG, combiner.nodeId as string, 'combined');
      });
    }, 60_000);
  });

  describe('error-recovery', () => {
    it('drives to failure when script reports error', async () => {
      await withTestGraph('error-recovery', async (tgc) => {
        const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
        const { orchestrationService } = createTestOrchestrationStack(
          tgc.service,
          tgc.ctx,
          workUnitService
        );

        const SLUG = 'error-recovery';

        // Same line: setup (user-input) → fail-node (code, serial)
        const { lineId } = await tgc.service.create(tgc.ctx, SLUG);
        await ensureGraphsDir(tgc.workspacePath, SLUG);
        const setup = await tgc.service.addNode(tgc.ctx, SLUG, lineId, 'setup');
        const failNode = await tgc.service.addNode(tgc.ctx, SLUG, lineId, 'fail-node');

        // Wire: fail-node.task ← setup.task
        await tgc.service.setInput(tgc.ctx, SLUG, failNode.nodeId as string, 'task', {
          from_node: setup.nodeId as string,
          from_output: 'task',
        });

        // Complete setup
        await completeUserInputNode(tgc.service, tgc.ctx, SLUG, setup.nodeId as string, {
          task: 'will fail',
        });

        // Drive — script calls cg wf node error, graph fails
        const handle = await orchestrationService.get(tgc.ctx, SLUG);
        const result = await handle.drive(TEST_DRIVE_OPTIONS);
        console.log(
          `  [result] exitReason=${result.exitReason}, iterations=${result.iterations}, actions=${result.totalActions}`
        );

        expect(result.exitReason).toBe('failed');
        const failStatus = await tgc.service.getNodeStatus(
          tgc.ctx,
          SLUG,
          failNode.nodeId as string
        );
        expect(failStatus.status).toBe('blocked-error');
        const graphStatus = await tgc.service.getStatus(tgc.ctx, SLUG);
        expect(graphStatus.status).toBe('failed');
      });
    }, 60_000);
  });

  describe('goat', () => {
    it('drives the full GOAT graph through all 8 scenarios', async () => {
      await withTestGraph('goat', async (tgc) => {
        const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
        const { orchestrationService } = createTestOrchestrationStack(
          tgc.service,
          tgc.ctx,
          workUnitService
        );

        const SLUG = 'goat';

        // ── Create 6-line graph ──────────────────────────────
        const { lineId: line0 } = await tgc.service.create(tgc.ctx, SLUG);
        await ensureGraphsDir(tgc.workspacePath, SLUG);

        // Line 1: serial workers (auto transition)
        const line1Result = await tgc.service.addLine(tgc.ctx, SLUG);
        const line1 = line1Result.lineId as string;

        // Line 2: parallel workers (MANUAL transition — gate between parallel and error)
        const line2Result = await tgc.service.addLine(tgc.ctx, SLUG, {
          orchestratorSettings: { transition: 'manual' },
        });
        const line2 = line2Result.lineId as string;

        // Line 3: error-node (auto)
        const line3Result = await tgc.service.addLine(tgc.ctx, SLUG);
        const line3 = line3Result.lineId as string;

        // Line 4: questioner (auto)
        const line4Result = await tgc.service.addLine(tgc.ctx, SLUG);
        const line4 = line4Result.lineId as string;

        // Line 5: final-combiner (auto)
        const line5Result = await tgc.service.addLine(tgc.ctx, SLUG);
        const line5 = line5Result.lineId as string;

        // ── Add 9 nodes ──────────────────────────────────────
        const userSetup = await tgc.service.addNode(tgc.ctx, SLUG, line0, 'user-setup');
        const serialA = await tgc.service.addNode(tgc.ctx, SLUG, line1, 'serial-a');
        const serialB = await tgc.service.addNode(tgc.ctx, SLUG, line1, 'serial-b');
        const p1 = await tgc.service.addNode(tgc.ctx, SLUG, line2, 'parallel-1', {
          orchestratorSettings: { execution: 'parallel' },
        });
        const p2 = await tgc.service.addNode(tgc.ctx, SLUG, line2, 'parallel-2', {
          orchestratorSettings: { execution: 'parallel' },
        });
        const p3 = await tgc.service.addNode(tgc.ctx, SLUG, line2, 'parallel-3', {
          orchestratorSettings: { execution: 'parallel' },
        });
        const errorNode = await tgc.service.addNode(tgc.ctx, SLUG, line3, 'error-node');
        const questioner = await tgc.service.addNode(tgc.ctx, SLUG, line4, 'questioner');
        const combiner = await tgc.service.addNode(tgc.ctx, SLUG, line5, 'final-combiner');

        // ── Wire inputs ──────────────────────────────────────
        // serial-a.task ← user-setup.instructions
        await tgc.service.setInput(tgc.ctx, SLUG, serialA.nodeId as string, 'task', {
          from_node: userSetup.nodeId as string,
          from_output: 'instructions',
        });
        // serial-b.previous_work ← serial-a.result
        await tgc.service.setInput(tgc.ctx, SLUG, serialB.nodeId as string, 'previous_work', {
          from_node: serialA.nodeId as string,
          from_output: 'result',
        });
        // parallel-1/2/3.config ← serial-b.result
        for (const p of [p1, p2, p3]) {
          await tgc.service.setInput(tgc.ctx, SLUG, p.nodeId as string, 'config', {
            from_node: serialB.nodeId as string,
            from_output: 'result',
          });
        }
        // error-node.data ← parallel-1.result
        await tgc.service.setInput(tgc.ctx, SLUG, errorNode.nodeId as string, 'data', {
          from_node: p1.nodeId as string,
          from_output: 'result',
        });
        // questioner.data ← error-node.result
        await tgc.service.setInput(tgc.ctx, SLUG, questioner.nodeId as string, 'data', {
          from_node: errorNode.nodeId as string,
          from_output: 'result',
        });
        // final-combiner.error_result ← error-node.result, question_result ← questioner.result
        await tgc.service.setInput(tgc.ctx, SLUG, combiner.nodeId as string, 'error_result', {
          from_node: errorNode.nodeId as string,
          from_output: 'result',
        });
        await tgc.service.setInput(tgc.ctx, SLUG, combiner.nodeId as string, 'question_result', {
          from_node: questioner.nodeId as string,
          from_output: 'result',
        });

        // ── Step 1: Complete user-setup ──────────────────────
        await completeUserInputNode(tgc.service, tgc.ctx, SLUG, userSetup.nodeId as string, {
          instructions: 'Build the GOAT pipeline',
        });

        // ── Step 2: Drive 1 — serial + parallel, idle at manual gate ──
        const handle = await orchestrationService.get(tgc.ctx, SLUG);
        const drive1 = await handle.drive({
          ...TEST_DRIVE_OPTIONS,
          maxIterations: 20,
        });
        console.log(
          `  [GOAT drive1] exitReason=${drive1.exitReason}, iterations=${drive1.iterations}, actions=${drive1.totalActions}`
        );

        expect(drive1.exitReason).toBe('max-iterations');
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, serialA.nodeId as string);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, serialB.nodeId as string);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, p1.nodeId as string);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, p2.nodeId as string);
        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, p3.nodeId as string);

        // ── Step 3: Trigger manual transition on line 2 ─────
        const triggerResult = await tgc.service.triggerTransition(tgc.ctx, SLUG, line2);
        expect(triggerResult.errors).toEqual([]);

        // ── Step 4: Drive 2 — error-node fails ──────────────
        const drive2 = await handle.drive({
          ...TEST_DRIVE_OPTIONS,
          maxIterations: 10,
        });
        console.log(
          `  [GOAT drive2] exitReason=${drive2.exitReason}, iterations=${drive2.iterations}, actions=${drive2.totalActions}`
        );

        expect(drive2.exitReason).toBe('failed');
        await assertNodeFailed(tgc.service, tgc.ctx, SLUG, errorNode.nodeId as string);

        // ── Step 5: Clear error + restart ────────────────────
        await clearErrorAndRestart(tgc.service, tgc.ctx, SLUG, errorNode.nodeId as string);

        // DYK#1 VALIDATION: Check node status after restart
        const errorStatusAfterRestart = await tgc.service.getNodeStatus(
          tgc.ctx,
          SLUG,
          errorNode.nodeId as string
        );
        console.log(`  [GOAT] error-node after restart: ${errorStatusAfterRestart.status}`);

        // ── Step 6: Drive 3 — error-node retries (succeeds), questioner asks question ──
        const drive3 = await handle.drive({
          ...TEST_DRIVE_OPTIONS,
          maxIterations: 15,
        });
        console.log(
          `  [GOAT drive3] exitReason=${drive3.exitReason}, iterations=${drive3.iterations}, actions=${drive3.totalActions}`
        );

        await assertNodeComplete(tgc.service, tgc.ctx, SLUG, errorNode.nodeId as string);
        await assertNodeWaitingQuestion(tgc.service, tgc.ctx, SLUG, questioner.nodeId as string);

        // ── Step 7: Answer question + restart ────────────────
        // Get the questionId from the node's events
        const events = await tgc.service.getNodeEvents(tgc.ctx, SLUG, questioner.nodeId as string, {
          types: ['question:ask'],
        });
        const questionId =
          (events.events?.[0] as { payload?: { questionId?: string } })?.payload?.questionId ??
          (events.events?.[0] as { event_id?: string })?.event_id;
        if (!questionId) {
          throw new Error('Failed to extract questionId from question:ask event');
        }
        console.log(`  [GOAT] questionId: ${questionId}`);

        await answerNodeQuestion(
          tgc.service,
          tgc.ctx,
          SLUG,
          questioner.nodeId as string,
          questionId,
          'blue'
        );

        // ── Step 8: Drive 4 — questioner completes, combiner completes, graph complete ──
        const drive4 = await handle.drive({
          ...TEST_DRIVE_OPTIONS,
          maxIterations: 15,
        });
        console.log(
          `  [GOAT drive4] exitReason=${drive4.exitReason}, iterations=${drive4.iterations}, actions=${drive4.totalActions}`
        );

        expect(drive4.exitReason).toBe('complete');

        // ── Step 9: Final Assertions ─────────────────────────
        await assertGraphComplete(tgc.service, tgc.ctx, SLUG);
        // All 9 nodes complete
        for (const nodeId of [
          userSetup.nodeId,
          serialA.nodeId,
          serialB.nodeId,
          p1.nodeId,
          p2.nodeId,
          p3.nodeId,
          errorNode.nodeId,
          questioner.nodeId,
          combiner.nodeId,
        ]) {
          await assertNodeComplete(tgc.service, tgc.ctx, SLUG, nodeId as string);
        }
        // Key outputs saved
        await assertOutputExists(tgc.service, tgc.ctx, SLUG, errorNode.nodeId as string, 'result');
        await assertOutputExists(tgc.service, tgc.ctx, SLUG, questioner.nodeId as string, 'result');
        await assertOutputExists(tgc.service, tgc.ctx, SLUG, combiner.nodeId as string, 'combined');
      });
    }, 120_000);
  });
});
