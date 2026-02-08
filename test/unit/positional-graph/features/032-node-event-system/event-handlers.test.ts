/*
Test Doc:
- Why: Verify all 6 event handlers apply correct state transitions via HandlerContext and subscriber stamps
- Contract: Each handler receives HandlerContext, mutates node state, and stamps events. markHandled() replaced by ctx.stamp().
- Usage Notes: Handlers receive (ctx: HandlerContext). Unit tests use createEventHandlerRegistry() + NodeEventService.handleEvents(). E2E walkthroughs use raiseEvent() → handleEvents() two-step sequence.
- Quality Contribution: Catches incorrect status transitions, missing stamps, and handler regression. Each handler tested against Workshop #02 walkthrough expectations updated for stamps model.
- Worked Example: handleNodeAccepted(ctx) with status 'starting' → status becomes 'agent-accepted', event.stamps['test'] has action 'state-transition'
*/

import { describe, expect, it } from 'vitest';

import {
  FakeNodeEventRegistry,
  NodeEventService,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type { NodeEvent } from '@chainglass/positional-graph/features/032-node-event-system';
import { raiseEvent } from '@chainglass/positional-graph/features/032-node-event-system/raise-event';
import type { RaiseEventDeps } from '@chainglass/positional-graph/features/032-node-event-system/raise-event';
import type { State } from '@chainglass/positional-graph/schemas/state.schema';

// ── Test Infrastructure ──────────────────────────────────

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

function createTestService() {
  const handlerRegistry = createEventHandlerRegistry();
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  return new NodeEventService(
    {
      registry: eventRegistry,
      loadState: async () => ({ graph_slug: 'g', version: '1', created_at: '', updated_at: '' }),
      persistState: async () => {},
    },
    handlerRegistry
  );
}

// ── T001: node:accepted handler tests ────────────────────

describe('node:accepted handler', () => {
  /*
  Test Doc:
  - Why: Two-phase handshake requires node:accepted to transition starting → agent-accepted (AC-6)
  - Contract: Handler transitions node status, stamps event with 'state-transition'
  - Usage Notes: Per Workshop #02 Walkthrough 1; simplest handler — status transition + stamp
  - Quality Contribution: Catches missing status transition or stamp in the handshake
  - Worked Example: status='starting' + handleEvents(node:accepted) → status='agent-accepted', event stamped
  */

  it('transitions node status from starting to agent-accepted', () => {
    const event = makeEvent('node:accepted');
    const state = makeState('node-1', 'starting', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].status).toBe('agent-accepted');
  });

  it('stamps the event with state-transition', () => {
    const event = makeEvent('node:accepted');
    const state = makeState('node-1', 'starting', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(event.stamps?.test).toBeDefined();
    expect(event.stamps?.test.action).toBe('state-transition');
    expect(event.stamps?.test.stamped_at).toBeDefined();
  });

  it('does not write legacy event.status or event.handled_at', () => {
    const event = makeEvent('node:accepted');
    const state = makeState('node-1', 'starting', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(event.status).toBe('new'); // stamps replace markHandled
    expect(event.handled_at).toBeUndefined();
  });
});

// ── T002: node:completed handler tests ───────────────────

describe('node:completed handler', () => {
  /*
  Test Doc:
  - Why: Completion handler must transition to complete, set completed_at, and stamp event
  - Contract: Status → 'complete', completed_at set to ISO-8601, event stamped
  - Usage Notes: Per Workshop #02 Walkthrough 1 final step
  - Quality Contribution: Catches missing completed_at timestamp or incorrect status transition
  - Worked Example: status='agent-accepted' + handleEvents(node:completed) → status='complete', completed_at set, event stamped
  */

  it('transitions node status to complete', () => {
    const event = makeEvent('node:completed');
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].status).toBe('complete');
  });

  it('sets completed_at timestamp', () => {
    const event = makeEvent('node:completed');
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].completed_at).toBeDefined();
    expect(() =>
      new Date(state.nodes?.['node-1'].completed_at as string).toISOString()
    ).not.toThrow();
  });

  it('stamps the event', () => {
    const event = makeEvent('node:completed');
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(event.stamps?.test?.action).toBe('state-transition');
  });
});

