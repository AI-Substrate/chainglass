/**
 * Plan 019: Agent Manager Refactor - Web Feature Barrel Export
 *
 * Re-exports all public implementations from the agent manager refactor
 * web-specific feature folder (real SSE broadcasting, adapters, etc.)
 *
 * Per PlanPak: plan-scoped files live in feature folders.
 */

// Real implementations
export { AgentNotifierService } from './agent-notifier.service';
export { SSEManagerBroadcaster } from './sse-manager-broadcaster';

// Hooks
export { useAgentManager } from './useAgentManager';
export type { UseAgentManagerReturn } from './useAgentManager';
export { useAgentInstance } from './useAgentInstance';
export type {
  AgentInstanceData,
  UseAgentInstanceOptions,
  UseAgentInstanceReturn,
} from './useAgentInstance';

// Transformers (Phase 5)
export {
  agentEventToLogEntryProps,
  mergeAgentEvents,
  transformAgentEventsToLogEntries,
} from './transformers/index';
export type { AgentStoredEvent } from './transformers/index';
