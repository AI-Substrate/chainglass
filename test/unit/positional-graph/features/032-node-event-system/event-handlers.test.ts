/*
Test Doc:
- Why: Verify all 6 event handlers apply correct state transitions and event lifecycle changes
- Contract: Each handler mutates state in-place: status transitions, timestamps, event lifecycle. Handlers are pure functions called between event creation and state persistence.
- Usage Notes: Handlers receive (state, nodeId, event) and mutate both state and event. Test each handler in isolation with pre-built state. The handler map is created via createEventHandlers().
- Quality Contribution: Catches incorrect status transitions, missing timestamp updates, and event lifecycle bugs. Each handler is tested against Workshop #02 walkthrough expectations.
- Worked Example: handleNodeAccepted(state, 'n1', event) with status 'starting' → status becomes 'agent-accepted', event.status becomes 'handled', event.handled_at set
*/

import { describe, expect, it } from 'vitest';

import { createEventHandlers } from '../../../../../packages/positional-graph/src/features/032-node-event-system/event-handlers.js';
import {
  FakeNodeEventRegistry,
  registerCoreEventTypes,
} from '../../../../../packages/positional-graph/src/features/032-node-event-system/index.js';
import type { NodeEvent } from '../../../../../packages/positional-graph/src/features/032-node-event-system/node-event.schema.js';
import { raiseEvent } from '../../../../../packages/positional-graph/src/features/032-node-event-system/raise-event.js';
import type { RaiseEventDeps } from '../../../../../packages/positional-graph/src/features/032-node-event-system/raise-event.js';
import type { State } from '../../../../../packages/positional-graph/src/schemas/state.schema.js';

// ── Test Infrastructure ──────────────────────────────────

/** Create a minimal valid state with a node in the given status. */
function makeState(
  nodeId: string,
  status: string,
  extraNodeFields?: Record<string, unknown>
): State {
  return {
    graph_status: 'in_progress',
    updated_at: new Date().toISOString(),
    nodes: {
      [nodeId]: {
        status: status as 'starting',
        started_at: new Date().toISOString(),
        ...extraNodeFields,
      },
    },
  };
}

/** Create a minimal NodeEvent for testing a handler. */
function makeEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
  overrides: Partial<NodeEvent> = {}
): NodeEvent {
  return {
    event_id: `evt_test_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 6)}`,
    event_type: eventType,
    source: 'agent',
    payload,
    status: 'new',
    stops_execution: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Get handler map ──────────────────────────────────────

const handlers = createEventHandlers();

// ── T001: node:accepted handler tests ────────────────────

describe('node:accepted handler', () => {
  /*
  Test Doc:
  - Why: Two-phase handshake requires node:accepted to transition starting → agent-accepted (AC-6)
  - Contract: Handler transitions node status from starting to agent-accepted, marks event as handled with handled_at timestamp
  - Usage Notes: Per Workshop #02 Walkthrough 1; this is the simplest handler — just status transition + event lifecycle
  - Quality Contribution: Catches missing status transition or event lifecycle update in the handshake
  - Worked Example: state.nodes['n1'].status = 'starting' + event(node:accepted) → status = 'agent-accepted', event.status = 'handled'
  */

  const handler = handlers.get('node:accepted');

  it('handler exists in the handler map', () => {
    expect(handler).toBeDefined();
  });

  it('transitions node status from starting to agent-accepted', () => {
    const state = makeState('node-1', 'starting');
    const event = makeEvent('node:accepted');

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('agent-accepted');
  });

  it('marks the event as handled with handled_at timestamp', () => {
    const state = makeState('node-1', 'starting');
    const event = makeEvent('node:accepted');

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    expect(event.status).toBe('handled');
    expect(event.handled_at).toBeDefined();
    // Verify ISO-8601 format
    expect(() => new Date(event.handled_at as string).toISOString()).not.toThrow();
  });
});

// ── T002: node:completed handler tests ───────────────────

describe('node:completed handler', () => {
  /*
  Test Doc:
  - Why: Completion handler must transition to complete, set completed_at, and mark event handled
  - Contract: Status → 'complete', completed_at set to ISO-8601, event.status → 'handled'
  - Usage Notes: Per Workshop #02 Walkthrough 1 final step
  - Quality Contribution: Catches missing completed_at timestamp or incorrect status transition
  - Worked Example: state.nodes['n1'].status = 'agent-accepted' + event(node:completed) → status = 'complete', completed_at set
  */

  const handler = handlers.get('node:completed');

  it('handler exists in the handler map', () => {
    expect(handler).toBeDefined();
  });

  it('transitions node status to complete', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('node:completed');

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('complete');
  });

  it('sets completed_at timestamp', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('node:completed');

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].completed_at).toBeDefined();
    expect(() => new Date(nodes['node-1'].completed_at as string).toISOString()).not.toThrow();
  });

  it('marks the event as handled', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('node:completed');

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    expect(event.status).toBe('handled');
    expect(event.handled_at).toBeDefined();
  });
});

