// @chainglass/workflow entry point
// Exports all workflow interfaces, types, fakes, and adapters

// Errors
export { EntityNotFoundError } from './errors/index.js';
export type { EntityType } from './errors/index.js';

// Run errors (E050-E059 per DYK-05)
export { RunErrorCodes, CheckpointErrorCodes } from './errors/index.js';
export {
  RunNotFoundError,
  RunsDirNotFoundError,
  InvalidRunStatusError,
  RunCorruptError,
  CheckpointCorruptError,
} from './errors/index.js';

// Workspace errors (E074-E081 per Plan 014)
export { WorkspaceErrorCodes, WorkspaceErrors } from './errors/index.js';
export type { WorkspaceError } from './errors/index.js';
export {
  WorkspaceNotFoundError,
  WorkspaceExistsError,
  InvalidPathError,
  PathNotFoundError,
  RegistryCorruptError,
  GitOperationError,
  ConfigNotWritableError,
} from './errors/index.js';

// Sample errors (E082-E089 per Plan 014 Phase 3)
export { SampleErrorCodes, SampleErrors } from './errors/index.js';
export type { SampleError } from './errors/index.js';
export {
  SampleNotFoundError,
  SampleExistsError,
  InvalidSampleDataError,
} from './errors/index.js';

// Agent session errors (E090-E093 per Plan 018)
export { AgentSessionErrorCodes, AgentSessionErrors } from './errors/index.js';
export type { AgentSessionError } from './errors/index.js';
export {
  AgentSessionNotFoundError,
  AgentSessionExistsError,
  InvalidAgentSessionDataError,
  AgentEventNotFoundError,
} from './errors/index.js';

// Types (matching core schemas)
export type {
  // wf.types.ts - Workflow definition types
  WfDefinition,
  PhaseDefinition,
  InputDeclaration,
  FileInput,
  ParameterInput,
  MessageInput,
  MessageOption,
  Output,
  OutputParameter,
  // wf-phase.types.ts - Phase state types
  WfPhaseState,
  StatusEntry,
  Facilitator,
  PhaseState,
  ActionType,
  // message.types.ts - Message types
  Message,
  MessageType,
  MessageOptionType,
  MessageAnswer,
  // wf-status.types.ts - Run status types
  WfStatus,
  WfStatusWorkflow,
  WfStatusRun,
  WfStatusPhase,
  RunStatus,
  PhaseRunStatus,
} from './types/index.js';

// Interfaces
export { YamlParseError } from './interfaces/index.js';
export type { IYamlParser, ParseResult } from './interfaces/index.js';

export { ValidationErrorCodes } from './interfaces/index.js';
export type {
  ISchemaValidator,
  ValidationResult,
  ResultError,
} from './interfaces/index.js';

// Workflow service interface (Phase 2)
export type { IWorkflowService } from './interfaces/index.js';

// Phase service interface (Phase 3)
export type { IPhaseService, ValidateCheckMode } from './interfaces/index.js';

// Workflow registry interface (Phase 1)
export type { IWorkflowRegistry } from './interfaces/index.js';

// Entity adapter interfaces (Phase 1: Entity Upgrade, Plan 010)
export type { IWorkflowAdapter, RunListFilter } from './interfaces/index.js';
export type { IPhaseAdapter } from './interfaces/index.js';

// Entities (Phase 1: Entity Upgrade, Plan 010)
export { Workflow } from './entities/index.js';
export type { CheckpointMetadata, RunMetadata, WorkflowJSON } from './entities/index.js';
export { Phase } from './entities/index.js';
export type {
  PhaseInput,
  PhaseInputFile,
  PhaseInputParameter,
  PhaseInputMessage,
  PhaseMessageOption,
  PhaseOutput,
  PhaseOutputParameter,
  PhaseStatusEntry,
  PhaseJSON,
} from './entities/index.js';

// Workspace entity (Plan 014: Workspaces)
export { Workspace } from './entities/index.js';
export type { WorkspaceInput, WorkspaceJSON } from './entities/index.js';

