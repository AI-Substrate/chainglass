/*
Test Doc:
- Why: Verify raiseEvent() validates, creates, and persists node events correctly
- Contract: 5-step validation pipeline rejects invalid events with E190-E195; valid events create NodeEvent records and persist atomically
- Usage Notes: raiseEvent is standalone — inject deps via RaiseEventDeps parameter bag. Tests use createFakeStateStore() for in-memory state.
- Quality Contribution: Catches validation ordering bugs, persistence safety violations, and event field correctness
- Worked Example: raiseEvent(deps, 'g', 'n1', 'node:accepted', {}, 'agent') with node in 'starting' → { ok: true, event: { event_type: 'node:accepted', status: 'new' } }
*/

import { describe, expect, it } from 'vitest';

import {
  FakeNodeEventRegistry,
  registerCoreEventTypes,
} from '../../../../../packages/positional-graph/src/features/032-node-event-system/index.js';
import { raiseEvent } from '../../../../../packages/positional-graph/src/features/032-node-event-system/raise-event.js';
import type { RaiseEventDeps } from '../../../../../packages/positional-graph/src/features/032-node-event-system/raise-event.js';
import type { State } from '../../../../../packages/positional-graph/src/schemas/state.schema.js';

// ── Test Infrastructure ──────────────────────────────────

/**
 * In-memory state store for testing raiseEvent() without real filesystem.
 * Per Critical Insight #4: local helper, not shared.
 */
function createFakeStateStore(initial?: Record<string, State>) {
  const store = new Map<string, State>(Object.entries(initial ?? {}));
  const persistCalls: Array<{ graphSlug: string; state: State }> = [];

  return {
    loadState: async (graphSlug: string): Promise<State> => {
      const state = store.get(graphSlug);
      if (!state) throw new Error(`Graph '${graphSlug}' not found`);
      return structuredClone(state);
    },
    persistState: async (graphSlug: string, state: State): Promise<void> => {
      store.set(graphSlug, structuredClone(state));
      persistCalls.push({ graphSlug, state: structuredClone(state) });
    },
    /** Get the current state for a graph (for assertions). */
    getState: (graphSlug: string): State | undefined => store.get(graphSlug),
    /** Get the history of persistState calls. */
    getPersistCalls: () => persistCalls,
    /** Reset all state and history. */
    reset: () => {
      store.clear();
      persistCalls.length = 0;
    },
  };
}

function createDeps(
  stateStore: ReturnType<typeof createFakeStateStore>,
  registry?: FakeNodeEventRegistry
): {
  deps: RaiseEventDeps;
  registry: FakeNodeEventRegistry;
  stateStore: ReturnType<typeof createFakeStateStore>;
} {
  const reg = registry ?? new FakeNodeEventRegistry();
  if (!registry) registerCoreEventTypes(reg);
  return {
    deps: {
      registry: reg,
      loadState: stateStore.loadState,
      persistState: stateStore.persistState,
    },
    registry: reg,
    stateStore,
  };
}

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

// ── T001: Unknown Type Validation (E190) ──────────────────

describe('raiseEvent — unknown type validation (E190)', () => {
  /*
  Test Doc:
  - Why: Step 1 of the 5-step pipeline must reject unregistered event types
  - Contract: Unknown type returns ok: false with E190 error listing available types
  - Usage Notes: Registry.get() returns undefined for unknown types
  - Quality Contribution: Prevents invalid event types from reaching later validation steps
  - Worked Example: raiseEvent(deps, 'g', 'n1', 'bogus:event', {}, 'agent') → E190
  */

  it('returns E190 for an unregistered event type', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'starting') });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'bogus:event', {}, 'agent');

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E190');
    expect(result.errors[0].message).toContain('bogus:event');
    expect(result.event).toBeUndefined();
  });

  it('lists available types in the E190 error message', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'starting') });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'unknown:type', {}, 'agent');

    expect(result.errors[0].message).toContain('node:accepted');
    expect(result.errors[0].message).toContain('question:ask');
  });
});

// ── T002: Invalid Payload Validation (E191) ──────────────

