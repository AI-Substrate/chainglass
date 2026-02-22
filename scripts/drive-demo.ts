/**
 * drive() Demo — Real Graph Progression
 *
 * Standalone script showing the orchestration system in action.
 * Creates a simple-serial graph, drives it to completion with real scripts,
 * and prints visual progression at each step.
 *
 * Run: npx tsx scripts/drive-demo.ts
 * Or:  just drive-demo
 */

import {
  buildDiskWorkUnitService,
  createTestOrchestrationStack,
  withTestGraph,
} from '../dev/test-graphs/shared/graph-test-runner.js';
import { completeUserInputNode, ensureGraphsDir } from '../dev/test-graphs/shared/helpers.js';
import type { DriveEvent } from '@chainglass/positional-graph/features/030-orchestration';

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════');
  console.log('  drive() Demo — Real Graph Progression');
  console.log('══════════════════════════════════════════════════');
  console.log('');

  await withTestGraph('simple-serial', async (tgc) => {
    const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
    const { orchestrationService } = createTestOrchestrationStack(
      tgc.service, tgc.ctx, workUnitService
    );

    // Create graph
    console.log('  Creating graph: setup (user-input) -> worker (code)');
    const { lineId } = await tgc.service.create(tgc.ctx, 'simple-serial');
    await ensureGraphsDir(tgc.workspacePath, 'simple-serial');
    const setup = await tgc.service.addNode(tgc.ctx, 'simple-serial', lineId, 'setup');
    const worker = await tgc.service.addNode(tgc.ctx, 'simple-serial', lineId, 'worker');
    await tgc.service.setInput(tgc.ctx, 'simple-serial', worker.nodeId, 'task', {
      from_node: setup.nodeId, from_output: 'instructions',
    });
    console.log('  Graph created\n');

    // Complete user-input
    console.log('  Completing user-input node (setup)...');
    await completeUserInputNode(tgc.service, tgc.ctx, 'simple-serial', setup.nodeId, {
      instructions: 'Build a calculator app',
    });
    console.log('  User input provided\n');

    // Drive with visual output
    console.log('  Driving graph...\n');
    const handle = await orchestrationService.get(tgc.ctx, 'simple-serial');
    const result = await handle.drive({
      maxIterations: 50,
      actionDelayMs: 50,
      idleDelayMs: 1500,
      onEvent: (event: DriveEvent) => {
        switch (event.type) {
          case 'status':
            console.log(event.message);
            console.log('');
            break;
          case 'iteration':
            console.log(`  -> ${event.message}`);
            break;
          case 'idle':
            console.log(`  .. ${event.message}`);
            break;
          case 'error':
            console.error(`  !! ${event.message}`);
            break;
        }
      },
    });

    console.log('');
    console.log('══════════════════════════════════════════════════');
    console.log(`  Result: ${result.exitReason}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Total Actions: ${result.totalActions}`);
    console.log('══════════════════════════════════════════════════');
    console.log('');
  });
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
