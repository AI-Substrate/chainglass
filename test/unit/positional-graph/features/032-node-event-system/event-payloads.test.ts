/*
Test Doc:
- Why: Validate all 6 event payload schemas accept valid data and reject invalid data
- Contract: Each schema enforces required fields, field types, and .strict() (no extra fields)
- Usage Notes: Schemas use .strict() so any extra field causes rejection
- Quality Contribution: Catches schema regressions when payload shapes change
- Worked Example: QuestionAskPayloadSchema accepts {type:'single',text:'Q?',options:['a']} but rejects {type:'invalid',text:'Q?'}
*/

import { describe, expect, it } from 'vitest';

import {
  NodeAcceptedPayloadSchema,
  NodeCompletedPayloadSchema,
  NodeErrorPayloadSchema,
  ProgressUpdatePayloadSchema,
  QuestionAnswerPayloadSchema,
  QuestionAskPayloadSchema,
} from '../../../../../packages/positional-graph/src/features/032-node-event-system/event-payloads.schema.js';

describe('NodeAcceptedPayloadSchema', () => {
  /*
  Test Doc:
  - Why: node:accepted has an empty payload — must accept {} and reject extras
  - Contract: safeParse({}) succeeds; safeParse({extra:true}) fails (.strict())
  - Usage Notes: Simplest schema — no fields, strict only
  - Quality Contribution: Catches accidental field additions to acceptance payload
  - Worked Example: {} → success; {extra:true} → failure
  */
  it('accepts empty object', () => {
    expect(NodeAcceptedPayloadSchema.safeParse({}).success).toBe(true);
  });

  it('rejects extra fields', () => {
    expect(NodeAcceptedPayloadSchema.safeParse({ extra: true }).success).toBe(false);
  });
});