// Sample entity (Plan 014: Phase 3 Exemplar)
export { Sample } from './entities/index.js';
export type { SampleInput, SampleJSON } from './entities/index.js';

// AgentSession entity (Plan 018)
export { AgentSession } from './entities/index.js';
export type { AgentSessionInput, AgentSessionJSON } from './entities/index.js';

// Workspace registry adapter interface (Plan 014: Workspaces)
export type {
  IWorkspaceRegistryAdapter,
  WorkspaceErrorCode,
  WorkspaceSaveResult,
  WorkspaceRemoveResult,
} from './interfaces/index.js';

// Sample adapter interface (Plan 014: Phase 3)
export type {
  ISampleAdapter,
  SampleErrorCode,
  SampleSaveResult,
  SampleRemoveResult,
} from './interfaces/index.js';

// Agent session adapter interface (Plan 018)
export type {
  IAgentSessionAdapter,
  AgentSessionErrorCode,
  AgentSessionSaveResult,
  AgentSessionRemoveResult,
} from './interfaces/index.js';

// Init service interface (Phase 4)
export type {
  IInitService,
  InitOptions,
  InitResult,
  InitializationStatus,
} from './interfaces/index.js';

// Message service interface (Phase 3 Subtask 001)
export { MessageErrorCodes } from './interfaces/index.js';
export type {
  IMessageService,
  MessageContent,
  AnswerInput,
} from './interfaces/index.js';

// Adapters
export { YamlParserAdapter } from './adapters/index.js';
export { SchemaValidatorAdapter } from './adapters/index.js';
export { WorkflowAdapter } from './adapters/index.js';
export { PhaseAdapter } from './adapters/index.js';

// Workspace registry adapter (Plan 014)
export { WorkspaceRegistryAdapter } from './adapters/index.js';

// Workspace data adapter base (Plan 014 Phase 3)
export { WorkspaceDataAdapterBase } from './adapters/index.js';
export type {
  EnsureStructureResult,
  ReadJsonResult,
  WriteJsonResult,
} from './adapters/index.js';

// Sample adapter (Plan 014 Phase 3)
export { SampleAdapter } from './adapters/index.js';

// Agent session adapter (Plan 018)
export { AgentSessionAdapter } from './adapters/index.js';

// Agent event adapter (Plan 018 Phase 2)
export { AgentEventAdapter } from './adapters/index.js';

// Agent event adapter interface (Plan 018 Phase 2)
export type {
  IAgentEventAdapter,
  StoredAgentEvent,
  AppendEventResult,
  ArchiveResult,
  ArchiveOptions,
} from './interfaces/index.js';

// Fakes
export { FakeYamlParser } from './fakes/index.js';
export { FakeSchemaValidator } from './fakes/index.js';
export { FakeWorkflowService } from './fakes/index.js';
export type { ComposeCall } from './fakes/index.js';
export { FakePhaseService } from './fakes/index.js';
export type { PrepareCall, ValidateCall, FinalizeCall } from './fakes/index.js';
export { FakeMessageService } from './fakes/index.js';
export type { CreateCall, AnswerCall, ListCall, ReadCall } from './fakes/index.js';
export { FakeWorkflowRegistry } from './fakes/index.js';
export type {
  RegistryListCall,
  RegistryInfoCall,
} from './fakes/index.js';
export { FakeInitService } from './fakes/index.js';
export type {
  InitCall,
  IsInitializedCall,
  GetInitializationStatusCall,
} from './fakes/index.js';
export { FakeWorkflowAdapter } from './fakes/index.js';
export type {
  LoadCurrentCall,
  LoadCheckpointCall,
  LoadRunCall,
  ListCheckpointsCall,
  ListRunsCall,
  ExistsCall,
} from './fakes/index.js';
export { FakePhaseAdapter } from './fakes/index.js';
export type { LoadFromPathCall, ListForWorkflowCall } from './fakes/index.js';

// Workspace registry adapter fake (Plan 014)
export { FakeWorkspaceRegistryAdapter } from './fakes/index.js';
export type {
  WorkspaceLoadCall,
  WorkspaceSaveCall,
  WorkspaceListCall,
  WorkspaceRemoveCall,
  WorkspaceExistsCall,
} from './fakes/index.js';

