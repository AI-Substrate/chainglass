// Workflow interfaces barrel export

// Entity adapters (Phase 1: Entity Upgrade)
export type { IWorkflowAdapter, RunListFilter } from './workflow-adapter.interface.js';
export type { IPhaseAdapter } from './phase-adapter.interface.js';

// Re-export from @chainglass/shared for backward compatibility (Phase 2: moved to shared)
export { YamlParseError } from '@chainglass/shared';
export type { IYamlParser, ParseResult } from '@chainglass/shared';

export { ValidationErrorCodes } from './schema-validator.interface.js';
export type {
  ISchemaValidator,
  ValidationResult,
  ResultError,
} from './schema-validator.interface.js';

// Workflow service interface (Phase 2, extended in Phase 3)
export type { ComposeOptions, IWorkflowService } from './workflow-service.interface.js';

// Phase service interface (Phase 3)
export type {
  IPhaseService,
  ValidateCheckMode,
  AcceptOptions,
  PreflightOptions,
  HandoverOptions,
} from './phase-service.interface.js';

// Message service interface (Phase 3 Subtask 001)
export { MessageErrorCodes } from './message-service.interface.js';
export type {
  IMessageService,
  MessageContent,
  AnswerInput,
} from './message-service.interface.js';

// Workflow registry interface (Phase 1)
export type { CheckpointOptions, IWorkflowRegistry } from './workflow-registry.interface.js';

// Init service interface (Phase 4)
export type {
  IInitService,
  InitOptions,
  InitResult,
  InitializationStatus,
} from './init-service.interface.js';
