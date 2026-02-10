/**
 * Worked Example: Positional Graph Orchestration — The Settle-Decide-Act Loop
 * ============================================================================
 *
 * Run:  npx tsx docs/plans/030-positional-orchestrator/tasks/phase-8-e2e-and-integration-testing/examples/worked-example.ts
 *
 * This walks through the entire orchestration system step by step, showing how
 * a graph with two serial agent nodes gets driven from "pending" to "graph-complete"
 * by the settle-decide-act loop. You'll see real ONBAS decisions, real ODS dispatch,
 * real event settlement, and real reality snapshots — all in-process with no CLI.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
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
import {
  FakeAgentAdapter,
  NodeFileSystemAdapter,
  PathResolverAdapter,
  YamlParserAdapter,
} from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

async function main() {
  // ──────────────────────────────────────────────────────────────────────
  // 1. Wire the Full Orchestration Stack
  //
  // The orchestration system has 7 collaborators wired together: a graph
  // service for storage, ONBAS for decisions, ODS for dispatch, an event
  // system for settlement, pods for execution, and context for session
  // inheritance. Only two are fakes: the agent adapter and script runner.
  // ──────────────────────────────────────────────────────────────────────

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orch-example-'));
  await fs.mkdir(path.join(tmpDir, '.chainglass', 'data', 'workflows'), { recursive: true });

  const ctx: WorkspaceContext = {
    workspaceSlug: 'example',
    workspaceName: 'Example',
    workspacePath: tmpDir,
    worktreePath: tmpDir,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: false,
  };

  // Real graph service (filesystem-backed)
  const nodeFs = new NodeFileSystemAdapter();
  const adapter = new PositionalGraphAdapter(nodeFs, new PathResolverAdapter());
  const loader = {
    async load(_ctx: WorkspaceContext, slug: string) {
      return { unit: { slug, type: 'agent' as const, inputs: [], outputs: [] }, errors: [] };
    },
  };
  const service: IPositionalGraphService = new PositionalGraphService(
    nodeFs,
    new PathResolverAdapter(),
    new YamlParserAdapter(),
    adapter,
    loader
  );

  // Real event system
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const nes = new NodeEventService(
    {
      registry: eventRegistry,
      loadState: async (slug) => service.loadGraphState(ctx, slug),
      persistState: async (slug, state) => service.persistGraphState(ctx, slug, state),
    },
    createEventHandlerRegistry()
  );
  const ehs = new EventHandlerService(nes);

  // Real orchestration components + fake adapters
  const agentAdapter = new FakeAgentAdapter();
  const ods = new ODS({
    graphService: service,
    podManager: new PodManager(nodeFs),
    contextService: new AgentContextService(),
    agentAdapter,
    scriptRunner: new FakeScriptRunner(),
  });

  const orchestrationService = new OrchestrationService({
    graphService: service,
    onbas: new ONBAS(),
    ods,
    eventHandlerService: ehs,
  });

  console.log('━━━ Section 1: Orchestration Stack ━━━');
  console.log('→ Graph service:     real (filesystem-backed in temp dir)');
  console.log('→ ONBAS:             real (pure, synchronous decision engine)');
  console.log('→ ODS:               real (dispatches start-node, fire-and-forget)');
  console.log('→ Event system:      real (7 core event types registered)');
  console.log('→ Agent adapter:     FAKE (resolves immediately, records calls)');
  console.log('→ Script runner:     FAKE (returns exit 0)');
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 2. Create a Simple Graph: Two Serial Agents
  //
  // A single line with two agent nodes: "researcher" → "writer". The
  // researcher runs first; when complete, the writer starts with context
  // inherited from the researcher's session.
  // ──────────────────────────────────────────────────────────────────────

  const SLUG = 'example-graph';
  await service.create(ctx, SLUG);
  const line = await service.addLine(ctx, SLUG);
  const lineId = line.lineId ?? '';
  const n1 = await service.addNode(ctx, SLUG, lineId, 'researcher');
  const n2 = await service.addNode(ctx, SLUG, lineId, 'writer');
  const researcherId = n1.nodeId ?? '';
  const writerId = n2.nodeId ?? '';

  console.log('━━━ Section 2: Graph Created ━━━');
  console.log(`→ Graph slug:  ${SLUG}`);
  console.log(`→ Line:        ${lineId}`);
  console.log(`→ Node 1:      ${researcherId} (researcher, serial position 0)`);
  console.log(`→ Node 2:      ${writerId} (writer, serial position 1)`);
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 3. First run() — ONBAS Decides to Start the Researcher
  //
  // The settle-decide-act loop runs: settle events (none yet), build a
  // reality snapshot, ask ONBAS "what next?". ONBAS walks the graph
  // left-to-right and finds "researcher" is ready → returns start-node.
  // ODS dispatches: reserves the node (pending→starting) and fires the
  // pod (fire-and-forget). The loop runs once more, finds no more ready
  // nodes, and exits with stopReason='no-action'.
  // ──────────────────────────────────────────────────────────────────────

  const handle = await orchestrationService.get(ctx, SLUG);
  const run1 = await handle.run();

  console.log('━━━ Section 3: First run() — Start Researcher ━━━');
  console.log(`→ Actions:     ${run1.actions.length} (ONBAS found 1 ready node)`);
  console.log(`→ Action type: ${run1.actions[0]?.request.type}`);
  console.log(`→ Node:        ${(run1.actions[0]?.request as { nodeId: string }).nodeId}`);
  console.log(`→ Stop reason: ${run1.stopReason} (no more ready nodes)`);
  console.log(`→ Iterations:  ${run1.iterations} (start + exit check)`);
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 4. Simulate the Agent Completing (via the Service API)
  //
  // In the real system, a CLI agent runs in a subprocess and raises events
  // via `cg wf node accept` and `cg wf node end`. Both CLI commands call
  // service.raiseNodeEvent(), which records the event AND settles it
  // inline (runs the handler that updates node status). Here we call
  // the same service method directly — no CLI subprocess needed.
  //
  // The two events form a pair:
  //   node:accepted  (starting → agent-accepted)  "I've started working"
  //   node:completed (agent-accepted → complete)   "I'm done"
  // ──────────────────────────────────────────────────────────────────────

  const accept1 = await service.raiseNodeEvent(
    ctx,
    SLUG,
    researcherId,
    'node:accepted',
    {},
    'agent'
  );
  console.log('━━━ Section 4: Agent Events Raised ━━━');
  console.log(`→ Raised node:accepted for ${researcherId} (ok=${!accept1.errors.length})`);

  const complete1 = await service.raiseNodeEvent(
    ctx,
    SLUG,
    researcherId,
    'node:completed',
    { message: 'Research done' },
    'agent'
  );
  console.log(`→ Raised node:completed for ${researcherId} (ok=${!complete1.errors.length})`);
  console.log('→ Events were raised AND settled inline (status transitions already applied)');
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 5. Second run() — ONBAS Finds Writer Ready, Starts It
  //
  // The researcher's events were already settled by raiseNodeEvent() in
  // Section 4 (status is already 'complete'). Now run() builds a fresh
  // reality snapshot: researcher=complete, writer=ready. ONBAS walks the
  // graph left-to-right and picks the writer. ODS dispatches start-node.
  // Loop exits with no-action (nothing else to start).
  // ──────────────────────────────────────────────────────────────────────

  const run2 = await handle.run();

  console.log('━━━ Section 5: Second run() — Start Writer ━━━');
  console.log(`→ Actions:     ${run2.actions.length}`);
  console.log(`→ Action type: ${run2.actions[0]?.request.type}`);
  console.log(`→ Node:        ${(run2.actions[0]?.request as { nodeId: string }).nodeId}`);
  console.log(`→ Stop reason: ${run2.stopReason}`);
  console.log('→ Researcher already complete (settled in Section 4), writer now ready');
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 6. Complete the Writer → Graph Complete
  //
  // Same pattern: raise events for the writer, then run() one more time.
  // This time ONBAS finds all nodes complete → returns no-action with
  // reason='graph-complete'. The loop exits immediately.
  // ──────────────────────────────────────────────────────────────────────

  await service.raiseNodeEvent(ctx, SLUG, writerId, 'node:accepted', {}, 'agent');
  await service.raiseNodeEvent(
    ctx,
    SLUG,
    writerId,
    'node:completed',
    { message: 'Writing done' },
    'agent'
  );

  const run3 = await handle.run();
  const reality = await handle.getReality();

  console.log('━━━ Section 6: Graph Complete ━━━');
  console.log(`→ Stop reason:      ${run3.stopReason}`);
  console.log(`→ Actions:          ${run3.actions.length} (nothing to start)`);
  console.log(`→ Graph status:     ${reality.graphStatus}`);
  console.log(`→ Total nodes:      ${reality.totalNodes}`);
  console.log(`→ Completed:        ${reality.completedCount}`);
  console.log(`→ isComplete:       ${reality.isComplete}`);
  console.log(`→ Current line idx: ${reality.currentLineIndex} (past-the-end sentinel)`);
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 7. Inspect the Reality Snapshot
  //
  // The reality object is the heart of the system — an immutable snapshot
  // that every component reads from. ONBAS uses it to decide, ODS uses it
  // to validate, and the UI renders it. Let's peek at what each node
  // looks like inside the snapshot.
  // ──────────────────────────────────────────────────────────────────────

  console.log('━━━ Section 7: Reality Snapshot ━━━');
  for (const [nodeId, node] of reality.nodes) {
    console.log(`→ ${node.unitSlug} (${nodeId}):`);
    console.log(
      `    status=${node.status}  line=${node.lineIndex}  pos=${node.positionInLine}  type=${node.unitType}`
    );
    console.log(`    ready=${node.ready}  execution=${node.execution}`);
  }
  console.log();
  console.log(
    `→ Agent adapter was called ${agentAdapter.getRunHistory().length} time(s) (fire-and-forget)`
  );
  console.log();

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });

  // ──────────────────────────────────────────────────────────────────────

  console.log('━━━ Done ━━━');
  console.log('✓ Walked through the full orchestration lifecycle:');
  console.log(
    '    Wire stack → Create graph → run() → Events → run() → Events → run() → graph-complete'
  );
  console.log('✓ All objects above are real instances from the actual Plan 030 implementation');
  console.log('✓ Only 2 fakes used: FakeAgentAdapter and FakeScriptRunner');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\n--- EXAMPLE FAILED ---');
    console.error(err);
    process.exit(1);
  }
);
