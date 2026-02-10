/**
 * Worked Example: Positional Graph Orchestration — All Patterns
 * =============================================================
 *
 * Run:  npx tsx docs/plans/030-positional-orchestrator/tasks/phase-8-e2e-and-integration-testing/examples/worked-example-full.ts
 *
 * This comprehensive example drives a 4-line, 8-node graph through every
 * orchestration pattern: user-input nodes, serial agents with input wiring,
 * manual transition gates, the full question/answer/restart lifecycle,
 * code nodes, parallel execution, and settlement idempotency.
 *
 * For a simpler 2-node introduction, see worked-example.ts.
 * For the full E2E validation test, see test/e2e/positional-graph-orchestration-e2e.ts.
 *
 * Graph topology:
 *
 *   Line 0 (auto):     [get-spec]                          user-input
 *   Line 1 (manual):   [researcher] → [reviewer]           serial agents
 *   Line 2 (auto):     [coder] → [tester]                  agent + code
 *   Line 3 (auto):     [par-a]  [par-b]  → [final]         parallel + serial
 *
 * Sections:
 *   1. Wire the Full Stack
 *   2. Create the Graph (4 lines, 8 nodes, 5 input wirings)
 *   3. User-Input Node (ONBAS skip, manual completion)
 *   4. Serial Agents + Input Wiring
 *   5. Manual Transition Gate
 *   6. Question/Answer/Restart Lifecycle
 *   7. Code Node
 *   8. Parallel Execution + Serial Gate
 *   9. Graph Complete + Full Reality
 *  10. Settlement Idempotency Proof
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

// Work unit definitions — the loader returns these by slug.
// Each unit declares its type, inputs, and outputs matching the wiring below.
const units: Record<
  string,
  {
    slug: string;
    type: 'agent' | 'code' | 'user-input';
    inputs: { name: string; type: string; data_type: string; required: boolean }[];
    outputs: { name: string; type: string; data_type: string; required: boolean }[];
  }
> = {
  'get-spec': {
    slug: 'get-spec',
    type: 'user-input',
    inputs: [],
    outputs: [{ name: 'spec', type: 'data', data_type: 'text', required: true }],
  },
  researcher: {
    slug: 'researcher',
    type: 'agent',
    inputs: [{ name: 'spec', type: 'data', data_type: 'text', required: true }],
    outputs: [{ name: 'research', type: 'data', data_type: 'text', required: true }],
  },
  reviewer: {
    slug: 'reviewer',
    type: 'agent',
    inputs: [{ name: 'research', type: 'data', data_type: 'text', required: true }],
    outputs: [{ name: 'review', type: 'data', data_type: 'text', required: true }],
  },
  coder: {
    slug: 'coder',
    type: 'agent',
    inputs: [{ name: 'research', type: 'data', data_type: 'text', required: true }],
    outputs: [{ name: 'code', type: 'data', data_type: 'text', required: true }],
  },
  tester: {
    slug: 'tester',
    type: 'code',
    inputs: [{ name: 'code', type: 'data', data_type: 'text', required: true }],
    outputs: [{ name: 'test_results', type: 'data', data_type: 'text', required: true }],
  },
  'par-a': {
    slug: 'par-a',
    type: 'agent',
    inputs: [{ name: 'code', type: 'data', data_type: 'text', required: true }],
    outputs: [{ name: 'result_a', type: 'data', data_type: 'text', required: true }],
  },
  'par-b': {
    slug: 'par-b',
    type: 'agent',
    inputs: [],
    outputs: [{ name: 'result_b', type: 'data', data_type: 'text', required: true }],
  },
  final: {
    slug: 'final',
    type: 'agent',
    inputs: [],
    outputs: [],
  },
};

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orch-full-'));

  try {
    await fs.mkdir(path.join(tmpDir, '.chainglass', 'data', 'workflows'), { recursive: true });

    const ctx: WorkspaceContext = {
      workspaceSlug: 'full-example',
      workspaceName: 'Full Example',
      workspacePath: tmpDir,
      worktreePath: tmpDir,
      worktreeBranch: null,
      isMainWorktree: true,
      hasGit: false,
    };

    // ──────────────────────────────────────────────────────────────────────
    // Section 1: Wire the Full Orchestration Stack
    //
    // Seven collaborators wired together: graph service for storage, ONBAS
    // for decisions, ODS for dispatch, an event system for settlement,
    // pods for execution, context for session inheritance, and a pod
    // manager for container lifecycle. Only two are fakes: the agent
    // adapter and the script runner.
    // ──────────────────────────────────────────────────────────────────────

    const nodeFs = new NodeFileSystemAdapter();
    const adapter = new PositionalGraphAdapter(nodeFs, new PathResolverAdapter());

    // The loader returns the correct type per slug from our units map.
    // This is the key difference from the simple example (which hardcodes 'agent').
    const loader = {
      async load(_ctx: WorkspaceContext, slug: string) {
        const unit = units[slug];
        if (!unit) {
          return { unit: { slug, type: 'agent' as const, inputs: [], outputs: [] }, errors: [] };
        }
        return { unit, errors: [] };
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
    const scriptRunner = new FakeScriptRunner();
    const ods = new ODS({
      graphService: service,
      podManager: new PodManager(nodeFs),
      contextService: new AgentContextService(),
      agentAdapter,
      scriptRunner,
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
    console.log('→ Pods:              real PodManager + AgentContextService');
    console.log('→ Agent adapter:     FAKE (resolves immediately, records calls)');
    console.log('→ Script runner:     FAKE (returns exit 0)');
    console.log('→ Work unit loader:  type-aware (agent/code/user-input per slug)');
    console.log();

    // ──────────────────────────────────────────────────────────────────────
    // Section 2: Create the Graph (4 lines, 8 nodes, 5 input wirings)
    //
    // Line 0 (auto):   get-spec              — user-input node
    // Line 1 (manual): researcher → reviewer  — serial agents, manual gate
    // Line 2 (auto):   coder → tester         — agent + code node
    // Line 3 (auto):   par-a  par-b → final   — parallel + serial successor
    //
    // Input wirings:
    //   get-spec.spec → researcher.spec        (cross-line)
    //   researcher.research → reviewer.research (same-line serial)
    //   researcher.research → coder.research    (cross-line)
    //   coder.code → tester.code               (same-line, agent to code)
    //   coder.code → par-a.code                (cross-line fan-out)
    // ──────────────────────────────────────────────────────────────────────

    const SLUG = 'full-example';
    const createResult = await service.create(ctx, SLUG);
    const line0Id = createResult.lineId;

    // Line 0: user-input (auto transition, created by service.create)
    const getSpec = await service.addNode(ctx, SLUG, line0Id, 'get-spec');
    const getSpecId = getSpec.nodeId ?? '';

    // Line 1: serial agents (manual transition gates entry to line 2)
    const line1 = await service.addLine(ctx, SLUG, {
      orchestratorSettings: { transition: 'manual' },
    });
    const line1Id = line1.lineId ?? '';
    const researcher = await service.addNode(ctx, SLUG, line1Id, 'researcher');
    const researcherId = researcher.nodeId ?? '';
    const reviewer = await service.addNode(ctx, SLUG, line1Id, 'reviewer');
    const reviewerId = reviewer.nodeId ?? '';

    // Line 2: agent + code (auto transition)
    const line2 = await service.addLine(ctx, SLUG);
    const line2Id = line2.lineId ?? '';
    const coder = await service.addNode(ctx, SLUG, line2Id, 'coder');
    const coderId = coder.nodeId ?? '';
    const tester = await service.addNode(ctx, SLUG, line2Id, 'tester');
    const testerId = tester.nodeId ?? '';

    // Line 3: parallel pair + serial successor
    const line3 = await service.addLine(ctx, SLUG);
    const parA = await service.addNode(ctx, SLUG, line3.lineId ?? '', 'par-a', {
      orchestratorSettings: { execution: 'parallel' },
    });
    const parAId = parA.nodeId ?? '';
    const parB = await service.addNode(ctx, SLUG, line3.lineId ?? '', 'par-b', {
      orchestratorSettings: { execution: 'parallel' },
    });
    const parBId = parB.nodeId ?? '';
    const finalNode = await service.addNode(ctx, SLUG, line3.lineId ?? '', 'final');
    const finalId = finalNode.nodeId ?? '';

    // Wire inputs (5 connections)
    await service.setInput(ctx, SLUG, researcherId, 'spec', {
      from_node: getSpecId,
      from_output: 'spec',
    });
    await service.setInput(ctx, SLUG, reviewerId, 'research', {
      from_node: researcherId,
      from_output: 'research',
    });
    await service.setInput(ctx, SLUG, coderId, 'research', {
      from_node: researcherId,
      from_output: 'research',
    });
    await service.setInput(ctx, SLUG, testerId, 'code', {
      from_node: coderId,
      from_output: 'code',
    });
    await service.setInput(ctx, SLUG, parAId, 'code', {
      from_node: coderId,
      from_output: 'code',
    });

    console.log('━━━ Section 2: Graph Created ━━━');
    console.log(`→ Graph slug:  ${SLUG}`);
    console.log(`→ Line 0:      ${line0Id} (auto)`);
    console.log(`→   get-spec:    ${getSpecId} (user-input)`);
    console.log(`→ Line 1:      ${line1Id} (manual transition)`);
    console.log(`→   researcher:  ${researcherId} (agent, serial)`);
    console.log(`→   reviewer:    ${reviewerId} (agent, serial)`);
    console.log(`→ Line 2:      ${line2Id} (auto)`);
    console.log(`→   coder:       ${coderId} (agent, serial)`);
    console.log(`→   tester:      ${testerId} (code, serial)`);
    console.log(`→ Line 3:      ${line3.lineId} (auto)`);
    console.log(`→   par-a:       ${parAId} (agent, parallel)`);
    console.log(`→   par-b:       ${parBId} (agent, parallel)`);
    console.log(`→   final:       ${finalId} (agent, serial)`);
    console.log('→ Input wirings: 5 connections wired');
    console.log();

    // Get the orchestration handle (two-level pattern: svc.get() → handle)
    const handle = await orchestrationService.get(ctx, SLUG);

    // ──────────────────────────────────────────────────────────────────────
    // Section 3: User-Input Node
    //
    // ONBAS skips user-input nodes — they are ready (gates pass) but ONBAS
    // returns null for them. The user must complete them manually via the
    // service API: startNode, node:accepted, saveOutputData, node:completed.
    // ──────────────────────────────────────────────────────────────────────

    // run() does NOT start get-spec — ONBAS skips user-input nodes
    const run1 = await handle.run();

    console.log('━━━ Section 3: User-Input Node ━━━');
    console.log(`→ run() actions:   ${run1.actions.length} (ONBAS skips user-input nodes)`);
    console.log(`→ stop reason:     ${run1.stopReason}`);

    // User completes get-spec manually (simulating CLI flow)
    await service.startNode(ctx, SLUG, getSpecId);
    await service.raiseNodeEvent(ctx, SLUG, getSpecId, 'node:accepted', {}, 'agent');
    await service.saveOutputData(ctx, SLUG, getSpecId, 'spec', 'Build a TODO app with auth');
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      getSpecId,
      'node:completed',
      { message: 'User provided spec' },
      'agent'
    );

    console.log('→ User completed get-spec manually:');
    console.log('    startNode → node:accepted → saveOutputData → node:completed');
    console.log('→ Output data saved: spec = "Build a TODO app with auth"');
    console.log();

    // ──────────────────────────────────────────────────────────────────────
    // Section 4: Serial Agents + Input Wiring
    //
    // With get-spec complete and its output data saved, the researcher's
    // spec input is now available (Gate 4 passes). ONBAS finds researcher
    // ready and returns start-node. After researcher completes with output
    // data, reviewer starts as the serial successor.
    // ──────────────────────────────────────────────────────────────────────

    const run2 = await handle.run();

    console.log('━━━ Section 4: Serial Agents + Input Wiring ━━━');
    console.log(`→ run() actions: ${run2.actions.length} (start researcher)`);
    console.log(
      `→ action:        start-node ${(run2.actions[0]?.request as { nodeId: string }).nodeId}`
    );
    console.log('→ researcher started because spec input from get-spec is available');

    // Complete researcher with output data for downstream wiring
    await service.raiseNodeEvent(ctx, SLUG, researcherId, 'node:accepted', {}, 'agent');
    await service.saveOutputData(
      ctx,
      SLUG,
      researcherId,
      'research',
      'Research findings: use Next.js + Prisma'
    );
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      researcherId,
      'node:completed',
      { message: 'Research done' },
      'agent'
    );

    console.log('→ researcher completed with research output saved');

    // run() starts reviewer (research input from researcher resolves)
    const run3 = await handle.run();

    console.log(`→ run() actions: ${run3.actions.length} (start reviewer)`);
    console.log(
      `→ action:        start-node ${(run3.actions[0]?.request as { nodeId: string }).nodeId}`
    );
    console.log('→ reviewer started because research input from researcher is available');
    console.log();

    // ──────────────────────────────────────────────────────────────────────
    // Section 5: Manual Transition Gate
    //
    // Line 1 has transition='manual'. Even after all Line 1 nodes complete,
    // Line 2 is blocked until the gate is triggered. run() returns no-action.
    // After triggerTransition(), run() starts the first ready node on Line 2.
    // ──────────────────────────────────────────────────────────────────────

    // Complete reviewer
    await service.raiseNodeEvent(ctx, SLUG, reviewerId, 'node:accepted', {}, 'agent');
    await service.saveOutputData(ctx, SLUG, reviewerId, 'review', 'Looks good, proceed');
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      reviewerId,
      'node:completed',
      { message: 'Review done' },
      'agent'
    );

    // run() returns no-action — line 2 blocked by manual transition on line 1
    const run4 = await handle.run();

    console.log('━━━ Section 5: Manual Transition Gate ━━━');
    console.log('→ Line 1 complete (researcher + reviewer both done)');
    console.log(`→ run() actions: ${run4.actions.length} (blocked by manual gate on line 1)`);
    console.log(`→ stop reason:   ${run4.stopReason}`);

    // Trigger the manual transition
    await service.triggerTransition(ctx, SLUG, line1Id);

    // run() now starts coder on line 2
    const run5 = await handle.run();

    console.log('→ Manual transition triggered on line 1');
    console.log(`→ run() actions: ${run5.actions.length} (coder starts on line 2)`);
    console.log(
      `→ action:        start-node ${(run5.actions[0]?.request as { nodeId: string }).nodeId}`
    );
    console.log();

    // ──────────────────────────────────────────────────────────────────────
    // Section 6: Question/Answer/Restart Lifecycle
    //
    // This is the most complex pattern. The coder agent:
    //   1. Accepts the node (starting → agent-accepted)
    //   2. Asks a question (agent-accepted → waiting-question)
    //   3. Orchestration loop sees waiting-question → no-action
    //   4. We inspect settlement and event stamps explicitly
    //   5. Human answers the question (status STAYS waiting-question)
    //   6. node:restart transitions to restart-pending
    //   7. run() restarts the node (restart-pending → ready → starting)
    //   8. Agent re-accepts and completes with output data
    // ──────────────────────────────────────────────────────────────────────

    console.log('━━━ Section 6: Question/Answer/Restart ━━━');

    // Step 1: Coder accepts
    await service.raiseNodeEvent(ctx, SLUG, coderId, 'node:accepted', {}, 'agent');
    console.log('→ Step 1: coder accepted (starting → agent-accepted)');

    // Step 2: Coder asks a question
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      coderId,
      'question:ask',
      {
        question_id: 'q-001',
        type: 'text',
        text: 'Should I use TypeScript or JavaScript?',
      },
      'agent'
    );
    console.log('→ Step 2: coder asked question q-001 (agent-accepted → waiting-question)');

    // Step 3: Orchestration loop observes waiting-question
    const run6 = await handle.run();
    console.log(`→ Step 3: run() returned ${run6.actions.length} actions, stop=${run6.stopReason}`);
    console.log('    (all-waiting — coder is waiting-question, no nodes to start)');

    // Step 4: Inspect settlement results via explicit processGraph
    const stateBeforeAnswer = await service.loadGraphState(ctx, SLUG);
    const settleResult = ehs.processGraph(stateBeforeAnswer, 'example-verifier', 'cli');
    await service.persistGraphState(ctx, SLUG, stateBeforeAnswer);

    console.log(`→ Step 4: processGraph (subscriber='example-verifier'):`);
    console.log(`    nodesVisited:       ${settleResult.nodesVisited}`);
    console.log(`    eventsProcessed:    ${settleResult.eventsProcessed}`);
    console.log(`    handlerInvocations: ${settleResult.handlerInvocations}`);

    // Show event stamps for coder
    const stateForStamps = await service.loadGraphState(ctx, SLUG);
    const coderEvents = stateForStamps.nodes?.[coderId]?.events ?? [];
    console.log(`→ Event stamps for coder (${coderEvents.length} events):`);
    console.log('    EVENT ID             TYPE                  SOURCE        STAMPS');
    for (const event of coderEvents) {
      const stamps = event.stamps ?? {};
      const subscriberNames = Object.keys(stamps).join(', ') || '(none)';
      console.log(
        `    ${event.event_id.substring(0, 18).padEnd(20)}` +
          `${event.event_type.padEnd(22)}` +
          `${event.source.padEnd(14)}` +
          `${subscriberNames}`
      );
    }

    // Step 5: Human answers the question
    const askEvent = coderEvents.find((e) => e.event_type === 'question:ask');
    const askEventId = askEvent?.event_id ?? '';
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      coderId,
      'question:answer',
      {
        question_event_id: askEventId,
        answer: 'Use TypeScript',
      },
      'human'
    );
    console.log('→ Step 5: answered question (answer: "Use TypeScript")');
    console.log('    Status: STILL waiting-question (answer does NOT transition status)');

    // Step 6: Raise node:restart
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      coderId,
      'node:restart',
      { reason: 'Question answered' },
      'orchestrator'
    );
    console.log('→ Step 6: raised node:restart (waiting-question → restart-pending)');

    // Step 7: run() restarts the node
    const run7 = await handle.run();
    console.log(
      `→ Step 7: run() returned ${run7.actions.length} action (restart-pending → ready → starting)`
    );
    if (run7.actions.length > 0) {
      console.log(
        `    action: start-node ${(run7.actions[0]?.request as { nodeId: string }).nodeId}`
      );
    }

    // Step 8: Agent re-accepts and completes with output data
    await service.raiseNodeEvent(ctx, SLUG, coderId, 'node:accepted', {}, 'agent');
    await service.saveOutputData(ctx, SLUG, coderId, 'code', 'console.log("Hello, TypeScript!")');
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      coderId,
      'node:completed',
      { message: 'Code written with TypeScript' },
      'agent'
    );
    console.log('→ Step 8: coder re-accepted, saved code output, completed');
    console.log();

    // ──────────────────────────────────────────────────────────────────────
    // Section 7: Code Node
    //
    // The tester node has type='code'. ONBAS makes no distinction — it
    // returns start-node when ready, just like agent nodes. The difference
    // is in ODS: unitType='code' creates a CodePod with FakeScriptRunner
    // instead of an AgentPod with FakeAgentAdapter.
    // ──────────────────────────────────────────────────────────────────────

    const run8 = await handle.run();

    console.log('━━━ Section 7: Code Node ━━━');
    console.log(`→ run() actions: ${run8.actions.length} (start tester)`);
    if (run8.actions.length > 0) {
      console.log(
        `→ action:        start-node ${(run8.actions[0]?.request as { nodeId: string }).nodeId}`
      );
    }
    console.log('→ ODS dispatched CodePod (FakeScriptRunner, not AgentPod)');

    // Complete tester via events (same lifecycle, different pod type)
    await service.raiseNodeEvent(ctx, SLUG, testerId, 'node:accepted', {}, 'agent');
    await service.saveOutputData(ctx, SLUG, testerId, 'test_results', 'All 42 tests pass');
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      testerId,
      'node:completed',
      { message: 'Tests passed' },
      'agent'
    );
    console.log('→ tester completed with test_results output saved');
    console.log();

    // ──────────────────────────────────────────────────────────────────────
    // Section 8: Parallel Execution + Serial Gate
    //
    // par-a and par-b are both parallel nodes on Line 3. ONBAS iterates:
    // one action per call, the loop starts a node, re-settles, and asks
    // again. Two ready parallel nodes → two iterations → two start-node
    // actions in one run() call. The serial successor (final) waits until
    // both parallel nodes complete.
    // ──────────────────────────────────────────────────────────────────────

    const run9 = await handle.run();

    console.log('━━━ Section 8: Parallel Execution + Serial Gate ━━━');
    console.log(`→ run() actions: ${run9.actions.length} (start par-a and par-b)`);
    for (const action of run9.actions) {
      console.log(`→ action:        start-node ${(action.request as { nodeId: string }).nodeId}`);
    }
    console.log('→ final NOT started (serial successor, left neighbor par-b not complete)');

    // Complete par-a
    await service.raiseNodeEvent(ctx, SLUG, parAId, 'node:accepted', {}, 'agent');
    await service.saveOutputData(ctx, SLUG, parAId, 'result_a', 'Alignment checks pass');
    await service.raiseNodeEvent(ctx, SLUG, parAId, 'node:completed', { message: 'Done' }, 'agent');
    console.log('→ par-a completed');

    // run() — final still blocked (par-b not complete)
    const run10 = await handle.run();
    console.log(
      `→ run() actions: ${run10.actions.length} (final still blocked, par-b not complete)`
    );

    // Complete par-b
    await service.raiseNodeEvent(ctx, SLUG, parBId, 'node:accepted', {}, 'agent');
    await service.saveOutputData(ctx, SLUG, parBId, 'result_b', 'PR prepared and ready');
    await service.raiseNodeEvent(ctx, SLUG, parBId, 'node:completed', { message: 'Done' }, 'agent');
    console.log('→ par-b completed');

    // run() starts final (serial successor, left neighbor par-b now complete)
    const run11 = await handle.run();
    console.log(`→ run() actions: ${run11.actions.length} (start final)`);
    if (run11.actions.length > 0) {
      console.log(
        `→ action:        start-node ${(run11.actions[0]?.request as { nodeId: string }).nodeId}`
      );
    }
    console.log();

    // ──────────────────────────────────────────────────────────────────────
    // Section 9: Graph Complete + Full Reality
    //
    // After completing the final node, ONBAS finds all 8 nodes complete
    // and returns graph-complete. The reality snapshot shows the full
    // state of every node.
    // ──────────────────────────────────────────────────────────────────────

    // Complete final
    await service.raiseNodeEvent(ctx, SLUG, finalId, 'node:accepted', {}, 'agent');
    await service.raiseNodeEvent(
      ctx,
      SLUG,
      finalId,
      'node:completed',
      { message: 'All done' },
      'agent'
    );

    const run12 = await handle.run();
    const reality = await handle.getReality();

    console.log('━━━ Section 9: Graph Complete ━━━');
    console.log(`→ Stop reason:      ${run12.stopReason}`);
    console.log(`→ Actions:          ${run12.actions.length} (nothing to start)`);
    console.log(`→ Graph status:     ${reality.graphStatus}`);
    console.log(`→ Total nodes:      ${reality.totalNodes}`);
    console.log(`→ Completed:        ${reality.completedCount}`);
    console.log(`→ isComplete:       ${reality.isComplete}`);
    console.log(`→ Current line idx: ${reality.currentLineIndex} (past-the-end sentinel)`);
    console.log();
    console.log('→ Reality snapshot:');
    console.log('    NODE              TYPE         STATUS     LINE  POS   EXEC      READY');
    for (const [nodeId, node] of reality.nodes) {
      console.log(
        `    ${node.unitSlug.padEnd(18)}` +
          `${node.unitType.padEnd(13)}` +
          `${node.status.padEnd(11)}` +
          `${String(node.lineIndex).padEnd(6)}` +
          `${String(node.positionInLine).padEnd(6)}` +
          `${node.execution.padEnd(10)}` +
          `${String(node.ready)}`
      );
    }
    console.log();
    console.log(
      `→ Agent adapter called ${agentAdapter.getRunHistory().length} time(s) (fire-and-forget)`
    );
    console.log(
      `→ Script runner called ${scriptRunner.getRunHistory().length} time(s) (tester only)`
    );
    console.log();

    // ──────────────────────────────────────────────────────────────────────
    // Section 10: Settlement Idempotency Proof
    //
    // processGraph() is idempotent per subscriber. The first call with a
    // new subscriber stamps all events (eventsProcessed > 0). The second
    // call with the same subscriber finds zero unstamped events. This is
    // how multi-subscriber event processing works: each consumer processes
    // every event exactly once.
    // ──────────────────────────────────────────────────────────────────────

    const finalState = await service.loadGraphState(ctx, SLUG);
    const firstPass = ehs.processGraph(finalState, 'idempotency-check', 'cli');
    await service.persistGraphState(ctx, SLUG, finalState);

    // Second call with same subscriber — should find zero unstamped events
    const finalState2 = await service.loadGraphState(ctx, SLUG);
    const secondPass = ehs.processGraph(finalState2, 'idempotency-check', 'cli');

    console.log('━━━ Section 10: Settlement Idempotency Proof ━━━');
    console.log(`→ First processGraph('idempotency-check'):`);
    console.log(`    eventsProcessed: ${firstPass.eventsProcessed} (all events stamped)`);
    console.log(`→ Second processGraph('idempotency-check'):`);
    console.log(`    eventsProcessed: ${secondPass.eventsProcessed} (zero — already stamped)`);
    console.log(
      `→ Proof: ${secondPass.eventsProcessed === 0 ? 'PASS' : 'FAIL'} — idempotency holds`
    );
    console.log();
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  // ──────────────────────────────────────────────────────────────────────

  console.log('━━━ Done ━━━');
  console.log('Walked through 10 orchestration patterns:');
  console.log('    1. Stack wiring (7 real collaborators + 2 fakes)');
  console.log('    2. Graph creation (4 lines, 8 nodes, 5 input wirings)');
  console.log('    3. User-input node (ONBAS skip, manual completion)');
  console.log('    4. Serial agents + input wiring (Gate 4 resolution)');
  console.log('    5. Manual transition gate (line-level blocking)');
  console.log('    6. Question/answer/restart lifecycle (8-step mega-lifecycle)');
  console.log('    7. Code node (CodePod with FakeScriptRunner)');
  console.log('    8. Parallel execution + serial gate');
  console.log('    9. Graph complete (8/8 nodes, full reality snapshot)');
  console.log('   10. Settlement idempotency (per-subscriber processing)');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\n--- EXAMPLE FAILED ---');
    console.error(err);
    process.exit(1);
  }
);
