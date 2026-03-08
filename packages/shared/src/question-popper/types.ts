import type { EventPopperRequest, EventPopperResponse } from '@chainglass/shared/event-popper';
import type {
  AlertPayload,
  AnswerPayload,
  ClarificationPayload,
  QuestionPayload,
  QuestionType,
} from './schemas.js';

/**
 * Plan 067: Question Popper — Composed Types
 *
 * Ergonomic types for callers. These abstract away the generic event envelope
 * and expose typed question/alert/answer interfaces.
 */

// ── Status Enums ──

export type QuestionStatus = 'pending' | 'answered' | 'needs-clarification' | 'dismissed';
export type AlertStatus = 'unread' | 'acknowledged';

// ── Caller Input Types ──

/** What callers provide when asking a question (CLI, API route) */
export interface QuestionIn {
  questionType: QuestionType;
  text: string;
  description?: string | null;
  options?: string[] | null;
  default?: string | boolean | null;
  timeout?: number;
  previousQuestionId?: string | null;
  source: string;
  meta?: Record<string, unknown>;
}

/** What callers provide when sending an alert */
export interface AlertIn {
  text: string;
  description?: string | null;
  source: string;
  meta?: Record<string, unknown>;
}

// ── Caller Output Types ──

/** What callers receive when reading a question's status */
export interface QuestionOut {
  questionId: string;
  status: QuestionStatus;
  question: QuestionPayload;
  source: string;
  createdAt: string;
  answer?: AnswerPayload | null;
  clarification?: ClarificationPayload | null;
  respondedAt?: string | null;
  respondedBy?: string | null;
  meta?: Record<string, unknown>;
}

/** What callers receive when reading an alert's status */
export interface AlertOut {
  alertId: string;
  status: AlertStatus;
  alert: AlertPayload;
  source: string;
  createdAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  meta?: Record<string, unknown>;
}

// ── On-Disk Storage Types ──

/** Complete on-disk record for a question (in.json envelope + optional out.json) */
export interface StoredQuestion {
  id: string;
  type: 'question';
  request: EventPopperRequest;
  response: EventPopperResponse | null;
  status: QuestionStatus;
}

/** Complete on-disk record for an alert (in.json envelope + optional out.json) */
export interface StoredAlert {
  id: string;
  type: 'alert';
  request: EventPopperRequest;
  response: EventPopperResponse | null;
  status: AlertStatus;
}

/** Union of stored event types */
export type StoredEvent = StoredQuestion | StoredAlert;
