// @chainglass/shared entry point
// Exports all shared interfaces, fakes, and adapters

// Interfaces
export type { ConfigType, IConfigService } from './interfaces/index.js';
export { LogLevel } from './interfaces/index.js';
export type { ILogger, LogEntry } from './interfaces/index.js';
export { FileSystemError } from './interfaces/index.js';
export type { IFileSystem, FileStat } from './interfaces/index.js';
export { PathSecurityError } from './interfaces/index.js';
export type { IPathResolver } from './interfaces/index.js';
export type { ViewerFile } from './interfaces/index.js';
export type { DiffError, DiffResult, IGitDiffService } from './interfaces/index.js';
export type { IHashGenerator } from './interfaces/index.js';
// YAML parser interface (Phase 2: extracted from workflow for shared use)
export { YamlParseError } from './interfaces/index.js';
export type { IYamlParser, ParseResult } from './interfaces/index.js';

// Library utilities
export { detectLanguage } from './lib/language-detection.js';
// Plan 015: Phase 1 - Session ID validation
export {
  isValidSessionId,
  MAX_SESSION_ID_LENGTH,
  SessionIdValidationError,
  validateSessionId,
} from './lib/validators/session-id-validator.js';

// Result types (per Phase 1a: Output Adapter Architecture)
export type {
  BaseResult,
  ResultError,
  ComposeResult,
  PrepareResult,
  ValidateResult,
  FinalizeResult,
  ResolvedInput,
  CopiedFile,
  ValidatedFile,
  ValidatedOutput, // @deprecated alias for ValidatedFile
  PhaseInfo,
  // Message result types (Phase 3 Subtask 001)
  MessageCreateResult,
  MessageAnswerResult,
  MessageListResult,
  MessageReadResult,
  MessageSummary,
  MessageAnswerData,
  MessageData,
  // Handover result types (Phase 3 Subtask 002)
  AcceptResult,
  PreflightResult,
  HandoverResult,
  Facilitator,
  PhaseState,
  StatusEntry,
  PreflightChecks,
  // Workflow registry result types (Phase 1)
  ListResult,
  InfoResult,
  CheckpointResult,
  RestoreResult,
  VersionsResult,
  CheckpointInfo,
  WorkflowSummary,
  WorkflowInfo,
  // Workspace result types (Plan 014: Phase 5)
  WorkspaceOutputData,
  WorktreeOutputData,
  WorkspaceAddCmdResult,
  WorkspaceListCmdResult,
  WorkspaceInfoCmdResult,
  WorkspaceRemoveCmdResult,
  SampleOutputData,
  SampleWorkspaceContextData,
  SampleAddCmdResult,
  SampleListCmdResult,
  SampleInfoCmdResult,
  SampleDeleteCmdResult,
} from './interfaces/index.js';

// Output adapter interface (per Phase 1a: Output Adapter Architecture)
export type {
  IOutputAdapter,
  CommandResponse,
  CommandResponseSuccess,
  CommandResponseError,
  ErrorDetail,
} from './interfaces/index.js';

// Agent interfaces and types
export type { IAgentAdapter } from './interfaces/index.js';
export type {
  AgentEvent,
  AgentEventHandler,
  AgentMessageEvent,
  AgentRawEvent,
  AgentResult,
  AgentRunOptions,
  AgentSessionEvent,
  AgentStatus,
  AgentTextDeltaEvent,
  AgentUsageEvent,
  TokenMetrics,
} from './interfaces/index.js';

// Copilot SDK interfaces and types (Plan 070: re-export for harness consumption)
export type {
  CopilotModelBilling,
  CopilotModelCapabilities,
  CopilotModelInfo,
  CopilotModelPolicy,
  CopilotReasoningEffort,
  CopilotSessionConfig,
  CopilotResumeSessionConfig,
  ICopilotClient,
  ICopilotSession,
} from './interfaces/index.js';

// Workflow Events interface (Plan 061)
export type { IWorkflowEvents } from './interfaces/index.js';

// Work Unit State interface (Plan 059)
export type { IWorkUnitStateService } from './interfaces/index.js';

