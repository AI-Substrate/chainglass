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

// AgentContext — Schemas + derived types (Phase 3)
export {
  InheritContextResultSchema,
  NewContextResultSchema,
  NotApplicableResultSchema,
  ContextSourceResultSchema,
} from './agent-context.schema.js';
export type {
  InheritContextResult,
  NewContextResult,
  NotApplicableResult,
  ContextSourceResult,
} from './agent-context.schema.js';

// AgentContext — Type guards + interface (Phase 3)
export {
  isInheritContext,
  isNewContext,
  isNotApplicable,
} from './agent-context.types.js';
export type { IAgentContextService } from './agent-context.types.js';

// AgentContext — Pure function + class wrapper (Phase 3)
export { getContextSource, AgentContextService } from './agent-context.js';

// AgentContext — Fake (Phase 3)
export { FakeAgentContextService } from './fake-agent-context.js';

// Pod — Schemas + derived types (Phase 4)
export {
  PodOutcomeSchema,
  PodErrorSchema,
  PodQuestionSchema,
  PodExecuteResultSchema,
} from './pod.schema.js';
export type {
  PodOutcome,
  PodError,
  PodQuestion,
  PodExecuteResult,
  PodExecuteOptions,
  PodEventHandler,
  PodEvent,
  PodOutputEvent,
  PodQuestionEvent,
  PodProgressEvent,
  IWorkUnitPod,
} from './pod.types.js';

// Pod — Implementations (Phase 4)
export { AgentPod } from './pod.agent.js';
export { CodePod } from './pod.code.js';

// ScriptRunner — Interface + Fake (Phase 4)
export type { IScriptRunner, ScriptRunOptions, ScriptRunResult } from './script-runner.types.js';
export { FakeScriptRunner } from './script-runner.types.js';

// PodManager — Interface + types (Phase 4)
export type { IPodManager, PodCreateParams } from './pod-manager.types.js';

// PodManager — Real implementation (Phase 4)
export { PodManager } from './pod-manager.js';

// PodManager — Fake (Phase 4)
export { FakePodManager, FakePod } from './fake-pod-manager.js';
export type { FakePodConfig, CreateHistoryEntry } from './fake-pod-manager.js';

// ONBAS — Interface + types (Phase 5)
export type { IONBAS } from './onbas.types.js';

// ONBAS — Pure function + class wrapper (Phase 5)
export { walkForNextAction, ONBAS } from './onbas.js';

// ONBAS — Fake + buildFakeReality helper (Phase 5)
export { FakeONBAS, buildFakeReality } from './fake-onbas.js';
export type {
  FakeRealityOptions,
  FakeLineInput,
  FakeNodeInput,
  FakeQuestionInput,
} from './fake-onbas.js';