describe('raiseEvent — invalid payload validation (E191)', () => {
  /*
  Test Doc:
  - Why: Step 2 must reject payloads that fail the registered Zod schema
  - Contract: Invalid payload returns ok: false with E191 error including field names and schema hint
  - Usage Notes: raiseEvent uses registry.validatePayload() then maps to factory function
  - Quality Contribution: Ensures agents get actionable feedback on bad payloads
  - Worked Example: raiseEvent(deps, 'g', 'n1', 'node:error', {}, 'agent') → E191 (missing code, message)
  */

  it('returns E191 when required fields are missing', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'agent-accepted') });
    const { deps } = createDeps(stateStore);

    // node:error requires { code, message }, passing empty payload
    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:error', {}, 'agent');

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E191');
    expect(result.errors[0].message).toContain('node:error');
    expect(result.event).toBeUndefined();
  });

  it('returns E191 when extra fields are present (.strict())', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'starting') });
    const { deps } = createDeps(stateStore);

    // node:accepted uses .strict() empty object — extra fields rejected
    const result = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'node:accepted',
      { unexpected: true },
      'agent'
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E191');
  });

  it('includes schema hint in the action field', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'agent-accepted') });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:error', {}, 'agent');

    expect(result.errors[0].action).toBeDefined();
    expect(result.errors[0].action).toContain('node:error');
  });
});

// ── T003: Source Validation (E192) ────────────────────────

describe('raiseEvent — source validation (E192)', () => {
  /*
  Test Doc:
  - Why: Step 3 must reject events from sources not in the event type's allowedSources
  - Contract: Unauthorized source returns ok: false with E192 error listing allowed sources
  - Usage Notes: question:answer only allows ['human', 'orchestrator'] — 'agent' is rejected
  - Quality Contribution: Prevents agents from answering their own questions
  - Worked Example: raiseEvent(deps, 'g', 'n1', 'question:answer', payload, 'agent') → E192
  */

  it('returns E192 when source is not in allowedSources', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'waiting-question'),
    });
    const { deps } = createDeps(stateStore);

    // question:answer allows ['human', 'orchestrator'] only — 'agent' is not allowed
    const result = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'question:answer',
      { question_event_id: 'evt_abc_1234', answer: 'yes' },
      'agent'
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E192');
    expect(result.errors[0].message).toContain('agent');
    expect(result.errors[0].message).toContain('human');
    expect(result.event).toBeUndefined();
  });

  it('accepts valid sources', async () => {
    // node:accepted allows ['agent', 'executor']
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'starting') });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    // Should pass source validation (may still succeed or fail elsewhere)
    // If it returns an error, it should NOT be E192
    if (!result.ok) {
      for (const error of result.errors) {
        expect(error.code).not.toBe('E192');
      }
    }
  });
});

// ── T004: Node State Validation (E193) ────────────────────

describe('raiseEvent — node state validation (E193)', () => {
  /*
  Test Doc:
  - Why: Step 4 must reject events when the node is not in a valid state for that event type
  - Contract: Wrong state returns ok: false with E193 error listing valid states; VALID_FROM_STATES map encodes Workshop #02 rules
  - Usage Notes: Implicit pending (no node entry) is treated as 'pending' — not in any valid-from-states
  - Quality Contribution: Prevents invalid state transitions; catches VALID_FROM_STATES map errors
  - Worked Example: raiseEvent(deps, 'g', 'n1', 'node:accepted', {}, 'agent') with node in 'complete' → E193
  */

  it('returns E193 when node:accepted is raised on a complete node', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'complete') });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E193');
    expect(result.errors[0].message).toContain('complete');
    expect(result.errors[0].message).toContain('starting');
    expect(result.event).toBeUndefined();
  });

  it('returns E193 when question:ask is raised on a starting node', async () => {
    // question:ask requires 'agent-accepted'
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'starting') });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'question:ask',
      { question_id: 'q1', type: 'text', text: 'What color?' },
      'agent'
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('E193');
    expect(result.errors[0].message).toContain('starting');
    expect(result.errors[0].message).toContain('agent-accepted');
  });

  it('returns E193 for implicit pending node (no entry in state.nodes)', async () => {
    // Node not in state.nodes → treated as 'pending' → not in any VALID_FROM_STATES
    const stateStore = createFakeStateStore({
      'my-graph': {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {},
      },
    });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('E193');
    expect(result.errors[0].message).toContain('pending');
  });

  it('returns E193 for a state with undefined nodes record', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
      },
    });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('E193');
  });
});

// ── T005: Question Reference Validation (E194/E195) ──────

