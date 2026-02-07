/*
Test Doc:
- Why: Verify all 6 event error factories produce valid ResultError objects with correct codes
- Contract: Each factory returns {code, message, action}; codes match E190-E195
- Usage Notes: Factories are used by raiseEvent() validation (Phase 3); registry uses inline E190/E191 (may switch to these factories later)
- Quality Contribution: Catches error code misassignment or missing fields
- Worked Example: eventTypeNotFoundError('bad', ['a','b']) → {code:'E190', message:'Unknown event type \'bad\'. Available types: a, b', action:'Run ...'}
*/

import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  eventAlreadyAnsweredError,
  eventPayloadValidationError,
  eventQuestionNotFoundError,
  eventSourceNotAllowedError,
  eventStateTransitionError,
  eventTypeNotFoundError,
} from '../../../../../packages/positional-graph/src/features/032-node-event-system/event-errors.js';

describe('Event error factories', () => {
  it('E190: eventTypeNotFoundError', () => {
    /*
    Test Doc:
    - Why: E190 is the first-line error when an unknown event type is raised
    - Contract: Returns code 'E190'; message includes the bad type and available types
    - Usage Notes: Available types list helps users discover valid options
    - Quality Contribution: Catches code mismatch or missing type name in message
    - Worked Example: eventTypeNotFoundError('bad:type', ['node:accepted']) → code='E190', message contains 'bad:type' and 'node:accepted'
    */
    const err = eventTypeNotFoundError('bad:type', ['node:accepted', 'node:completed']);
    expect(err.code).toBe('E190');
    expect(err.message).toContain('bad:type');
    expect(err.message).toContain('node:accepted');
    expect(err.action).toBeDefined();
  });

  it('E190: eventTypeNotFoundError with empty available', () => {
    /*
    Test Doc:
    - Why: Edge case — no types registered yet should still produce a helpful message
    - Contract: Returns code 'E190'; message contains 'none' when available list is empty
    - Usage Notes: Happens when registry is empty (e.g., before registerCoreEventTypes)
    - Quality Contribution: Catches crash on empty array or unhelpful "Available types: " message
    - Worked Example: eventTypeNotFoundError('x', []) → message contains 'none'
    */
    const err = eventTypeNotFoundError('x', []);
    expect(err.code).toBe('E190');
    expect(err.message).toContain('none');
  });

  it('E191: eventPayloadValidationError', () => {
    /*
    Test Doc:
    - Why: E191 wraps Zod validation failures into a ResultError with field-level detail
    - Contract: Returns code 'E191'; message includes event type and field path; action references schema command
    - Usage Notes: Accepts ZodIssue[] from Zod safeParse result; maps each issue to message text
    - Quality Contribution: Catches missing field paths or broken action command format
    - Worked Example: eventPayloadValidationError('question:ask', [{path:['text'],...}]) → code='E191', message contains 'question:ask' and 'text'
    */
    const err = eventPayloadValidationError('question:ask', [
      {
        code: 'invalid_type',
        path: ['text'],
        message: 'Required',
        expected: 'string',
        received: 'undefined',
      } as z.ZodIssue,
    ]);
    expect(err.code).toBe('E191');
    expect(err.message).toContain('question:ask');
    expect(err.message).toContain('text');
    expect(err.action).toContain('cg wf node event schema');
  });

  it('E192: eventSourceNotAllowedError', () => {
    /*
    Test Doc:
    - Why: E192 fires when a source (e.g., 'human') tries to raise an event it's not allowed to
    - Contract: Returns code 'E192'; message includes attempted source, event type, and allowed sources
    - Usage Notes: allowedSources come from EventTypeRegistration metadata
    - Quality Contribution: Catches authorization bypass if source check is removed
    - Worked Example: eventSourceNotAllowedError('node:accepted','human',['agent','executor']) → code='E192', message contains all three
    */
    const err = eventSourceNotAllowedError('node:accepted', 'human', ['agent', 'executor']);
    expect(err.code).toBe('E192');
    expect(err.message).toContain('human');
    expect(err.message).toContain('node:accepted');
    expect(err.message).toContain('agent');
    expect(err.action).toBeDefined();
  });

  it('E193: eventStateTransitionError', () => {
    /*
    Test Doc:
    - Why: E193 fires when an event is raised in an invalid node status (e.g., node:accepted in 'complete')
    - Contract: Returns code 'E193'; message includes event type, current status, and allowed statuses
    - Usage Notes: Status validation happens in Phase 4 event handlers
    - Quality Contribution: Catches missing status context in error message
    - Worked Example: eventStateTransitionError('node:accepted','complete',['starting']) → code='E193'
    */
    const err = eventStateTransitionError('node:accepted', 'complete', ['starting']);
    expect(err.code).toBe('E193');
    expect(err.message).toContain('node:accepted');
    expect(err.message).toContain('complete');
    expect(err.message).toContain('starting');
    expect(err.action).toBeDefined();
  });

  it('E194: eventQuestionNotFoundError', () => {
    /*
    Test Doc:
    - Why: E194 fires when question:answer references a non-existent question event
    - Contract: Returns code 'E194'; message includes the referenced event ID
    - Usage Notes: Used in Phase 5 when answering questions
    - Quality Contribution: Catches missing event ID in error message
    - Worked Example: eventQuestionNotFoundError('evt_abc_1234') → code='E194', message contains 'evt_abc_1234'
    */
    const err = eventQuestionNotFoundError('evt_abc_1234');
    expect(err.code).toBe('E194');
    expect(err.message).toContain('evt_abc_1234');
    expect(err.action).toBeDefined();
  });

  it('E195: eventAlreadyAnsweredError', () => {
    /*
    Test Doc:
    - Why: E195 fires when question:answer targets a question that already has an answer
    - Contract: Returns code 'E195'; message includes the question event ID
    - Usage Notes: Prevents double-answering in Phase 5
    - Quality Contribution: Catches idempotency regression if double-answer guard is removed
    - Worked Example: eventAlreadyAnsweredError('evt_abc_1234') → code='E195', message contains 'evt_abc_1234'
    */
    const err = eventAlreadyAnsweredError('evt_abc_1234');
    expect(err.code).toBe('E195');
    expect(err.message).toContain('evt_abc_1234');
    expect(err.action).toBeDefined();
  });

  it('all factories produce objects with code, message, and action', () => {
    /*
    Test Doc:
    - Why: ResultError contract requires all three fields — this is a structural sweep
    - Contract: Every factory returns an object with string code, message, and action properties
    - Usage Notes: Tests all 6 factories with minimal valid args
    - Quality Contribution: Catches any factory that omits a required ResultError field
    - Worked Example: eventTypeNotFoundError('x',[]) → has code, message, action as strings
    */
    const errors = [
      eventTypeNotFoundError('x', []),
      eventPayloadValidationError('x', []),
      eventSourceNotAllowedError('x', 's', []),
      eventStateTransitionError('x', 's', []),
      eventQuestionNotFoundError('x'),
      eventAlreadyAnsweredError('x'),
    ];
    for (const err of errors) {
      expect(err).toHaveProperty('code');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('action');
      expect(typeof err.code).toBe('string');
      expect(typeof err.message).toBe('string');
      expect(typeof err.action).toBe('string');
    }
  });
});
