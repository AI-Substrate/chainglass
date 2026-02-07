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

// ── output:save-data ─────────────────────────
export const OutputSaveDataPayloadSchema = z
  .object({
    name: z.string().min(1),
    value: z.unknown(),
  })
  .strict();
export type OutputSaveDataPayload = z.infer<typeof OutputSaveDataPayloadSchema>;

// ── output:save-file ─────────────────────────
export const OutputSaveFilePayloadSchema = z
  .object({
    name: z.string().min(1),
    source_path: z.string().min(1),
  })
  .strict();
export type OutputSaveFilePayload = z.infer<typeof OutputSaveFilePayloadSchema>;

// ── progress:update ──────────────────────────
export const ProgressUpdatePayloadSchema = z
  .object({
    message: z.string().min(1),
    percent: z.number().min(0).max(100).optional(),
  })
  .strict();
export type ProgressUpdatePayload = z.infer<typeof ProgressUpdatePayloadSchema>;