describe('NodeCompletedPayloadSchema', () => {
  /*
  Test Doc:
  - Why: node:completed has an optional message field — must accept both empty and with-message payloads
  - Contract: safeParse({}) succeeds; safeParse({message:'Done'}) succeeds; extras rejected
  - Usage Notes: message is optional — agents may or may not explain completion
  - Quality Contribution: Catches regression if message becomes required or type changes
  - Worked Example: {} → success; {message:'Done'} → success; {message:'Done',extra:1} → failure
  */
  it('accepts empty object', () => {
    expect(NodeCompletedPayloadSchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional message', () => {
    expect(NodeCompletedPayloadSchema.safeParse({ message: 'Done' }).success).toBe(true);
  });

  it('rejects extra fields', () => {
    expect(NodeCompletedPayloadSchema.safeParse({ message: 'Done', extra: 1 }).success).toBe(false);
  });
});

describe('NodeErrorPayloadSchema', () => {
  /*
  Test Doc:
  - Why: node:error carries structured error info — code+message required, details+recoverable optional
  - Contract: {code,message} required; recoverable defaults false; extras rejected; empty code rejected
  - Usage Notes: code is min(1) string; recoverable defaults to false via .default(false)
  - Quality Contribution: Catches missing required fields or default value changes
  - Worked Example: {code:'AGENT_TIMEOUT',message:'Timed out'} → success with recoverable=false
  */
  it('accepts valid error payload', () => {
    const result = NodeErrorPayloadSchema.safeParse({
      code: 'AGENT_TIMEOUT',
      message: 'Timed out',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recoverable).toBe(false); // default
    }
  });

  it('accepts payload with all optional fields', () => {
    const result = NodeErrorPayloadSchema.safeParse({
      code: 'ERR',
      message: 'Fail',
      details: { elapsed: 300 },
      recoverable: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing code', () => {
    expect(NodeErrorPayloadSchema.safeParse({ message: 'Fail' }).success).toBe(false);
  });

  it('rejects missing message', () => {
    expect(NodeErrorPayloadSchema.safeParse({ code: 'ERR' }).success).toBe(false);
  });

  it('rejects empty code', () => {
    expect(NodeErrorPayloadSchema.safeParse({ code: '', message: 'Fail' }).success).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(NodeErrorPayloadSchema.safeParse({ code: 'E', message: 'M', bonus: true }).success).toBe(
      false
    );
  });
});

describe('QuestionAskPayloadSchema', () => {
  /*
  Test Doc:
  - Why: question:ask carries question type, text, optional options/default — enforces enum + min(1)
  - Contract: type must be text|single|multi|confirm; text min(1); options/default optional; extras rejected
  - Usage Notes: options is structurally optional (cross-field validation deferred to Phase 3)
  - Quality Contribution: Catches invalid question type enums or empty text regressions
  - Worked Example: {type:'single',text:'Which?',options:['React','Vue']} → success; {type:'invalid',text:'Q?'} → failure
  */
  it('accepts text question', () => {
    expect(QuestionAskPayloadSchema.safeParse({ type: 'text', text: 'Why?' }).success).toBe(true);
  });

  it('accepts single-choice with options', () => {
    const result = QuestionAskPayloadSchema.safeParse({
      type: 'single',
      text: 'Which framework?',
      options: ['React', 'Vue', 'Angular'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts confirm with default', () => {
    const result = QuestionAskPayloadSchema.safeParse({
      type: 'confirm',
      text: 'Proceed?',
      default: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(QuestionAskPayloadSchema.safeParse({ type: 'invalid', text: 'Q?' }).success).toBe(false);
  });

  it('rejects empty text', () => {
    expect(QuestionAskPayloadSchema.safeParse({ type: 'text', text: '' }).success).toBe(false);
  });

  it('rejects missing text', () => {
    expect(QuestionAskPayloadSchema.safeParse({ type: 'text' }).success).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(
      QuestionAskPayloadSchema.safeParse({ type: 'text', text: 'Q?', extra: true }).success
    ).toBe(false);
  });
});

describe('QuestionAnswerPayloadSchema', () => {
  /*
  Test Doc:
  - Why: question:answer links back to the ask event and carries an answer of any JSON type
  - Contract: question_event_id required min(1); answer required (any type); extras rejected
  - Usage Notes: answer is z.unknown() — strings, arrays, booleans, objects all valid
  - Quality Contribution: Catches broken link-back (empty event ID) or answer type restriction regressions
  - Worked Example: {question_event_id:'evt_abc_1234',answer:'React'} → success
  */
  it('accepts valid answer', () => {
    const result = QuestionAnswerPayloadSchema.safeParse({
      question_event_id: 'evt_abc_1234',
      answer: 'React',
    });
    expect(result.success).toBe(true);
  });

  it('accepts answer with any type', () => {
    expect(
      QuestionAnswerPayloadSchema.safeParse({
        question_event_id: 'evt_abc_1234',
        answer: ['React', 'Vue'],
      }).success
    ).toBe(true);
  });

  it('rejects missing question_event_id', () => {
    expect(QuestionAnswerPayloadSchema.safeParse({ answer: 'React' }).success).toBe(false);
  });

  it('rejects empty question_event_id', () => {
    expect(
      QuestionAnswerPayloadSchema.safeParse({ question_event_id: '', answer: 'R' }).success
    ).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(
      QuestionAnswerPayloadSchema.safeParse({
        question_event_id: 'evt_abc_1234',
        answer: 'R',
        bonus: true,
      }).success
    ).toBe(false);
  });
});

describe('ProgressUpdatePayloadSchema', () => {
  /*
  Test Doc:
  - Why: progress:update carries a message and optional percent (0-100) — informational, no state change
  - Contract: message required min(1); percent optional 0-100; extras rejected
  - Usage Notes: percent uses z.number().min(0).max(100) — boundary values 0 and 100 are valid
  - Quality Contribution: Catches percent boundary regressions or empty message acceptance
  - Worked Example: {message:'Working...',percent:50} → success; {message:'X',percent:101} → failure
  */
  it('accepts message only', () => {
    expect(ProgressUpdatePayloadSchema.safeParse({ message: 'Working...' }).success).toBe(true);
  });

  it('accepts message with percent', () => {
    expect(
      ProgressUpdatePayloadSchema.safeParse({ message: 'Working...', percent: 50 }).success
    ).toBe(true);
  });

  it('rejects percent below 0', () => {
    expect(ProgressUpdatePayloadSchema.safeParse({ message: 'X', percent: -1 }).success).toBe(
      false
    );
  });

  it('rejects percent above 100', () => {
    expect(ProgressUpdatePayloadSchema.safeParse({ message: 'X', percent: 101 }).success).toBe(
      false
    );
  });

  it('rejects empty message', () => {
    expect(ProgressUpdatePayloadSchema.safeParse({ message: '' }).success).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(ProgressUpdatePayloadSchema.safeParse({ message: 'X', extra: true }).success).toBe(
      false
    );
  });
});
