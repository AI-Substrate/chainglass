/**
 * Plan 019: Agent Manager Refactor - AgentNotifierService
 *
 * Real implementation of IAgentNotifierService for SSE broadcasting.
 * Per ADR-0007: Uses single 'agents' channel with client-side routing by agentId.
 * Per DYK-07: Lives in apps/web (correct dependency direction from shared→web).
 * Per DYK-08: Receives ISSEBroadcaster for testability.
 *
 * FX001-3: Optional lazy bridge resolver for WorkUnitStateService integration.
 * - broadcastStatus() → bridge.updateAgentStatus() (status mapping: working→working, stopped→idle, error→error)
 * - Register/unregister are NOT handled here — they stay in API route handlers (DYK-FX001-03)
 * - broadcastIntent() does NOT call bridge (too high-frequency per DYK-FX001-02)
 * - Bridge is lazy-resolved to avoid DI registration order issues (DYK-FX001-01)
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
import type { AgentWorkUnitBridge } from '../059-fix-agents/agent-work-unit-bridge';

/** Maps AgentInstanceStatus (3 values) → WorkUnitStatus (5 values). */
function mapAgentStatus(status: AgentInstanceStatus): 'working' | 'idle' | 'error' {
  switch (status) {
    case 'working':
      return 'working';
    case 'error':
      return 'error';
    case 'stopped':
      return 'idle';
  }
}

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
 *
 * @deprecated Future migration to domain event adapters via {@link CentralEventNotifierService}
 * is planned. When an agent domain adapter is created, it will replace this service with
 * filesystem-driven notifications through the central event system (Plan 027).
 * See `docs/how/dev/central-events/3-adapters.md` for the adapter pattern.
 */
export class AgentNotifierService implements IAgentNotifierService {
  constructor(
    private readonly broadcaster: ISSEBroadcaster,
    private readonly resolveBridge?: () => AgentWorkUnitBridge | undefined
  ) {}

  /**
   * Broadcast a status change for an agent.
   * Per AC-15: Status changes are broadcast.
   * FX001-3: Also updates WorkUnitStateService via lazy bridge.
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

    // Update WorkUnitStateService via bridge (FX001-3)
    try {
      const bridge = this.resolveBridge?.();
      if (bridge) {
        bridge.updateAgentStatus(agentId, mapAgentStatus(status));
      }
    } catch (error) {
      console.warn('[AgentNotifier] Failed to update work-unit-state:', agentId, error);
    }
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

  /**
   * Broadcast agent creation lifecycle event.
   * Hooks subscribe to 'agent_created' to invalidate query cache.
   */
  broadcastCreated(agentId: string, info: { name: string; type: string; workspace: string }): void {
    const event = {
      type: 'agent_created' as const,
      agentId,
      name: info.name,
      agentType: info.type,
      workspace: info.workspace,
      timestamp: new Date().toISOString(),
    };
    this.broadcaster.broadcast(AGENTS_CHANNEL, 'agent_created', event);
  }

  /**
   * Broadcast agent termination lifecycle event.
   * Hooks subscribe to 'agent_terminated' to invalidate query cache.
   */
  broadcastTerminated(agentId: string): void {
    const event = {
      type: 'agent_terminated' as const,
      agentId,
      timestamp: new Date().toISOString(),
    };
    this.broadcaster.broadcast(AGENTS_CHANNEL, 'agent_terminated', event);
  }
}
