import { z } from 'zod';

// ── node:accepted ────────────────────────────
export const NodeAcceptedPayloadSchema = z.object({}).strict();
export type NodeAcceptedPayload = z.infer<typeof NodeAcceptedPayloadSchema>;

// ── node:completed ───────────────────────────
export const NodeCompletedPayloadSchema = z
  .object({
    message: z.string().optional(),
  })
  .strict();
export type NodeCompletedPayload = z.infer<typeof NodeCompletedPayloadSchema>;

// ── node:error ───────────────────────────────
export const NodeErrorPayloadSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
    recoverable: z.boolean().default(false),
  })
  .strict();
export type NodeErrorPayload = z.infer<typeof NodeErrorPayloadSchema>;

// ── question:ask ─────────────────────────────
export const QuestionAskPayloadSchema = z
  .object({
    question_id: z.string().min(1),
    type: z.enum(['text', 'single', 'multi', 'confirm']),
    text: z.string().min(1),
    options: z.array(z.string()).optional(),
    default: z.union([z.string(), z.boolean()]).optional(),
  })
  .strict();
export type QuestionAskPayload = z.infer<typeof QuestionAskPayloadSchema>;

// ── question:answer ──────────────────────────
export const QuestionAnswerPayloadSchema = z
  .object({
    question_event_id: z.string().min(1),
    answer: z.unknown(),
  })
  .strict();
export type QuestionAnswerPayload = z.infer<typeof QuestionAnswerPayloadSchema>;

// ── progress:update ──────────────────────────
export const ProgressUpdatePayloadSchema = z
  .object({
    message: z.string().min(1),
    percent: z.number().min(0).max(100).optional(),
  })
  .strict();
export type ProgressUpdatePayload = z.infer<typeof ProgressUpdatePayloadSchema>;
