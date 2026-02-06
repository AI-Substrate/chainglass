/**
 * Feature: 030 Orchestration
 *
 * Barrel export for orchestration types, schemas, builder, and view.
 *
 * @packageDocumentation
 */

// Types
export type {
  ExecutionStatus,
  ReadinessDetail,
  NodeError,
  NodeReality,
  LineReality,
  QuestionOption,
  QuestionReality,
  PositionalGraphReality,
} from './reality.types.js';

// Schemas
export {
  ExecutionStatusSchema,
  ReadinessDetailSchema,
  NodeErrorSchema,
  QuestionOptionSchema,
  LineRealitySchema,
  QuestionRealitySchema,
  NodeRealitySchema,
} from './reality.schema.js';

// Builder
export { buildPositionalGraphReality } from './reality.builder.js';
export type { BuildRealityOptions } from './reality.builder.js';

// View
export { PositionalGraphRealityView } from './reality.view.js';

// OrchestrationRequest — Schemas + derived types (Phase 2)
export {
  NoActionReasonSchema,
  StartNodeRequestSchema,
  ResumeNodeRequestSchema,
  QuestionPendingRequestSchema,
  NoActionRequestSchema,
  OrchestrationRequestSchema,
} from './orchestration-request.schema.js';
export type {
  NoActionReason,
  StartNodeRequest,
  ResumeNodeRequest,
  QuestionPendingRequest,
  NoActionRequest,
  OrchestrationRequest,
} from './orchestration-request.schema.js';

// OrchestrationRequest — Non-schema types (Phase 2)
export type {
  NodeLevelRequest,
  OrchestrationError,
  OrchestrationExecuteResult,
} from './orchestration-request.types.js';

// OrchestrationRequest — Type guards (Phase 2)
export {
  isStartNodeRequest,
  isResumeNodeRequest,
  isQuestionPendingRequest,
  isNoActionRequest,
  isNodeLevelRequest,
  getNodeId,
} from './orchestration-request.guards.js';
