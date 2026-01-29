/**
 * Plan 019: Agent Manager Refactor - Feature Barrel Export
 *
 * Re-exports all public interfaces, types, and implementations from
 * the agent manager refactor feature.
 */

// Interfaces
export type {
  IAgentManagerService,
  CreateAgentParams,
  AgentFilter,
} from './agent-manager.interface.js';

export type {
  IAgentInstance,
  AgentType,
  AgentInstanceStatus,
  AdapterFactory,
  AgentRunOptions,
  GetEventsOptions,
  AgentStoredEvent,
} from './agent-instance.interface.js';

// Real implementations
export { AgentManagerService } from './agent-manager.service.js';
export { AgentInstance } from './agent-instance.js';
export type { AgentInstanceConfig } from './agent-instance.js';

// Fakes
export { FakeAgentManagerService } from './fake-agent-manager.service.js';
export {
  FakeAgentInstance,
  type FakeAgentInstanceOptions,
  type RecordedRunCall,
} from './fake-agent-instance.js';