// ── T003: node:error handler tests ───────────────────────

describe('node:error handler', () => {
  /*
  Test Doc:
  - Why: Error handler must transition to blocked-error and populate error field from payload (AC-7)
  - Contract: Status → 'blocked-error', error field populated with code/message/details from payload, event stamped
  - Usage Notes: Per Workshop #02 Walkthrough 3; payload has { code, message, details?, recoverable? }
  - Quality Contribution: Catches missing error field population or incorrect status transition
  - Worked Example: handleEvents(node:error, {code:'ERR',message:'fail'}) → status='blocked-error', error populated
  */

  it('transitions node status to blocked-error', () => {
    const event = makeEvent('node:error', { code: 'FAIL', message: 'bad' });
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].status).toBe('blocked-error');
  });

  it('populates error field from event payload', () => {
    const event = makeEvent('node:error', {
      code: 'AGENT_FAILURE',
      message: 'Something went wrong',
      details: { stack: 'trace here' },
    });
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    const error = state.nodes?.['node-1'].error;
    expect(error).toBeDefined();
    expect(error?.code).toBe('AGENT_FAILURE');
    expect(error?.message).toBe('Something went wrong');
    expect(error?.details).toEqual({ stack: 'trace here' });
  });

  it('stamps the event', () => {
    const event = makeEvent('node:error', { code: 'FAIL', message: 'bad' });
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(event.stamps?.test?.action).toBe('state-transition');
  });
});

// ── T004: question:ask handler tests ─────────────────────

describe('question:ask handler', () => {
  /*
  Test Doc:
  - Why: Ask handler transitions to waiting-question, sets pending_question_id from payload.question_id (DYK #3), stamps event
  - Contract: Status → 'waiting-question', pending_question_id = payload.question_id, event stamped
  - Usage Notes: question_id comes from the payload, NOT event_id (DYK #3). All handlers now stamp uniformly.
  - Quality Contribution: Catches pending_question_id source regression (payload.question_id vs event.event_id)
  - Worked Example: handleEvents(question:ask, {question_id:'q1',type:'text',text:'What?'}) → status='waiting-question', pending_question_id='q1'
  */

  it('transitions node status to waiting-question', () => {
    const event = makeEvent('question:ask', { question_id: 'q1', type: 'text', text: 'What?' });
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].status).toBe('waiting-question');
  });

  it('sets pending_question_id from payload.question_id (not event_id)', () => {
    const event = makeEvent('question:ask', {
      question_id: 'q-custom',
      type: 'text',
      text: 'What?',
    });
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].pending_question_id).toBe('q-custom');
    expect(state.nodes?.['node-1'].pending_question_id).not.toBe(event.event_id);
  });

  it('stamps the event', () => {
    const event = makeEvent('question:ask', { question_id: 'q1', type: 'text', text: 'What?' });
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(event.stamps?.test?.action).toBe('state-transition');
  });
});

// ── T005: question:answer handler tests ──────────────────

