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
  assertOutputExists,
} from '../../dev/test-graphs/shared/assertions.js';
import {
  buildDiskWorkUnitService,
  createTestOrchestrationStack,
  withTestGraph,
} from '../../dev/test-graphs/shared/graph-test-runner.js';
import { completeUserInputNode, ensureGraphsDir } from '../../dev/test-graphs/shared/helpers.js';

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

describe.skipIf(!CLI_EXISTS)('Orchestration Drive Integration Tests', () => {
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
});
