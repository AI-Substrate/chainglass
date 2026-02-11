/**
 * Worked Example: Node Event System — How Events Flow Through a Graph
 * ====================================================================
 *
 * Run:
 *   pnpm build --filter=@chainglass/cli && \
 *   npx tsx docs/plans/032-node-event-system/tasks/phase-8-e2e-validation-script/examples/worked-example.ts
 *
 * This walks through the node event system in miniature — one node, three
 * events, one processGraph settle — so you can see how events are raised,
 * stamped, and settled without the full 41-step E2E. When you're satisfied,
 * run the real thing:
 *
 *   npx tsx test/e2e/node-event-system-visual-e2e.ts
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

import {
  assert,
  banner,
  cleanup,
  createStepCounter,
  createTestServiceStack,
  runCli,
  unwrap,
} from '../../../../../../test/helpers/positional-graph-e2e-helpers.js';

const GRAPH = 'worked-example';

async function main(): Promise<void> {
  const { step, count } = createStepCounter();
  const { service, ctx, workspacePath } = await createTestServiceStack('worked-ex');

  banner('Worked Example: Node Event System');
  console.log(`Temp workspace: ${workspacePath}\n`);

  // ──────────────────────────────────────────────────────────────────────
  // 1. Wire the Orchestrator Stack
  //
  // The event system has three layers: a type registry (knows which events
  // exist), a handler registry (knows what to do when they fire), and the
  // EventHandlerService that walks a graph and settles unstamped events.
  // Here we wire them up with state I/O bound to our temp workspace.
  // ──────────────────────────────────────────────────────────────────────

  console.log('--- Section 1: Wire the Orchestrator Stack ---');

  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);

  const handlerRegistry = createEventHandlerRegistry();

  const nes = new NodeEventService(
    {
      registry: eventRegistry,
      loadState: (slug) => service.loadGraphState(ctx, slug),
      persistState: (slug, st) => service.persistGraphState(ctx, slug, st),
    },
    handlerRegistry
  );

  const ehs = new EventHandlerService(nes);

  step('Orchestrator stack: FakeNodeEventRegistry + NodeEventService + EventHandlerService');

  const registeredTypes = eventRegistry.list();
  console.log(`  -> ${registeredTypes.length} event types registered:`);
  for (const t of registeredTypes) {
    console.log(`     ${t.type.padEnd(20)} sources: [${t.allowedSources.join(', ')}]`);
  }
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 2. Create a Graph With One Node
  //
  // A graph is a container for nodes. Each node represents a work unit
  // (like "write a spec" or "build code"). We create a graph and add a
  // single agent node called "greeter". Node IDs include a random hex
  // suffix — e.g. "greeter-a3f" — so we capture the actual ID.
  // ──────────────────────────────────────────────────────────────────────

  console.log('--- Section 2: Create a Graph With One Node ---');

  // Write a minimal work-unit YAML so the CLI can resolve it
  const unitDir = path.join(workspacePath, '.chainglass', 'units', 'greeter');
  await fs.mkdir(unitDir, { recursive: true });
  await fs.writeFile(
    path.join(unitDir, 'unit.yaml'),
    'slug: greeter\ntype: agent\nversion: 1.0.0\ndescription: Worked example\ninputs: []\noutputs:\n  - name: greeting\n    type: data\n    data_type: text\n    required: true\n    description: The greeting\nagent:\n  prompt_template: prompts/main.md\n  supported_agents:\n    - claude-code\n  estimated_tokens: 100\n'
  );

  const createResult = await service.create(ctx, GRAPH);
  assert(createResult.errors.length === 0, `create failed: ${JSON.stringify(createResult.errors)}`);
  const lineId = unwrap(createResult.lineId, 'lineId');

  const addResult = await service.addNode(ctx, GRAPH, lineId, 'greeter');
  assert(addResult.errors.length === 0, `addNode failed: ${JSON.stringify(addResult.errors)}`);
  const nodeId = unwrap(addResult.nodeId, 'nodeId');

  step(`Graph "${GRAPH}" created with node "${nodeId}"`);
  console.log(`  -> Line: ${lineId}`);
  console.log(`  -> Node ID has hex suffix: ${nodeId} (not just "greeter")\n`);

  // ──────────────────────────────────────────────────────────────────────
  // 3. Walk a Node Through Its Lifecycle via CLI
  //
  // The CLI is how agents and humans interact with nodes. We register our
  // temp dir as a CLI workspace, then run commands: start (pending ->
  // starting), accept (starting -> agent-accepted). Each of these raises
  // an event under the hood.
  // ──────────────────────────────────────────────────────────────────────

  console.log('--- Section 3: Walk a Node Through Its Lifecycle ---');

  // Register workspace for CLI
  await runCli(['workspace', 'remove', 'worked-example', '--force'], workspacePath);
  await runCli(['workspace', 'add', 'worked-example', workspacePath], workspacePath);

  const startRes = await runCli(['wf', 'node', 'start', GRAPH, nodeId], workspacePath);
  assert(startRes.success, `start failed: ${startRes.rawOutput}`);
  step(`CLI: start -> node is now "starting"`);

  const acceptRes = await runCli(['wf', 'node', 'accept', GRAPH, nodeId], workspacePath);
  assert(acceptRes.success, `accept failed: ${acceptRes.rawOutput}`);
  step(`CLI: accept -> node is now "agent-accepted"`);

  // Raise a progress event via the generic raise-event command
  const progressRes = await runCli(
    [
      'wf',
      'node',
      'raise-event',
      GRAPH,
      nodeId,
      'progress:update',
      '--payload',
      JSON.stringify({ message: 'Thinking about greetings', percent: 50 }),
    ],
    workspacePath
  );
  assert(progressRes.success, `progress failed: ${progressRes.rawOutput}`);
  step('CLI: raise-event progress:update (50%)');
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 4. Inspect the Event Log
  //
  // Every event raised on a node is persisted in its event log. The CLI
  // "events" command reads it. Notice each event has an ID, type, source,
  // and a stamps map showing which subscribers have processed it.
  // ──────────────────────────────────────────────────────────────────────

  console.log('--- Section 4: Inspect the Event Log ---');

  const eventsRes = await runCli<{
    events: Array<{
      event_id: string;
      event_type: string;
      source: string;
      stamps: Record<string, unknown>;
    }>;
  }>(['wf', 'node', 'events', GRAPH, nodeId], workspacePath);
  assert(eventsRes.success, `events failed: ${eventsRes.rawOutput}`);
  const events = eventsRes.data.events ?? [];

  step(`Event log has ${events.length} events:`);
  for (const evt of events) {
    const stampCount = evt.stamps ? Object.keys(evt.stamps).length : 0;
    console.log(
      `     ${evt.event_type.padEnd(20)} source=${evt.source.padEnd(10)} stamps=${stampCount}`
    );
  }
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 5. processGraph — The Orchestrator Settles Events
  //
  // This is the key mechanism: processGraph walks every node, finds
  // unstamped events, runs handlers, and stamps them. It returns counts
  // of what it did. After settlement, the same call returns 0 events
  // processed — that's idempotency.
  // ──────────────────────────────────────────────────────────────────────

  console.log('--- Section 5: processGraph Settles Events ---');

  let state: State = await service.loadGraphState(ctx, GRAPH);
  const result1 = ehs.processGraph(state, 'orchestrator', 'cli');
  await service.persistGraphState(ctx, GRAPH, state);

  step(
    `processGraph pass 1: ${result1.eventsProcessed} events processed, ${result1.handlerInvocations} handlers invoked`
  );

  // Second pass proves idempotency
  state = await service.loadGraphState(ctx, GRAPH);
  const result2 = ehs.processGraph(state, 'orchestrator', 'cli');
  await service.persistGraphState(ctx, GRAPH, state);

  assert(
    result2.eventsProcessed === 0,
    `Expected 0 on second pass, got ${result2.eventsProcessed}`
  );
  step(`processGraph pass 2: ${result2.eventsProcessed} events (idempotent!)`);
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // 6. Complete the Node and Verify
  //
  // Save output data, then use the "end" shortcut to complete the node.
  // This raises a node:completed event internally. We verify the final
  // state shows status=complete with a completed_at timestamp.
  // ──────────────────────────────────────────────────────────────────────

  console.log('--- Section 6: Complete the Node ---');

  await runCli(
    [
      'wf',
      'node',
      'save-output-data',
      GRAPH,
      nodeId,
      'greeting',
      JSON.stringify({ text: 'Hello, world!' }),
    ],
    workspacePath
  );
  step('Saved output "greeting"');

  const endRes = await runCli(
    ['wf', 'node', 'end', GRAPH, nodeId, '--message', 'Greeting delivered'],
    workspacePath
  );
  assert(endRes.success, `end failed: ${endRes.rawOutput}`);
  step('CLI: end -> node is now "complete"');

  state = await service.loadGraphState(ctx, GRAPH);
  const finalNode = unwrap(state.nodes?.[nodeId], 'greeter node');
  assert(finalNode.status === 'complete', `Expected complete, got ${finalNode.status}`);
  assert(finalNode.completed_at !== undefined, 'Should have completed_at');
  step(`Verified: status=${finalNode.status}, completed_at=${finalNode.completed_at}`);
  console.log();

  // ──────────────────────────────────────────────────────────────────────
  // Done
  // ──────────────────────────────────────────────────────────────────────

  await runCli(['workspace', 'remove', 'worked-example', '--force'], workspacePath);
  await cleanup(workspacePath);

  banner(`ALL ${count()} STEPS PASSED`);
  console.log('\nThis was the simplified version. For the full 41-step lifecycle:');
  console.log('  npx tsx test/e2e/node-event-system-visual-e2e.ts\n');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\n--- WORKED EXAMPLE FAILED ---');
    console.error(err);
    process.exit(1);
  }
);