// Note: IEventStorage, EventStorageService, FakeEventStorage removed in Plan 018 Phase 2.
// Use AgentEventAdapter from @chainglass/workflow for workspace-scoped event storage.

// Process manager interfaces and types
export type {
  IProcessManager,
  ProcessExitResult,
  ProcessHandle,
  ProcessSignal,
  SpawnOptions,
  StdioOption,
  StdioOptions,
} from './interfaces/index.js';

// Fakes
export { FakeAgentAdapter } from './fakes/index.js';
export type { FakeAgentAdapterOptions } from './fakes/index.js';
export { FakeConfigService } from './fakes/index.js';
export { FakeCopilotClient } from './fakes/index.js';
export type { FakeCopilotClientOptions } from './fakes/index.js';
export { FakeCopilotSession } from './fakes/index.js';
export type { FakeCopilotSessionOptions } from './fakes/index.js';
export { FakeLogger } from './fakes/index.js';
export { FakeFileSystem } from './fakes/index.js';
export { FakePathResolver } from './fakes/index.js';
export { FakeOutputAdapter } from './fakes/index.js';
export type { FormattedResult } from './fakes/index.js';
export { FakeDiffAction } from './fakes/index.js';
export { FakeHashGenerator } from './fakes/index.js';
export { FakeProcessManager } from './fakes/index.js';
// YAML parser fake (Phase 2)
export { FakeYamlParser } from './fakes/index.js';
// Workflow Events fake (Plan 061)
export { FakeWorkflowEventsService } from './fakes/index.js';
// Work Unit State fake (Plan 059)
export { FakeWorkUnitStateService } from './fakes/index.js';

// Adapters
export { PinoLoggerAdapter } from './adapters/index.js';
export { NodeFileSystemAdapter } from './adapters/index.js';
export { PathResolverAdapter } from './adapters/index.js';
export { JsonOutputAdapter } from './adapters/index.js';
export { ConsoleOutputAdapter } from './adapters/index.js';
export { HashGeneratorAdapter } from './adapters/index.js';
export { StreamJsonParser } from './adapters/index.js';
// YAML parser adapter (Phase 2)
export { YamlParserAdapter } from './adapters/index.js';
// Phase 4: Deleted CopilotLogParser (56 LOC) and old CopilotAdapter (499 LOC)
// CopilotAdapter is now an alias for SdkCopilotAdapter
export { ClaudeCodeAdapter } from './adapters/index.js';
export type { ClaudeCodeAdapterOptions } from './adapters/index.js';
export { CopilotAdapter, SdkCopilotAdapter } from './adapters/index.js';
export type { SdkCopilotAdapterOptions } from './adapters/index.js';
export { parseEventsJsonlLine } from './adapters/index.js';
export { CopilotCLIAdapter } from './adapters/index.js';
export type { CopilotCLIAdapterOptions } from './adapters/index.js';
export { UnixProcessManager } from './adapters/index.js';
export { WindowsProcessManager } from './adapters/index.js';
export { createProcessManager, ProcessManagerAdapter } from './adapters/index.js';

// DI Tokens
export {
  SHARED_DI_TOKENS,
  WORKFLOW_DI_TOKENS,
  WORKSPACE_DI_TOKENS,
  POSITIONAL_GRAPH_DI_TOKENS,
  ORCHESTRATION_DI_TOKENS,
  WORKGRAPH_DI_TOKENS,
} from './di-tokens.js';

// Plan 061: WorkflowEvents typed constants and types
export { WorkflowEventType } from './workflow-events/index.js';
export type { WorkflowEventTypeValue } from './workflow-events/index.js';
export type {
  AnswerInput,
  AnswerResult,
  ErrorInput,
  ProgressInput,
  QuestionInput,
  ProgressEvent as WorkflowProgressEvent,
  QuestionAskedEvent,
  QuestionAnsweredEvent,
  WorkflowEvent,
} from './workflow-events/index.js';

