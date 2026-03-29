/**
 * Zod schemas and derived types for OrchestrationRequest discriminated union.
 *
 * This file is the single source of truth per ADR-0003 (DYK-I6).
 * TypeScript types are derived via z.infer<> — never handwritten separately.
 *
 * Workshop #2 defines the 4-variant closed set:
 * - start-node: Begin executing a ready node
 * - resume-node: Continue a node after question answered
 * - question-pending: Surface an unsurfaced question
 * - no-action: Nothing actionable (loop exits)
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// ── NoActionReason ────────────────────────────────

export const NoActionReasonSchema = z.enum([
  'graph-complete',
  'transition-blocked',
  'all-waiting',
  'graph-failed',
]);
export type NoActionReason = z.infer<typeof NoActionReasonSchema>;

// ── StartNodeRequest ──────────────────────────────

export const StartNodeRequestSchema = z
  .object({
    type: z.literal('start-node'),
    graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
    nodeId: z.string().min(1),
    inputs: z.object({
      inputs: z.record(z.unknown()),
      ok: z.boolean(),
    }),
  })
  .strict();
export type StartNodeRequest = z.infer<typeof StartNodeRequestSchema>;

// ── ResumeNodeRequest ─────────────────────────────

export const ResumeNodeRequestSchema = z
  .object({
    type: z.literal('resume-node'),
    graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
    nodeId: z.string().min(1),
    questionId: z.string().min(1),
    answer: z.unknown(),
  })
  .strict();
export type ResumeNodeRequest = z.infer<typeof ResumeNodeRequestSchema>;

// ── QuestionPendingRequest ────────────────────────

export const QuestionPendingRequestSchema = z
  .object({
    type: z.literal('question-pending'),
    graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
    nodeId: z.string().min(1),
    questionId: z.string().min(1),
    questionText: z.string().min(1),
    questionType: z.enum(['text', 'single', 'multi', 'confirm']),
    options: z.array(z.string()).optional(),
    defaultValue: z.union([z.string(), z.boolean()]).optional(),
  })
  .strict();
export type QuestionPendingRequest = z.infer<typeof QuestionPendingRequestSchema>;

// ── NoActionRequest ───────────────────────────────

export const NoActionRequestSchema = z
  .object({
    type: z.literal('no-action'),
    graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
    reason: NoActionReasonSchema.optional(),
    lineId: z.string().optional(),
  })
  .strict();
export type NoActionRequest = z.infer<typeof NoActionRequestSchema>;

// ── ErrorNodeRequest (Plan 076 FX003) ─────────────

export const ErrorNodeRequestSchema = z
  .object({
    type: z.literal('error-node'),
    graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
    nodeId: z.string().min(1),
    inputs: z.object({
      inputs: z.record(z.unknown()),
      ok: z.boolean(),
    }),
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
    }),
  })
  .strict();
export type ErrorNodeRequest = z.infer<typeof ErrorNodeRequestSchema>;

// ── OrchestrationRequest (Discriminated Union) ───

export const OrchestrationRequestSchema = z.discriminatedUnion('type', [
  StartNodeRequestSchema,
  ResumeNodeRequestSchema,
  QuestionPendingRequestSchema,
  NoActionRequestSchema,
  ErrorNodeRequestSchema,
]);
export type OrchestrationRequest = z.infer<typeof OrchestrationRequestSchema>;