describe('raiseEvent — question reference validation (E194/E195)', () => {
  /*
  Test Doc:
  - Why: Step 5 validates question:answer references an existing unanswered question:ask
  - Contract: E194 when question_event_id not found in events; E195 when already answered
  - Usage Notes: events: undefined or [] treated as "no ask found" → E194. Per Critical Insight #2.
  - Quality Contribution: Prevents answers to nonexistent or already-answered questions
  - Worked Example: raiseEvent(deps, 'g', 'n1', 'question:answer', { question_event_id: 'bogus' }, 'human') → E194
  */

  it('returns E194 when question_event_id references a nonexistent ask event', async () => {
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'waiting-question', { events: [] }),
    });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'question:answer',
      { question_event_id: 'evt_nonexistent_0000', answer: 'yes' },
      'human'
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E194');
    expect(result.errors[0].message).toContain('evt_nonexistent_0000');
    expect(result.event).toBeUndefined();
  });

  it('returns E194 when events array is undefined (legacy node)', async () => {
    // Per Critical Insight #2: undefined events treated as empty → E194
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'waiting-question'),
    });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'question:answer',
      { question_event_id: 'evt_abc_1234', answer: 'yes' },
      'human'
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('E194');
  });

  it('returns E195 when the question has already been answered', async () => {
    const askEvent = {
      event_id: 'evt_ask_1234',
      event_type: 'question:ask',
      source: 'agent' as const,
      payload: { type: 'text', text: 'What color?' },
      status: 'new' as const,
      stops_execution: true,
      created_at: new Date().toISOString(),
    };
    const answerEvent = {
      event_id: 'evt_ans_5678',
      event_type: 'question:answer',
      source: 'human' as const,
      payload: { question_event_id: 'evt_ask_1234', answer: 'blue' },
      status: 'new' as const,
      stops_execution: false,
      created_at: new Date().toISOString(),
    };

    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'waiting-question', {
        events: [askEvent, answerEvent],
      }),
    });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'question:answer',
      { question_event_id: 'evt_ask_1234', answer: 'red' },
      'human'
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E195');
    expect(result.errors[0].message).toContain('evt_ask_1234');
  });
});

// ── T006: Successful Event Creation ───────────────────────

describe('raiseEvent — successful event creation', () => {
  /*
  Test Doc:
  - Why: Valid events must create NodeEvent records with correct fields and persist atomically
  - Contract: Created event has correct ID format, status 'new', stops_execution from registry, ISO-8601 timestamps; appended to events[]; state persisted
  - Usage Notes: After T007, raiseEvent is record-only. Event status stays 'new', no stamps. Handlers run via INodeEventService.handleEvents() separately.
  - Quality Contribution: Verifies the happy path end-to-end; catches field mapping bugs
  - Worked Example: raiseEvent(deps, 'g', 'n1', 'node:accepted', {}, 'agent') with node in 'starting' → ok: true, event created, status 'new', no stamps
  */

  it('creates a NodeEvent with correct fields for node:accepted', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'starting') });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.event).toBeDefined();

    const event = result.event as NonNullable<typeof result.event>;
    expect(event.event_id).toMatch(/^evt_[0-9a-f]+_[0-9a-f]{4}$/);
    expect(event.event_type).toBe('node:accepted');
    expect(event.source).toBe('agent');
    expect(event.payload).toEqual({});
    // After T007: raiseEvent is record-only — no handlers, no stamps.
    expect(event.status).toBe('new');
    expect(event.stamps).toBeUndefined();
    expect(event.stops_execution).toBe(false); // node:accepted has stopsExecution: false
    expect(event.created_at).toBeDefined();
    // Verify ISO-8601 format
    expect(() => new Date(event.created_at).toISOString()).not.toThrow();
  });

  it('sets stops_execution from the registry for stop events', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'agent-accepted') });
    const { deps } = createDeps(stateStore);

    // node:completed has stopsExecution: true
    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:completed', {}, 'agent');

    expect(result.ok).toBe(true);
    expect(result.event).toBeDefined();
    expect((result.event as NonNullable<typeof result.event>).stops_execution).toBe(true);
  });

  it('appends the event to the node events array', async () => {
    const existingEvent = {
      event_id: 'evt_existing_1111',
      event_type: 'node:accepted',
      source: 'agent' as const,
      payload: {},
      status: 'new' as const,
      stops_execution: false,
      created_at: new Date().toISOString(),
    };

    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'agent-accepted', {
        events: [existingEvent],
      }),
    });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(
      deps,
      'my-graph',
      'node-1',
      'progress:update',
      { message: 'Working on it' },
      'agent'
    );

    expect(result.ok).toBe(true);

    const savedState = stateStore.getState('my-graph');
    expect(savedState).toBeDefined();
    const nodes = (savedState as NonNullable<typeof savedState>).nodes;
    expect(nodes).toBeDefined();
    const nodeEvents = (nodes as NonNullable<typeof nodes>)['node-1'].events;
    expect(nodeEvents).toBeDefined();
    expect(nodeEvents).toHaveLength(2);
    expect((nodeEvents as NonNullable<typeof nodeEvents>)[0].event_id).toBe('evt_existing_1111');
    expect(result.event).toBeDefined();
    expect((nodeEvents as NonNullable<typeof nodeEvents>)[1].event_id).toBe(
      (result.event as NonNullable<typeof result.event>).event_id
    );
  });

  it('persists state with updated_at timestamp', async () => {
    const oldDate = '2020-01-01T00:00:00.000Z';
    const stateStore = createFakeStateStore({
      'my-graph': {
        graph_status: 'in_progress',
        updated_at: oldDate,
        nodes: {
          'node-1': {
            status: 'starting',
            started_at: new Date().toISOString(),
          },
        },
      },
    });
    const { deps } = createDeps(stateStore);

    await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    const savedState = stateStore.getState('my-graph');
    expect(savedState).toBeDefined();
    const updated = (savedState as NonNullable<typeof savedState>).updated_at;
    expect(updated).not.toBe(oldDate);
    expect(new Date(updated).getTime()).toBeGreaterThan(new Date(oldDate).getTime());
  });

  it('initializes events array when node has no existing events', async () => {
    // Node has no events field — raiseEvent should create the array
    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'starting'),
    });
    const { deps } = createDeps(stateStore);

    const result = await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    expect(result.ok).toBe(true);
    const savedState = stateStore.getState('my-graph');
    expect(savedState).toBeDefined();
    const nodes = (savedState as NonNullable<typeof savedState>).nodes;
    expect(nodes).toBeDefined();
    expect((nodes as NonNullable<typeof nodes>)['node-1'].events).toHaveLength(1);
  });
});

