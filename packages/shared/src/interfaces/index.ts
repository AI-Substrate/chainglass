export type { ConfigType, IConfigService } from './config.interface.js';
export { LogLevel } from './logger.interface.js';
export type { ILogger, LogEntry } from './logger.interface.js';
export { FileSystemError } from './filesystem.interface.js';
export type { IFileSystem, FileStat } from './filesystem.interface.js';
export { PathSecurityError } from './path-resolver.interface.js';
export type { IPathResolver } from './path-resolver.interface.js';
export type { IHashGenerator } from './hash-generator.interface.js';
// YAML parser interface (Phase 2: extracted from workflow for shared use)
export { YamlParseError } from './yaml-parser.interface.js';
export type { IYamlParser, ParseResult } from './yaml-parser.interface.js';

// Viewer interfaces (per Phase 1: Headless Viewer Hooks)
export type { ViewerFile } from './viewer.interface.js';

// Diff interfaces (per Phase 5: DiffViewer Component)
export type { DiffError, DiffResult, IGitDiffService } from './diff.interface.js';

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
  ValidatedOutput, // @deprecated alias
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
} from './results/index.js';

// Output adapter interface (per Phase 1a: Output Adapter Architecture)
export type {
  IOutputAdapter,
  CommandResponse,
  CommandResponseSuccess,
  CommandResponseError,
  ErrorDetail,
} from './output-adapter.interface.js';

// Agent interfaces and types
export type { IAgentAdapter } from './agent-adapter.interface.js';
export type {
  AgentEvent,
  AgentEventBase,
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
} from './agent-types.js';

// Process manager interfaces and types
export type {
  IProcessManager,
  ProcessExitResult,
  ProcessHandle,
  ProcessSignal,
  SpawnOptions,
  StdioOption,
  StdioOptions,
} from './process-manager.interface.js';

// Copilot SDK interfaces and types (local layer isolation per R-ARCH-001)
export type {
  CopilotAssistantMessageDeltaEvent,
  CopilotAssistantMessageEvent,
  CopilotAssistantUsageEvent,
  CopilotMessageOptions,
  CopilotResumeSessionConfig,
  CopilotSessionConfig,
  CopilotSessionErrorEvent,
  CopilotSessionEvent,
  CopilotSessionEventBase,
  CopilotSessionEventHandler,
  CopilotSessionEventLike,
  CopilotSessionEventType,
  CopilotSessionIdleEvent,
  CopilotStatusResponse,
  CopilotToolRequest,
  ICopilotClient,
  ICopilotSession,
} from './copilot-sdk.interface.js';
