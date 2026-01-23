export type { ConfigType, IConfigService } from './config.interface.js';
export { LogLevel } from './logger.interface.js';
export type { ILogger, LogEntry } from './logger.interface.js';

// Agent interfaces and types
export type { IAgentAdapter } from './agent-adapter.interface.js';
export type {
  AgentResult,
  AgentRunOptions,
  AgentStatus,
  TokenMetrics,
} from './agent-types.js';

// Process manager interfaces and types
export type {
  IProcessManager,
  ProcessExitResult,
  ProcessHandle,
  ProcessSignal,
  SpawnOptions,
} from './process-manager.interface.js';

// Copilot SDK interfaces and types (local layer isolation per R-ARCH-001)
export type {
  CopilotAssistantMessageEvent,
  CopilotMessageOptions,
  CopilotResumeSessionConfig,
  CopilotSessionConfig,
  CopilotSessionErrorEvent,
  CopilotSessionEvent,
  CopilotSessionEventHandler,
  CopilotSessionEventType,
  CopilotSessionIdleEvent,
  CopilotStatusResponse,
  ICopilotClient,
  ICopilotSession,
} from './copilot-sdk.interface.js';
