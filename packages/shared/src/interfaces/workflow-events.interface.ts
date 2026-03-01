/**
 * IWorkflowEvents — Intent-based API for workflow event interactions.
 *
 * Sits on top of the generic event system (Plan 032). Callers don't need
 * to understand raiseEvent(), event handlers, state transitions, or the
 * 3-event QnA handshake. They express intent; the implementation handles
 * the rest.
 *
 * 5 action methods + 4 observer methods = 9 total (AC-01).
 *
 * @example
 * ```ts
 * // Ask a question — internally raises question:ask + runs handlers
 * const { questionId } = await wfEvents.askQuestion(graph, node, {
 *   type: 'confirm', text: 'Deploy to production?'
 * });
 *
 * // Answer — handles 3-event handshake (question:answer + node:restart)
 * await wfEvents.answerQuestion(graph, node, questionId, { confirmed: true });
 *
 * // Observe events from another domain
 * const unsub = wfEvents.onQuestionAsked(graph, (event) => {
 *   console.log(`Node ${event.nodeId} asked: ${event.question.text}`);
 * });
 * ```
 */

import type {
  AnswerResult,
  ErrorInput,
  ProgressEvent,
  ProgressInput,
  QuestionAnsweredEvent,
  QuestionAskedEvent,
  QuestionInput,
  WorkflowEvent,
} from '../workflow-events/types.js';

export interface IWorkflowEvents {
  // ── Actions ──

  /**
   * Ask a question from a node.
   *
   * Internally raises question:ask event, runs handlers (node transitions
   * to waiting-question), and persists. Returns the generated questionId.
   */
  askQuestion(
    graphSlug: string,
    nodeId: string,
    question: QuestionInput
  ): Promise<{ questionId: string }>;

  /**
   * Answer a pending question.
   *
   * Encapsulates the 3-event handshake: raises question:answer event,
   * then raises node:restart with reason 'question-answered'. Callers
   * don't need to know about the handshake (AC-03).
   */
  answerQuestion(
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answer: unknown
  ): Promise<void>;

  /**
   * Get the answer to a previously asked question.
   * Returns null if not yet answered.
   */
  getAnswer(graphSlug: string, nodeId: string, questionId: string): Promise<AnswerResult | null>;

  /**
   * Report progress from a node. Informational only — no state change.
   * Raises progress:update event.
   */
  reportProgress(graphSlug: string, nodeId: string, progress: ProgressInput): Promise<void>;

  /**
   * Report an error from a node.
   * Raises node:error event. Node transitions to blocked-error.
   */
  reportError(graphSlug: string, nodeId: string, error: ErrorInput): Promise<void>;

  // ── Observers (server-side event subscription) ──

  /**
   * Subscribe to question-asked events across all nodes in a graph.
   * Fires when any node enters waiting-question state.
   * Returns an unsubscribe function (AC-09).
   */
  onQuestionAsked(graphSlug: string, handler: (event: QuestionAskedEvent) => void): () => void;

  /**
   * Subscribe to question-answered events.
   * Fires when an answer is recorded.
   */
  onQuestionAnswered(
    graphSlug: string,
    handler: (event: QuestionAnsweredEvent) => void
  ): () => void;

  /** Subscribe to progress events. */
  onProgress(graphSlug: string, handler: (event: ProgressEvent) => void): () => void;

  /**
   * Subscribe to ANY workflow event (generic escape hatch).
   * Useful for logging, debugging, or custom event handling.
   */
  onEvent(graphSlug: string, handler: (event: WorkflowEvent) => void): () => void;
}