describe('question:answer handler', () => {
  /*
  Test Doc:
  - Why: Answer handler cross-stamps ask event, clears pending_question_id, transitions to starting (DYK #1b)
  - Contract: Ask event cross-stamped with 'answer-linked', pending_question_id cleared, status → 'starting', answer event stamped
  - Usage Notes: handleQuestionAnswer now transitions to 'starting' (DYK #1b). The agent must re-accept. Cross-stamps via ctx.stampEvent().
  - Quality Contribution: Catches missing starting transition, cross-stamp regression, pending_question_id lifecycle
  - Worked Example: answer event + ask event → ask cross-stamped, status='starting', pending cleared
  */

  it('cross-stamps the original ask event with answer-linked', () => {
    const askEvent = makeEvent(
      'question:ask',
      { question_id: 'q1', type: 'text', text: 'What?' },
      {
        event_id: 'evt_ask_1',
      }
    );
    const answerEvent = makeEvent('question:answer', {
      question_event_id: 'evt_ask_1',
      answer: 'blue',
    });
    const state = makeState('node-1', 'waiting-question', {
      pending_question_id: 'q1',
      events: [askEvent, answerEvent],
    });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(askEvent.stamps?.test).toBeDefined();
    expect(askEvent.stamps?.test.action).toBe('answer-linked');
  });

  it('clears pending_question_id on the node', () => {
    const askEvent = makeEvent(
      'question:ask',
      { question_id: 'q1', type: 'text', text: 'What?' },
      {
        event_id: 'evt_ask_1',
      }
    );
    const answerEvent = makeEvent('question:answer', {
      question_event_id: 'evt_ask_1',
      answer: 'blue',
    });
    const state = makeState('node-1', 'waiting-question', {
      pending_question_id: 'q1',
      events: [askEvent, answerEvent],
    });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].pending_question_id).toBeUndefined();
  });

  it('transitions node to starting (DYK #1b)', () => {
    const askEvent = makeEvent(
      'question:ask',
      { question_id: 'q1', type: 'text', text: 'What?' },
      {
        event_id: 'evt_ask_1',
      }
    );
    const answerEvent = makeEvent('question:answer', {
      question_event_id: 'evt_ask_1',
      answer: 'blue',
    });
    const state = makeState('node-1', 'waiting-question', {
      pending_question_id: 'q1',
      events: [askEvent, answerEvent],
    });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].status).toBe('starting');
  });

  it('stamps the answer event', () => {
    const askEvent = makeEvent(
      'question:ask',
      { question_id: 'q1', type: 'text', text: 'What?' },
      {
        event_id: 'evt_ask_1',
      }
    );
    const answerEvent = makeEvent('question:answer', {
      question_event_id: 'evt_ask_1',
      answer: 'blue',
    });
    const state = makeState('node-1', 'waiting-question', {
      pending_question_id: 'q1',
      events: [askEvent, answerEvent],
    });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(answerEvent.stamps?.test?.action).toBe('state-transition');
  });
});

// ── T006: progress:update handler tests ──────────────────

describe('progress:update handler', () => {
  /*
  Test Doc:
  - Why: Progress handler should not change node state, only stamp event
  - Contract: No status transition, no side effects on node state, event stamped
  - Usage Notes: Per Workshop #02 Walkthrough 4; progress events are informational only
  - Quality Contribution: Catches accidental state mutations from informational events
  - Worked Example: handleEvents(progress:update, {message:'50%'}) → node status unchanged, event stamped
  */

  it('does not change node status', () => {
    const event = makeEvent('progress:update', { message: 'Working on it' });
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(state.nodes?.['node-1'].status).toBe('agent-accepted');
  });

  it('stamps the event', () => {
    const event = makeEvent('progress:update', { message: 'Working on it' });
    const state = makeState('node-1', 'agent-accepted', { events: [event] });
    const service = createTestService();

    service.handleEvents(state, 'node-1', 'test', 'cli');

    expect(event.stamps?.test?.action).toBe('state-transition');
  });
});

// ═══════════════════════════════════════════════════════════
// T011: End-to-End Walkthrough Tests (raise + handleEvents)
// ═══════════════════════════════════════════════════════════

// These tests exercise the full two-phase flow: raiseEvent() (record-only)
// followed by service.handleEvents() (handler invocation with stamps).

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

/** Raise an event and then run handleEvents on the resulting state. */
async function raiseAndHandle(
  deps: RaiseEventDeps,
  stateStore: ReturnType<typeof createFakeStateStore>,
  service: InstanceType<typeof NodeEventService>,
  graphSlug: string,
  nodeId: string,
  eventType: string,
  payload: unknown,
  source: 'agent' | 'human' | 'system'
) {
  const result = await raiseEvent(deps, graphSlug, nodeId, eventType, payload, source);
  if (result.ok) {
    // Load persisted state, run handlers, persist back
    const state = stateStore.getState(graphSlug) as State;
    service.handleEvents(state, nodeId, 'e2e', 'cli');
    await stateStore.persistState(graphSlug, state);
  }
  return result;
}

