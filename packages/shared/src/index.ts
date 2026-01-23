// @chainglass/shared entry point
// Exports all shared interfaces, fakes, and adapters

// Interfaces
export type { ConfigType, IConfigService } from './interfaces/index.js';
export { LogLevel } from './interfaces/index.js';
export type { ILogger, LogEntry } from './interfaces/index.js';

// Agent interfaces and types
export type { IAgentAdapter } from './interfaces/index.js';
export type {
  AgentResult,
  AgentRunOptions,
  AgentStatus,
  TokenMetrics,
} from './interfaces/index.js';

// Process manager interfaces and types
export type {
  IProcessManager,
  ProcessExitResult,
  ProcessHandle,
  ProcessSignal,
  SpawnOptions,
} from './interfaces/index.js';

// Fakes
export { FakeAgentAdapter } from './fakes/index.js';
export type { FakeAgentAdapterOptions } from './fakes/index.js';
export { FakeConfigService } from './fakes/index.js';
export { FakeLogger } from './fakes/index.js';
export { FakeProcessManager } from './fakes/index.js';

// Adapters
export { PinoLoggerAdapter } from './adapters/index.js';
export { StreamJsonParser } from './adapters/index.js';
export { CopilotLogParser } from './adapters/index.js';
export { ClaudeCodeAdapter } from './adapters/index.js';
export type { ClaudeCodeAdapterOptions } from './adapters/index.js';
export { CopilotAdapter } from './adapters/index.js';
export type { CopilotAdapterOptions, ReadLogFileFunction } from './adapters/index.js';
export { UnixProcessManager } from './adapters/index.js';
export { WindowsProcessManager } from './adapters/index.js';

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