// ── T003: node:error handler tests ───────────────────────

describe('node:error handler', () => {
  /*
  Test Doc:
  - Why: Error handler must transition to blocked-error and populate error field from payload (AC-7)
  - Contract: Status → 'blocked-error', error field populated with code/message/details from payload, event handled
  - Usage Notes: Per Workshop #02 Walkthrough 3; payload has { code, message, details?, recoverable? }
  - Quality Contribution: Catches missing error field population or incorrect status transition
  - Worked Example: event(node:error, { code: 'ERR', message: 'fail' }) → status = 'blocked-error', error = { code: 'ERR', message: 'fail' }
  */

  const handler = handlers.get('node:error');

  it('handler exists in the handler map', () => {
    expect(handler).toBeDefined();
  });

  it('transitions node status to blocked-error', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('node:error', {
      code: 'AGENT_FAILURE',
      message: 'Something went wrong',
    });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('blocked-error');
  });

  it('populates error field from event payload', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('node:error', {
      code: 'AGENT_FAILURE',
      message: 'Something went wrong',
      details: { stack: 'trace here' },
    });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    const error = nodes['node-1'].error;
    expect(error).toBeDefined();
    expect((error as NonNullable<typeof error>).code).toBe('AGENT_FAILURE');
    expect((error as NonNullable<typeof error>).message).toBe('Something went wrong');
    expect((error as NonNullable<typeof error>).details).toEqual({ stack: 'trace here' });
  });

  it('marks the event as handled', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('node:error', {
      code: 'AGENT_FAILURE',
      message: 'Something went wrong',
    });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    expect(event.status).toBe('handled');
    expect(event.handled_at).toBeDefined();
  });
});

// ── T004: question:ask handler tests ─────────────────────

describe('question:ask handler', () => {
  /*
  Test Doc:
  - Why: Ask handler transitions to waiting-question, sets pending_question_id, event stays new (AC-7)
  - Contract: Status → 'waiting-question', pending_question_id = event.event_id, event.status stays 'new' (deferred processing)
  - Usage Notes: Per Workshop #02 Walkthrough 2. question:ask is the ONLY event that stays 'new' after handler — requires external action (someone must answer)
  - Quality Contribution: Catches the critical difference — ask events are deferred, not immediately handled
  - Worked Example: event(question:ask, { type: 'text', text: 'What?' }) → status = 'waiting-question', pending_question_id = event.event_id, event.status = 'new'
  */

  const handler = handlers.get('question:ask');

  it('handler exists in the handler map', () => {
    expect(handler).toBeDefined();
  });

  it('transitions node status to waiting-question', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('question:ask', { type: 'text', text: 'What color?' });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('waiting-question');
  });

  it('sets pending_question_id to the event_id', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('question:ask', { type: 'text', text: 'What color?' });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].pending_question_id).toBe(event.event_id);
  });

  it('leaves event status as new (deferred processing)', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('question:ask', { type: 'text', text: 'What color?' });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    // question:ask is the ONLY event type that stays 'new' after the handler.
    // External action is required — someone must answer the question.
    expect(event.status).toBe('new');
    expect(event.handled_at).toBeUndefined();
  });
});

// ── T005: question:answer handler tests ──────────────────

