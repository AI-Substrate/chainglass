// @chainglass/workflow entry point
// Exports all workflow interfaces, types, fakes, and adapters

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

// Adapters
export { YamlParserAdapter } from './adapters/index.js';
export { SchemaValidatorAdapter } from './adapters/index.js';

// Fakes
export { FakeYamlParser } from './fakes/index.js';
export { FakeSchemaValidator } from './fakes/index.js';
export { FakeWorkflowService } from './fakes/index.js';
export type { ComposeCall } from './fakes/index.js';
export { FakePhaseService } from './fakes/index.js';
export type { PrepareCall, ValidateCall, FinalizeCall } from './fakes/index.js';

// Services (Phase 2)
export { WorkflowService, ComposeErrorCodes } from './services/index.js';

// Services (Phase 3)
export { PhaseService, PhaseErrorCodes } from './services/index.js';

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