describe('Workshop #02 Walkthrough 1: Happy Path (accept → complete)', () => {
  /*
  Test Doc:
  - Why: Verify the full happy-path lifecycle through raise + handleEvents two-phase flow
  - Contract: starting → node:accepted → agent-accepted → node:completed → complete with completed_at
  - Usage Notes: raiseEvent is record-only (T007); handleEvents applies stamps via 'e2e' subscriber
  - Quality Contribution: Proves end-to-end pipeline works for the simplest lifecycle
  - Worked Example: raise(accept) + handle → raise(complete) + handle → status='complete', 2 events stamped
  */

  it('transitions through accept and complete with correct state at each step', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const deps = createE2EDeps(stateStore);
    const service = createTestService();

    // Step 1: Agent accepts the node
    const acceptResult = await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'node:accepted',
      {},
      'agent'
    );
    expect(acceptResult.ok).toBe(true);

    let state = stateStore.getState('my-graph') as State;
    let nodes = state.nodes as State['nodes'];
    expect(nodes['node-1'].status).toBe('agent-accepted');
    expect(nodes['node-1'].events).toHaveLength(1);
    const acceptEvent = nodes['node-1'].events?.[0];
    expect(acceptEvent.event_type).toBe('node:accepted');
    expect(acceptEvent.stamps?.e2e?.action).toBe('state-transition');

    // Step 2: Agent completes the node
    const completeResult = await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'node:completed',
      {},
      'agent'
    );
    expect(completeResult.ok).toBe(true);

    state = stateStore.getState('my-graph') as State;
    nodes = state.nodes as State['nodes'];
    expect(nodes['node-1'].status).toBe('complete');
    expect(nodes['node-1'].completed_at).toBeDefined();
    expect(nodes['node-1'].events).toHaveLength(2);
    const completedEvent = nodes['node-1'].events?.[1];
    expect(completedEvent.event_type).toBe('node:completed');
    expect(completedEvent.stamps?.e2e?.action).toBe('state-transition');
  });
});

describe('Workshop #02 Walkthrough 2: Q&A Lifecycle', () => {
  /*
  Test Doc:
  - Why: Verify question ask/answer lifecycle through raise + handleEvents with stamps
  - Contract: question:ask → waiting-question + pending_question_id from payload; question:answer → starting + pending cleared + ask cross-stamped
  - Usage Notes: handleQuestionAnswer transitions to starting (DYK #1b). pending_question_id from payload.question_id (DYK #3).
  - Quality Contribution: Proves the most complex handler interaction works end-to-end
  - Worked Example: accept → ask → answer → status='starting', pending=undefined, ask cross-stamped
  */

  it('manages question lifecycle with correct state at each step', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const deps = createE2EDeps(stateStore);
    const service = createTestService();

    // Step 1: Agent accepts
    await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'node:accepted',
      {},
      'agent'
    );

    // Step 2: Agent asks a question
    const askResult = await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'question:ask',
      {
        question_id: 'q-framework',
        type: 'single',
        text: 'Which framework?',
        options: ['React', 'Vue', 'Angular'],
      },
      'agent'
    );
    expect(askResult.ok).toBe(true);

    let state = stateStore.getState('my-graph') as State;
    let nodes = state.nodes as State['nodes'];
    expect(nodes['node-1'].status).toBe('waiting-question');
    expect(nodes['node-1'].pending_question_id).toBe('q-framework');
    expect(nodes['node-1'].events).toHaveLength(2);

    const askEvent = nodes['node-1'].events?.[1];
    expect(askEvent.event_type).toBe('question:ask');
    expect(askEvent.stamps?.e2e?.action).toBe('state-transition');
    const askEventId = askEvent.event_id;

    // Step 3: Human answers the question
    const answerResult = await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'question:answer',
      { question_event_id: askEventId, answer: 'React' },
      'human'
    );
    expect(answerResult.ok).toBe(true);

    state = stateStore.getState('my-graph') as State;
    nodes = state.nodes as State['nodes'];

    // DYK #1b: Node transitions to starting (agent must re-accept)
    expect(nodes['node-1'].status).toBe('starting');
    expect(nodes['node-1'].pending_question_id).toBeUndefined();
    expect(nodes['node-1'].events).toHaveLength(3);

    // Ask event cross-stamped with answer-linked
    const persistedAskEvent = nodes['node-1'].events?.[1];
    expect(persistedAskEvent.stamps?.e2e?.action).toBe('answer-linked');

    // Answer event stamped
    const answerEvent = nodes['node-1'].events?.[2];
    expect(answerEvent.event_type).toBe('question:answer');
    expect(answerEvent.stamps?.e2e?.action).toBe('state-transition');
  });
});

