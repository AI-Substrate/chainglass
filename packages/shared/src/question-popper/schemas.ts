import { z } from 'zod';

/**
 * Plan 067: Question Popper — Payload Schemas
 *
 * Concept-specific Zod schemas for the question-popper domain.
 * These validate the `payload` field inside EventPopperRequest/Response envelopes.
 *
 * Question types: text, single (choice), multi (choice), confirm (yes/no)
 * Alert type: fire-and-forget notification
 *
 * All schemas use `.strict()` to reject unknown fields.
 */

// ── Question Type Enum ──

export const QuestionTypeEnum = z.enum(['text', 'single', 'multi', 'confirm']);
export type QuestionType = z.infer<typeof QuestionTypeEnum>;

// ── T001: Question Payload ──

export const QuestionPayloadSchema = z
  .object({
    /** Question variant — determines UI rendering and answer type */
    questionType: QuestionTypeEnum,

    /** The question text (always displayed) */
    text: z.string().min(1),

    /** Optional markdown context — can be pages of information */
    description: z.string().nullable(),

    /** Options for single/multi choice questions — null for text/confirm */
    options: z.array(z.string().min(1)).nullable(),

    /** Default answer — string for text/single, boolean for confirm, null for multi */
    default: z.union([z.string(), z.boolean()]).nullable(),

    /** CLI blocking timeout in seconds (0 = fire-and-forget) */
    timeout: z.number().int().min(0).default(600),

    /** Soft link to previous question for conversation chaining */
    previousQuestionId: z.string().nullable(),
  })
  .strict();

export type QuestionPayload = z.infer<typeof QuestionPayloadSchema>;

// ── T002: Answer Payload ──

export const AnswerPayloadSchema = z
  .object({
    /** Structured answer — type depends on questionType:
     *  text → string, single → string, multi → string[], confirm → boolean */
    answer: z.union([z.string(), z.boolean(), z.array(z.string())]).nullable(),

    /** Optional freeform user commentary (always available regardless of question type) */
    text: z.string().nullable(),
  })
  .strict();

export type AnswerPayload = z.infer<typeof AnswerPayloadSchema>;

// ── T002: Clarification Payload ──

export const ClarificationPayloadSchema = z
  .object({
    /** User's clarification request text */
    text: z.string().min(1),
  })
  .strict();

export type ClarificationPayload = z.infer<typeof ClarificationPayloadSchema>;

// ── T003: Alert Payload ──

export const AlertPayloadSchema = z
  .object({
    /** Alert headline (always displayed) */
    text: z.string().min(1),

    /** Optional markdown context */
    description: z.string().nullable(),
  })
  .strict();

export type AlertPayload = z.infer<typeof AlertPayloadSchema>;