describe('question:answer handler', () => {
  /*
  Test Doc:
  - Why: Answer handler marks ask event handled, clears pending_question_id, marks answer handled (AC-7)
  - Contract: Original ask event → status 'handled' + handler_notes, pending_question_id cleared, answer event → handled, node status unchanged
  - Usage Notes: Per Workshop #02 Q&A lifecycle. The answer handler MUTATES A DIFFERENT EVENT (the ask event) — this is unique among all handlers. Node status stays waiting-question (ONBAS detects answer on next walk).
  - Quality Contribution: Catches the cross-event mutation pattern, pending_question_id lifecycle, and status preservation
  - Worked Example: answer event + ask event in events[] → ask.status = 'handled', ask.handler_notes set, answer.status = 'handled', pending_question_id = undefined
  */

  const handler = handlers.get('question:answer');

  it('handler exists in the handler map', () => {
    expect(handler).toBeDefined();
  });

  it('marks the original ask event as handled with handler_notes', () => {
    const askEvent: NodeEvent = {
      event_id: 'evt_ask_1234',
      event_type: 'question:ask',
      source: 'agent',
      payload: { type: 'text', text: 'What color?' },
      status: 'new',
      stops_execution: true,
      created_at: '2026-02-07T10:00:00.000Z',
    };
    const answerEvent = makeEvent('question:answer', {
      question_event_id: 'evt_ask_1234',
      answer: 'blue',
    });

    const state = makeState('node-1', 'waiting-question', {
      pending_question_id: 'evt_ask_1234',
      events: [askEvent, answerEvent],
    });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', answerEvent);

    // Ask event should now be handled
    expect(askEvent.status).toBe('handled');
    expect(askEvent.handled_at).toBeDefined();
    expect(askEvent.handler_notes).toBeDefined();
    expect(askEvent.handler_notes).toContain('answered');
  });

  it('clears pending_question_id on the node', () => {
    const askEvent: NodeEvent = {
      event_id: 'evt_ask_1234',
      event_type: 'question:ask',
      source: 'agent',
      payload: { type: 'text', text: 'What color?' },
      status: 'new',
      stops_execution: true,
      created_at: '2026-02-07T10:00:00.000Z',
    };
    const answerEvent = makeEvent('question:answer', {
      question_event_id: 'evt_ask_1234',
      answer: 'blue',
    });

    const state = makeState('node-1', 'waiting-question', {
      pending_question_id: 'evt_ask_1234',
      events: [askEvent, answerEvent],
    });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', answerEvent);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].pending_question_id).toBeUndefined();
  });

  it('marks the answer event as handled', () => {
    const askEvent: NodeEvent = {
      event_id: 'evt_ask_1234',
      event_type: 'question:ask',
      source: 'agent',
      payload: { type: 'text', text: 'What color?' },
      status: 'new',
      stops_execution: true,
      created_at: '2026-02-07T10:00:00.000Z',
    };
    const answerEvent = makeEvent('question:answer', {
      question_event_id: 'evt_ask_1234',
      answer: 'blue',
    });

    const state = makeState('node-1', 'waiting-question', {
      pending_question_id: 'evt_ask_1234',
      events: [askEvent, answerEvent],
    });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', answerEvent);

    expect(answerEvent.status).toBe('handled');
    expect(answerEvent.handled_at).toBeDefined();
  });

  it('does not change the node status (stays waiting-question)', () => {
    const askEvent: NodeEvent = {
      event_id: 'evt_ask_1234',
      event_type: 'question:ask',
      source: 'agent',
      payload: { type: 'text', text: 'What color?' },
      status: 'new',
      stops_execution: true,
      created_at: '2026-02-07T10:00:00.000Z',
    };
    const answerEvent = makeEvent('question:answer', {
      question_event_id: 'evt_ask_1234',
      answer: 'blue',
    });

    const state = makeState('node-1', 'waiting-question', {
      pending_question_id: 'evt_ask_1234',
      events: [askEvent, answerEvent],
    });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', answerEvent);

    // Node status does NOT change on answer — ONBAS detects the answer on next walk
    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('waiting-question');
  });
});

// ── T006: progress:update handler tests ──────────────────

