import { describe, expect, it } from 'vitest';

import { EventStampSchema } from '@chainglass/positional-graph/features/032-node-event-system';

/*
Test Doc:
- Why: EventStampSchema validates subscriber stamps on events — the replacement for markHandled()
- Contract: Valid stamps parse; missing required fields rejected; optional data accepted
- Usage Notes: Each subscriber writes stamps[subscriberName] = { stamped_at, action, data? }
- Quality Contribution: Catches schema regressions when stamp shape changes
- Worked Example: { stamped_at: ISO, action: 'state-transition' } → ok; missing action → error
*/

describe('EventStampSchema', () => {
  it('accepts a valid stamp with required fields only', () => {
    const result = EventStampSchema.safeParse({
      stamped_at: '2026-02-08T10:00:00.000Z',
      action: 'state-transition',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid stamp with optional data', () => {
    const result = EventStampSchema.safeParse({
      stamped_at: '2026-02-08T10:00:00.000Z',
      action: 'answer-linked',
      data: { question_event_id: 'evt_abc_1234' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toEqual({ question_event_id: 'evt_abc_1234' });
    }
  });

  it('rejects missing stamped_at', () => {
    const result = EventStampSchema.safeParse({
      action: 'state-transition',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid stamped_at (not ISO-8601)', () => {
    const result = EventStampSchema.safeParse({
      stamped_at: 'not-a-date',
      action: 'state-transition',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing action', () => {
    const result = EventStampSchema.safeParse({
      stamped_at: '2026-02-08T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty action string', () => {
    const result = EventStampSchema.safeParse({
      stamped_at: '2026-02-08T10:00:00.000Z',
      action: '',
    });
    expect(result.success).toBe(false);
  });
});
