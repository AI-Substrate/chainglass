/**
 * Plan 019: Agent Manager Refactor - AgentNotifierService
 *
 * Real implementation of IAgentNotifierService for SSE broadcasting.
 * Per ADR-0007: Uses single 'agents' channel with client-side routing by agentId.
 * Per DYK-07: Lives in apps/web (correct dependency direction from shared→web).
 * Per DYK-08: Receives ISSEBroadcaster for testability.
 *
 * Usage:
 * ```typescript
 * import { sseManager } from '@/lib/sse-manager';
 * import { SSEManagerBroadcaster } from './sse-manager-broadcaster';
 *
 * const broadcaster = new SSEManagerBroadcaster(sseManager);
 * const notifier = new AgentNotifierService(broadcaster);
 *
 * notifier.broadcastStatus('agent-1', 'working');
 * ```
 */

import type {
  AgentInstanceStatus,
  AgentStoredEvent,
} from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import type {
  AgentEventSSEEvent,
  AgentIntentSSEEvent,
  AgentStatusSSEEvent,
  IAgentNotifierService,
} from '@chainglass/shared/features/019-agent-manager-refactor/agent-notifier.interface';
import type { ISSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor/sse-broadcaster.interface';

/**
 * Channel name used for agent broadcasts.
 * Per ADR-0007: Single channel with client-side routing.
 */
const AGENTS_CHANNEL = 'agents';

/**
 * AgentNotifierService - real implementation for SSE broadcasting.
 *
 * Formats agent events with agentId and timestamp, then delegates
 * to ISSEBroadcaster for actual transmission.
 *
 * Per ADR-0007 IMP-001: All events include agentId for client-side filtering.
 */
export class AgentNotifierService implements IAgentNotifierService {
  constructor(private readonly broadcaster: ISSEBroadcaster) {}

  /**
   * Broadcast a status change for an agent.
   * Per AC-15: Status changes are broadcast.
   */
  broadcastStatus(agentId: string, status: AgentInstanceStatus): void {
    console.log(`[AgentNotifier] Broadcasting status: ${agentId} → ${status}`);
    const event: AgentStatusSSEEvent = {
      type: 'agent_status',
      agentId,
      status,
      timestamp: new Date().toISOString(),
    };
    this.broadcaster.broadcast(AGENTS_CHANNEL, 'agent_status', event);
  }

  /**
   * Broadcast an intent change for an agent.
   * Per AC-16: Intent changes are broadcast.
   */
  broadcastIntent(agentId: string, intent: string): void {
    const event: AgentIntentSSEEvent = {
      type: 'agent_intent',
      agentId,
      intent,
      timestamp: new Date().toISOString(),
    };
    this.broadcaster.broadcast(AGENTS_CHANNEL, 'agent_intent', event);
  }

  /**
   * Broadcast an agent event.
   * Per AC-17: Agent events are broadcast after storage.
   * Per PL-01: Caller must ensure event is already stored before calling.
   */
  broadcastEvent(agentId: string, event: AgentStoredEvent): void {
    console.log(
      `[AgentNotifier] Broadcasting event: ${agentId} type="${event.type}" eventId=${event.eventId}`
    );
    const sseEvent: AgentEventSSEEvent = {
      type: 'agent_event',
      agentId,
      event,
      timestamp: new Date().toISOString(),
    };
    this.broadcaster.broadcast(AGENTS_CHANNEL, 'agent_event', sseEvent);
  }
}
