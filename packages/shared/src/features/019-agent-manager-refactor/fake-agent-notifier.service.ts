/**
 * Plan 019: Agent Manager Refactor - FakeAgentNotifierService
 *
 * Test double for IAgentNotifierService that records all broadcasts.
 * Per AC-28: FakeAgentNotifierService provides test helpers.
 * Per DYK-08: Uses FakeSSEBroadcaster internally for isolation.
 *
 * Usage:
 * ```typescript
 * const fakeNotifier = new FakeAgentNotifierService();
 *
 * fakeNotifier.broadcastStatus('agent-1', 'working');
 *
 * expect(fakeNotifier.getStatusBroadcasts()).toHaveLength(1);
 * expect(fakeNotifier.getLastStatusBroadcast()?.status).toBe('working');
 * ```
 */

import type { AgentInstanceStatus, AgentStoredEvent } from './agent-instance.interface.js';
import type {
  AgentEventSSEEvent,
  AgentIntentSSEEvent,
  AgentStatusSSEEvent,
  IAgentNotifierService,
} from './agent-notifier.interface.js';
import { FakeSSEBroadcaster, type RecordedBroadcast } from './fake-sse-broadcaster.js';
import type { ISSEBroadcaster } from './sse-broadcaster.interface.js';

/**
 * Channel name used for agent broadcasts.
 * Per ADR-0007: Single channel with client-side routing.
 */
const AGENTS_CHANNEL = 'agents';

/**
 * FakeAgentNotifierService - test double for IAgentNotifierService.
 *
 * Can operate in two modes:
 * 1. With internal FakeSSEBroadcaster (default) - for unit tests
 * 2. With injected ISSEBroadcaster - for contract tests
 *
 * Provides rich inspection methods for verifying notification behavior.
 */
export class FakeAgentNotifierService implements IAgentNotifierService {
  private readonly _broadcaster: ISSEBroadcaster;
  private readonly _ownsBroadcaster: boolean;

  /**
   * Create a FakeAgentNotifierService.
   *
   * @param broadcaster - Optional ISSEBroadcaster. If not provided, creates internal FakeSSEBroadcaster.
   */
  constructor(broadcaster?: ISSEBroadcaster) {
    if (broadcaster) {
      this._broadcaster = broadcaster;
      this._ownsBroadcaster = false;
    } else {
      this._broadcaster = new FakeSSEBroadcaster();
      this._ownsBroadcaster = true;
    }
  }

  // ===== IAgentNotifierService Implementation =====

  broadcastStatus(agentId: string, status: AgentInstanceStatus): void {
    const event: AgentStatusSSEEvent = {
      type: 'agent_status',
      agentId,
      status,
      timestamp: new Date().toISOString(),
    };
    this._broadcaster.broadcast(AGENTS_CHANNEL, 'agent_status', event);
  }

  broadcastIntent(agentId: string, intent: string): void {
    const event: AgentIntentSSEEvent = {
      type: 'agent_intent',
      agentId,
      intent,
      timestamp: new Date().toISOString(),
    };
    this._broadcaster.broadcast(AGENTS_CHANNEL, 'agent_intent', event);
  }

  broadcastEvent(agentId: string, event: AgentStoredEvent): void {
    const sseEvent: AgentEventSSEEvent = {
      type: 'agent_event',
      agentId,
      event,
      timestamp: new Date().toISOString(),
    };
    this._broadcaster.broadcast(AGENTS_CHANNEL, 'agent_event', sseEvent);
  }

  // ===== Test Helpers =====

  /**
   * Get all recorded broadcasts (only works with internal FakeSSEBroadcaster).
   */
  getBroadcasts(): RecordedBroadcast[] {
    if (this._ownsBroadcaster && this._broadcaster instanceof FakeSSEBroadcaster) {
      return this._broadcaster.getBroadcasts();
    }
    throw new Error('getBroadcasts() only available with internal FakeSSEBroadcaster');
  }

  /**
   * Get the last recorded broadcast.
   */
  getLastBroadcast(): RecordedBroadcast | undefined {
    if (this._ownsBroadcaster && this._broadcaster instanceof FakeSSEBroadcaster) {
      return this._broadcaster.getLastBroadcast();
    }
    throw new Error('getLastBroadcast() only available with internal FakeSSEBroadcaster');
  }

  /**
   * Get all status broadcasts.
   */
  getStatusBroadcasts(): RecordedBroadcast[] {
    return this.getBroadcasts().filter((b) => b.eventType === 'agent_status');
  }

  /**
   * Get the last status broadcast.
   */
  getLastStatusBroadcast(): AgentStatusSSEEvent | undefined {
    const broadcasts = this.getStatusBroadcasts();
    const last = broadcasts[broadcasts.length - 1];
    return last?.data as AgentStatusSSEEvent | undefined;
  }

  /**
   * Get all intent broadcasts.
   */
  getIntentBroadcasts(): RecordedBroadcast[] {
    return this.getBroadcasts().filter((b) => b.eventType === 'agent_intent');
  }

  /**
   * Get the last intent broadcast.
   */
  getLastIntentBroadcast(): AgentIntentSSEEvent | undefined {
    const broadcasts = this.getIntentBroadcasts();
    const last = broadcasts[broadcasts.length - 1];
    return last?.data as AgentIntentSSEEvent | undefined;
  }

  /**
   * Get all event broadcasts.
   */
  getEventBroadcasts(): RecordedBroadcast[] {
    return this.getBroadcasts().filter((b) => b.eventType === 'agent_event');
  }

  /**
   * Get the last event broadcast.
   */
  getLastEventBroadcast(): AgentEventSSEEvent | undefined {
    const broadcasts = this.getEventBroadcasts();
    const last = broadcasts[broadcasts.length - 1];
    return last?.data as AgentEventSSEEvent | undefined;
  }

  /**
   * Get broadcasts filtered by agentId.
   */
  getBroadcastsByAgent(agentId: string): RecordedBroadcast[] {
    return this.getBroadcasts().filter((b) => {
      const data = b.data as { agentId?: string };
      return data.agentId === agentId;
    });
  }

  /**
   * Reset all recorded state for test isolation.
   */
  reset(): void {
    if (this._ownsBroadcaster && this._broadcaster instanceof FakeSSEBroadcaster) {
      this._broadcaster.reset();
    }
  }
}
