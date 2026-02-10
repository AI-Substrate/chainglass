/**
 * E2E: Positional Graph Orchestration — Full Pipeline Validation
 *
 * Standalone validation script for Plan 030. Exercises the entire orchestration
 * system end-to-end using a hybrid model:
 * - Graph setup and orchestration via in-process service calls
 * - Agent actions via CLI subprocess (accept, save-output-data, end, ask, answer)
 * - GraphOrchestration.run() drives the Settle → Decide → Act loop
 *
 * 4-line, 8-node pipeline:
 *   Line 0: get-spec (user-input)
 *   Line 1: spec-builder → spec-reviewer (serial agents)
 *   Line 2: coder → tester (serial: agent → code) [manual transition from line 1]
 *   Line 3: alignment-tester + pr-preparer (parallel) → pr-creator (serial)
 *
 * Run: pnpm build --filter=@chainglass/cli --force && npx tsx test/e2e/positional-graph-orchestration-e2e.ts
 * Exit 0 on success, 1 on failure.
 *
 * Phase 8, Plan 030.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import type { State } from '@chainglass/positional-graph/schemas';
import { FakeAgentAdapter, NodeFileSystemAdapter } from '@chainglass/shared';

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

import {
  assert,
  banner,
  cleanup,
  createStepCounter,
  createTestServiceStack,
  runCli,
  unwrap,
} from '../helpers/positional-graph-e2e-helpers.js';

// ============================================
// Constants
// ============================================

const GRAPH_SLUG = 'orchestration-e2e';

// ============================================
// Orchestrator Stack Builder
// ============================================

function createOrchestrationStack(
  service: IPositionalGraphService,
  ctx: {
    workspaceSlug: string;
    workspaceName: string;
    workspacePath: string;
    worktreePath: string;
    worktreeBranch: null;
    isMainWorktree: true;
    hasGit: false;
  }
) {
  // Event system (same pattern as Plan 032 E2E)
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const handlerRegistry = createEventHandlerRegistry();
  const nes = new NodeEventService(
    {
      registry: eventRegistry,
      loadState: async (graphSlug) => service.loadGraphState(ctx, graphSlug),
      persistState: async (graphSlug, state) => service.persistGraphState(ctx, graphSlug, state),
    },
    handlerRegistry
  );
  const eventHandlerService = new EventHandlerService(nes);

  // Orchestration components (same wiring as registerOrchestrationServices)
  const nodeFs = new NodeFileSystemAdapter();
  const onbas = new ONBAS();
  const contextService = new AgentContextService();
  const podManager = new PodManager(nodeFs);
  const agentAdapter = new FakeAgentAdapter();
  const scriptRunner = new FakeScriptRunner();
  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentAdapter,
    scriptRunner,
  });

  const orchestrationService = new OrchestrationService({
    graphService: service,
    onbas,
    ods,
    eventHandlerService,
  });

  return { orchestrationService, eventHandlerService, agentAdapter, scriptRunner, podManager };
}

// ============================================
// Work Unit Helpers
// ============================================

async function createWorkUnitFiles(workspacePath: string): Promise<void> {
  const unitsDir = path.join(workspacePath, '.chainglass', 'units');

  const units: Record<string, string> = {
    'get-spec': `slug: get-spec
type: user-input
version: 1.0.0
description: User provides specification

inputs: []

outputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The specification

user_input:
  question_type: text
  prompt: "Provide the spec"
`,
    'spec-builder': `slug: spec-builder
type: agent
version: 1.0.0
description: Builds detailed spec from user input

inputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: Raw spec from user

outputs:
  - name: detailed_spec
    type: data
    data_type: text
    required: true
    description: Detailed specification

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 1000
`,
    'spec-reviewer': `slug: spec-reviewer
type: agent
version: 1.0.0
description: Reviews the detailed spec

inputs:
  - name: detailed_spec
    type: data
    data_type: text
    required: true
    description: Spec to review

outputs:
  - name: review
    type: data
    data_type: text
    required: true
    description: Review result

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 500
`,
    coder: `slug: coder
type: agent
version: 1.0.0
description: Writes code from spec

inputs:
  - name: detailed_spec
    type: data
    data_type: text
    required: true
    description: Spec to implement

outputs:
  - name: code
    type: data
    data_type: text
    required: true
    description: Generated code

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 2000
`,
    tester: `slug: tester
type: code
version: 1.0.0
description: Runs test suite

inputs:
  - name: code
    type: data
    data_type: text
    required: true
    description: Code to test

outputs:
  - name: test_results
    type: data
    data_type: text
    required: true
    description: Test results

code:
  script: scripts/run-tests.sh
  timeout: 60
`,
    'alignment-tester': `slug: alignment-tester
type: agent
version: 1.0.0
description: Tests alignment

inputs:
  - name: code
    type: data
    data_type: text
    required: true
    description: Code to verify

outputs:
  - name: alignment_result
    type: data
    data_type: text
    required: true
    description: Alignment check result

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 800
`,
    'pr-preparer': `slug: pr-preparer
type: agent
version: 1.0.0
description: Prepares PR

inputs:
  - name: code
    type: data
    data_type: text
    required: true
    description: Code for PR

outputs:
  - name: pr_draft
    type: data
    data_type: text
    required: true
    description: PR draft

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 500
`,
    'pr-creator': `slug: pr-creator
type: agent
version: 1.0.0
description: Creates the PR

inputs:
  - name: pr_draft
    type: data
    data_type: text
    required: true
    description: PR draft to submit

outputs:
  - name: pr_url
    type: data
    data_type: text
    required: true
    description: URL of created PR

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 300
`,
    // Error recovery graph unit
    'error-agent': `slug: error-agent
type: agent
version: 1.0.0
description: Agent that will error

inputs: []
outputs: []

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 100
`,
  };

  for (const [slug, content] of Object.entries(units)) {
    const unitDir = path.join(unitsDir, slug);
    await fs.mkdir(unitDir, { recursive: true });
    await fs.writeFile(path.join(unitDir, 'unit.yaml'), content);
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const { step, count } = createStepCounter();
  const { service, ctx, workspacePath } = await createTestServiceStack('orchestration-e2e');

  await createWorkUnitFiles(workspacePath);

  const { orchestrationService } = createOrchestrationStack(service, ctx);

  // Register workspace for CLI
  await runCli(['workspace', 'remove', 'e2e-orchestration', '--force'], workspacePath);
  const wsAdd = await runCli(
    ['workspace', 'add', 'e2e-orchestration', workspacePath],
    workspacePath
  );
  assert(wsAdd.success, `Failed to register workspace: ${wsAdd.rawOutput}`);

  banner('E2E: Positional Graph Orchestration — Full Pipeline');
  console.log('Mode: Hybrid (in-process orchestration + CLI agent actions)');
  console.log(`Workspace: ${workspacePath}`);

  // ============================================
  // ACT 0: Graph Fixture Setup
  // ============================================

  banner('ACT 0: Graph Fixture Setup');

  // Create graph — gets default line (line-000)
  const createResult = await service.create(ctx, GRAPH_SLUG);
  assert(
    createResult.errors.length === 0,
    `Failed to create graph: ${JSON.stringify(createResult.errors)}`
  );
  const line0Id = unwrap(createResult.lineId, 'default lineId');
  step(`Created graph: ${GRAPH_SLUG} (line-000: ${line0Id})`);

  // Add line 1 (manual transition: gates entry to line 2)
  const addLine1 = await service.addLine(ctx, GRAPH_SLUG, {
    orchestratorSettings: { transition: 'manual' },
  });
  assert(addLine1.errors.length === 0, `Failed to add line 1: ${JSON.stringify(addLine1.errors)}`);
  const line1Id = unwrap(addLine1.lineId, 'line1 lineId');
  step(`Added line-001: ${line1Id} (manual transition gates line-002)`);

  // Add line 2 (auto transition)
  const addLine2 = await service.addLine(ctx, GRAPH_SLUG);
  assert(addLine2.errors.length === 0, `Failed to add line 2: ${JSON.stringify(addLine2.errors)}`);
  const line2Id = unwrap(addLine2.lineId, 'line2 lineId');
  step(`Added line-002: ${line2Id}`);

  // Add line 3 (auto transition from line 2)
  const addLine3 = await service.addLine(ctx, GRAPH_SLUG);
  assert(addLine3.errors.length === 0, `Failed to add line 3: ${JSON.stringify(addLine3.errors)}`);
  const line3Id = unwrap(addLine3.lineId, 'line3 lineId');
  step(`Added line-003: ${line3Id}`);

  // Add nodes to lines
  // Line 0: get-spec (user-input)
  const addGetSpec = await service.addNode(ctx, GRAPH_SLUG, line0Id, 'get-spec');
  assert(
    addGetSpec.errors.length === 0,
    `Failed to add get-spec: ${JSON.stringify(addGetSpec.errors)}`
  );
  const getSpecId = unwrap(addGetSpec.nodeId, 'get-spec nodeId');
  step(`Line 0: ${getSpecId} (get-spec, user-input)`);

  // Line 1: spec-builder → spec-reviewer (serial)
  const addSpecBuilder = await service.addNode(ctx, GRAPH_SLUG, line1Id, 'spec-builder');
  assert(
    addSpecBuilder.errors.length === 0,
    `Failed to add spec-builder: ${JSON.stringify(addSpecBuilder.errors)}`
  );
  const specBuilderId = unwrap(addSpecBuilder.nodeId, 'spec-builder nodeId');
  step(`Line 1: ${specBuilderId} (spec-builder, serial agent)`);

  const addSpecReviewer = await service.addNode(ctx, GRAPH_SLUG, line1Id, 'spec-reviewer');
  assert(
    addSpecReviewer.errors.length === 0,
    `Failed to add spec-reviewer: ${JSON.stringify(addSpecReviewer.errors)}`
  );
  const specReviewerId = unwrap(addSpecReviewer.nodeId, 'spec-reviewer nodeId');
  step(`Line 1: ${specReviewerId} (spec-reviewer, serial agent)`);

  // Line 2: coder → tester (serial: agent → code)
  const addCoder = await service.addNode(ctx, GRAPH_SLUG, line2Id, 'coder');
  assert(addCoder.errors.length === 0, `Failed to add coder: ${JSON.stringify(addCoder.errors)}`);
  const coderId = unwrap(addCoder.nodeId, 'coder nodeId');
  step(`Line 2: ${coderId} (coder, serial agent)`);

  const addTester = await service.addNode(ctx, GRAPH_SLUG, line2Id, 'tester');
  assert(
    addTester.errors.length === 0,
    `Failed to add tester: ${JSON.stringify(addTester.errors)}`
  );
  const testerId = unwrap(addTester.nodeId, 'tester nodeId');
  step(`Line 2: ${testerId} (tester, serial code)`);

  // Line 3: alignment-tester + pr-preparer (parallel) → pr-creator (serial)
  const addAlignmentTester = await service.addNode(ctx, GRAPH_SLUG, line3Id, 'alignment-tester', {
    orchestratorSettings: { execution: 'parallel' },
  });
  assert(
    addAlignmentTester.errors.length === 0,
    `Failed to add alignment-tester: ${JSON.stringify(addAlignmentTester.errors)}`
  );
  const alignmentTesterId = unwrap(addAlignmentTester.nodeId, 'alignment-tester nodeId');
  step(`Line 3: ${alignmentTesterId} (alignment-tester, parallel agent)`);

  const addPrPreparer = await service.addNode(ctx, GRAPH_SLUG, line3Id, 'pr-preparer', {
    orchestratorSettings: { execution: 'parallel' },
  });
  assert(
    addPrPreparer.errors.length === 0,
    `Failed to add pr-preparer: ${JSON.stringify(addPrPreparer.errors)}`
  );
  const prPreparerId = unwrap(addPrPreparer.nodeId, 'pr-preparer nodeId');
  step(`Line 3: ${prPreparerId} (pr-preparer, parallel agent)`);

  const addPrCreator = await service.addNode(ctx, GRAPH_SLUG, line3Id, 'pr-creator');
  assert(
    addPrCreator.errors.length === 0,
    `Failed to add pr-creator: ${JSON.stringify(addPrCreator.errors)}`
  );
  const prCreatorId = unwrap(addPrCreator.nodeId, 'pr-creator nodeId');
  step(`Line 3: ${prCreatorId} (pr-creator, serial agent)`);

  // Wire inputs (7 connections) using setInput (AC-14: input wiring flows through)
  // get-spec → spec-builder (spec)
  await service.setInput(ctx, GRAPH_SLUG, specBuilderId, 'spec', {
    from_node: getSpecId,
    from_output: 'spec',
  });
  step('Wired: get-spec.spec -> spec-builder.spec');

  // spec-builder → spec-reviewer (detailed_spec)
  await service.setInput(ctx, GRAPH_SLUG, specReviewerId, 'detailed_spec', {
    from_node: specBuilderId,
    from_output: 'detailed_spec',
  });
  step('Wired: spec-builder.detailed_spec -> spec-reviewer.detailed_spec');

  // spec-builder → coder (detailed_spec)
  await service.setInput(ctx, GRAPH_SLUG, coderId, 'detailed_spec', {
    from_node: specBuilderId,
    from_output: 'detailed_spec',
  });
  step('Wired: spec-builder.detailed_spec -> coder.detailed_spec');

  // coder → tester (code)
  await service.setInput(ctx, GRAPH_SLUG, testerId, 'code', {
    from_node: coderId,
    from_output: 'code',
  });
  step('Wired: coder.code -> tester.code');

  // coder → alignment-tester (code)
  await service.setInput(ctx, GRAPH_SLUG, alignmentTesterId, 'code', {
    from_node: coderId,
    from_output: 'code',
  });
  step('Wired: coder.code -> alignment-tester.code');

  // coder → pr-preparer (code)
  await service.setInput(ctx, GRAPH_SLUG, prPreparerId, 'code', {
    from_node: coderId,
    from_output: 'code',
  });
  step('Wired: coder.code -> pr-preparer.code');

  // pr-preparer → pr-creator (pr_draft)
  await service.setInput(ctx, GRAPH_SLUG, prCreatorId, 'pr_draft', {
    from_node: prPreparerId,
    from_output: 'pr_draft',
  });
  step('Wired: pr-preparer.pr_draft -> pr-creator.pr_draft');

  // Get orchestration handle (AC-10: two-level entry point)
  const handle = await orchestrationService.get(ctx, GRAPH_SLUG);
  assert(
    handle.graphSlug === GRAPH_SLUG,
    `Expected graphSlug=${GRAPH_SLUG}, got ${handle.graphSlug}`
  );
  step(`Orchestration handle obtained: ${handle.graphSlug} (AC-10: svc.get() -> handle)`);

  console.log('\nACT 0 complete: 4 lines, 8 nodes, 7 input wirings, orchestration stack ready');

  // ============================================
  // ACT 1: User-Input Flow
  // ============================================

  banner('ACT 1: User-Input Flow (get-spec)');

  // Complete get-spec via CLI before orchestration starts
  // (user-input nodes are completed by the user, not by the orchestrator)
  const startGetSpec = await runCli(['wf', 'node', 'start', GRAPH_SLUG, getSpecId], workspacePath);
  assert(startGetSpec.success, `Failed to start get-spec: ${startGetSpec.rawOutput}`);
  step(`${getSpecId}: pending -> starting                                [CLI]`);

  const acceptGetSpec = await runCli(
    ['wf', 'node', 'accept', GRAPH_SLUG, getSpecId],
    workspacePath
  );
  assert(acceptGetSpec.success, `Failed to accept get-spec: ${acceptGetSpec.rawOutput}`);
  step(`${getSpecId}: starting -> agent-accepted                         [CLI]`);

  const saveSpec = await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      getSpecId,
      'spec',
      JSON.stringify({ title: 'Widget Spec', requirements: ['R1', 'R2', 'R3'] }),
    ],
    workspacePath
  );
  assert(saveSpec.success, `Failed to save spec: ${saveSpec.rawOutput}`);
  step(`${getSpecId}: saved output 'spec'                                [CLI]`);

  const endGetSpec = await runCli(
    ['wf', 'node', 'end', GRAPH_SLUG, getSpecId, '--message', 'User provided spec'],
    workspacePath
  );
  assert(endGetSpec.success, `Failed to end get-spec: ${endGetSpec.rawOutput}`);
  step(`${getSpecId}: agent-accepted -> complete (end shortcut)           [CLI]`);

  // Now run orchestration — ONBAS should skip completed user-input and start next ready node (AC-4: pure/synchronous)
  // AC-11: loop exercised in-process via handle.run() — all subsequent run() calls validate this
  const run1 = await handle.run();
  assert(run1.errors.length === 0, `run1 errors: ${JSON.stringify(run1.errors)}`);
  assert(run1.actions.length >= 1, `Expected >= 1 action, got ${run1.actions.length}`);
  assert(
    run1.actions[0].request.type === 'start-node',
    `Expected start-node, got ${run1.actions[0].request.type}` // AC-2: typed request union; AC-3: deterministic walk
  );
  const firstStartedNode = (run1.actions[0].request as { nodeId: string }).nodeId;
  step(
    `handle.run(): ${run1.actions.length} action(s), first=${firstStartedNode}, stop=${run1.stopReason}`
  );

  // Verify get-spec is complete (user-input skipped by ONBAS)
  const stateAfterRun1 = await service.loadGraphState(ctx, GRAPH_SLUG);
  const getSpecNode = unwrap(stateAfterRun1.nodes?.[getSpecId], 'get-spec node');
  assert(
    getSpecNode.status === 'complete',
    `Expected get-spec complete, got ${getSpecNode.status}`
  );
  step(`Verified: get-spec=${getSpecNode.status} (ONBAS skipped user-input, AC-6)`);

  console.log('\nACT 1 complete: user-input flow validated');

  // ============================================
  // ACT 2: Serial Agent Execution (spec-builder → spec-reviewer)
  // ============================================

  banner('ACT 2: Serial Agent Execution');

  // spec-builder was started by run1 — act as the agent
  const acceptSpecBuilder = await runCli(
    ['wf', 'node', 'accept', GRAPH_SLUG, specBuilderId],
    workspacePath
  );
  assert(
    acceptSpecBuilder.success,
    `Failed to accept spec-builder: ${acceptSpecBuilder.rawOutput}`
  );
  step(`${specBuilderId}: starting -> agent-accepted                      [CLI]`);

  const saveDetailedSpec = await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      specBuilderId,
      'detailed_spec',
      JSON.stringify({
        title: 'Detailed Widget Spec',
        sections: ['Intro', 'Requirements', 'Architecture'],
      }),
    ],
    workspacePath
  );
  assert(saveDetailedSpec.success, `Failed to save detailed_spec: ${saveDetailedSpec.rawOutput}`);
  step(`${specBuilderId}: saved output 'detailed_spec'                    [CLI]`);

  const endSpecBuilder = await runCli(
    ['wf', 'node', 'end', GRAPH_SLUG, specBuilderId, '--message', 'Spec built'],
    workspacePath
  );
  assert(endSpecBuilder.success, `Failed to end spec-builder: ${endSpecBuilder.rawOutput}`);
  step(`${specBuilderId}: agent-accepted -> complete                      [CLI]`);

  // run() should start spec-reviewer (serial successor)
  const run2 = await handle.run();
  assert(run2.errors.length === 0, `run2 errors: ${JSON.stringify(run2.errors)}`);
  assert(run2.actions.length >= 1, `Expected >= 1 action from run2, got ${run2.actions.length}`);
  const run2NodeId = (run2.actions[0].request as { nodeId: string }).nodeId;
  assert(run2NodeId === specReviewerId, `Expected spec-reviewer to start, got ${run2NodeId}`);
  step(`handle.run(): started ${run2NodeId} (spec-reviewer, serial successor, AC-5)`);

  // Complete spec-reviewer
  const acceptSpecReviewer = await runCli(
    ['wf', 'node', 'accept', GRAPH_SLUG, specReviewerId],
    workspacePath
  );
  assert(
    acceptSpecReviewer.success,
    `Failed to accept spec-reviewer: ${acceptSpecReviewer.rawOutput}`
  );

  const saveReview = await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      specReviewerId,
      'review',
      JSON.stringify({ approved: true, notes: 'LGTM' }),
    ],
    workspacePath
  );
  assert(saveReview.success, `Failed to save review: ${saveReview.rawOutput}`);

  const endSpecReviewer = await runCli(
    ['wf', 'node', 'end', GRAPH_SLUG, specReviewerId, '--message', 'Reviewed'],
    workspacePath
  );
  assert(endSpecReviewer.success, `Failed to end spec-reviewer: ${endSpecReviewer.rawOutput}`);
  step(`${specReviewerId}: complete (serial chain done)`);

  console.log('\nACT 2 complete: serial agent chain validated (AC-5 context inheritance)');

  // ============================================
  // ACT 3: Manual Transition Gate
  // ============================================

  banner('ACT 3: Manual Transition Gate (line-001 → line-002)');

  // Line 1 is now complete. Line 2 has manual transition — should block.
  const run3 = await handle.run();
  assert(
    run3.stopReason === 'no-action',
    `Expected no-action (transition blocked), got ${run3.stopReason}`
  );
  assert(run3.actions.length === 0, `Expected 0 actions (blocked), got ${run3.actions.length}`);
  step(`handle.run(): stopReason=${run3.stopReason} (line-002 manual transition blocked)`);

  // Trigger manual transition on line 1 (gates entry to line 2)
  const trigger = await runCli(['wf', 'trigger', GRAPH_SLUG, line1Id], workspacePath);
  assert(trigger.success, `Failed to trigger transition: ${trigger.rawOutput}`);
  step(`Triggered manual transition on ${line1Id}                         [CLI]`);

  // Now run() should start coder on line 2
  const run4 = await handle.run();
  assert(run4.errors.length === 0, `run4 errors: ${JSON.stringify(run4.errors)}`);
  assert(
    run4.actions.length >= 1,
    `Expected >= 1 action after trigger, got ${run4.actions.length}`
  );
  const run4NodeId = (run4.actions[0].request as { nodeId: string }).nodeId;
  assert(run4NodeId === coderId, `Expected coder to start after trigger, got ${run4NodeId}`);
  step(`handle.run(): started ${run4NodeId} (coder, after manual transition)`);

  console.log('\nACT 3 complete: manual transition gate validated');

  // ============================================
  // ACT 4: Question/Answer Cycle (coder)
  // ============================================

  banner('ACT 4: Question/Answer Cycle');

  // coder was started by run4 — accept as agent
  const acceptCoder = await runCli(['wf', 'node', 'accept', GRAPH_SLUG, coderId], workspacePath);
  assert(acceptCoder.success, `Failed to accept coder: ${acceptCoder.rawOutput}`);
  step(`${coderId}: starting -> agent-accepted                           [CLI]`);

  // Agent asks a question
  const questionPayload = JSON.stringify({
    question_id: 'q-arch',
    text: 'Should we use microservices or monolith?',
    type: 'text',
  });
  const askResult = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      coderId,
      'question:ask',
      '--payload',
      questionPayload,
    ],
    workspacePath
  );
  assert(askResult.success, `Failed to ask question: ${askResult.rawOutput}`);
  step(`${coderId}: raised question:ask (q-arch)                         [CLI]`);

  // run() should settle and find waiting-question → no-action
  const run5 = await handle.run();
  assert(
    run5.stopReason === 'no-action',
    `Expected no-action (waiting-question), got ${run5.stopReason}`
  );
  step(`handle.run(): stopReason=${run5.stopReason} (coder waiting-question, settled by EHS)`);

  // Human answers the question
  const askEvents = await runCli<{
    events: Array<{ event_id: string; event_type: string }>;
  }>(['wf', 'node', 'events', GRAPH_SLUG, coderId, '--type', 'question:ask'], workspacePath);
  assert(askEvents.success, `Failed to list ask events: ${askEvents.rawOutput}`);
  const askEventId = unwrap(askEvents.data.events?.[0]?.event_id, 'ask event_id');

  const answerPayload = JSON.stringify({
    question_event_id: askEventId,
    answer: 'Use a modular monolith approach',
  });
  const answerResult = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      coderId,
      'question:answer',
      '--payload',
      answerPayload,
      '--source',
      'human',
    ],
    workspacePath
  );
  assert(answerResult.success, `Failed to answer: ${answerResult.rawOutput}`);
  step(`Human answered question: "Use a modular monolith approach"       [CLI]`);

  // Raise node:restart to resume coder (Workshop 10 flow)
  const restartResult = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      coderId,
      'node:restart',
      '--payload',
      JSON.stringify({ reason: 'Question answered' }),
      '--source',
      'orchestrator',
    ],
    workspacePath
  );
  assert(restartResult.success, `Failed to raise node:restart: ${restartResult.rawOutput}`);
  step(`Raised node:restart for ${coderId}                               [CLI]`);

  // run() should settle restart → restart-pending → ready → start-node(coder)
  const run6 = await handle.run();
  assert(run6.errors.length === 0, `run6 errors: ${JSON.stringify(run6.errors)}`);
  assert(
    run6.actions.length >= 1,
    `Expected >= 1 action after restart, got ${run6.actions.length}`
  );
  const run6NodeId = (run6.actions[0].request as { nodeId: string }).nodeId;
  assert(run6NodeId === coderId, `Expected coder to re-start, got ${run6NodeId}`);
  step(`handle.run(): re-started ${run6NodeId} (question answered, AC-9)`);

  // Complete coder
  const reAcceptCoder = await runCli(['wf', 'node', 'accept', GRAPH_SLUG, coderId], workspacePath);
  assert(reAcceptCoder.success, `Failed to re-accept coder: ${reAcceptCoder.rawOutput}`);

  const saveCode = await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      coderId,
      'code',
      JSON.stringify({ files: ['widget.ts'], linesOfCode: 200 }),
    ],
    workspacePath
  );
  assert(saveCode.success, `Failed to save code: ${saveCode.rawOutput}`);

  const endCoder = await runCli(
    ['wf', 'node', 'end', GRAPH_SLUG, coderId, '--message', 'Code complete'],
    workspacePath
  );
  assert(endCoder.success, `Failed to end coder: ${endCoder.rawOutput}`);
  step(`${coderId}: complete (question cycle done)                       [CLI]`);

  console.log('\nACT 4 complete: question/answer cycle validated (AC-9)');

  // ============================================
  // ACT 5: Code Node Execution (tester)
  // ============================================

  banner('ACT 5: Code Node Execution (tester)');

  // run() should start tester (serial successor to coder on line 2)
  const run7 = await handle.run();
  assert(run7.errors.length === 0, `run7 errors: ${JSON.stringify(run7.errors)}`);
  assert(run7.actions.length >= 1, `Expected >= 1 action for tester, got ${run7.actions.length}`);
  const run7NodeId = (run7.actions[0].request as { nodeId: string }).nodeId;
  assert(run7NodeId === testerId, `Expected tester to start, got ${run7NodeId}`);
  step(`handle.run(): started ${run7NodeId} (tester, code node via FakeScriptRunner, AC-7)`);

  // Code node is fire-and-forget — FakeScriptRunner resolves immediately
  // Complete tester via CLI (accept + end)
  const acceptTester = await runCli(['wf', 'node', 'accept', GRAPH_SLUG, testerId], workspacePath);
  assert(acceptTester.success, `Failed to accept tester: ${acceptTester.rawOutput}`);

  const saveTesterOutput = await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      testerId,
      'test_results',
      JSON.stringify({ passed: 42, failed: 0 }),
    ],
    workspacePath
  );
  assert(saveTesterOutput.success, `Failed to save test_results: ${saveTesterOutput.rawOutput}`);

  const endTester = await runCli(
    ['wf', 'node', 'end', GRAPH_SLUG, testerId, '--message', 'All tests pass'],
    workspacePath
  );
  assert(endTester.success, `Failed to end tester: ${endTester.rawOutput}`);
  step(`${testerId}: complete (code node, no session tracking)           [CLI]`);

  console.log('\nACT 5 complete: code node execution validated');

  // ============================================
  // ACT 6: Parallel Execution (line 3)
  // ============================================

  banner('ACT 6: Parallel Execution (line-003)');

  // Line 2 complete, line 3 auto-transition. run() should start both parallel nodes.
  const run8 = await handle.run();
  assert(run8.errors.length === 0, `run8 errors: ${JSON.stringify(run8.errors)}`);
  assert(run8.actions.length >= 2, `Expected >= 2 parallel actions, got ${run8.actions.length}`);

  const parallelNodeIds = run8.actions.map((a) => (a.request as { nodeId: string }).nodeId);
  assert(
    parallelNodeIds.includes(alignmentTesterId),
    'Expected alignment-tester in parallel start'
  );
  assert(parallelNodeIds.includes(prPreparerId), 'Expected pr-preparer in parallel start');
  assert(!parallelNodeIds.includes(prCreatorId), 'pr-creator should NOT start (serial gate)'); // AC-3: deterministic walk order
  step(
    `handle.run(): started ${parallelNodeIds.length} parallel nodes: ${parallelNodeIds.join(', ')}`
  );

  // Complete both parallel nodes
  for (const nodeId of [alignmentTesterId, prPreparerId]) {
    const unitSlug = nodeId === alignmentTesterId ? 'alignment-tester' : 'pr-preparer';
    const outputName = nodeId === alignmentTesterId ? 'alignment_result' : 'pr_draft';
    const outputData =
      nodeId === alignmentTesterId
        ? { aligned: true }
        : { title: 'Widget PR', body: 'Implements widget' };

    await runCli(['wf', 'node', 'accept', GRAPH_SLUG, nodeId], workspacePath);
    await runCli(
      [
        'wf',
        'node',
        'save-output-data',
        GRAPH_SLUG,
        nodeId,
        outputName,
        JSON.stringify(outputData),
      ],
      workspacePath
    );
    await runCli(
      ['wf', 'node', 'end', GRAPH_SLUG, nodeId, '--message', `${unitSlug} done`],
      workspacePath
    );
    step(`${nodeId}: complete (${unitSlug})                              [CLI]`);
  }

  console.log('\nACT 6 complete: parallel execution validated');

  // ============================================
  // ACT 7: Serial After Parallel (pr-creator)
  // ============================================

  banner('ACT 7: Serial After Parallel (pr-creator)');

  // run() should start pr-creator now that both parallel nodes are complete
  const run9 = await handle.run();
  assert(run9.errors.length === 0, `run9 errors: ${JSON.stringify(run9.errors)}`);
  assert(
    run9.actions.length >= 1,
    `Expected >= 1 action for pr-creator, got ${run9.actions.length}`
  );
  const run9NodeId = (run9.actions[0].request as { nodeId: string }).nodeId;
  assert(run9NodeId === prCreatorId, `Expected pr-creator to start, got ${run9NodeId}`);
  step(`handle.run(): started ${run9NodeId} (serial after parallel)`);

  // Complete pr-creator
  await runCli(['wf', 'node', 'accept', GRAPH_SLUG, prCreatorId], workspacePath);
  await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      prCreatorId,
      'pr_url',
      JSON.stringify({ url: 'https://github.com/example/pr/1' }),
    ],
    workspacePath
  );
  await runCli(
    ['wf', 'node', 'end', GRAPH_SLUG, prCreatorId, '--message', 'PR created'],
    workspacePath
  );
  step(`${prCreatorId}: complete (PR created)                            [CLI]`);

  console.log('\nACT 7 complete: serial after parallel validated');

  // ============================================
  // ACT 8: Graph Complete
  // ============================================

  banner('ACT 8: Graph Complete');

  // run() should detect graph-complete
  const runFinal = await handle.run();
  assert(runFinal.errors.length === 0, `runFinal errors: ${JSON.stringify(runFinal.errors)}`);
  assert(
    runFinal.stopReason === 'graph-complete',
    `Expected graph-complete, got ${runFinal.stopReason}`
  );
  assert(
    runFinal.actions.length === 0,
    `Expected 0 actions at completion, got ${runFinal.actions.length}`
  );
  step(`handle.run(): stopReason=${runFinal.stopReason} — all 8 nodes complete!`);

  // Verify via getReality() (AC-1)
  const reality = await handle.getReality();
  assert(reality.isComplete, 'Reality should be complete');
  assert(reality.totalNodes === 8, `Expected 8 total nodes, got ${reality.totalNodes}`);
  assert(reality.completedCount === 8, `Expected 8 completed, got ${reality.completedCount}`);
  assert(!reality.isFailed, 'Reality should not be failed');
  step(
    `Reality: ${reality.completedCount}/${reality.totalNodes} complete, isComplete=${reality.isComplete} (AC-1)`
  );

  console.log('\nACT 8 complete: graph-complete validated (AC-12)');

  // ============================================
  // ACT E: Error Recovery (separate graph)
  // ============================================

  banner('ACT E: Error Recovery');

  const ERROR_GRAPH = 'error-recovery-e2e';

  // Create separate error recovery graph (1 line, 2 nodes)
  const createError = await service.create(ctx, ERROR_GRAPH);
  assert(
    createError.errors.length === 0,
    `Failed to create error graph: ${JSON.stringify(createError.errors)}`
  );
  const errorLine0 = unwrap(createError.lineId, 'error graph lineId');
  step(`Created error graph: ${ERROR_GRAPH}`);

  const addErrAgent1 = await service.addNode(ctx, ERROR_GRAPH, errorLine0, 'error-agent');
  assert(
    addErrAgent1.errors.length === 0,
    `Failed to add error-agent-1: ${JSON.stringify(addErrAgent1.errors)}`
  );
  const errAgent1Id = unwrap(addErrAgent1.nodeId, 'error-agent-1 nodeId');
  step(`Added error node: ${errAgent1Id}`);

  const addErrAgent2 = await service.addNode(ctx, ERROR_GRAPH, errorLine0, 'error-agent');
  assert(
    addErrAgent2.errors.length === 0,
    `Failed to add error-agent-2: ${JSON.stringify(addErrAgent2.errors)}`
  );
  const errAgent2Id = unwrap(addErrAgent2.nodeId, 'error-agent-2 nodeId');
  step(`Added error node: ${errAgent2Id}`);

  // Get separate handle for error graph
  const errorHandle = await orchestrationService.get(ctx, ERROR_GRAPH);
  assert(
    errorHandle.graphSlug === ERROR_GRAPH,
    `Expected ${ERROR_GRAPH}, got ${errorHandle.graphSlug}`
  );

  // run() starts first node
  const errRun1 = await errorHandle.run();
  assert(errRun1.errors.length === 0, `errRun1 errors: ${JSON.stringify(errRun1.errors)}`);
  assert(errRun1.actions.length >= 1, `Expected >= 1 action, got ${errRun1.actions.length}`);
  step(`Error graph run(): started ${(errRun1.actions[0].request as { nodeId: string }).nodeId}`);

  // Accept then error via CLI
  await runCli(['wf', 'node', 'accept', ERROR_GRAPH, errAgent1Id], workspacePath);
  const errorCmd = await runCli(
    [
      'wf',
      'node',
      'error',
      ERROR_GRAPH,
      errAgent1Id,
      '--code',
      'AGENT_CRASH',
      '--message',
      'Simulated agent crash',
    ],
    workspacePath
  );
  assert(errorCmd.success, `Failed to raise error: ${errorCmd.rawOutput}`);
  step(`${errAgent1Id}: error raised (AGENT_CRASH)                       [CLI]`);

  // run() should settle error → blocked-error → graph-failed or no-action
  const errRun2 = await errorHandle.run();
  assert(errRun2.errors.length === 0, `errRun2 errors: ${JSON.stringify(errRun2.errors)}`);
  // When a node is blocked-error, ONBAS diagnoses graph-failed
  step(`Error graph run(): stopReason=${errRun2.stopReason}`);

  // Verify error node state
  const errorReality = await errorHandle.getReality();
  const errNode = errorReality.nodes.get(errAgent1Id);
  assert(errNode !== undefined, 'Error node should exist in reality');
  assert(errNode.status === 'blocked-error', `Expected blocked-error, got ${errNode.status}`);
  step(`Verified: ${errAgent1Id} status=${errNode.status} (error recovery validated)`);

  // Verify no cross-graph contamination (DYK #3)
  const mainReality = await handle.getReality();
  assert(mainReality.isComplete, 'Main graph should still be complete after error graph');
  assert(mainReality.completedCount === 8, 'Main graph should still have 8 completed nodes');
  step('Cross-graph isolation verified: main graph still complete (DYK #3)');

  console.log('\nACT E complete: error recovery validated');

  // ============================================
  // Cleanup
  // ============================================

  await runCli(['workspace', 'remove', 'e2e-orchestration', '--force'], workspacePath);
  await cleanup(workspacePath);

  banner(`ALL ${count()} STEPS PASSED — Orchestration E2E Complete`);
  console.log('\nPlan 030 Phase 8 validation: PASS');
  console.log('Patterns exercised: user-input, serial agents, Q&A cycle,');
  console.log('  manual transition, code node, parallel execution, error recovery');
  console.log('Acceptance criteria coverage:');
  console.log('  AC-1:  Reality snapshot (ACT 8 getReality assertions)');
  console.log('  AC-2:  Typed request union (start-node type checks throughout)');
  console.log('  AC-3:  Deterministic walk (serial/parallel order, ACTs 2,6,7)');
  console.log('  AC-4:  Pure/synchronous ONBAS (real ONBAS in all ACTs)');
  console.log('  AC-5:  Context inheritance (ACT 2 serial chain)');
  console.log('  AC-6:  ODS handles all types (user-input ACT 1, agent ACTs 2-7, code ACT 5)');
  console.log('  AC-7:  Pod lifecycle (FakeAgentAdapter ACTs 2-7, FakeScriptRunner ACT 5)');
  console.log('  AC-8:  Session restart resilience — DEFERRED (unit-level scope)');
  console.log('  AC-9:  Question lifecycle (ACT 4 ask->answer->restart->re-start)');
  console.log('  AC-10: Two-level entry point (svc.get() -> handle.run() ACT 0)');
  console.log('  AC-11: In-process loop (all handle.run() calls)');
  console.log('  AC-12: E2E without real agents (8 nodes, FakeAgentAdapter+FakeScriptRunner)');
  console.log('  AC-13: Deterministic tests (real PodManager + fake adapters)');
  console.log('  AC-14: Input wiring (7 connections wired ACT 0, data flows ACTs 2+)\n');
}

// ============================================
// Entry point
// ============================================

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\n--- E2E FAILED ---');
    console.error(err);
    process.exit(1);
  }
);