describe('progress:update handler', () => {
  /*
  Test Doc:
  - Why: Progress handler should not change node state, only mark event as handled
  - Contract: No status transition, no side effects on node state, event.status → 'handled'
  - Usage Notes: Per Workshop #02 Walkthrough 4; progress events are informational only
  - Quality Contribution: Catches accidental state mutations from informational events
  - Worked Example: event(progress:update, { message: '50%' }) → node status unchanged, event.status = 'handled'
  */

  const handler = handlers.get('progress:update');

  it('handler exists in the handler map', () => {
    expect(handler).toBeDefined();
  });

  it('does not change node status', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('progress:update', { message: 'Working on it' });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('agent-accepted');
  });

  it('marks the event as handled', () => {
    const state = makeState('node-1', 'agent-accepted');
    const event = makeEvent('progress:update', { message: 'Working on it' });

    expect(handler).toBeDefined();
    (handler as NonNullable<typeof handler>)(state, 'node-1', event);

    expect(event.status).toBe('handled');
    expect(event.handled_at).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// T011: End-to-End Walkthrough Tests (via raiseEvent pipeline)
// ═══════════════════════════════════════════════════════════

// These tests exercise the full raiseEvent() pipeline: validate → create →
// append → handle → derive compat → persist. They match Workshop #02
// lifecycle walkthroughs.

/** In-memory state store for E2E tests (same pattern as raise-event.test.ts). */
function createFakeStateStore(initial?: Record<string, State>) {
  const store = new Map<string, State>(Object.entries(initial ?? {}));
  return {
    loadState: async (graphSlug: string): Promise<State> => {
      const s = store.get(graphSlug);
      if (!s) throw new Error(`Graph '${graphSlug}' not found`);
      return structuredClone(s);
    },
    persistState: async (graphSlug: string, s: State): Promise<void> => {
      store.set(graphSlug, structuredClone(s));
    },
    getState: (graphSlug: string): State | undefined => store.get(graphSlug),
  };
}

function createE2EDeps(stateStore: ReturnType<typeof createFakeStateStore>): RaiseEventDeps {
  const registry = new FakeNodeEventRegistry();
  registerCoreEventTypes(registry);
  return {
    registry,
    loadState: stateStore.loadState,
    persistState: stateStore.persistState,
  };
}

describe('Workshop #02 Walkthrough 1: Happy Path (accept → complete)', () => {
  /*
  Test Doc:
  - Why: Verify the full happy-path lifecycle through raiseEvent pipeline
  - Contract: starting → node:accepted → agent-accepted → node:completed → complete with completed_at
  - Usage Notes: Output events removed — this walkthrough skips output:save-data
  - Quality Contribution: Proves end-to-end pipeline works for the simplest lifecycle
  - Worked Example: raiseEvent(accept) → raiseEvent(complete) → status='complete', 2 events, completed_at set
  */

  it('transitions through accept and complete with correct state at each step', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const deps = createE2EDeps(stateStore);

    // Step 1: Agent accepts the node
    const acceptResult = await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');
    expect(acceptResult.ok).toBe(true);

    let state = stateStore.getState('my-graph') as NonNullable<State>;
    let nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('agent-accepted');
    expect(nodes['node-1'].events).toHaveLength(1);
    const acceptEvent = (nodes['node-1'].events as NodeEvent[])[0];
    expect(acceptEvent.event_type).toBe('node:accepted');
    expect(acceptEvent.status).toBe('handled');
    expect(acceptEvent.handled_at).toBeDefined();

    // Step 2: Agent completes the node
    const completeResult = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'node:completed',
      {},
      'agent'
    );
    expect(completeResult.ok).toBe(true);

    state = stateStore.getState('my-graph') as NonNullable<State>;
    nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('complete');
    expect(nodes['node-1'].completed_at).toBeDefined();
    expect(nodes['node-1'].events).toHaveLength(2);
    const completedEvent = (nodes['node-1'].events as NodeEvent[])[1];
    expect(completedEvent.event_type).toBe('node:completed');
    expect(completedEvent.status).toBe('handled');
  });
});

describe('Workshop #02 Walkthrough 2: Q&A Lifecycle', () => {
  /*
  Test Doc:
  - Why: Verify question ask/answer lifecycle through raiseEvent pipeline
  - Contract: agent-accepted → question:ask → waiting-question + pending_question_id; question:answer → ask handled, pending cleared
  - Usage Notes: Node status stays waiting-question after answer — ONBAS handles resume
  - Quality Contribution: Proves the most complex handler interaction works end-to-end
  - Worked Example: accept → ask → answer → status='waiting-question', pending=undefined, ask.status='handled'
  */

  it('manages question lifecycle with correct state at each step', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const deps = createE2EDeps(stateStore);

    // Step 1: Agent accepts
    await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    // Step 2: Agent asks a question
    const askResult = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'question:ask',
      { type: 'single', text: 'Which framework?', options: ['React', 'Vue', 'Angular'] },
      'agent'
    );
    expect(askResult.ok).toBe(true);

    let state = stateStore.getState('my-graph') as NonNullable<State>;
    let nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('waiting-question');
    expect(nodes['node-1'].pending_question_id).toBeDefined();
    expect(nodes['node-1'].events).toHaveLength(2);

    const askEvent = (nodes['node-1'].events as NodeEvent[])[1];
    expect(askEvent.event_type).toBe('question:ask');
    expect(askEvent.status).toBe('new'); // Deferred — stays new
    const askEventId = askEvent.event_id;
    expect(nodes['node-1'].pending_question_id).toBe(askEventId);

    // Step 3: Human answers the question
    const answerResult = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'question:answer',
      { question_event_id: askEventId, answer: 'React' },
      'human'
    );
    expect(answerResult.ok).toBe(true);

    state = stateStore.getState('my-graph') as NonNullable<State>;
    nodes = state.nodes as NonNullable<typeof state.nodes>;

    // Node status stays waiting-question (ONBAS handles resume)
    expect(nodes['node-1'].status).toBe('waiting-question');
    // pending_question_id cleared by compat derivation
    expect(nodes['node-1'].pending_question_id).toBeUndefined();
    expect(nodes['node-1'].events).toHaveLength(3);

    // Ask event should now be handled
    const persistedAskEvent = (nodes['node-1'].events as NodeEvent[])[1];
    expect(persistedAskEvent.status).toBe('handled');
    expect(persistedAskEvent.handled_at).toBeDefined();
    expect(persistedAskEvent.handler_notes).toContain('answered');

    // Answer event should be handled
    const answerEvent = (nodes['node-1'].events as NodeEvent[])[2];
    expect(answerEvent.event_type).toBe('question:answer');
    expect(answerEvent.status).toBe('handled');
  });
});

