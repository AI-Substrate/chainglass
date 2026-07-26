/**
 * FakeSSEBroadcaster - test double for ISSEBroadcaster that records broadcasts.
 *
 * Lets a service under test be driven without a live SSEManager, then asserted
 * against what it tried to send.
 *
 * Usage:
 * ```typescript
 * const fakeBroadcaster = new FakeSSEBroadcaster();
 * const notifier = new CentralEventNotifierService(fakeBroadcaster);
 *
 * notifier.emit('work-unit-state', 'unit_changed', { id: 'u-1' });
 *
 * expect(fakeBroadcaster.getBroadcasts()).toHaveLength(1);
 * expect(fakeBroadcaster.getLastBroadcast()?.eventType).toBe('unit_changed');
 * ```
 */

import type { ISSEBroadcaster } from '../interfaces/sse-broadcaster.interface.js';

/**
 * Recorded broadcast call for test inspection.
 */
export interface RecordedBroadcast {
  /** Channel the broadcast was sent to */
  channel: string;
  /** SSE event type */
  eventType: string;
  /** Data payload */
  data: unknown;
  /** Timestamp of broadcast */
  timestamp: Date;
}

/**
 * FakeSSEBroadcaster - test double that records all broadcast calls.
 *
 * Provides inspection methods for verifying broadcast behavior in tests.
 */
export class FakeSSEBroadcaster implements ISSEBroadcaster {
  private _broadcasts: RecordedBroadcast[] = [];

  /**
   * Record a broadcast (does not actually send SSE).
   */
  broadcast(channel: string, eventType: string, data: unknown): void {
    this._broadcasts.push({
      channel,
      eventType,
      data,
      timestamp: new Date(),
    });
  }

  // ===== Test Helpers =====

  /**
   * Get all recorded broadcasts.
   */
  getBroadcasts(): RecordedBroadcast[] {
    return [...this._broadcasts];
  }

  /**
   * Get the last recorded broadcast, or undefined if none.
   */
  getLastBroadcast(): RecordedBroadcast | undefined {
    return this._broadcasts[this._broadcasts.length - 1];
  }

  /**
   * Get broadcasts filtered by channel.
   */
  getBroadcastsByChannel(channel: string): RecordedBroadcast[] {
    return this._broadcasts.filter((b) => b.channel === channel);
  }

  /**
   * Get broadcasts filtered by event type.
   */
  getBroadcastsByEventType(eventType: string): RecordedBroadcast[] {
    return this._broadcasts.filter((b) => b.eventType === eventType);
  }

  /**
   * Reset all recorded state for test isolation.
   */
  reset(): void {
    this._broadcasts = [];
  }
}
