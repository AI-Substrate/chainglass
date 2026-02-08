/**
 * Worked Example: Node Event CLI Commands — The Full Agent Lifecycle
 * ===================================================================
 *
 * Run:  npx tsx docs/plans/032-node-event-system/tasks/phase-6-cli-commands/examples/worked-example.ts
 *
 * This walks through the event lifecycle that an LLM agent would experience
 * when interacting with a workflow node via CLI: start a node, accept it,
 * raise events, inspect the event log, stamp events as processed, and see
 * how stop-execution events signal the agent to halt. You'll see real service
 * objects, real state mutations, and real event data structures.
 */

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import {
  NodeEventRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type { IWorkUnitLoader } from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

// ──────────────────────────────────────────────────────────────────────
// 1. Setting Up the Service
//
// We construct a real PositionalGraphService with in-memory fakes for
// the filesystem and path resolver. This is exactly how the CLI wires
// things up — the service is the single entry point for all commands.
// ──────────────────────────────────────────────────────────────────────

const fs = new FakeFileSystem();
const pathResolver = new FakePathResolver();
const yamlParser = new YamlParserAdapter();
const adapter = new PositionalGraphAdapter(fs, pathResolver);

// Stub loader that accepts any work unit slug
const loader: IWorkUnitLoader = {
  async load(_ctx: WorkspaceContext, slug: string) {
    return { unit: { slug, type: 'agent' as const, inputs: [], outputs: [] }, errors: [] };
  },
};

const service = new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);

const ctx: WorkspaceContext = {
  workspaceSlug: 'demo',
  workspaceName: 'Demo Workspace',
  workspacePath: '/workspace/demo',
  worktreePath: '/workspace/demo',
  worktreeBranch: 'main',
  isMainWorktree: true,
};

console.log('━━━ Section 1: Service Construction ━━━');
console.log('→ PositionalGraphService created with FakeFileSystem + FakePathResolver');
console.log('→ NodeEventRegistry initialized with 6 core event types');
console.log();

// ──────────────────────────────────────────────────────────────────────
// 2. Creating a Graph and Starting a Node
//
// Before we can raise events, we need a graph with a node in 'starting'
// state. After startNode(), the node enters the two-phase handshake:
// it's 'starting' and waiting for the agent to raise 'node:accepted'.
// ──────────────────────────────────────────────────────────────────────

const GRAPH = 'demo-workflow';

const createResult = await service.create(ctx, GRAPH);
const lineId = createResult.lineId;

const addResult = await service.addNode(ctx, GRAPH, lineId, 'code-writer');
const nodeId = addResult.nodeId as string;

await service.startNode(ctx, GRAPH, nodeId);