describe('Workshop #02 Walkthrough 3: Error Path', () => {
  /*
  Test Doc:
  - Why: Verify error reporting lifecycle through raiseEvent pipeline
  - Contract: agent-accepted → node:error → blocked-error + error field populated from payload
  - Usage Notes: Per Workshop #02; error field derived from event log via compat derivation
  - Quality Contribution: Proves error state transition and field population work end-to-end
  - Worked Example: accept → error(AGENT_TIMEOUT) → status='blocked-error', error.code='AGENT_TIMEOUT'
  */

  it('transitions to blocked-error with correct error field', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const deps = createE2EDeps(stateStore);

    // Step 1: Agent accepts
    await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    // Step 2: Agent reports error
    const errorResult = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'node:error',
      {
        code: 'AGENT_TIMEOUT',
        message: 'Failed to generate spec within time limit',
        details: { elapsed_seconds: 300 },
      },
      'agent'
    );
    expect(errorResult.ok).toBe(true);

    const state = stateStore.getState('my-graph') as NonNullable<State>;
    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].status).toBe('blocked-error');
    expect(nodes['node-1'].events).toHaveLength(2);

    // Error field derived from event log
    const error = nodes['node-1'].error;
    expect(error).toBeDefined();
    expect((error as NonNullable<typeof error>).code).toBe('AGENT_TIMEOUT');
    expect((error as NonNullable<typeof error>).message).toBe(
      'Failed to generate spec within time limit'
    );
    expect((error as NonNullable<typeof error>).details).toEqual({ elapsed_seconds: 300 });

    // Error event should be handled
    const errorEvent = (nodes['node-1'].events as NodeEvent[])[1];
    expect(errorEvent.event_type).toBe('node:error');
    expect(errorEvent.status).toBe('handled');
  });
});

describe('Workshop #02 Walkthrough 4: Progress Updates', () => {
  /*
  Test Doc:
  - Why: Verify progress events don't affect node state
  - Contract: agent-accepted + progress:update → status unchanged, event handled
  - Usage Notes: Progress events are informational only — no state transitions
  - Quality Contribution: Proves progress events don't accidentally mutate state
  - Worked Example: accept → progress(25%) → progress(50%) → status='agent-accepted', 3 events
  */

  it('records progress events without changing node state', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const deps = createE2EDeps(stateStore);

    // Step 1: Agent accepts
    await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    // Step 2: Progress update 25%
    const p1 = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'progress:update',
      { message: 'Analyzing spec requirements...', percent: 25 },
      'agent'
    );
    expect(p1.ok).toBe(true);

    // Step 3: Progress update 50%
    const p2 = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'progress:update',
      { message: 'Generating output...', percent: 50 },
      'agent'
    );
    expect(p2.ok).toBe(true);

    const state = stateStore.getState('my-graph') as NonNullable<State>;
    const nodes = state.nodes as NonNullable<typeof state.nodes>;

    // Status unchanged after progress events
    expect(nodes['node-1'].status).toBe('agent-accepted');
    expect(nodes['node-1'].events).toHaveLength(3);

    // Both progress events handled
    const events = nodes['node-1'].events as NodeEvent[];
    expect(events[1].event_type).toBe('progress:update');
    expect(events[1].status).toBe('handled');
    expect(events[2].event_type).toBe('progress:update');
    expect(events[2].status).toBe('handled');
  });
});