// ── T008: Persistence Safety ──────────────────────────────

describe('raiseEvent — persistence safety', () => {
  /*
  Test Doc:
  - Why: Failed validation must NEVER modify state or call persistState
  - Contract: When validation fails, events array unchanged, persistState not called
  - Usage Notes: This is AC-3's safety proof — invalid events never reach persistence
  - Quality Contribution: Catches bugs where partial state mutations leak through on validation failure
  - Worked Example: Invalid type → persistState call count = 0, events unchanged
  */

  it('does not call persistState when validation fails', async () => {
    const stateStore = createFakeStateStore({ 'my-graph': makeState('node-1', 'starting') });
    const { deps } = createDeps(stateStore);

    // Invalid type → E190
    await raiseEvent(deps, 'my-graph', 'node-1', 'bogus:type', {}, 'agent');

    expect(stateStore.getPersistCalls()).toHaveLength(0);
  });

  it('leaves events array unchanged when validation fails', async () => {
    const existingEvent = {
      event_id: 'evt_existing_1111',
      event_type: 'node:accepted',
      source: 'agent' as const,
      payload: {},
      status: 'new' as const,
      stops_execution: false,
      created_at: new Date().toISOString(),
    };

    const stateStore = createFakeStateStore({
      'my-graph': makeState('node-1', 'complete', {
        events: [existingEvent],
      }),
    });
    const { deps } = createDeps(stateStore);

    // node:accepted on complete node → E193
    await raiseEvent(deps, 'my-graph', 'node-1', 'node:accepted', {}, 'agent');

    // State should not have been modified
    const currentState = stateStore.getState('my-graph');
    expect(currentState).toBeDefined();
    const cNodes = (currentState as NonNullable<typeof currentState>).nodes;
    expect(cNodes).toBeDefined();
    const cEntry = (cNodes as NonNullable<typeof cNodes>)['node-1'];
    expect(cEntry.events).toHaveLength(1);
    expect((cEntry.events as NonNullable<typeof cEntry.events>)[0].event_id).toBe(
      'evt_existing_1111'
    );
    expect(stateStore.getPersistCalls()).toHaveLength(0);
  });
});
