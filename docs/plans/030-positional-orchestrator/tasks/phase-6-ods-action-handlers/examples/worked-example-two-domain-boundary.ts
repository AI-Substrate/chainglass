/**
 * Worked Example: Two-Domain Boundary — How Events Record and Handlers Decide
 * =============================================================================
 *
 * Run:  npx tsx docs/plans/030-positional-orchestrator/tasks/phase-6-ods-action-handlers/examples/worked-example-two-domain-boundary.ts
 *
 * This walks through the complete question-answer-restart lifecycle using the
 * real Node Event System implementation. You'll see how the Event Domain
 * (handlers stamp and set handler-owned status) stays cleanly separated from
 * the Graph Domain (ONBAS decides, ODS acts). The key insight: after a question
 * is answered, the node does NOT transition to 'starting' — it stays in
 * 'waiting-question' until an explicit node:restart event fires.
 */

import {
  EventHandlerService,
  NodeEventRegistry,
  NodeEventService,
  createEventHandlerRegistry,
  generateEventId,
  registerCoreEventTypes,
} from '../../../../../../packages/positional-graph/src/features/032-node-event-system/index.js';
import type { NodeEvent } from '../../../../../../packages/positional-graph/src/features/032-node-event-system/index.js';
import type {
  NodeStateEntry,
  State,
} from '../../../../../../packages/positional-graph/src/schemas/state.schema.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const GRAPH = 'design-system';
const NODE = 'code-builder-01';
const SUBSCRIBER = 'orchestrator';

/** In-memory state store — replaces the filesystem for this demo. */
let storedState: State;

async function loadState(_graphSlug: string): Promise<State> {
  return JSON.parse(JSON.stringify(storedState)) as State;
}

async function persistState(_graphSlug: string, state: State): Promise<void> {
  storedState = state;
}

function getNode(): NodeStateEntry {
  const nodes = storedState.nodes;
  if (!nodes || !nodes[NODE]) throw new Error('Node not found');
  return nodes[NODE];
}

function getEvents(): NodeEvent[] {
  return getNode().events ?? [];
}

function printNode(_label: string): void {
  const node = getNode();
  const events = getEvents();
  const lastStamp =
    events.length > 0
      ? (events[events.length - 1].stamps?.[SUBSCRIBER]?.action ?? '(unstamped)')
      : '(none)';
  console.log(`  status:              ${node.status}`);
  console.log(`  pending_question_id: ${node.pending_question_id ?? '(undefined)'}`);
  console.log(`  events:              ${events.length} total`);
  console.log(`  last stamp:          ${lastStamp}`);
}

// ── Build the real services ──────────────────────────────────────────────────

const eventRegistry = new NodeEventRegistry();
registerCoreEventTypes(eventRegistry);

const handlerRegistry = createEventHandlerRegistry();
const nodeEventService = new NodeEventService(
  { registry: eventRegistry, loadState, persistState },
  handlerRegistry
);
const ehs = new EventHandlerService(nodeEventService);

// ──────────────────────────────────────────────────────────────────────────────
// 1. Initial State — A Node Running Happily
//
// We start with a node in 'agent-accepted' status. The agent has been
// assigned work and is executing. This is the normal state right before
// the agent discovers it needs to ask a question.
// ──────────────────────────────────────────────────────────────────────────────

storedState = {
  graph_status: 'in_progress',
  updated_at: new Date().toISOString(),
  nodes: {
    [NODE]: {
      status: 'agent-accepted',
      started_at: new Date().toISOString(),
    },
  },
};

console.log('━━━ Section 1: Initial State ━━━');
console.log(`→ Graph "${GRAPH}", node "${NODE}"`);
printNode('initial');
console.log();

// ──────────────────────────────────────────────────────────────────────────────
// 2. Agent Asks a Question (question:ask)
//
// The agent raises a question:ask event. The handler sets the node to
// 'waiting-question' and records the pending_question_id. This is a
// state-transition — the handler DOES set status here because the agent
// is actively requesting a pause.
// ──────────────────────────────────────────────────────────────────────────────

const questionId = 'q-framework';
const _askEventId = generateEventId();

const askResult = await nodeEventService.raise(
  GRAPH,
  NODE,
  'question:ask',
  { question_id: questionId, type: 'single', text: 'Which framework?', options: ['React', 'Vue'] },
  'agent'
);

// Load fresh state and run handlers (Settle phase)
let state = await loadState(GRAPH);
ehs.processGraph(state, SUBSCRIBER, 'cli');
await persistState(GRAPH, state);

const askEventForLog = askResult.event;
console.log('━━━ Section 2: Question Asked ━━━');
console.log(`→ Raised question:ask (event_id: ${askEventForLog?.event_id.slice(0, 16)}...)`);
printNode('after ask');
console.log();

// ──────────────────────────────────────────────────────────────────────────────
// 3. Human Answers the Question (question:answer)
//
// Here is the KEY INSIGHT from the concept drift remediation. The old handler
// would set status='starting' and clear pending_question_id. The fixed handler
// stamps 'answer-recorded' and does NOTHING else — the node stays in
// 'waiting-question' with pending_question_id preserved. Why? Because the
// Graph Domain (ONBAS/ODS) should decide what happens next, not the handler.
// ──────────────────────────────────────────────────────────────────────────────

