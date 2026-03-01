/**
 * E2E: Node Event System — Full Lifecycle Demo
 *
 * Standalone validation script for Plan 032. Exercises the entire node event
 * system end-to-end using a hybrid model:
 * - Graph/node setup via in-process service calls (orchestrator territory)
 * - Agent/Human event actions go through CLI (subprocess)
 * - Orchestrator settle phase calls EventHandlerService.processGraph in-process
 *
 * Two-node pipeline:
 *   spec-writer → code-builder
 *
 * Run: pnpm build --filter=@chainglass/cli && npx tsx test/e2e/node-event-system-visual-e2e.ts
 * Exit 0 on success, 1 on failure.
 *
 * Phase 8, Plan 032.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  EventHandlerService,
  FakeNodeEventRegistry,
  NodeEventService,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type { State } from '@chainglass/positional-graph/schemas';
import { WorkflowEventType } from '@chainglass/shared/workflow-events';

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

const GRAPH_SLUG = 'event-system-e2e';
const SUBSCRIBER_ORCHESTRATOR = 'orchestrator';
const SUBSCRIBER_E2E_VERIFIER = 'e2e-verifier';

// ============================================
// Orchestrator Stack (in-process)
// ============================================

function createOrchestratorStack(
  loadState: (graphSlug: string) => Promise<State>,
  persistState: (graphSlug: string, state: State) => Promise<void>
): EventHandlerService {
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const handlerRegistry = createEventHandlerRegistry();
  const nes = new NodeEventService(
    { registry: eventRegistry, loadState, persistState },
    handlerRegistry
  );
  return new EventHandlerService(nes);
}

// ============================================
// Work Unit Helpers
// ============================================

/**
 * Create minimal work unit YAML files so CLI commands that call workUnitLoader.load()
 * (e.g. `end`, `start`) can resolve unit definitions in the temp workspace.
 * Outputs match what we actually save via save-output-data during the E2E.
 */
