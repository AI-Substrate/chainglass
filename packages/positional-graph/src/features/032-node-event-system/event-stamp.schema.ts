import { z } from 'zod';

/**
 * Schema for a subscriber stamp on an event.
 *
 * Each subscriber that processes an event writes a stamp to
 * `event.stamps[subscriberName]`. Stamps are the authoritative
 * record of "has this subscriber processed this event."
 */
export const EventStampSchema = z.object({
  /** ISO-8601 timestamp when the subscriber processed this event */
  stamped_at: z.string().datetime(),

  /** What the subscriber did (e.g. 'state-transition', 'answer-linked') */
  action: z.string().min(1),

  /** Optional handler-specific data */
  data: z.record(z.unknown()).optional(),
});

export type EventStamp = z.infer<typeof EventStampSchema>;
