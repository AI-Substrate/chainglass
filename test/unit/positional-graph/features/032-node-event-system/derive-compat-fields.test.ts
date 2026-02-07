/*
Test Doc:
- Why: Verify deriveBackwardCompatFields() computes node-level derived fields from the event log (AC-15 prep)
- Contract: pending_question_id derived from latest unanswered ask event; error derived from latest node:error event. Fields recomputed from event log after every handler.
- Usage Notes: Called after every handler, before persist. Only derives node-level fields (pending_question_id, error). Graph-level questions[] deferred to Phase 5.
- Quality Contribution: Catches derivation bugs where backward-compat fields drift from event log state
- Worked Example: events=[ask(new)] → pending_question_id = ask.event_id; events=[ask(handled), answer(handled)] → pending_question_id = undefined
*/

import { describe, expect, it } from 'vitest';

import { deriveBackwardCompatFields } from '../../../../../packages/positional-graph/src/features/032-node-event-system/derive-compat-fields.js';
import type { NodeEvent } from '../../../../../packages/positional-graph/src/features/032-node-event-system/node-event.schema.js';
import type { State } from '../../../../../packages/positional-graph/src/schemas/state.schema.js';

// ── Test Infrastructure ──────────────────────────────────

function makeState(nodeId: string, status: string, events: NodeEvent[] = []): State {
  return {
    graph_status: 'in_progress',
    updated_at: new Date().toISOString(),
    nodes: {
      [nodeId]: {
        status: status as 'starting',
        started_at: new Date().toISOString(),
        events,
      },
    },
  };
}

function makeAskEvent(
  eventId: string,
  status: 'new' | 'handled' | 'acknowledged' = 'new',
  overrides: Partial<NodeEvent> = {}
): NodeEvent {
  return {
    event_id: eventId,
    event_type: 'question:ask',
    source: 'agent',
    payload: { type: 'text', text: 'What color?' },
    status,
    stops_execution: true,
    created_at: '2026-02-07T10:00:00.000Z',
    ...overrides,
  };
}

function makeAnswerEvent(questionEventId: string, overrides: Partial<NodeEvent> = {}): NodeEvent {
  return {
    event_id: `evt_answer_${Date.now().toString(16)}`,
    event_type: 'question:answer',
    source: 'human',
    payload: { question_event_id: questionEventId, answer: 'blue' },
    status: 'handled',
    stops_execution: false,
    created_at: '2026-02-07T10:05:00.000Z',
    ...overrides,
  };
}

function makeErrorEvent(
  code: string,
  message: string,
  overrides: Partial<NodeEvent> = {}
): NodeEvent {
  return {
    event_id: `evt_error_${Date.now().toString(16)}`,
    event_type: 'node:error',
    source: 'agent',
    payload: { code, message },
    status: 'handled',
    stops_execution: true,
    created_at: '2026-02-07T10:00:00.000Z',
    ...overrides,
  };
}

// ── pending_question_id derivation ───────────────────────

describe('deriveBackwardCompatFields — pending_question_id', () => {
  /*
  Test Doc:
  - Why: pending_question_id must be derived from the event log, not stored independently
  - Contract: Latest unanswered ask → set pending_question_id; answered → clear; no asks → undefined
  - Usage Notes: An "unanswered" ask has no matching question:answer in events
  - Quality Contribution: Catches cases where pending_question_id drifts from event log state
  - Worked Example: ask(new) → pending=ask_id; ask(handled)+answer → pending=undefined
  */

  it('sets pending_question_id from the latest unanswered ask', () => {
    const state = makeState('node-1', 'waiting-question', [makeAskEvent('evt_ask_001', 'new')]);

    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].pending_question_id).toBe('evt_ask_001');
  });

  it('clears pending_question_id when the ask is answered', () => {
    const state = makeState('node-1', 'waiting-question', [
      makeAskEvent('evt_ask_001', 'handled', {
        handled_at: '2026-02-07T10:05:00.000Z',
        handler_notes: 'answered by human',
      }),
      makeAnswerEvent('evt_ask_001'),
    ]);

    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].pending_question_id).toBeUndefined();
  });

  it('sets pending_question_id to undefined when there are no ask events', () => {
    const state = makeState('node-1', 'agent-accepted', []);

    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].pending_question_id).toBeUndefined();
  });

  it('uses the latest unanswered ask when multiple asks exist', () => {
    const state = makeState('node-1', 'waiting-question', [
      makeAskEvent('evt_ask_001', 'handled', {
        handled_at: '2026-02-07T10:05:00.000Z',
        handler_notes: 'answered',
      }),
      makeAnswerEvent('evt_ask_001'),
      makeAskEvent('evt_ask_002', 'new', {
        created_at: '2026-02-07T11:00:00.000Z',
      }),
    ]);

    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].pending_question_id).toBe('evt_ask_002');
  });

  it('handles undefined events array gracefully', () => {
    const state: State = {
      graph_status: 'in_progress',
      updated_at: new Date().toISOString(),
      nodes: {
        'node-1': {
          status: 'agent-accepted',
          started_at: new Date().toISOString(),
        },
      },
    };

    // Should not throw
    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].pending_question_id).toBeUndefined();
  });
});

// ── error derivation ─────────────────────────────────────

describe('deriveBackwardCompatFields — error', () => {
  /*
  Test Doc:
  - Why: error field must be derived from latest node:error event payload
  - Contract: Latest error event → populate error field; no errors → undefined
  - Usage Notes: Error payload has { code, message, details? }
  - Quality Contribution: Catches cases where error field doesn't match latest error event
  - Worked Example: error_event({code:'ERR', message:'fail'}) → error = {code:'ERR', message:'fail'}
  */

  it('populates error from the latest node:error event', () => {
    const state = makeState('node-1', 'blocked-error', [
      makeErrorEvent('AGENT_FAILURE', 'Something went wrong'),
    ]);

    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    const error = nodes['node-1'].error;
    expect(error).toBeDefined();
    expect((error as NonNullable<typeof error>).code).toBe('AGENT_FAILURE');
    expect((error as NonNullable<typeof error>).message).toBe('Something went wrong');
  });

  it('sets error to undefined when there are no error events', () => {
    const state = makeState('node-1', 'agent-accepted', []);

    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    expect(nodes['node-1'].error).toBeUndefined();
  });

  it('uses the latest error event when multiple exist', () => {
    const state = makeState('node-1', 'blocked-error', [
      makeErrorEvent('FIRST_ERROR', 'First failure', {
        created_at: '2026-02-07T10:00:00.000Z',
        event_id: 'evt_err_001',
      }),
      makeErrorEvent('SECOND_ERROR', 'Second failure', {
        created_at: '2026-02-07T11:00:00.000Z',
        event_id: 'evt_err_002',
      }),
    ]);

    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    const error = nodes['node-1'].error;
    expect(error).toBeDefined();
    expect((error as NonNullable<typeof error>).code).toBe('SECOND_ERROR');
    expect((error as NonNullable<typeof error>).message).toBe('Second failure');
  });

  it('includes details from error payload when present', () => {
    const state = makeState('node-1', 'blocked-error', [
      makeErrorEvent('ERR', 'fail', {
        event_id: 'evt_err_with_details',
        payload: {
          code: 'ERR',
          message: 'fail',
          details: { stack: 'at line 42' },
        },
      }),
    ]);

    deriveBackwardCompatFields(state, 'node-1');

    const nodes = state.nodes as NonNullable<typeof state.nodes>;
    const error = nodes['node-1'].error;
    expect(error).toBeDefined();
    expect((error as NonNullable<typeof error>).details).toEqual({ stack: 'at line 42' });
  });
});