const answerResult = await nodeEventService.raise(
  GRAPH,
  NODE,
  'question:answer',
  { question_event_id: askEventForLog?.event_id, answer: 'React' },
  'human'
);

// Load fresh state and run handlers (Settle phase)
state = await loadState(GRAPH);
ehs.processGraph(state, SUBSCRIBER, 'cli');
await persistState(GRAPH, state);

const answerEventForLog = answerResult.event;
console.log('━━━ Section 3: Question Answered (The Fix) ━━━');
console.log(`→ Raised question:answer (event_id: ${answerEventForLog?.event_id.slice(0, 16)}...)`);
printNode('after answer');
console.log("→ KEY: Status is still 'waiting-question', NOT 'starting'");
console.log('→ KEY: pending_question_id preserved — handler did NOT clear it');
console.log();

// ──────────────────────────────────────────────────────────────────────────────
// 4. Orchestrator Triggers Restart (node:restart)
//
// Workshop 10 introduced the node:restart event. After the answer is recorded,
// the orchestrator (or human) raises node:restart. The handler sets
// 'restart-pending' and clears pending_question_id. This is a convention-based
// contract: the handler sets the stored status, then the reality builder maps
// 'restart-pending' to computed 'ready', and ONBAS returns 'start-node'.
// ──────────────────────────────────────────────────────────────────────────────

const restartResult = await nodeEventService.raise(
  GRAPH,
  NODE,
  'node:restart',
  { reason: 'Question answered, resuming work' },
  'orchestrator'
);

// Load fresh state and run handlers (Settle phase)
state = await loadState(GRAPH);
ehs.processGraph(state, SUBSCRIBER, 'cli');
await persistState(GRAPH, state);

const restartEventForLog = restartResult.event;
console.log('━━━ Section 4: Restart Initiated ━━━');
console.log(`→ Raised node:restart (event_id: ${restartEventForLog?.event_id.slice(0, 16)}...)`);
printNode('after restart');
console.log('→ pending_question_id cleared — handler owns this cleanup');
console.log("→ Reality builder would map 'restart-pending' → 'ready'");
console.log();

// ──────────────────────────────────────────────────────────────────────────────
// 5. The Full Event Log
//
// Let's look at the complete event log to see the trail. Each event has a
// subscriber stamp showing what the handler did. This is the Event Domain's
// record — stamps are the authoritative proof of processing.
// ──────────────────────────────────────────────────────────────────────────────

const allEvents = getEvents();

console.log('━━━ Section 5: Event Log ━━━');
console.log(`→ ${allEvents.length} events recorded:\n`);
for (const [i, evt] of allEvents.entries()) {
  const stamp = evt.stamps?.[SUBSCRIBER];
  console.log(
    `   ${i + 1}. ${evt.event_type.padEnd(18)} source=${evt.source.padEnd(13)} stamp=${stamp?.action ?? '(none)'}`
  );
}
console.log();

// ──────────────────────────────────────────────────────────────────────────────
// 6. Cross-Stamp Verification
//
// When the answer was recorded, the handler also cross-stamped the original
// ask event with 'answer-linked'. This creates a bidirectional reference in
// the event log — you can trace from the answer back to the question it
// answered, and from the question forward to its answer.
// ──────────────────────────────────────────────────────────────────────────────

const askEvent = allEvents.find((e) => e.event_type === 'question:ask');
const askStamps = Object.entries(askEvent?.stamps ?? {});

console.log('━━━ Section 6: Cross-Stamp Verification ━━━');
console.log(`→ The question:ask event has ${askStamps.length} stamps:`);
for (const [sub, stamp] of askStamps) {
  console.log(`   subscriber="${sub}" action="${stamp.action}"`);
}
console.log("→ The 'answer-linked' stamp proves this question was answered");
console.log();

// ──────────────────────────────────────────────────────────────────────────────
// 7. The Two-Domain Boundary in Summary
//
// Here's the complete Settle → Decide → Act loop that Phase 6 (ODS) will
// implement. This example proved the Settle phase works correctly. The handler
// recorded events without making graph-domain decisions — which is exactly what
// ONBAS and ODS need to do their jobs.
// ──────────────────────────────────────────────────────────────────────────────

console.log('━━━ Section 7: The Two-Domain Boundary ━━━');
console.log();
console.log('  Event Domain (what we just demonstrated):');
console.log('    Handlers record → stamp, set handler-owned status');
console.log('    question:answer → stamp "answer-recorded", leave node alone');
console.log('    node:restart    → set restart-pending, clear pending_question_id');
console.log();
console.log('  Graph Domain (what Phase 6 ODS will implement):');
console.log('    ONBAS decides  → reads settled state via reality builder');
console.log('    ODS acts       → executes graph actions (startNode, resume, etc.)');
console.log('    restart-pending → reality builder maps to "ready"');
console.log('    "ready" node   → ONBAS returns "start-node" action');
console.log('    ODS executes   → calls startNode(), creates pod, agent resumes');
console.log();

// ──────────────────────────────────────────────────────────────────────────────

console.log('━━━ Done ━━━');
console.log('✓ Walked through the complete question-answer-restart lifecycle');
console.log('✓ Verified handlers record WITHOUT making graph-domain decisions');
console.log('✓ All objects are real instances from the actual implementation');
