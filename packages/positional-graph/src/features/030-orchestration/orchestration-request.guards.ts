/**
 * Type guards for OrchestrationRequest discriminated union.
 *
 * Each guard narrows the union to a specific variant.
 * Use in switch statements or conditional blocks for type-safe dispatch.
 *
 * @packageDocumentation
 */

import type {
  NoActionRequest,
  OrchestrationRequest,
  QuestionPendingRequest,
  ResumeNodeRequest,
  StartNodeRequest,
} from './orchestration-request.schema.js';
import type { NodeLevelRequest } from './orchestration-request.types.js';

export function isStartNodeRequest(req: OrchestrationRequest): req is StartNodeRequest {
  return req.type === 'start-node';
}

export function isResumeNodeRequest(req: OrchestrationRequest): req is ResumeNodeRequest {
  return req.type === 'resume-node';
}

export function isQuestionPendingRequest(req: OrchestrationRequest): req is QuestionPendingRequest {
  return req.type === 'question-pending';
}

export function isNoActionRequest(req: OrchestrationRequest): req is NoActionRequest {
  return req.type === 'no-action';
}

export function isNodeLevelRequest(req: OrchestrationRequest): req is NodeLevelRequest {
  return req.type !== 'no-action';
}

/**
 * Extract nodeId from any OrchestrationRequest.
 *
 * Returns the nodeId for node-level requests (start-node, resume-node, question-pending)
 * and undefined for no-action requests.
 *
 * DYK-I7: After narrowing via a type guard, prefer accessing `request.nodeId` directly
 * rather than calling this function. This utility is for unnarrowed contexts only.
 */
export function getNodeId(req: OrchestrationRequest): string | undefined {
  if (isNodeLevelRequest(req)) {
    return req.nodeId;
  }
  return undefined;
}
