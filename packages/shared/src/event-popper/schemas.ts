import { z } from 'zod';

/**
 * Plan 067: Event Popper Infrastructure
 *
 * Generic event envelope schemas for the Event Popper system.
 * These define the wire format for all event popper communications.
 * Concept-specific payloads (questions, alerts, etc.) validate the
 * `payload` field with their own schemas in their own domains.
 *
 * Version 1 — bump only if envelope shape changes.
 */

export const EventPopperRequestSchema = z
  .object({
    /** Schema version for forward compatibility */
    version: z.literal(1),

    /** Event type discriminator — determines payload shape (e.g., 'question', 'alert') */
    type: z.string().min(1),

    /** When this event was created (ISO-8601) */
    createdAt: z.string().datetime(),

    /** Who created this event (human-readable identifier, e.g., 'claude-code:agent-1') */
    source: z.string().min(1),

    /** Type-specific payload — shape determined by `type` field */
    payload: z.record(z.string(), z.unknown()),

    /** Optional unstructured metadata — pass-through, not validated by the envelope */
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type EventPopperRequest = z.infer<typeof EventPopperRequestSchema>;

export const EventPopperResponseSchema = z
  .object({
    /** Schema version — matches the request version */
    version: z.literal(1),

    /** Response status — semantics depend on the event type */
    status: z.string().min(1),

    /** When this response was created (ISO-8601) */
    respondedAt: z.string().datetime(),

    /** Who responded (human-readable identifier) */
    respondedBy: z.string().min(1),

    /** Type-specific response payload */
    payload: z.record(z.string(), z.unknown()),

    /** Optional unstructured metadata */
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type EventPopperResponse = z.infer<typeof EventPopperResponseSchema>;