// Plan 059: WorkUnit State types and SSE event shapes
export type {
  RegisterWorkUnitInput,
  UpdateWorkUnitInput,
  WorkUnitCreator,
  WorkUnitEntry,
  WorkUnitEvent,
  WorkUnitFilter,
  WorkUnitRegisteredEvent,
  WorkUnitRemovedEvent,
  WorkUnitSourceRef,
  WorkUnitStatus,
  WorkUnitStatusEvent,
} from './work-unit-state/index.js';

// Plan 027: Central Domain Event Notification System
export { WorkspaceDomain } from './features/027-central-notify-events/index.js';
export type { WorkspaceDomainType } from './features/027-central-notify-events/index.js';
export type {
  DomainEvent,
  ICentralEventNotifier,
} from './features/027-central-notify-events/index.js';
export { FakeCentralEventNotifier } from './features/027-central-notify-events/index.js';

// Config (re-export key items from ./config for convenience)
export {
  ConfigurationError,
  LiteralSecretError,
  MissingConfigurationError,
} from './config/index.js';
export {
  AgentConfigSchema,
  AgentConfigType,
  type AgentConfig,
} from './config/index.js';
export {
  SampleConfigSchema,
  SampleConfigType,
  type SampleConfig,
} from './config/index.js';
export {
  WorkflowMetadataSchema,
  type WorkflowMetadata,
} from './config/index.js';
export {
  ChainglassConfigService,
  type ChainglassConfigServiceOptions,
} from './config/index.js';
export {
  getUserConfigDir,
  ensureUserConfig,
  getProjectConfigDir,
} from './config/index.js';

// Services
export { AgentService } from './services/index.js';
export type { AdapterFactory, AgentServiceRunOptions } from './services/index.js';
// Note: EventStorageService removed in Plan 018 Phase 2.
// Use AgentEventAdapter from @chainglass/workflow for workspace-scoped event storage.

// Plan 034: Agentic CLI — AgentManagerService + AgentInstance
export { AgentInstance } from './features/034-agentic-cli/agent-instance.js';
export { AgentManagerService } from './features/034-agentic-cli/agent-manager-service.js';
export type { IAgentInstance } from './features/034-agentic-cli/agent-instance.interface.js';
export type { IAgentManagerService } from './features/034-agentic-cli/agent-manager-service.interface.js';
export type {
  AdapterFactory as AgentAdapterFactory,
  AgentCompactOptions,
  AgentFilter,
  AgentInstanceConfig,
  AgentInstanceStatus,
  AgentType as AgentInstanceType,
  CreateAgentParams,
} from './features/034-agentic-cli/types.js';
export { FakeAgentInstance } from './features/034-agentic-cli/fakes/fake-agent-instance.js';
export { FakeAgentManagerService } from './features/034-agentic-cli/fakes/fake-agent-manager-service.js';

// Schemas (Plan 015: Phase 1 - Zod-first approach, derive types via z.infer)
export {
  // Schemas
  AgentEventBaseSchema,
  AgentStoredEventSchema,
  AgentThinkingEventSchema,
  AgentToolCallEventSchema,
  AgentToolResultEventSchema,
  agentStoredEventSchemas,
  // Session metadata schemas (Plan 015: Phase 3)
  SessionMetadataSchema,
  SessionMetadataCreateSchema,
  SessionMetadataUpdateSchema,
  AgentTypeSchema,
  SessionStatusSchema,
  // Agent session schemas (Plan 018)
  AgentSessionJSONSchema,
  AgentSessionInputSchema,
  AgentSessionStatusSchema,
  SESSION_ID_PATTERN,
  isValidSessionId as isValidAgentSessionId,
  validateSessionId as validateAgentSessionId,
  // Types
  type AgentStoredEvent,
  type AgentThinkingEvent,
  type AgentToolCallEvent,
  type AgentToolResultEvent,
  type SessionMetadata,
  type SessionMetadataCreate,
  type SessionMetadataUpdate,
  type AgentType,
  type SessionStatus,
  type AgentSessionJSON,
  type AgentSessionInput,
  type AgentSessionStatus,
} from './schemas/index.js';
