/**
 * Worked Example: ODS Dispatch — How the Orchestrator Executes Decisions
 * ======================================================================
 *
 * Run:  npx tsx docs/plans/030-positional-orchestrator/tasks/phase-6-ods-action-handlers/examples/worked-example-ods-dispatch.ts
 *
 * This walks through the ODS (Orchestration Dispatch Service) operating on a
 * realistic graph: a 3-line data pipeline with 8 nodes in various states —
 * some complete, some running, some ready, some pending. You'll see how ODS
 * receives a decision from ONBAS targeting one specific node, validates it
 * against the full reality snapshot, and fires execution without awaiting.
 */

import type {
  IPositionalGraphService,
  StartNodeResult,
} from '../../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';
import type { IAgentAdapter } from '../../../../../../packages/shared/src/interfaces/index.js';
import type { WorkspaceContext } from '../../../../../../packages/workflow/src/index.js';

import { FakeAgentContextService } from '../../../../../../packages/positional-graph/src/features/030-orchestration/fake-agent-context.js';
import { buildFakeReality } from '../../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { FakePodManager } from '../../../../../../packages/positional-graph/src/features/030-orchestration/fake-pod-manager.js';
import { ODS } from '../../../../../../packages/positional-graph/src/features/030-orchestration/ods.js';
import type { ODSDependencies } from '../../../../../../packages/positional-graph/src/features/030-orchestration/ods.types.js';
import type { OrchestrationRequest } from '../../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-request.schema.js';
import type { PositionalGraphReality } from '../../../../../../packages/positional-graph/src/features/030-orchestration/reality.types.js';
import { FakeScriptRunner } from '../../../../../../packages/positional-graph/src/features/030-orchestration/script-runner.types.js';

// ── Shared fixtures ─────────────────────────────────────────────────────────

const ctx: WorkspaceContext = {
  workspaceSlug: 'acme-ws',
  workspaceName: 'Acme Data Pipeline',
  workspacePath: '/workspace/acme',
  worktreePath: '/workspace/acme',
  worktreeBranch: null,
  isMainWorktree: true,
  hasGit: false,
};

/** Stub graphService — only startNode matters for ODS. */
function makeGraphService(): IPositionalGraphService {
  return {
    startNode: async (_ctx, _graphSlug, nodeId): Promise<StartNodeResult> => ({
      errors: [],
      nodeId,
      status: 'starting',
      startedAt: new Date().toISOString(),
    }),
  } as unknown as IPositionalGraphService;
}

const stubAdapter: IAgentAdapter = {
  run: async () => ({
    output: '',
    sessionId: 's1',
    status: 'complete',
    exitCode: 0,
    tokens: { input: 0, output: 0, cacheRead: 0 },
  }),
  terminate: async () => {},
} as IAgentAdapter;

// ──────────────────────────────────────────────────────────────────────
// 1. A Realistic Graph — 3 Lines, 8 Nodes, Mixed States
//
// Imagine a data pipeline: Line 1 ingests data (complete), Line 2
// transforms it (in progress — one agent done, one code node ready,
// one user-input waiting for human approval), Line 3 exports results
// (blocked because Line 2 isn't done yet). This is the kind of graph
// state ODS sees on every orchestration tick.
// ──────────────────────────────────────────────────────────────────────

