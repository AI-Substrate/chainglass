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
} from './interfaces/index.js';

// Output adapter interface (per Phase 1a: Output Adapter Architecture)
export type {
  IOutputAdapter,
  CommandResponse,
  CommandResponseSuccess,
  CommandResponseError,
  ErrorDetail,
} from './interfaces/index.js';

// Fakes
export { FakeConfigService } from './fakes/index.js';
export { FakeLogger } from './fakes/index.js';
export { FakeFileSystem } from './fakes/index.js';
export { FakePathResolver } from './fakes/index.js';
export { FakeOutputAdapter } from './fakes/index.js';
export type { FormattedResult } from './fakes/index.js';

// Adapters
export { PinoLoggerAdapter } from './adapters/index.js';
export { NodeFileSystemAdapter } from './adapters/index.js';
export { PathResolverAdapter } from './adapters/index.js';
export { JsonOutputAdapter } from './adapters/index.js';
export { ConsoleOutputAdapter } from './adapters/index.js';

// DI Tokens
export { SHARED_DI_TOKENS, WORKFLOW_DI_TOKENS } from './di-tokens.js';

// Config (re-export key items from ./config for convenience)
export {
  ConfigurationError,
  LiteralSecretError,
  MissingConfigurationError,
} from './config/index.js';
export {
  SampleConfigSchema,
  SampleConfigType,
  type SampleConfig,
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
