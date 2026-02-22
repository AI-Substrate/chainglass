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

// Format (Plan 036 Phase 3)
export { formatGraphStatus } from './reality.format.js';

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

// ScriptRunner — Interface + Fake + Real (Phase 4 / Plan 037)
export type { IScriptRunner, ScriptRunOptions, ScriptRunResult } from './script-runner.types.js';
export { FakeScriptRunner } from './script-runner.types.js';
export { ScriptRunner } from './script-runner.js';

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

// ODS — Interface + types (Phase 6)
export type { IODS, ODSDependencies } from './ods.types.js';

// ODS — Implementation (Phase 6)
export { ODS } from './ods.js';

// ODS — Fake (Phase 6)
export { FakeODS } from './fake-ods.js';
export type { FakeODSCallRecord } from './fake-ods.js';

// OrchestrationService — Types + interfaces (Phase 7)
export type {
  OrchestrationStopReason,
  OrchestrationAction,
  OrchestrationRunResult,
  IGraphOrchestration,
  IOrchestrationService,
  FakeGraphConfig,
  DriveOptions,
  DriveEvent,
  DriveEventType,
  DriveResult,
  DriveExitReason,
} from './orchestration-service.types.js';

// OrchestrationService — Implementation (Phase 7)
export { OrchestrationService } from './orchestration-service.js';
export type { OrchestrationServiceDeps } from './orchestration-service.js';

// GraphOrchestration — Implementation (Phase 7)
export { GraphOrchestration } from './graph-orchestration.js';
export type { GraphOrchestrationOptions } from './graph-orchestration.js';

// OrchestrationService — Fakes (Phase 7)
export {
  FakeOrchestrationService,
  FakeGraphOrchestration,
} from './fake-orchestration-service.js';
export type { FakeGetCallRecord } from './fake-orchestration-service.js';