async function createWorkUnitFiles(workspacePath: string): Promise<void> {
  const unitsDir = path.join(workspacePath, '.chainglass', 'units');

  const units: Record<string, string> = {
    'spec-writer': `slug: spec-writer
type: user-input
version: 1.0.0
description: E2E test — provides spec

inputs: []

outputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The specification output

user_input:
  question_type: text
  prompt: "Provide spec"
`,
    'code-builder': `slug: code-builder
type: agent
version: 1.0.0
description: E2E test — builds code from spec

inputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: Specification input

outputs:
  - name: code
    type: data
    data_type: text
    required: true
    description: Generated code output

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 1000
`,
    throwaway: `slug: throwaway
type: agent
version: 1.0.0
description: E2E test — throwaway node for error testing

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
  const { service, ctx, workspacePath } = await createTestServiceStack('node-event-e2e');

  // Create work unit definitions so CLI's workUnitLoader can resolve them
  await createWorkUnitFiles(workspacePath);

  // Build orchestrator with state I/O bound to this workspace
  const ehs = createOrchestratorStack(
    async (graphSlug) => service.loadGraphState(ctx, graphSlug),
    async (graphSlug, state) => service.persistGraphState(ctx, graphSlug, state)
  );

  // Register temp dir as a workspace so CLI commands can resolve context
  // Clean up stale registration from prior failed runs (ignore errors)
  await runCli(['workspace', 'remove', 'e2e-node-events', '--force'], workspacePath);
  const wsAdd = await runCli(['workspace', 'add', 'e2e-node-events', workspacePath], workspacePath);
  assert(wsAdd.success, `Failed to register workspace: ${wsAdd.rawOutput}`);

  banner('E2E: Node Event System — Full Lifecycle Demo');
  console.log('Mode: Hybrid (CLI for agent/human, in-process for orchestrator)');
  console.log(`Workspace: ${workspacePath}`);

  // ============================================
  // ACT 1: Setup & Discovery
  // ============================================

  banner('ACT 1: Setup & Discovery');

  // ── STEP 1: Create graph and add 2 nodes (in-process) ──
  // Node IDs are generated with random hex suffixes (e.g. spec-writer-a3f)
  console.log('\nSTEP 1: Create graph and add nodes                               [IN-PROCESS]');

  const createResult = await service.create(ctx, GRAPH_SLUG);
  assert(
    createResult.errors.length === 0,
    `Failed to create graph: ${JSON.stringify(createResult.errors)}`
  );
  const lineId = unwrap(createResult.lineId, 'lineId from create');
  step(`Created graph: ${GRAPH_SLUG} (default line: ${lineId})`);

  const addSpecWriter = await service.addNode(ctx, GRAPH_SLUG, lineId, 'spec-writer');
  assert(
    addSpecWriter.errors.length === 0,
    `Failed to add spec-writer: ${JSON.stringify(addSpecWriter.errors)}`
  );
  const specWriterId = unwrap(addSpecWriter.nodeId, 'spec-writer nodeId');
  step(`Added node: ${specWriterId} (unit: spec-writer)`);

  const addCodeBuilder = await service.addNode(ctx, GRAPH_SLUG, lineId, 'code-builder');
  assert(
    addCodeBuilder.errors.length === 0,
    `Failed to add code-builder: ${JSON.stringify(addCodeBuilder.errors)}`
  );
  const codeBuilderId = unwrap(addCodeBuilder.nodeId, 'code-builder nodeId');
  step(`Added node: ${codeBuilderId} (unit: code-builder)`);

  // ── STEP 2: Schema self-discovery ──
  console.log('\nSTEP 2: Schema self-discovery                                     [CLI]');

  const listTypes = await runCli<{ types: Array<{ type: string; domain: string }> }>(
    ['wf', 'node', 'event', 'list-types', GRAPH_SLUG, specWriterId],
    workspacePath
  );
  assert(listTypes.success, `list-types failed: ${listTypes.rawOutput}`);
  const types = listTypes.data.types ?? [];
  assert(types.length >= 6, `Expected >= 6 event types, got ${types.length}`);
  step(`list-types returned ${types.length} types: ${types.map((t) => t.type).join(', ')}`);

  const schemaResult = await runCli<{ schema: Record<string, unknown> }>(
    ['wf', 'node', 'event', 'schema', GRAPH_SLUG, specWriterId, 'question:ask'],
    workspacePath
  );
  assert(schemaResult.success, `schema failed: ${schemaResult.rawOutput}`);
  const schemaStr = JSON.stringify(schemaResult.data);
  assert(schemaStr.includes('text'), `question:ask schema missing 'text' field`);
  assert(schemaStr.includes('question_id'), `question:ask schema missing 'question_id' field`);
  step('schema question:ask has required fields (text, question_id, type)');

  // ── STEP 2e: Error handling section ──
  console.log('\nSTEP 2e: Error handling — all 5 error codes                       [CLI]');

  // Create throwaway node for error testing (in-process)
  const addThrowaway = await service.addNode(ctx, GRAPH_SLUG, lineId, 'throwaway');
  assert(
    addThrowaway.errors.length === 0,
    `Failed to add throwaway: ${JSON.stringify(addThrowaway.errors)}`
  );
  const throwawayId = unwrap(addThrowaway.nodeId, 'throwaway nodeId');

  // Start + accept throwaway so it's in agent-accepted state (via CLI)
  const startThrowaway = await runCli(
    ['wf', 'node', 'start', GRAPH_SLUG, throwawayId],
    workspacePath
  );
  assert(startThrowaway.success, `Failed to start throwaway: ${startThrowaway.rawOutput}`);
  const acceptThrowaway = await runCli(
    ['wf', 'node', 'accept', GRAPH_SLUG, throwawayId],
    workspacePath
  );
  assert(acceptThrowaway.success, `Failed to accept throwaway: ${acceptThrowaway.rawOutput}`);

  // E190: Unknown event type
  const e190 = await runCli(
    ['wf', 'node', 'raise-event', GRAPH_SLUG, throwawayId, 'nonexistent:type'],
    workspacePath
  );
  assert(!e190.success, 'E190 should fail');
  assert(e190.rawOutput.includes('E190'), `Expected E190 in output: ${e190.rawOutput}`);
  step('E190: Unknown event type — verified');

  // E191: Invalid payload (node:accepted with wrong fields)
  const e191 = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      throwawayId,
      'node:accepted',
      '--payload',
      '{"invalid_field": true}',
    ],
    workspacePath
  );
  assert(!e191.success, 'E191 should fail');
  assert(e191.rawOutput.includes('E191'), `Expected E191 in output: ${e191.rawOutput}`);
  step('E191: Invalid payload — verified');

  // E193: Invalid state transition (throwaway is agent-accepted, node:accepted requires starting)
  const e193 = await runCli(
    ['wf', 'node', 'raise-event', GRAPH_SLUG, throwawayId, 'node:accepted', '--payload', '{}'],
    workspacePath
  );
  assert(!e193.success, 'E193 should fail');
  assert(e193.rawOutput.includes('E193'), `Expected E193 in output: ${e193.rawOutput}`);
  step('E193: Invalid state transition — verified');

  // E196: Event not found (stamp a nonexistent event)
  const e196 = await runCli(
    [
      'wf',
      'node',
      'stamp-event',
      GRAPH_SLUG,
      throwawayId,
      'nonexistent-event-id',
      '--subscriber',
      'test',
      '--action',
      'test',
    ],
    workspacePath
  );
  assert(!e196.success, 'E196 should fail');
  assert(e196.rawOutput.includes('E196'), `Expected E196 in output: ${e196.rawOutput}`);
  step('E196: Event not found — verified');

  // E197: Invalid JSON payload
  const e197 = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      throwawayId,
      'progress:update',
      '--payload',
      '{not valid json}',
    ],
    workspacePath
  );
  assert(!e197.success, 'E197 should fail');
  assert(e197.rawOutput.includes('E197'), `Expected E197 in output: ${e197.rawOutput}`);
  step('E197: Invalid JSON payload — verified');

  // Error shortcut: cg wf node error
  const errorShortcut = await runCli(
    [
      'wf',
      'node',
      'error',
      GRAPH_SLUG,
      throwawayId,
      '--code',
      'TEST_ERR',
      '--message',
      'Throwaway error for testing',
    ],
    workspacePath
  );
  assert(errorShortcut.success, `error shortcut failed: ${errorShortcut.rawOutput}`);
  step('error shortcut: node:error raised, status -> blocked-error');

  // Remove throwaway node (in-process)
  const removeResult = await service.removeNode(ctx, GRAPH_SLUG, throwawayId);
  assert(
    removeResult.errors.length === 0,
    `Failed to remove throwaway: ${JSON.stringify(removeResult.errors)}`
  );
  step('Throwaway node removed');

  // ============================================
  // ACT 2: Simple Node (spec-writer completes directly)
  // ============================================

  banner('ACT 2: Simple Node — spec-writer');

  console.log('\nSTEP 3: Start, accept, save output, and complete spec-writer');

  // Start: pending → starting [CLI]
  const startSpecWriter = await runCli(
    ['wf', 'node', 'start', GRAPH_SLUG, specWriterId],
    workspacePath
  );
  assert(startSpecWriter.success, `Failed to start spec-writer: ${startSpecWriter.rawOutput}`);
  step(`${specWriterId}: pending -> starting                                [CLI]`);

  // Accept: starting → agent-accepted [CLI]
  const acceptSpecWriter = await runCli(
    ['wf', 'node', 'accept', GRAPH_SLUG, specWriterId],
    workspacePath
  );
  assert(acceptSpecWriter.success, `Failed to accept spec-writer: ${acceptSpecWriter.rawOutput}`);
  step(`${specWriterId}: starting -> agent-accepted                         [CLI]`);

  // Save output data [CLI] (note: save-output-data is NOT an event)
  const saveSpecOutput = await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      specWriterId,
      'spec',
      JSON.stringify({ title: 'Widget Spec', requirements: ['R1', 'R2', 'R3'] }),
    ],
    workspacePath
  );
  assert(saveSpecOutput.success, `Failed to save spec output: ${saveSpecOutput.rawOutput}`);
  step(`${specWriterId}: saved output 'spec' (NOT an event)                 [CLI]`);

  // Complete via 'end' shortcut [CLI] (internally raises node:completed event)
  const endSpecWriter = await runCli(
    ['wf', 'node', 'end', GRAPH_SLUG, specWriterId, '--message', 'Spec complete'],
    workspacePath
  );
  assert(endSpecWriter.success, `Failed to end spec-writer: ${endSpecWriter.rawOutput}`);
  step(`${specWriterId}: agent-accepted -> complete (end shortcut)           [CLI]`);

  // Verify [IN-PROCESS]
  const stateAfterSpec = await service.loadGraphState(ctx, GRAPH_SLUG);
  const specNode = unwrap(stateAfterSpec.nodes?.[specWriterId], 'spec-writer node');
  assert(specNode.status === 'complete', `Expected spec-writer complete, got ${specNode.status}`);
  assert(specNode.completed_at !== undefined, 'spec-writer should have completed_at');
  step(`Verified: ${specWriterId} status=${specNode.status}, completed_at set`);

  // ============================================
  // ACT 3: Agent Node — the main story
  // ============================================

  banner('ACT 3: Agent Node — code-builder lifecycle');

  // ── Steps 4a-4c: Start + Accept + processGraph settle ──
  console.log('\nSTEP 4a: Start code-builder                                      [CLI]');

  const startCodeBuilder = await runCli(
    ['wf', 'node', 'start', GRAPH_SLUG, codeBuilderId],
    workspacePath
  );
  assert(startCodeBuilder.success, `Failed to start code-builder: ${startCodeBuilder.rawOutput}`);
  step(`${codeBuilderId}: pending -> starting`);

  console.log('\nSTEP 4b: Agent accepts code-builder                              [CLI]');

  const acceptCodeBuilder = await runCli(
    ['wf', 'node', 'accept', GRAPH_SLUG, codeBuilderId],
    workspacePath
  );
  assert(
    acceptCodeBuilder.success,
    `Failed to accept code-builder: ${acceptCodeBuilder.rawOutput}`
  );
  step(`${codeBuilderId}: starting -> agent-accepted (accept shortcut)`);

  console.log('\nSTEP 4c: Orchestrator settles                                    [IN-PROCESS]');

  let state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const settle1 = ehs.processGraph(state, SUBSCRIBER_ORCHESTRATOR, 'cli');
  await service.persistGraphState(ctx, GRAPH_SLUG, state);

  assert(settle1.nodesVisited >= 2, `Expected >= 2 nodes visited, got ${settle1.nodesVisited}`);
  assert(
    settle1.eventsProcessed >= 1,
    `Expected >= 1 events processed, got ${settle1.eventsProcessed}`
  );
  step(
    `processGraph: visited=${settle1.nodesVisited}, processed=${settle1.eventsProcessed}, handlers=${settle1.handlerInvocations}`
  );

  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const cbAfterAccept = unwrap(state.nodes?.[codeBuilderId], 'code-builder node');
  assert(
    cbAfterAccept.status === 'agent-accepted',
    `Expected agent-accepted, got ${cbAfterAccept.status}`
  );
  step(`Verified: ${codeBuilderId} status=${cbAfterAccept.status}`);

  // ── Step 5: Agent does work ──
  console.log('\nSTEP 5: Agent does work (progress + save-output-data)             [CLI]');

  // Raise progress:update via generic raise-event (not shortcut — AC-18 requires both)
  const progressResult = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      codeBuilderId,
      'progress:update',
      '--payload',
      JSON.stringify({ message: 'Analyzing spec requirements', percent: 30 }),
    ],
    workspacePath
  );
  assert(progressResult.success, `Failed to raise progress: ${progressResult.rawOutput}`);
  step('Raised progress:update via generic raise-event (30%)');

  const savePartial = await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      codeBuilderId,
      'analysis',
      JSON.stringify({ findings: ['R1 feasible', 'R2 needs decomposition'] }),
    ],
    workspacePath
  );
  assert(savePartial.success, `Failed to save partial: ${savePartial.rawOutput}`);
  step(`Saved partial output 'analysis' (NOT an event)`);

  // ── Steps 6a-6b: Agent asks question + processGraph settle ──
  console.log('\nSTEP 6a: Agent asks a question                                    [CLI]');

  const questionPayload = JSON.stringify({
    question_id: 'q-001',
    text: 'Should R2 be split into R2a and R2b?',
    type: 'confirm',
  });
  const askResult = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      codeBuilderId,
      'question:ask',
      '--payload',
      questionPayload,
    ],
    workspacePath
  );
  assert(askResult.success, `Failed to ask question: ${askResult.rawOutput}`);
  assert(
    askResult.rawOutput.includes('AGENT INSTRUCTION') ||
      askResult.rawOutput.includes('stopsExecution'),
    'question:ask should include stops_execution indicator'
  );
  step(`question:ask raised (q-001: "Should R2 be split?")`);

  console.log('\nSTEP 6b: Orchestrator settles after question                      [IN-PROCESS]');

  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const settle2 = ehs.processGraph(state, SUBSCRIBER_ORCHESTRATOR, 'cli');
  await service.persistGraphState(ctx, GRAPH_SLUG, state);

  assert(
    settle2.eventsProcessed >= 1,
    `Expected >= 1 events after question, got ${settle2.eventsProcessed}`
  );
  step(
    `processGraph: visited=${settle2.nodesVisited}, processed=${settle2.eventsProcessed}, handlers=${settle2.handlerInvocations}`
  );

  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const cbAfterQuestion = unwrap(state.nodes?.[codeBuilderId], 'code-builder node');
  assert(
    cbAfterQuestion.status === 'waiting-question',
    `Expected waiting-question, got ${cbAfterQuestion.status}`
  );
  assert(
    cbAfterQuestion.pending_question_id === 'q-001',
    `Expected pending_question_id='q-001', got ${cbAfterQuestion.pending_question_id}`
  );
  step(`Verified: ${codeBuilderId} status=waiting-question, pending_question_id=q-001`);

  // ── Steps 7-8: Human answers + processGraph settle + agent resume ──
  console.log('\nSTEP 7: Human answers the question                                [CLI]');

  // Find the ask event ID
  const eventsBeforeAnswer = await runCli<{
    events: Array<{ event_id: string; event_type: string }>;
  }>(['wf', 'node', 'events', GRAPH_SLUG, codeBuilderId, '--type', 'question:ask'], workspacePath);
  assert(eventsBeforeAnswer.success, `Failed to list events: ${eventsBeforeAnswer.rawOutput}`);
  const askEvents = eventsBeforeAnswer.data.events ?? [];
  assert(askEvents.length >= 1, `Expected >= 1 question:ask event, got ${askEvents.length}`);
  const askEventId = unwrap(askEvents[0]?.event_id, 'ask event_id');

  const answerPayload = JSON.stringify({
    question_event_id: askEventId,
    answer: 'Yes, split R2 into R2a (data model) and R2b (API endpoint)',
  });
  const answerResult = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      codeBuilderId,
      'question:answer',
      '--payload',
      answerPayload,
      '--source',
      'human',
    ],
    workspacePath
  );
  assert(answerResult.success, `Failed to answer: ${answerResult.rawOutput}`);
  step(`Human answered question (source=human): "Yes, split R2..."`);

  console.log('\nSTEP 8: Orchestrator settles after answer                         [IN-PROCESS]');

  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const settle3 = ehs.processGraph(state, SUBSCRIBER_ORCHESTRATOR, 'cli');
  await service.persistGraphState(ctx, GRAPH_SLUG, state);

  assert(
    settle3.eventsProcessed >= 1,
    `Expected >= 1 events after answer, got ${settle3.eventsProcessed}`
  );
  step(
    `processGraph: visited=${settle3.nodesVisited}, processed=${settle3.eventsProcessed}, handlers=${settle3.handlerInvocations}`
  );

  // Answer handler is record-only: node stays waiting-question, pending_question_id preserved
  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const cbAfterAnswer = unwrap(state.nodes?.[codeBuilderId], 'code-builder node');
  assert(
    cbAfterAnswer.status === 'waiting-question',
    `Expected 'waiting-question' after answer, got ${cbAfterAnswer.status}`
  );
  assert(
    cbAfterAnswer.pending_question_id === 'q-001',
    `Expected pending_question_id='q-001' preserved, got ${cbAfterAnswer.pending_question_id}`
  );
  step(`Verified: ${codeBuilderId} status=waiting-question (answer is record-only)`);

  // Agent reads the answer [CLI]
  console.log('\n        Agent resumes and reads the answer                        [CLI]');

  const readAnswer = await runCli<{
    events: Array<{ event_id: string; event_type: string; payload: unknown }>;
  }>(
    ['wf', 'node', 'events', GRAPH_SLUG, codeBuilderId, '--type', 'question:answer'],
    workspacePath
  );
  assert(readAnswer.success, `Failed to read answer: ${readAnswer.rawOutput}`);
  const answerEvents = readAnswer.data.events ?? [];
  assert(answerEvents.length >= 1, `Expected >= 1 answer event, got ${answerEvents.length}`);
  step(`Agent retrieved answer event (${answerEvents.length} answer(s) found)`);

  // ── Step 9: Workshop 10 restart — raise node:restart, settle, startNode ──
  console.log(
    '\nSTEP 9: Workshop 10 restart flow (node:restart -> startNode)       [CLI + IN-PROCESS]'
  );

  // Raise node:restart via CLI (human or orchestrator triggers restart)
  const restartResult = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      codeBuilderId,
      'node:restart',
      '--payload',
      JSON.stringify({ reason: 'Question answered, resuming work' }),
      '--source',
      'orchestrator',
    ],
    workspacePath
  );
  assert(restartResult.success, `Failed to raise node:restart: ${restartResult.rawOutput}`);
  step('Raised node:restart (source=orchestrator)');

  // Settle — handler sets restart-pending, clears pending_question_id
  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const settleRestart = ehs.processGraph(state, SUBSCRIBER_ORCHESTRATOR, 'cli');
  await service.persistGraphState(ctx, GRAPH_SLUG, state);

  assert(
    settleRestart.eventsProcessed >= 1,
    `Expected >= 1 events after restart, got ${settleRestart.eventsProcessed}`
  );
  step(
    `processGraph: visited=${settleRestart.nodesVisited}, processed=${settleRestart.eventsProcessed}, handlers=${settleRestart.handlerInvocations}`
  );

  // Verify restart-pending state
  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const cbAfterRestart = unwrap(state.nodes?.[codeBuilderId], 'code-builder node');
  assert(
    cbAfterRestart.status === 'restart-pending',
    `Expected 'restart-pending' after restart settle, got ${cbAfterRestart.status}`
  );
  assert(
    cbAfterRestart.pending_question_id === undefined,
    `Expected pending_question_id cleared by restart handler, got ${cbAfterRestart.pending_question_id}`
  );
  step(`Verified: ${codeBuilderId} status=restart-pending, pending_question_id cleared`);

  // startNode via CLI (simulates what ODS would do: restart-pending -> starting)
  const restartStart = await runCli(
    ['wf', 'node', 'start', GRAPH_SLUG, codeBuilderId],
    workspacePath
  );
  assert(restartStart.success, `Failed to start after restart: ${restartStart.rawOutput}`);
  step(`${codeBuilderId}: restart-pending -> starting (Workshop 10 startNode)`);

  // Re-accept after restart
  const reAccept = await runCli(['wf', 'node', 'accept', GRAPH_SLUG, codeBuilderId], workspacePath);
  assert(reAccept.success, `Failed to re-accept: ${reAccept.rawOutput}`);
  step(`${codeBuilderId}: starting -> agent-accepted (re-accept after restart)`);

  // ── Step 10: Agent completes ──
  console.log('\nSTEP 10: Agent completes code-builder                             [CLI]');

  // Final progress via generic raise-event
  const finalProgress = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH_SLUG,
      codeBuilderId,
      'progress:update',
      '--payload',
      JSON.stringify({ message: 'Implementation complete', percent: 100 }),
    ],
    workspacePath
  );
  assert(finalProgress.success, `Failed to raise final progress: ${finalProgress.rawOutput}`);
  step('Raised progress:update (100%)');

  // Save final output [CLI]
  const saveFinal = await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH_SLUG,
      codeBuilderId,
      'code',
      JSON.stringify({
        files: ['widget.ts', 'widget.test.ts'],
        linesOfCode: 342,
        r2Split: { r2a: 'data-model.ts', r2b: 'api-endpoint.ts' },
      }),
    ],
    workspacePath
  );
  assert(saveFinal.success, `Failed to save final: ${saveFinal.rawOutput}`);
  step(`Saved final output 'code'`);

  // Complete via 'end' shortcut [CLI]
  const endCodeBuilder = await runCli(
    ['wf', 'node', 'end', GRAPH_SLUG, codeBuilderId, '--message', 'All requirements implemented'],
    workspacePath
  );
  assert(endCodeBuilder.success, `Failed to end code-builder: ${endCodeBuilder.rawOutput}`);
  step(`${codeBuilderId}: agent-accepted -> complete (end shortcut)`);

  // Verify [IN-PROCESS]
  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const cbAfterEnd = unwrap(state.nodes?.[codeBuilderId], 'code-builder node');
  assert(cbAfterEnd.status === 'complete', `Expected complete, got ${cbAfterEnd.status}`);
  assert(cbAfterEnd.completed_at !== undefined, 'code-builder should have completed_at');
  step(`Verified: ${codeBuilderId} status=${cbAfterEnd.status}, completed_at set`);

  // ============================================
  // ACT 4: Inspection & Proof
  // ============================================

  banner('ACT 4: Inspection & Proof');

  // ── Step 11: Event log inspection ──
  console.log('\nSTEP 11: Event log inspection                                     [CLI]');

  const allEvents = await runCli<{
    events: Array<{
      event_id: string;
      event_type: string;
      source: string;
      stops_execution: boolean;
      stamps: Record<string, unknown>;
    }>;
  }>(['wf', 'node', 'events', GRAPH_SLUG, codeBuilderId], workspacePath);
  assert(allEvents.success, `Failed to list events: ${allEvents.rawOutput}`);
  const events = allEvents.data.events ?? [];

  console.log(`\n  Event log for ${codeBuilderId} (${events.length} events):`);
  console.log(`  ${'-'.repeat(90)}`);
  console.log(
    `  ${'event_id'.padEnd(20)}${'type'.padEnd(22)}${'source'.padEnd(14)}${'stops'.padEnd(8)}stamps`
  );
  console.log(`  ${'-'.repeat(90)}`);
  for (const evt of events) {
    const stampKeys = evt.stamps ? Object.keys(evt.stamps) : [];
    console.log(
      `  ${(evt.event_id ?? '').substring(0, 18).padEnd(20)}${(evt.event_type ?? '').padEnd(22)}${(evt.source ?? '').padEnd(14)}${String(evt.stops_execution ?? false).padEnd(8)}${stampKeys.length > 0 ? stampKeys.join(', ') : '(none)'}`
    );
  }
  console.log(`  ${'-'.repeat(90)}`);
  step(`Printed event log: ${events.length} events for ${codeBuilderId}`);

  // Demonstrate stamp-event: add manual stamp from e2e-verifier [CLI]
  assert(events.length >= 1, 'Need at least 1 event to stamp');
  const firstEventId = unwrap(events[0]?.event_id, 'first event_id');

  const stampResult = await runCli(
    [
      'wf',
      'node',
      'stamp-event',
      GRAPH_SLUG,
      codeBuilderId,
      firstEventId,
      '--subscriber',
      SUBSCRIBER_E2E_VERIFIER,
      '--action',
      'verified',
    ],
    workspacePath
  );
  assert(stampResult.success, `stamp-event failed: ${stampResult.rawOutput}`);
  step(
    `stamp-event: added '${SUBSCRIBER_E2E_VERIFIER}' to event ${firstEventId.substring(0, 12)}...`
  );

  // Verify stamps visible [CLI]
  const stampCheck = await runCli<{
    events: Array<{ event_id: string; stamps: Record<string, unknown> }>;
    event_id?: string;
    stamps?: Record<string, unknown>;
  }>(['wf', 'node', 'events', GRAPH_SLUG, codeBuilderId, '--id', firstEventId], workspacePath);
  assert(stampCheck.success, `stamp check failed: ${stampCheck.rawOutput}`);
  const stampedEvent = stampCheck.data.events?.[0] ?? stampCheck.data;
  const stamps = (stampedEvent as Record<string, unknown>).stamps as
    | Record<string, unknown>
    | undefined;
  const subscriberCount = stamps ? Object.keys(stamps).length : 0;
  assert(
    subscriberCount >= 2,
    `Expected >= 2 subscribers on stamped event, got ${subscriberCount}`
  );
  step(`Verified: event has ${subscriberCount} subscriber stamp(s)`);

  // ── Steps 12-13: Final processGraph settle + idempotency proof ──
  console.log('\nSTEP 12: Final processGraph — settle remaining + idempotency      [IN-PROCESS]');

  // First pass: settle any remaining unstamped events (from re-accept + final progress/complete)
  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const settleRemaining = ehs.processGraph(state, SUBSCRIBER_ORCHESTRATOR, 'cli');
  await service.persistGraphState(ctx, GRAPH_SLUG, state);
  step(
    `processGraph settle: visited=${settleRemaining.nodesVisited}, processed=${settleRemaining.eventsProcessed}, handlers=${settleRemaining.handlerInvocations}`
  );

  // Second pass: idempotency — should find 0 unstamped events
  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const settleFinal = ehs.processGraph(state, SUBSCRIBER_ORCHESTRATOR, 'cli');
  await service.persistGraphState(ctx, GRAPH_SLUG, state);

  assert(
    settleFinal.eventsProcessed === 0,
    `Idempotency: expected 0 events processed, got ${settleFinal.eventsProcessed}`
  );
  step(
    `processGraph idempotency: visited=${settleFinal.nodesVisited}, processed=${settleFinal.eventsProcessed} (idempotent!)`
  );

  console.log('\nSTEP 13: Final state validation');

  state = await service.loadGraphState(ctx, GRAPH_SLUG);
  const finalSpecWriter = unwrap(state.nodes?.[specWriterId], 'spec-writer');
  const finalCodeBuilder = unwrap(state.nodes?.[codeBuilderId], 'code-builder');

  assert(
    finalSpecWriter.status === 'complete',
    `Final: spec-writer should be complete, got ${finalSpecWriter.status}`
  );
  assert(
    finalCodeBuilder.status === 'complete',
    `Final: code-builder should be complete, got ${finalCodeBuilder.status}`
  );
  step(`Final state: ${specWriterId}=complete, ${codeBuilderId}=complete`);

  // ============================================
  // Done
  // ============================================

  // Unregister workspace before cleanup
  await runCli(['workspace', 'remove', 'e2e-node-events', '--force'], workspacePath);
  await cleanup(workspacePath);

  banner(`ALL ${count()} STEPS PASSED — Node Event System E2E Complete`);
  console.log('\nPlan 032 validation: PASS');
  console.log('Events exercised: 7 types (node:accepted, node:completed, node:error,');
  console.log('  question:ask, question:answer, progress:update, node:restart)');
  console.log('Error codes verified: E190, E191, E193, E196, E197');
  console.log('CLI commands used: raise-event, events, stamp-event, accept, end, error,');
  console.log('  event list-types, event schema, start, save-output-data');
  console.log('In-process: processGraph() x6 (4 mid-story + 1 final settle + 1 idempotency)\n');
}

// ============================================
// Entry point
// ============================================

main().then(
  () => {
    process.exit(0);
  },
  (err) => {
    console.error('\n--- E2E FAILED ---');
    console.error(err);
    process.exit(1);
  }
);
