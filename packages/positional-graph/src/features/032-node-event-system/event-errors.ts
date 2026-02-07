import type { ResultError } from '@chainglass/shared';
import type { z } from 'zod';

import { POSITIONAL_GRAPH_ERROR_CODES } from '../../errors/positional-graph-errors.js';

/**
 * E190: Unknown event type.
 */
export function eventTypeNotFoundError(type: string, available: string[]): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E190,
    message: `Unknown event type '${type}'. Available types: ${available.join(', ') || 'none'}`,
    action: "Run 'cg wf node event list-types' to see available event types.",
  };
}

/**
 * E191: Payload validation failed against the registered Zod schema.
 */
export function eventPayloadValidationError(type: string, zodErrors: z.ZodIssue[]): ResultError {
  const fields = zodErrors.map((e) => e.path.join('.') || 'root').join(', ');
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E191,
    message: `Invalid payload for event type '${type}': validation failed on fields: ${fields}`,
    action: `Run 'cg wf node event schema ${type}' to see the required payload schema. Fix the JSON and retry.`,
  };
}

/**
 * E192: Source not in the event type's `allowedSources`.
 */
export function eventSourceNotAllowedError(
  type: string,
  source: string,
  allowed: readonly string[]
): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E192,
    message: `Source '${source}' is not allowed for event type '${type}'. Allowed sources: ${allowed.join(', ')}`,
    action: `Use one of the allowed sources: ${allowed.join(', ')}`,
  };
}

/**
 * E193: Node is not in a valid state for this event type.
 */
export function eventStateTransitionError(
  type: string,
  currentState: string,
  requiredStates: string[]
): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E193,
    message: `Event '${type}' cannot be raised when node is in '${currentState}' state. Required states: ${requiredStates.join(', ')}`,
    action: 'Check node status and ensure it is in a valid state for this event type.',
  };
}

/**
 * E194: question:answer references a nonexistent question:ask event.
 */
export function eventQuestionNotFoundError(questionEventId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E194,
    message: `Question event '${questionEventId}' not found`,
    action: 'Verify the question_event_id matches an existing question:ask event on this node.',
  };
}

/**
 * E195: question:answer references a question that already has an answer.
 */
export function eventAlreadyAnsweredError(questionEventId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E195,
    message: `Question '${questionEventId}' has already been answered`,
    action: 'Each question can only be answered once.',
  };
}
