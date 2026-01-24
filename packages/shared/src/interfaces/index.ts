export type { ConfigType, IConfigService } from './config.interface.js';
export { LogLevel } from './logger.interface.js';
export type { ILogger, LogEntry } from './logger.interface.js';
export { FileSystemError } from './filesystem.interface.js';
export type { IFileSystem, FileStat } from './filesystem.interface.js';
export { PathSecurityError } from './path-resolver.interface.js';
export type { IPathResolver } from './path-resolver.interface.js';

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
} from './results/index.js';

// Output adapter interface (per Phase 1a: Output Adapter Architecture)
export type {
  IOutputAdapter,
  CommandResponse,
  CommandResponseSuccess,
  CommandResponseError,
  ErrorDetail,
} from './output-adapter.interface.js';
