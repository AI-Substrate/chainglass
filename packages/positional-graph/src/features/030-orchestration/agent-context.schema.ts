/**
 * Zod schemas for ContextSourceResult — the output of getContextSource().
 *
 * 3-variant discriminated union: inherit, new, not-applicable.
 * Types derived via z.infer<> per ADR-0003 (Zod-first).
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// ── InheritContextResult ────────────────────────────

export const InheritContextResultSchema = z
  .object({
    source: z.literal('inherit'),
    fromNodeId: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export type InheritContextResult = z.infer<typeof InheritContextResultSchema>;

// ── NewContextResult ────────────────────────────────

export const NewContextResultSchema = z
  .object({
    source: z.literal('new'),
    reason: z.string().min(1),
  })
  .strict();

export type NewContextResult = z.infer<typeof NewContextResultSchema>;

// ── NotApplicableResult ─────────────────────────────

export const NotApplicableResultSchema = z
  .object({
    source: z.literal('not-applicable'),
    reason: z.string().min(1),
  })
  .strict();

export type NotApplicableResult = z.infer<typeof NotApplicableResultSchema>;

// ── ContextSourceResult (discriminated union) ───────

export const ContextSourceResultSchema = z.discriminatedUnion('source', [
  InheritContextResultSchema,
  NewContextResultSchema,
  NotApplicableResultSchema,
]);

export type ContextSourceResult = z.infer<typeof ContextSourceResultSchema>;
