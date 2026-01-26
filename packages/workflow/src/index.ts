// @chainglass/workflow entry point
// Exports all workflow interfaces, types, fakes, and adapters

// Errors
export { EntityNotFoundError } from './errors/index.js';
export type { EntityType } from './errors/index.js';

// Run errors (E050-E059 per DYK-05)
export { RunErrorCodes } from './errors/index.js';
export {
  RunNotFoundError,
  RunsDirNotFoundError,
  InvalidRunStatusError,
  RunCorruptError,
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
