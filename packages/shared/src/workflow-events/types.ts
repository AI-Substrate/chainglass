/**
 * Convenience types for workflow event interactions.
 *
 * These types are the consumer-facing API surface. They're simpler than the
 * raw Zod payload schemas and PGService option types — no WorkspaceContext,
 * no BaseResult, no event plumbing.
 *
 * Field names align with Zod .strict() schemas in event-payloads.schema.ts:
 * - `percent` not `percentage`
 * - `type` values: 'text' | 'single' | 'multi' | 'confirm'
 * - `default` not `defaultValue`
 *
 * The implementation (Phase 2) maps between these and the raw PGService types.
 */

import type { WorkflowEventTypeValue } from './constants.js';

// ── Convenience Input/Output Types (AC-07) ──

/** What a caller provides to ask a question from a node */
export interface QuestionInput {
  /** Question type — determines UX presentation */
  type: 'text' | 'single' | 'multi' | 'confirm';
  /** Question text shown to the human */
  text: string;
  /** Available options for single/multi choice questions */
  options?: string[];
  /** Default value — string for text/single/multi, boolean for confirm */
  default?: string | boolean;
}

/**
 * Structured answer shape for common question types.
 *
 * This is an optional helper type — the system accepts `unknown` as the
 * answer value. Use AnswerInput when you know the question type for
 * better DX, or pass any value directly.
 */
export interface AnswerInput {
  /** Free text answer (for 'text' questions) */
  text?: string;
  /** Selected option(s) (for 'single' or 'multi' questions) */
  selected?: string[];
  /** Confirmation value (for 'confirm' questions) */
  confirmed?: boolean;
}

/** What getAnswer() returns when the question has been answered */
export interface AnswerResult {
  questionId: string;
  answered: true;
  answer: unknown;
  answeredAt: string;
}

/** What a caller provides for a progress update */
export interface ProgressInput {
  message: string;
  /** Progress percentage 0-100 (aligns with Zod `percent` field) */
  percent?: number;
}

/** What a caller provides to report a node error */
export interface ErrorInput {
  code: string;
  message: string;
  /** Structured error details (aligns with Zod z.unknown().optional()) */
  details?: unknown;
  recoverable?: boolean;
}

// ── Observer Event Types (AC-08) ──

/** Delivered to onQuestionAsked observers when a node asks a question */
export interface QuestionAskedEvent {
  graphSlug: string;
  nodeId: string;
  questionId: string;
  question: QuestionInput;
  askedAt: string;
  source: string;
}

/** Delivered to onQuestionAnswered observers when a question is answered */
export interface QuestionAnsweredEvent {
  graphSlug: string;
  nodeId: string;
  questionId: string;
  answer: unknown;
  answeredAt: string;
}

/** Delivered to onProgress observers on progress updates */
export interface ProgressEvent {
  graphSlug: string;
  nodeId: string;
  message: string;
  percent?: number;
}

/** Delivered to onEvent observers for any workflow event (escape hatch) */
export interface WorkflowEvent {
  graphSlug: string;
  nodeId: string;
  /** Known event type or custom registered type string */
  eventType: WorkflowEventTypeValue | string;
  payload: Record<string, unknown>;
  source: string;
  timestamp: string;
}
