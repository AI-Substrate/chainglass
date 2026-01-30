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

// Phase 2: Notifier interfaces (per DYK-07: interface in shared)
export type {
  IAgentNotifierService,
  AgentSSEEventType,
  BaseAgentSSEEvent,
  AgentStatusSSEEvent,
  AgentIntentSSEEvent,
  AgentEventSSEEvent,
  AgentSSEEvent,
} from './agent-notifier.interface.js';

// Phase 2: SSE Broadcaster interface (per DYK-08)
export type { ISSEBroadcaster } from './sse-broadcaster.interface.js';

// Phase 3: Storage interface (per AC-19, AC-20, AC-21, AC-22, AC-23)
export type {
  IAgentStorageAdapter,
  AgentRegistryEntry,
  AgentInstanceData,
} from './agent-storage.interface.js';

// Real implementations
export { AgentManagerService } from './agent-manager.service.js';
export { AgentInstance } from './agent-instance.js';
export type { AgentInstanceConfig } from './agent-instance.js';

// Phase 3: Real storage adapter (per DYK-11)
export { AgentStorageAdapter } from './agent-storage.adapter.js';

// Fakes
export { FakeAgentManagerService } from './fake-agent-manager.service.js';
export {
  FakeAgentInstance,
  type FakeAgentInstanceOptions,
  type RecordedRunCall,
} from './fake-agent-instance.js';

// Phase 2: Notifier fakes (per AC-28)
export { FakeAgentNotifierService } from './fake-agent-notifier.service.js';
export {
  FakeSSEBroadcaster,
  type RecordedBroadcast,
} from './fake-sse-broadcaster.js';

// Phase 3: Storage fakes (per AC-28)
export { FakeAgentStorageAdapter } from './fake-agent-storage.adapter.js';
