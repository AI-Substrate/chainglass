/**
 * Plan 019: Agent Manager Refactor - IAgentNotifierService Interface
 *
 * Defines the contract for broadcasting agent events via SSE.
 * Per ADR-0007: Single channel with client-side routing by agentId.
 * Per DYK-07: Interface in shared, implementation in apps/web.
 *
 * Usage:
 * ```typescript
 * // Service broadcasts events for any agent
 * notifier.broadcastStatus(agentId, 'working');
 * notifier.broadcastIntent(agentId, 'Analyzing code...');
 * notifier.broadcastEvent(agentId, { type: 'text_delta', content: '...' });
 * ```
 */

import type { AgentStoredEvent } from './agent-instance.interface.js';
import type { AgentInstanceStatus } from './agent-instance.interface.js';

/**
 * SSE event types broadcast by the agent notifier.
 * Per ADR-0007 IMP-001: All events include agentId for client-side filtering.
 */
export type AgentSSEEventType =
  | 'agent_status'
  | 'agent_intent'
  | 'agent_event'
  | 'agent_created'
  | 'agent_terminated';

/**
 * Base shape for all agent SSE events.
 * Per ADR-0007 IMP-001: agentId is mandatory for routing.
 */
export interface BaseAgentSSEEvent {
  /** Event type for SSE */
  readonly type: AgentSSEEventType;
  /** Agent ID for client-side routing */
  readonly agentId: string;
  /** Timestamp of when the event was created */
  readonly timestamp: string;
}

/**
 * Status change event - broadcast when agent status transitions.
 * Per AC-15: Status changes are broadcast.
 */
export interface AgentStatusSSEEvent extends BaseAgentSSEEvent {
  readonly type: 'agent_status';
  readonly status: AgentInstanceStatus;
}

/**
 * Intent change event - broadcast when agent intent updates.
 * Per AC-16: Intent changes are broadcast.
 */
export interface AgentIntentSSEEvent extends BaseAgentSSEEvent {
  readonly type: 'agent_intent';
  readonly intent: string;
}

/**
 * Agent event - broadcast when adapter emits an event.
 * Per AC-17: Agent events are broadcast after storage.
 */
export interface AgentEventSSEEvent extends BaseAgentSSEEvent {
  readonly type: 'agent_event';
  readonly event: AgentStoredEvent;
}

/**
 * Agent created lifecycle event.
 */
export interface AgentCreatedSSEEvent extends BaseAgentSSEEvent {
  readonly type: 'agent_created';
  readonly name: string;
  readonly agentType: string;
  readonly workspace: string;
}

/**
 * Agent terminated lifecycle event.
 */
export interface AgentTerminatedSSEEvent extends BaseAgentSSEEvent {
  readonly type: 'agent_terminated';
}

/**
 * Union type for all agent SSE events.
 */
export type AgentSSEEvent =
  | AgentStatusSSEEvent
  | AgentIntentSSEEvent
  | AgentEventSSEEvent
  | AgentCreatedSSEEvent
  | AgentTerminatedSSEEvent;

/**
 * IAgentNotifierService - interface for broadcasting agent events.
 *
 * Per DYK-08: Receives ISSEBroadcaster for testability.
 * Per ADR-0007: Uses single 'agents' channel with agentId routing.
 *
 * Responsibilities:
 * - Format events with agentId and timestamp
 * - Delegate to ISSEBroadcaster for actual SSE transmission
 * - Provide typed broadcast methods for status, intent, and events
 */
export interface IAgentNotifierService {
  /**
   * Broadcast a status change for an agent.
   */
  broadcastStatus(agentId: string, status: AgentInstanceStatus): void;

  /**
   * Broadcast an intent change for an agent.
   */
  broadcastIntent(agentId: string, intent: string): void;

  /**
   * Broadcast an agent event.
   * Per PL-01: Event should already be stored before calling this.
   */
  broadcastEvent(agentId: string, event: AgentStoredEvent): void;

  /**
   * Broadcast agent creation lifecycle event.
   */
  broadcastCreated(agentId: string, info: { name: string; type: string; workspace: string }): void;

  /**
   * Broadcast agent termination lifecycle event.
   */
  broadcastTerminated(agentId: string): void;
}
