import { z } from 'zod';

import { EventSourceSchema } from './event-source.schema.js';
import { EventStampSchema } from './event-stamp.schema.js';
import { EventStatusSchema } from './event-status.schema.js';

/**
 * Schema for a persisted node event record.
 *
 * The `payload` field uses `z.record(z.unknown())` — an open shape.
 * The registry validates payloads against type-specific schemas;
 * the NodeEventSchema itself accepts any valid record.
 */
export const NodeEventSchema = z.object({
  /** Unique event ID (generated on creation) */
  event_id: z.string().min(1),

  /** Event type from the registry (e.g. 'question:ask') */
  event_type: z.string().min(1),

  /** Who raised this event */
  source: EventSourceSchema,

  /** Validated payload (shape depends on event_type) */
  payload: z.record(z.unknown()),

  /** Lifecycle state */
  status: EventStatusSchema,

  /** Whether the raiser should stop execution after this event */
  stops_execution: z.boolean(),

  /** ISO-8601 creation timestamp */
  created_at: z.string().datetime(),

  /** ISO-8601 timestamp when system acknowledged the event */
  acknowledged_at: z.string().datetime().optional(),

  /** ISO-8601 timestamp when the event was fully handled */
  handled_at: z.string().datetime().optional(),

  /** Optional handler notes (who handled it, what happened) */
  handler_notes: z.string().optional(),

  /** Per-subscriber processing stamps (subscriber name → stamp) */
  stamps: z.record(z.string(), EventStampSchema).optional(),
});

export type NodeEvent = z.infer<typeof NodeEventSchema>;
