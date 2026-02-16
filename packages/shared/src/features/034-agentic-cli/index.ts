/**
 * Plan 034: Agentic CLI — Feature Barrel
 *
 * Re-exports all types and interfaces for the redesigned agent system.
 * Consumers import from this barrel; implementation exports are added
 * in Phase 2 and fakes in `./fakes/index.js`.
 */

export type {
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
