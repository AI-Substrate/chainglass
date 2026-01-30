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

// Workspace registry adapter interface (Plan 014)
export type {
  IWorkspaceRegistryAdapter,
  WorkspaceErrorCode,
  WorkspaceSaveResult,
  WorkspaceRemoveResult,
} from './workspace-registry-adapter.interface.js';

// Workspace context resolver interface (Plan 014 Phase 2)
export type {
  Worktree,
  WorkspaceContext,
  WorkspaceInfo,
  WorkspaceContextResult,
  WorkspaceInfoResult,
  IWorkspaceContextResolver,
} from './workspace-context.interface.js';

// Sample adapter interface (Plan 014 Phase 3)
export type {
  ISampleAdapter,
  SampleErrorCode,
  SampleSaveResult,
  SampleRemoveResult,
} from './sample-adapter.interface.js';

// Git worktree resolver interface (Plan 014 Phase 4)
export type { IGitWorktreeResolver } from './git-worktree-resolver.interface.js';

// Workspace service interface (Plan 014 Phase 4)
export type {
  IWorkspaceService,
  WorkspaceOperationResult,
  AddWorkspaceResult,
  RemoveWorkspaceResult,
  AddWorkspaceOptions,
} from './workspace-service.interface.js';

// Sample service interface (Plan 014 Phase 4)
export type {
  ISampleService,
  SampleOperationResult,
  AddSampleResult,
  DeleteSampleResult,
} from './sample-service.interface.js';

// File watcher interface (Plan 022 Phase 4 Subtask 001)
export type {
  FileWatcherEvent,
  FileWatcherOptions,
  IFileWatcher,
  IFileWatcherFactory,
} from './file-watcher.interface.js';

// Workspace change notifier interface (Plan 022 Phase 4 Subtask 001)
export type {
  GraphChangedEvent,
  GraphChangedCallback,
  IWorkspaceChangeNotifierService,
} from './workspace-change-notifier.interface.js';
