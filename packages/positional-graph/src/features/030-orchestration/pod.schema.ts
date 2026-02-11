/**
 * Zod schemas for pod types (serializable).
 *
 * Types are derived via z.infer<> in pod.types.ts.
 *
 * @see Workshop #4 (04-work-unit-pods.md)
 */

import { z } from 'zod';

// ── PodOutcome ────────────────────────────────────────

export const PodOutcomeSchema = z.enum(['completed', 'question', 'error', 'terminated']);

// ── PodError ──────────────────────────────────────────

export const PodErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

// ── PodQuestion ───────────────────────────────────────

export const PodQuestionSchema = z
  .object({
    questionId: z.string().min(1),
    questionType: z.enum(['text', 'single', 'multi', 'confirm']),
    text: z.string().min(1),
    options: z.array(z.string()).optional(),
    defaultValue: z.union([z.string(), z.boolean()]).optional(),
  })
  .strict();

// ── PodExecuteResult ──────────────────────────────────

export const PodExecuteResultSchema = z
  .object({
    outcome: PodOutcomeSchema,
    sessionId: z.string().optional(),
    outputs: z.record(z.unknown()).optional(),
    error: PodErrorSchema.optional(),
    question: PodQuestionSchema.optional(),
  })
  .strict();
