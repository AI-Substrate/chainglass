/**
 * Plan 034: Agentic CLI — Feature Barrel
 *
 * Re-exports all types, interfaces, implementations, and fakes.
 */

export type {
  AdapterFactory,
  AgentCompactOptions,
  AgentEvent,
  AgentEventHandler,
  AgentFilter,
  AgentInstanceConfig,
  AgentInstanceStatus,
  AgentResult,
  AgentRunOptions,
  AgentType,
  CreateAgentParams,
} from './types.js';

export type { IAgentInstance } from './agent-instance.interface.js';
export type { IAgentManagerService } from './agent-manager-service.interface.js';

// Implementations (Phase 2)
export { AgentInstance } from './agent-instance.js';
export { AgentManagerService } from './agent-manager-service.js';

// Fakes (Phase 2)
export {
  FakeAgentInstance,
  FakeAgentManagerService,
} from './fakes/index.js';
export type {
  FakeAgentInstanceOptions,
  FakeAgentManagerServiceOptions,
} from './fakes/index.js';