const pipelineReality = buildFakeReality({
  graphSlug: 'data-pipeline',
  lines: [
    { lineId: 'ingest', label: 'Ingest', nodeIds: ['fetch-api', 'parse-csv'], isComplete: true },
    {
      lineId: 'transform',
      label: 'Transform',
      nodeIds: ['clean', 'validate', 'approve'],
      transitionOpen: true,
    },
    {
      lineId: 'export',
      label: 'Export',
      nodeIds: ['format', 'upload', 'notify'],
      transitionOpen: false,
    },
  ],
  nodes: [
    // Line 1: Ingest (all complete)
    {
      nodeId: 'fetch-api',
      lineIndex: 0,
      positionInLine: 0,
      unitType: 'agent',
      unitSlug: 'api-fetcher',
      status: 'complete',
    },
    {
      nodeId: 'parse-csv',
      lineIndex: 0,
      positionInLine: 1,
      unitType: 'code',
      unitSlug: 'csv-parser',
      status: 'complete',
    },

    // Line 2: Transform (mixed — this is where the action is)
    {
      nodeId: 'clean',
      lineIndex: 1,
      positionInLine: 0,
      unitType: 'agent',
      unitSlug: 'data-cleaner',
      status: 'complete',
    },
    {
      nodeId: 'validate',
      lineIndex: 1,
      positionInLine: 1,
      unitType: 'code',
      unitSlug: 'validator',
      status: 'ready',
    },
    {
      nodeId: 'approve',
      lineIndex: 1,
      positionInLine: 2,
      unitType: 'user-input',
      unitSlug: 'approval',
      status: 'ready',
    },

    // Line 3: Export (all pending — transition not open yet)
    {
      nodeId: 'format',
      lineIndex: 2,
      positionInLine: 0,
      unitType: 'code',
      unitSlug: 'formatter',
      status: 'pending',
      ready: false,
    },
    {
      nodeId: 'upload',
      lineIndex: 2,
      positionInLine: 1,
      unitType: 'agent',
      unitSlug: 's3-uploader',
      status: 'pending',
      ready: false,
    },
    {
      nodeId: 'notify',
      lineIndex: 2,
      positionInLine: 2,
      unitType: 'agent',
      unitSlug: 'slack-notifier',
      status: 'pending',
      ready: false,
    },
  ],
});

console.log('━━━ Section 1: The Graph Snapshot ━━━');
console.log(`→ Graph: ${pipelineReality.graphSlug}  (status: ${pipelineReality.graphStatus})`);
console.log(`→ ${pipelineReality.totalNodes} nodes across ${pipelineReality.lines.length} lines`);
console.log();
for (const line of pipelineReality.lines) {
  const nodeStates = line.nodeIds.map((id) => {
    const n = pipelineReality.nodes.get(id);
    if (!n) return `? ${id}(unknown)`;
    const icon = n.status === 'complete' ? '✓' : n.status === 'ready' ? '●' : '○';
    return `${icon} ${id}(${n.unitType})`;
  });
  const gateIcon = line.transitionOpen ? '🟢' : '🔴';
  console.log(`   ${gateIcon} Line "${line.label}": ${nodeStates.join(' → ')}`);
}
console.log();
console.log(`→ Ready:     [${pipelineReality.readyNodeIds.join(', ')}]`);
console.log(`→ Complete:  [${pipelineReality.completedNodeIds.join(', ')}]`);
const pendingIds = [...pipelineReality.nodes.values()]
  .filter((n) => n.status === 'pending')
  .map((n) => n.nodeId);
