export type { ConfigType, IConfigService } from './config.interface.js';
export { LogLevel } from './logger.interface.js';
export type { ILogger, LogEntry } from './logger.interface.js';

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
  CopilotSessionEventHandler,
  CopilotSessionEventType,
  CopilotSessionIdleEvent,
  CopilotStatusResponse,
  ICopilotClient,
  ICopilotSession,
} from './copilot-sdk.interface.js';