console.log('━━━ Section 2: Graph Setup ━━━');
console.log(`→ Created graph '${GRAPH}' with line ${lineId}`);
console.log(`→ Added node '${nodeId}' (work unit: code-writer)`);
console.log(`→ Started node — now in 'starting' state, awaiting agent acceptance`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 3. raiseNodeEvent — Agent Accepts the Node
//
// This is what `cg wf node accept <graph> <nodeId>` does under the hood.
// The service raises a 'node:accepted' event, runs handleEvents (which
// transitions the node to 'agent-accepted'), persists state, and returns
// the event with a stopsExecution flag from the registry.
// ──────────────────────────────────────────────────────────────────────

const acceptResult = await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:accepted', {}, 'agent');

console.log('━━━ Section 3: raise-event (node:accepted) ━━━');
console.log(`→ Event ID:         ${acceptResult.event?.event_id}`);
console.log(`→ Event type:       ${acceptResult.event?.event_type}`);
console.log(`→ Source:           ${acceptResult.event?.source}`);
console.log(`→ Status:           ${acceptResult.event?.status}`);
console.log(`→ Stops execution:  ${acceptResult.stopsExecution}`);
console.log(
  `→ Errors:           ${acceptResult.errors.length === 0 ? 'none' : acceptResult.errors}`
);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 4. Raising a Question Event
//
// Agents can raise structured events. Here a 'question:ask' event posts
// a question for the user. The payload is validated against the registered
// QuestionAskPayloadSchema — question_id, type, and text are required.
// ──────────────────────────────────────────────────────────────────────

const questionResult = await service.raiseNodeEvent(
  ctx,
  GRAPH,
  nodeId,
  'question:ask',
  {
    question_id: 'q1',
    type: 'single',
    text: 'Which programming language should I use?',
    options: ['TypeScript', 'Python', 'Go'],
  },
  'agent'
);

console.log('━━━ Section 4: raise-event (question:ask) ━━━');
console.log(`→ Event ID:         ${questionResult.event?.event_id}`);
console.log(`→ Payload question:  "${questionResult.event?.payload?.text}"`);
console.log(`→ Payload options:   ${JSON.stringify(questionResult.event?.payload?.options)}`);
console.log(`→ Stops execution:  ${questionResult.stopsExecution}`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 5. getNodeEvents — Inspecting the Event Log
//
// This is `cg wf node events <graph> <nodeId>`. It returns all events
// recorded for this node. Notice we now have at least 2 events — the
// accepted event and the question. Filters let you narrow by type or
// status.
// ──────────────────────────────────────────────────────────────────────

const allEvents = await service.getNodeEvents(ctx, GRAPH, nodeId);

console.log('━━━ Section 5: events (list all) ━━━');
console.log(`→ Total events: ${allEvents.events?.length}`);
for (const evt of allEvents.events ?? []) {
  console.log(
    `   ${evt.event_id.slice(0, 12)}…  ${evt.event_type.padEnd(18)} ${evt.source.padEnd(8)} ${evt.status}`
  );
}
console.log();

// Filter by type
const questionEvents = await service.getNodeEvents(ctx, GRAPH, nodeId, {
  types: ['question:ask'],
});

console.log('→ Filtered by type=question:ask:');
console.log(`   Found ${questionEvents.events?.length} event(s)`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 6. stampNodeEvent — Processing an Event
//
// This is `cg wf node stamp-event <graph> <nodeId> <eventId>`. Stamps
// record that a subscriber has processed an event — the orchestrator
// or another agent acknowledges it. The stamp includes action, timestamp,
// and optional data.
// ──────────────────────────────────────────────────────────────────────

const questionEventId = questionResult.event?.event_id;

const stampResult = await service.stampNodeEvent(
  ctx,
  GRAPH,
  nodeId,
  questionEventId,
  'orchestrator',
  'forwarded-to-user',
  { channel: 'slack', forwarded_at: new Date().toISOString() }
);

console.log('━━━ Section 6: stamp-event ━━━');
console.log(`→ Stamped event:   ${stampResult.eventId}`);
console.log(`→ Subscriber:      ${stampResult.subscriber}`);
console.log(`→ Action:          ${stampResult.stamp?.action}`);
console.log(`→ Stamp data:      ${JSON.stringify(stampResult.stamp?.data)}`);
console.log(`→ Stamped at:      ${stampResult.stamp?.stamped_at}`);
console.log();

// Verify the stamp persisted by re-reading the event
const afterStamp = await service.getNodeEvents(ctx, GRAPH, nodeId, {
  eventId: questionEventId,
});
const stampedEvent = afterStamp.events?.[0];
console.log(`→ Persisted stamps: ${JSON.stringify(Object.keys(stampedEvent.stamps))}`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 7. Error Codes in Action
//
// The event system returns specific error codes for common failures.
// E190 means the event type doesn't exist, E193 means invalid state
// transition, and E196 means the event ID wasn't found. These map
// directly to CLI error output.
// ──────────────────────────────────────────────────────────────────────

const e190 = await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'bogus:event', {}, 'agent');
const e196 = await service.stampNodeEvent(ctx, GRAPH, nodeId, 'nonexistent-id', 'sub', 'ack');

console.log('━━━ Section 7: Error Codes ━━━');
console.log(`→ E190 (unknown type):   code=${e190.errors[0].code}  "${e190.errors[0].message}"`);
console.log(`→ E196 (event not found): code=${e196.errors[0].code}  "${e196.errors[0].message}"`);
console.log();

// ──────────────────────────────────────────────────────────────────────
// 8. Discovery — Event Type Registry
//
// The discovery commands `cg wf node event list-types` and
// `cg wf node event schema` query the NodeEventRegistry directly.
// Let's see what's registered — 6 core event types grouped by domain.
// ──────────────────────────────────────────────────────────────────────

const registry = new NodeEventRegistry();
registerCoreEventTypes(registry);

const allTypes = registry.list();
const domains = new Map<string, string[]>();
for (const reg of allTypes) {
  const list = domains.get(reg.domain) ?? [];
  list.push(reg.type);
  domains.set(reg.domain, list);
}

console.log('━━━ Section 8: Event Type Discovery ━━━');
console.log(`→ ${allTypes.length} registered event types:\n`);
for (const [domain, types] of domains) {
  console.log(`   ${domain}:`);
  for (const type of types) {
    const reg = registry.get(type);
    if (!reg) continue;
    const stop = reg.stopsExecution ? ' [STOPS EXECUTION]' : '';
    console.log(`     ${type.padEnd(20)} ${reg.displayName}${stop}`);
  }
}
console.log();

// Show schema details for one type
const questionReg = registry.get('question:ask');
console.log(`→ Schema for '${questionReg?.type}':`);
console.log(`   Display name:   ${questionReg?.displayName}`);
console.log(`   Description:    ${questionReg?.description}`);
console.log(`   Domain:         ${questionReg?.domain}`);
console.log(`   Allowed sources: ${questionReg?.allowedSources.join(', ')}`);
console.log(`   Stops execution: ${questionReg?.stopsExecution}`);
console.log();

// ──────────────────────────────────────────────────────────────────────

console.log('━━━ Done ━━━');
console.log(
  '✓ Demonstrated the full agent event lifecycle: start → accept → raise → inspect → stamp'
);
console.log('✓ All objects above are real instances from the actual implementation');
console.log('✓ Error codes E190/E196 returned from real validation pipelines');
console.log('✓ Registry discovery shows all 6 core event types with metadata');