// Services (Phase 2)
export { WorkflowService, ComposeErrorCodes } from './services/index.js';

// Services (Phase 3)
export { PhaseService, PhaseErrorCodes } from './services/index.js';

// Services (Phase 3 Subtask 001: Message CLI Commands)
export { MessageService } from './services/index.js';

// Workflow Registry Service (Phase 1)
export { WorkflowRegistryService, WorkflowRegistryErrorCodes } from './services/index.js';

// Init Service (Phase 4)
export { InitService } from './services/index.js';

// Utilities (Phase 4)
export { extractValue } from './utils/index.js';

// Embedded schemas (Phase 2 - DYK-01)
export {
  WF_SCHEMA,
  WF_PHASE_SCHEMA,
  MESSAGE_SCHEMA,
  WF_STATUS_SCHEMA,
} from './schemas/index.js';

// DI Container
export {
  createWorkflowProductionContainer,
  createWorkflowTestContainer,
} from './container.js';

// Workspace context resolver (Plan 014 Phase 2)
export type {
  Worktree,
  WorkspaceContext,
  WorkspaceInfo,
  WorkspaceContextResult,
  WorkspaceInfoResult,
  IWorkspaceContextResolver,
} from './interfaces/index.js';

// Workspace context resolver fake (Plan 014 Phase 2)
export { FakeWorkspaceContextResolver } from './fakes/index.js';
export type {
  ResolveFromPathCall,
  GetWorkspaceInfoCall,
} from './fakes/index.js';

// Sample adapter fake (Plan 014 Phase 3)
export { FakeSampleAdapter } from './fakes/index.js';
export type {
  SampleLoadCall,
  SampleSaveCall,
  SampleListCall,
  SampleRemoveCall,
  SampleExistsCall,
} from './fakes/index.js';

export { WorkspaceContextResolver } from './resolvers/index.js';
export { GitWorktreeResolver } from './resolvers/index.js';

// Git worktree resolver interface (Plan 014 Phase 4)
export type { IGitWorktreeResolver } from './interfaces/index.js';

// Workspace service interface (Plan 014 Phase 4)
export type {
  IWorkspaceService,
  WorkspaceOperationResult,
  AddWorkspaceResult,
  RemoveWorkspaceResult,
  AddWorkspaceOptions,
} from './interfaces/index.js';

// Sample service interface (Plan 014 Phase 4)
export type {
  ISampleService,
  SampleOperationResult,
  AddSampleResult,
  DeleteSampleResult,
} from './interfaces/index.js';

// Agent session service interface (Plan 018)
export type {
  IAgentSessionService,
  CreateSessionResult,
  DeleteSessionResult,
  UpdateSessionStatusResult,
} from './interfaces/index.js';

// Workspace service (Plan 014 Phase 4)
export { WorkspaceService } from './services/index.js';
export { SampleService } from './services/index.js';

// Agent session service (Plan 018)
export { AgentSessionService } from './services/index.js';

// Git worktree resolver fake (Plan 014 Phase 4)
export { FakeGitWorktreeResolver } from './fakes/index.js';
export type {
  DetectWorktreesCall,
  GetMainRepoPathCall,
  IsMainWorktreeCall,
} from './fakes/index.js';

// Agent session adapter fake (Plan 018)
export { FakeAgentSessionAdapter } from './fakes/index.js';
export type {
  AgentSessionLoadCall,
  AgentSessionSaveCall,
  AgentSessionListCall,
  AgentSessionRemoveCall,
  AgentSessionExistsCall,
} from './fakes/index.js';

// Agent event adapter fake (Plan 018 Phase 2)
export { FakeAgentEventAdapter } from './fakes/index.js';
export type {
  AgentEventAppendCall,
  AgentEventGetAllCall,
  AgentEventGetSinceCall,
  AgentEventArchiveCall,
  AgentEventExistsCall,
} from './fakes/index.js';
