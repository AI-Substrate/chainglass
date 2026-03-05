/**
 * Typed constants for all core workflow event types.
 *
 * Replaces magic strings like 'question:ask' throughout the codebase.
 * Values align exactly with core-event-types.ts registrations in
 * packages/positional-graph/src/features/032-node-event-system/.
 *
 * @example
 * ```ts
 * import { WorkflowEventType } from '@chainglass/shared/workflow-events';
 * // Instead of: raiseEvent('question:ask', payload)
 * // Use:        raiseEvent(WorkflowEventType.QuestionAsk, payload)
 * ```
 */
export const WorkflowEventType = {
  /** Agent asks a question — node transitions to waiting-question */
  QuestionAsk: 'question:ask',
  /** Human answers a question — triggers restart handshake */
  QuestionAnswer: 'question:answer',
  /** Node restart — used in QnA handshake after answer */
  NodeRestart: 'node:restart',
  /** Node accepted by orchestrator — initial state after pod creation */
  NodeAccepted: 'node:accepted',
  /** Node completed successfully */
  NodeCompleted: 'node:completed',
  /** Node encountered an error — transitions to blocked-error */
  NodeError: 'node:error',
  /** Progress update — informational, no state change */
  ProgressUpdate: 'progress:update',
} as const;

/** Union type of all workflow event type string values */
export type WorkflowEventTypeValue = (typeof WorkflowEventType)[keyof typeof WorkflowEventType];