describe('Workshop #02 Walkthrough 3: Error Path', () => {
  /*
  Test Doc:
  - Why: Verify error reporting lifecycle through raise + handleEvents with stamps
  - Contract: agent-accepted → node:error → blocked-error + error field populated, event stamped
  - Usage Notes: Error field populated directly by handler from payload
  - Quality Contribution: Proves error state transition and field population work end-to-end
  - Worked Example: accept → error(AGENT_TIMEOUT) → status='blocked-error', error.code='AGENT_TIMEOUT'
  */

  it('transitions to blocked-error with correct error field', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const deps = createE2EDeps(stateStore);
    const service = createTestService();

    // Step 1: Agent accepts
    await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'node:accepted',
      {},
      'agent'
    );

    // Step 2: Agent reports error
    const errorResult = await raiseAndHandle(
      deps,
      stateStore,
      service,
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

    const state = stateStore.getState('my-graph') as State;
    const nodes = state.nodes as State['nodes'];
    expect(nodes['node-1'].status).toBe('blocked-error');
    expect(nodes['node-1'].events).toHaveLength(2);

    const error = nodes['node-1'].error;
    expect(error).toBeDefined();
    expect(error?.code).toBe('AGENT_TIMEOUT');
    expect(error?.message).toBe('Failed to generate spec within time limit');
    expect(error?.details).toEqual({ elapsed_seconds: 300 });

    const errorEvent = nodes['node-1'].events?.[1];
    expect(errorEvent.event_type).toBe('node:error');
    expect(errorEvent.stamps?.e2e?.action).toBe('state-transition');
  });
});

describe('Workshop #02 Walkthrough 4: Progress Updates', () => {
  /*
  Test Doc:
  - Why: Verify progress events don't affect node state, stamps applied
  - Contract: agent-accepted + progress:update → status unchanged, events stamped
  - Usage Notes: Progress events are informational only — no state transitions
  - Quality Contribution: Proves progress events don't accidentally mutate state
  - Worked Example: accept → progress(25%) → progress(50%) → status='agent-accepted', 3 events stamped
  */

  it('records progress events without changing node state', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const deps = createE2EDeps(stateStore);
    const service = createTestService();

    await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'node:accepted',
      {},
      'agent'
    );

    const p1 = await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'progress:update',
      { message: 'Analyzing spec requirements...', percent: 25 },
      'agent'
    );
    expect(p1.ok).toBe(true);

    const p2 = await raiseAndHandle(
      deps,
      stateStore,
      service,
      'my-graph',
      'node-1',
      'progress:update',
      { message: 'Generating output...', percent: 50 },
      'agent'
    );
    expect(p2.ok).toBe(true);

    const state = stateStore.getState('my-graph') as State;
    const nodes = state.nodes as State['nodes'];
    expect(nodes['node-1'].status).toBe('agent-accepted');
    expect(nodes['node-1'].events).toHaveLength(3);

    const events = nodes['node-1'].events ?? [];
    expect(events[1].event_type).toBe('progress:update');
    expect(events[1].stamps?.e2e?.action).toBe('state-transition');
    expect(events[2].event_type).toBe('progress:update');
    expect(events[2].stamps?.e2e?.action).toBe('state-transition');
  });
});
