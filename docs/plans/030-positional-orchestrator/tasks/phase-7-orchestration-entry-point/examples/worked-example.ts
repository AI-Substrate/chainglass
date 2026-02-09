/**
 * Worked Example: Orchestration Entry Point — The Settle-Decide-Act Loop
 * ======================================================================
 *
 * Run:  npx tsx docs/plans/030-positional-orchestrator/tasks/phase-7-orchestration-entry-point/examples/worked-example.ts
 *
 * This walks through Phase 7's two-level orchestration pattern step by step.
 * You'll see how OrchestrationService creates cached per-graph handles, how
 * GraphOrchestration runs its Settle → Decide → Act loop, and how stop reasons
 * propagate from ONBAS decisions to the final OrchestrationRunResult. All objects
 * are real instances — the fakes are the same test doubles used in the test suite.
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import { FakeODS } from '../../../../../../packages/positional-graph/src/features/030-orchestration/fake-ods.js';
import {
  FakeONBAS,
  buildFakeReality,
} from '../../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { FakeOrchestrationService } from '../../../../../../packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.js';
import { GraphOrchestration } from '../../../../../../packages/positional-graph/src/features/030-orchestration/graph-orchestration.js';
import type { OrchestrationRequest } from '../../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-request.schema.js';
import { FakeEventHandlerService } from '../../../../../../packages/positional-graph/src/features/032-node-event-system/fake-event-handler-service.js';
import type {
  GraphStatusResult,
  IPositionalGraphService,
} from '../../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';
import type { State } from '../../../../../../packages/positional-graph/src/schemas/state.schema.js';

// ── Shared fixtures ───────────────────────────────────────────────────

const ctx: WorkspaceContext = {
  workspaceSlug: 'demo-ws',
  workspaceName: 'Demo Workspace',
  workspacePath: '/tmp/demo',
  worktreePath: '/tmp/demo',
  worktreeBranch: null,
  isMainWorktree: true,
  hasGit: false,
};

const state: State = { graph_slug: 'my-pipeline', version: '1.0.0', nodes: {}, questions: [] };

const statusResult: GraphStatusResult = {
  graphSlug: 'my-pipeline',
  version: '1.0.0',
  status: 'in_progress',
  totalNodes: 3,
  completedNodes: 0,
  lines: [],
  readyNodes: [],
  runningNodes: [],
  waitingQuestionNodes: [],
  blockedNodes: [],
  completedNodeIds: [],
};

const graphService = {
  getStatus: async () => statusResult,
  loadGraphState: async () => state,
} as unknown as IPositionalGraphService;

// ──────────────────────────────────────────────────────────────────────
// 1. The Two-Level Pattern: Service → Handle
//
// OrchestrationService is a singleton. You call get(ctx, slug) to obtain
// a per-graph handle. Calling get() again with the same slug returns the
// same cached handle — no duplicate wiring, no wasted memory.
// ──────────────────────────────────────────────────────────────────────

const svc = new FakeOrchestrationService();

// Configure what the fake will return when we ask for a handle
const fakeReality = buildFakeReality({
  graphSlug: 'my-pipeline',
  graphStatus: 'complete',
  nodes: [
    { nodeId: 'A', status: 'complete' },
    { nodeId: 'B', status: 'complete' },
  ],
});

svc.configureGraph('my-pipeline', {
  runResults: [
    {
      errors: [],
      actions: [],
      stopReason: 'graph-complete',
      finalReality: fakeReality,
      iterations: 1,
    },
  ],
  reality: fakeReality,
});

const handle1 = await svc.get(ctx, 'my-pipeline');
const handle2 = await svc.get(ctx, 'my-pipeline');

console.log('━━━ Section 1: Two-Level Pattern ━━━');
console.log(`→ handle1.graphSlug:       ${handle1.graphSlug}`);
console.log(`→ handle2.graphSlug:       ${handle2.graphSlug}`);
console.log(`→ Same handle (cached)?    ${handle1 === handle2}`);
console.log(`→ get() call history:      ${svc.getGetHistory().length} calls recorded`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 2. Building a Reality Snapshot
//
// Before the loop can decide anything, it needs a PositionalGraphReality —
// an immutable snapshot of every line, node, question, and session in the
// graph. buildFakeReality() fills in sensible defaults so you only specify
// what matters for your scenario.
// ──────────────────────────────────────────────────────────────────────

const reality = buildFakeReality({
  graphSlug: 'my-pipeline',
  graphStatus: 'in_progress',
  lines: [
    { lineId: 'line-000', index: 0, nodeIds: ['A', 'B'], transitionOpen: true },
    { lineId: 'line-001', index: 1, nodeIds: ['C'], transitionOpen: false },
  ],
  nodes: [
    { nodeId: 'A', lineIndex: 0, positionInLine: 0, status: 'complete', unitType: 'agent' },
    { nodeId: 'B', lineIndex: 0, positionInLine: 1, status: 'ready', unitType: 'code' },
    { nodeId: 'C', lineIndex: 1, positionInLine: 0, status: 'pending', unitType: 'agent' },
  ],
});

console.log('━━━ Section 2: Reality Snapshot ━━━');
console.log(`→ graphSlug:       ${reality.graphSlug}`);
console.log(`→ graphStatus:     ${reality.graphStatus}`);
console.log(`→ lines:           ${reality.lines.length} (line-000: open, line-001: blocked)`);
console.log(`→ totalNodes:      ${reality.totalNodes}`);
console.log(`→ completedCount:  ${reality.completedCount}`);
console.log(`→ readyNodeIds:    [${reality.readyNodeIds.join(', ')}]`);
console.log(`→ isComplete:      ${reality.isComplete}`);
console.log(`→ isFailed:        ${reality.isFailed}`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 3. ONBAS Decides — "What Should We Do Next?"
//
// FakeONBAS queues up decisions in FIFO order. The last decision repeats
// forever, which is how the loop naturally stops — once ONBAS says
// "no-action", the loop exits on every subsequent iteration too.
// ──────────────────────────────────────────────────────────────────────

const onbas = new FakeONBAS();

const startA: OrchestrationRequest = {
  type: 'start-node',
  graphSlug: 'my-pipeline',
  nodeId: 'A',
  inputs: { ok: true, inputs: { prompt: 'Summarize the data' } },
};

const startB: OrchestrationRequest = {
  type: 'start-node',
  graphSlug: 'my-pipeline',
  nodeId: 'B',
  inputs: { ok: true, inputs: {} },
};

const noMore: OrchestrationRequest = {
  type: 'no-action',
  graphSlug: 'my-pipeline',
  reason: 'all-waiting',
};

onbas.setActions([startA, startB, noMore]);

// Simulate three calls to see the queue behavior
const d1 = onbas.getNextAction(reality);
const d2 = onbas.getNextAction(reality);
const d3 = onbas.getNextAction(reality);
const d4 = onbas.getNextAction(reality); // last repeats

console.log('━━━ Section 3: ONBAS Decision Queue ━━━');
console.log(`→ Call 1: ${d1.type}${d1.type === 'start-node' ? ` (node ${d1.nodeId})` : ''}`);
console.log(`→ Call 2: ${d2.type}${d2.type === 'start-node' ? ` (node ${d2.nodeId})` : ''}`);
console.log(`→ Call 3: ${d3.type} — reason: ${d3.type === 'no-action' ? d3.reason : 'n/a'}`);
console.log(`→ Call 4: ${d4.type} — last repeats: ${d3.type === d4.type}`);
console.log(`→ History: ${onbas.getHistory().length} realities recorded`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 4. The Full Loop — Settle → Decide → Act → Record → Repeat
//
// GraphOrchestration wires everything together. Each iteration: settle
// events via EHS, build a fresh reality, ask ONBAS what to do, and if
// it's an action, hand it to ODS. The loop stops the instant ONBAS
// returns 'no-action'. Let's run a 2-node scenario end to end.
// ──────────────────────────────────────────────────────────────────────

const loopOnbas = new FakeONBAS();
const loopOds = new FakeODS();
const loopEhs = new FakeEventHandlerService();

loopOnbas.setActions([
  { type: 'start-node', graphSlug: 'my-pipeline', nodeId: 'A', inputs: { ok: true, inputs: {} } },
  { type: 'start-node', graphSlug: 'my-pipeline', nodeId: 'B', inputs: { ok: true, inputs: {} } },
  { type: 'no-action', graphSlug: 'my-pipeline', reason: 'graph-complete' },
]);

const handle = new GraphOrchestration({
  graphSlug: 'my-pipeline',
  ctx,
  graphService,
  onbas: loopOnbas,
  ods: loopOds,
  eventHandlerService: loopEhs,
});

const result = await handle.run();

console.log('━━━ Section 4: Full Loop Execution ━━━');
console.log(`→ iterations:    ${result.iterations}`);
console.log(`→ actions taken:  ${result.actions.length}`);
for (const [i, action] of result.actions.entries()) {
  const req = action.request;
  console.log(
    `   ${i + 1}. ${req.type}${req.type === 'start-node' ? ` → node ${req.nodeId}` : ''} at ${action.timestamp}`
  );
}
console.log(`→ stopReason:    ${result.stopReason}`);
console.log(
  `→ errors:        ${result.errors.length === 0 ? 'none' : result.errors.map((e) => e.code).join(', ')}`
);
console.log(`→ EHS settled:   ${loopEhs.getHistory().length} times`);
console.log(`→ ODS executed:  ${loopOds.getHistory().length} times`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 5. Stop Reasons — How the Loop Knows When to Quit
//
// ONBAS returns a NoActionRequest with a 'reason' field. The loop maps
// these to three OrchestrationStopReasons: 'graph-complete', 'graph-failed',
// or 'no-action' (catch-all for 'all-waiting', 'transition-blocked', etc.)
// ──────────────────────────────────────────────────────────────────────

const scenarios: Array<{ label: string; reason: string; expected: string }> = [
  { label: 'graph-complete', reason: 'graph-complete', expected: 'graph-complete' },
  { label: 'graph-failed', reason: 'graph-failed', expected: 'graph-failed' },
  { label: 'all-waiting', reason: 'all-waiting', expected: 'no-action' },
  { label: 'transition-blocked', reason: 'transition-blocked', expected: 'no-action' },
];

console.log('━━━ Section 5: Stop Reason Mapping ━━━');
for (const s of scenarios) {
  const testOnbas = new FakeONBAS();
  testOnbas.setActions([
    { type: 'no-action', graphSlug: 'my-pipeline', reason: s.reason } as OrchestrationRequest,
  ]);

  const testHandle = new GraphOrchestration({
    graphSlug: 'my-pipeline',
    ctx,
    graphService,
    onbas: testOnbas,
    ods: new FakeODS(),
    eventHandlerService: new FakeEventHandlerService(),
  });

  const r = await testHandle.run();
  const match = r.stopReason === s.expected ? '✓' : '✗';
  console.log(`→ ${match} ONBAS reason "${s.reason}" → stopReason "${r.stopReason}"`);
}
console.log();

// ──────────────────────────────────────────────────────────────────────
// 6. Safety Guard — Max Iteration Protection
//
// If ONBAS keeps returning start-node requests forever (a bug), the loop
// won't spin indefinitely. The maxIterations guard (default 100) kicks in
// and returns with a MAX_ITERATIONS error. Here we set it to 3 to see
// the guard in action.
// ──────────────────────────────────────────────────────────────────────

const guardOnbas = new FakeONBAS();
guardOnbas.setActions([
  { type: 'start-node', graphSlug: 'my-pipeline', nodeId: 'A', inputs: { ok: true, inputs: {} } },
  // Last repeats — ONBAS never says "no-action", loop runs until guard
]);

const guardHandle = new GraphOrchestration({
  graphSlug: 'my-pipeline',
  ctx,
  graphService,
  onbas: guardOnbas,
  ods: new FakeODS(),
  eventHandlerService: new FakeEventHandlerService(),
  maxIterations: 3,
});

const guardResult = await guardHandle.run();

console.log('━━━ Section 6: Max Iteration Guard ━━━');
console.log('→ maxIterations:  3');
console.log(`→ iterations ran: ${guardResult.iterations}`);
console.log(`→ actions taken:  ${guardResult.actions.length}`);
console.log(
  `→ errors:         ${guardResult.errors.map((e) => `${e.code}: ${e.message}`).join('; ')}`
);
console.log(`→ stopReason:     ${guardResult.stopReason} (safety exit)`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 7. FakeOrchestrationService for Downstream Consumers
//
// Downstream code that depends on IOrchestrationService doesn't need to
// know about ONBAS, ODS, or the loop. FakeOrchestrationService lets you
// configure canned run results and reality snapshots per graph slug.
// ──────────────────────────────────────────────────────────────────────

const fakeSvc = new FakeOrchestrationService();

const pipelineReality = buildFakeReality({
  graphSlug: 'deploy-pipeline',
  graphStatus: 'complete',
  nodes: [
    { nodeId: 'build', status: 'complete' },
    { nodeId: 'test', status: 'complete' },
    { nodeId: 'deploy', status: 'complete' },
  ],
});

fakeSvc.configureGraph('deploy-pipeline', {
  runResults: [
    {
      errors: [],
      actions: [],
      stopReason: 'graph-complete',
      finalReality: pipelineReality,
      iterations: 4,
    },
  ],
  reality: pipelineReality,
});

const deployHandle = await fakeSvc.get(ctx, 'deploy-pipeline');
const deployResult = await deployHandle.run();
const deployReality = await deployHandle.getReality();

console.log('━━━ Section 7: Downstream Consumer Fake ━━━');
console.log(`→ graphSlug:          ${deployHandle.graphSlug}`);
console.log(`→ run() stopReason:   ${deployResult.stopReason}`);
console.log(`→ run() iterations:   ${deployResult.iterations}`);
console.log(`→ getReality() nodes: ${deployReality.totalNodes}`);
console.log(`→ getReality() complete: ${deployReality.isComplete}`);

// Second run() returns same result (last repeats)
const deployResult2 = await deployHandle.run();
console.log(`→ Second run() same?  ${deployResult2.stopReason === deployResult.stopReason}`);
console.log();

// ──────────────────────────────────────────────────────────────────────

console.log('━━━ Done ━━━');
console.log('✓ Two-level pattern: OrchestrationService → GraphOrchestration handles');
console.log('✓ Settle → Decide → Act loop with EHS, ONBAS, and ODS');
console.log('✓ Stop reason mapping: graph-complete, graph-failed, no-action');
console.log('✓ Max iteration guard prevents infinite loops');
console.log('✓ FakeOrchestrationService enables downstream testing');
console.log('✓ All objects above are real instances from the actual implementation');
