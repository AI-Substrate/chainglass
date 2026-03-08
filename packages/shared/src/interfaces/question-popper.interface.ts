import type { AnswerPayload } from '../question-popper/schemas.js';
import type {
  AlertIn,
  AlertOut,
  AlertStatus,
  QuestionIn,
  QuestionOut,
  QuestionStatus,
  StoredAlert,
  StoredEvent,
  StoredQuestion,
} from '../question-popper/types.js';

/**
 * Plan 067: Question Popper — Service Interface
 *
 * Defines the contract for the question-and-answer service.
 * Implementations: FakeQuestionPopperService (test), QuestionPopperService (real).
 *
 * The service manages the full lifecycle of questions and alerts:
 * - Questions: ask → pending → answered | needs-clarification | dismissed
 * - Alerts: send → unread → acknowledged
 *
 * Real implementation emits SSE events via ICentralEventNotifier on every
 * lifecycle transition and tracks outstanding count in memory.
 */
export interface IQuestionPopperService {
  // ── Questions ──

  /** Store a new question. Returns the generated question ID. */
  askQuestion(input: QuestionIn): Promise<{ questionId: string }>;

  /** Retrieve a question by ID. Returns null if not found. */
  getQuestion(id: string): Promise<StoredQuestion | null>;

  /** Record an answer for a pending question. Throws if already answered or not found. */
  answerQuestion(id: string, answer: AnswerPayload): Promise<void>;

  /** Dismiss a pending question without answering. Throws if already resolved or not found. */
  dismissQuestion(id: string): Promise<void>;

  /** Request clarification on a pending question. Throws if already resolved or not found. */
  requestClarification(id: string, text: string): Promise<void>;

  /** List questions, optionally filtered by status. */
  listQuestions(filter?: { status?: QuestionStatus }): Promise<StoredQuestion[]>;

  // ── Alerts ──

  /** Store a new alert. Returns the generated alert ID. */
  sendAlert(input: AlertIn): Promise<{ alertId: string }>;

  /** Retrieve an alert by ID. Returns null if not found. */
  getAlert(id: string): Promise<StoredAlert | null>;

  /** Acknowledge (mark as read) an alert. Throws if already acknowledged or not found. */
  acknowledgeAlert(id: string): Promise<void>;

  // ── Queries ──

  /** List all events (questions + alerts), newest first. */
  listAll(): Promise<StoredEvent[]>;

  /** Current count of outstanding items (unanswered questions + unread alerts). */
  getOutstandingCount(): number;
}