console.log(`→ Pending:   [${pendingIds.join(', ')}]`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 2. ODS Construction & Starting a Code Node Mid-Pipeline
//
// ONBAS looked at this graph and decided: "validate" is the next node
// to start — it's ready and it's the next serial step after "clean"
// completed. ODS doesn't re-derive this decision; it trusts ONBAS
// but validates the node is actually ready before acting.
// ──────────────────────────────────────────────────────────────────────

const podManager = new FakePodManager();
const contextService = new FakeAgentContextService();
const scriptRunner = new FakeScriptRunner();

const deps: ODSDependencies = {
  graphService: makeGraphService(),
  podManager,
  contextService,
  agentAdapter: stubAdapter,
  scriptRunner,
};

const ods = new ODS(deps);

const validateRequest: OrchestrationRequest = {
  type: 'start-node',
  graphSlug: 'data-pipeline',
  nodeId: 'validate',
  inputs: { ok: true, inputs: { cleanedData: '/tmp/cleaned.parquet', schema: 'v2' } },
};

const validateResult = await ods.execute(validateRequest, ctx, pipelineReality);

console.log('━━━ Section 2: Start "validate" (Code Node, Mid-Pipeline) ━━━');
console.log(`→ ONBAS decided: start-node "validate" on line "Transform"`);
const validateNode = pipelineReality.nodes.get('validate');
console.log(
  `→ ODS looked up node in reality: unitType=${validateNode?.unitType}, ready=${validateNode?.ready}`
);
console.log(`→ Result: ok=${validateResult.ok}, newStatus=${validateResult.newStatus}`);
console.log(`→ Pod created: ${podManager.getCreateHistory().length > 0}`);
const validateEntry = podManager.getCreateHistory()[0];
console.log(
  `→ Pod params: nodeId=${validateEntry.nodeId}, unitType=${validateEntry.unitType}, unitSlug=${validateEntry.unitSlug}`
);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 3. User-Input Node — The Human Gate
//
// "approve" is also ready, but it's a user-input node. When ONBAS says
// start it, ODS returns ok but does nothing — no pod, no startNode()
// call. The approval gate stays where it is until a human acts.
// Meanwhile the rest of the pipeline isn't blocked from proceeding
// on other paths.
// ──────────────────────────────────────────────────────────────────────

const podCountBefore = podManager.getCreateHistory().length;

const approveRequest: OrchestrationRequest = {
  type: 'start-node',
  graphSlug: 'data-pipeline',
  nodeId: 'approve',
  inputs: { ok: true, inputs: {} },
};

const approveResult = await ods.execute(approveRequest, ctx, pipelineReality);

console.log('━━━ Section 3: User-Input "approve" (No-Op) ━━━');
console.log('→ Node "approve" is user-input — a human gate');
console.log(`→ Result: ok=${approveResult.ok}`);
console.log(
  `→ Pods before: ${podCountBefore}, pods after: ${podManager.getCreateHistory().length}`
);
console.log('→ No pod created, no startNode() called — waits for UI');
console.log();

// ──────────────────────────────────────────────────────────────────────
// 4. Trying to Start a Blocked Node — Error Paths
//
// What if something goes wrong? Let's try starting "format" on Line 3.
// It exists in the reality but it's not ready (Line 3's transition
// gate is closed). ODS catches this before touching graphService.
// Then let's try a node that doesn't exist at all.
// ──────────────────────────────────────────────────────────────────────

const formatResult = await ods.execute(
  {
    type: 'start-node',
    graphSlug: 'data-pipeline',
    nodeId: 'format',
    inputs: { ok: true, inputs: {} },
  },
  ctx,
  pipelineReality
);

const ghostResult = await ods.execute(
  {
    type: 'start-node',
    graphSlug: 'data-pipeline',
    nodeId: 'deleted-step',
    inputs: { ok: true, inputs: {} },
  },
  ctx,
  pipelineReality
);

console.log('━━━ Section 4: Error Paths ━━━');
console.log(`→ Start "format" (not ready, gate closed):`);
console.log(
  `   ok=${formatResult.ok}, code=${formatResult.error?.code}, nodeId=${formatResult.error?.nodeId}`
);
console.log(`→ Start "deleted-step" (not in reality):`);
console.log(`   ok=${ghostResult.ok}, code=${ghostResult.error?.code}`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 5. The Full Dispatch Table
//
// ODS handles four request types. Only start-node does real work.
// no-action is a clean pass-through (ONBAS says "nothing to do").
// resume-node and question-pending are dead code paths since Workshop
// 12 moved question handling to the event system — they return
// defensive errors so we catch integration mistakes early.
// ──────────────────────────────────────────────────────────────────────

const noActionResult = await ods.execute(
  { type: 'no-action', graphSlug: 'data-pipeline', reason: 'transition-blocked' },
  ctx,
  pipelineReality
);

const resumeResult = await ods.execute(
  {
    type: 'resume-node',
    graphSlug: 'data-pipeline',
    nodeId: 'clean',
    questionId: 'q1',
    answer: 'yes',
  },
  ctx,
  pipelineReality
);

const questionResult = await ods.execute(
  {
    type: 'question-pending',
    graphSlug: 'data-pipeline',
    nodeId: 'clean',
    questionId: 'q1',
    questionText: 'Proceed?',
    questionType: 'confirm',
  },
  ctx,
  pipelineReality
);

console.log('━━━ Section 5: Dispatch Table ━━━');
console.log('→ Request type        ok?    Error code');
console.log('  ─────────────────── ────── ──────────────────────');
console.log(`  start-node          ${validateResult.ok}   (creates pod, fires execution)`);
console.log(`  no-action           ${noActionResult.ok}   (clean pass-through)`);
console.log(`  resume-node         ${resumeResult.ok}  ${resumeResult.error?.code}`);
console.log(`  question-pending    ${questionResult.ok}  ${questionResult.error?.code}`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 6. Context Inheritance Across Nodes
//
// The "clean" agent (Line 2, position 0) already ran and left a
// session. Now imagine "validate" were an agent that inherits that
// context — ODS would ask contextService where the session comes from,
// look up the parent's sessionId, and pass it to pod.execute().
// Let's demonstrate with a fresh ODS wired for inheritance.
// ──────────────────────────────────────────────────────────────────────

const inheritPodManager = new FakePodManager();
const inheritContextService = new FakeAgentContextService();

// "clean" ran earlier and left session "session-clean-42"
inheritPodManager.seedSession('clean', 'session-clean-42');

// contextService says "validate" inherits from "clean"
inheritContextService.setContextSource('validate', {
  source: 'inherit',
  fromNodeId: 'clean',
});

const inheritDeps: ODSDependencies = {
  graphService: makeGraphService(),
  podManager: inheritPodManager,
  contextService: inheritContextService,
  agentAdapter: stubAdapter,
  scriptRunner,
};

// Use an agent version of "validate" for this demo (agents have sessions)
const inheritReality = buildFakeReality({
  graphSlug: 'data-pipeline',
  lines: [
    { lineId: 'ingest', nodeIds: ['fetch-api', 'parse-csv'], isComplete: true },
    { lineId: 'transform', nodeIds: ['clean', 'validate'], transitionOpen: true },
  ],
  nodes: [
    { nodeId: 'fetch-api', lineIndex: 0, positionInLine: 0, unitType: 'agent', status: 'complete' },
    { nodeId: 'parse-csv', lineIndex: 0, positionInLine: 1, unitType: 'code', status: 'complete' },
    { nodeId: 'clean', lineIndex: 1, positionInLine: 0, unitType: 'agent', status: 'complete' },
    {
      nodeId: 'validate',
      lineIndex: 1,
      positionInLine: 1,
      unitType: 'agent',
      unitSlug: 'validator-agent',
      status: 'ready',
    },
  ],
});

const inheritOds = new ODS(inheritDeps);
await inheritOds.execute(
  {
    type: 'start-node',
    graphSlug: 'data-pipeline',
    nodeId: 'validate',
    inputs: { ok: true, inputs: { schema: 'v2' } },
  },
  ctx,
  inheritReality
);

console.log('━━━ Section 6: Context Inheritance ━━━');
console.log(`→ "clean" left session: session-clean-42`);
console.log(`→ contextService says "validate" inherits from "clean"`);
console.log(`→ Context service consulted: ${inheritContextService.getHistory().length} call(s)`);
console.log(`→ Resolved parent sessionId: ${inheritPodManager.getSessionId('clean')}`);
console.log(`→ Pod "validate" launched with inherited context`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 7. What ODS Leaves Behind
//
// After all these dispatches, let's look at the footprint: which pods
// were created, which nodes were started, and what the podManager's
// create history looks like. Remember — ODS fires and forgets. The
// pods are running (or already done) in the background. Results will
// surface on the next Settle pass via the event system.
// ──────────────────────────────────────────────────────────────────────

console.log('━━━ Section 7: ODS Footprint ━━━');
console.log('→ Main ODS pod create history:');
for (const entry of podManager.getCreateHistory()) {
  console.log(`   ${entry.nodeId} — ${entry.unitType} (${entry.unitSlug})`);
}
console.log(`→ Total pods created: ${podManager.getCreateHistory().length}`);
console.log();
console.log('→ Inheritance ODS pod create history:');
for (const entry of inheritPodManager.getCreateHistory()) {
  console.log(`   ${entry.nodeId} — ${entry.unitType} (${entry.unitSlug})`);
}
console.log();

// Print a mini pipeline diagram showing what happened
console.log('→ Pipeline state after ODS actions:');
console.log('   Line "Ingest":    ✓ fetch-api → ✓ parse-csv');
console.log('   Line "Transform": ✓ clean → ⚡ validate (just started) → ○ approve (human gate)');
console.log('   Line "Export":    ○ format → ○ upload → ○ notify (gate closed)');
console.log();

// ──────────────────────────────────────────────────────────────────────

console.log('━━━ Done ━━━');
console.log('✓ Realistic graph: 3 lines, 8 nodes, mixed states');
console.log('✓ ODS targets one node per request — validates against full reality');
console.log('✓ Code node started mid-pipeline with fire-and-forget');
console.log('✓ User-input skipped (no pod, no side effects)');
console.log('✓ Blocked and missing nodes caught with error codes');
console.log('✓ Dispatch table: start-node, no-action, defensive errors');
console.log('✓ Context inheritance resolves parent session for agent continuity');
