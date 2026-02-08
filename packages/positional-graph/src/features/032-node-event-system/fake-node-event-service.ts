import type { State } from '../../schemas/state.schema.js';
import type { EventSource } from './event-source.schema.js';
import type { EventStamp } from './event-stamp.schema.js';
import type { INodeEventService, RaiseResult } from './node-event-service.interface.js';
import type { NodeEvent } from './node-event.schema.js';

// ── History Entry Types ─────────────────────────────────

export interface RaiseHistoryEntry {
  graphSlug: string;
  nodeId: string;
  eventType: string;
  payload: unknown;
  source: EventSource;
}

export interface HandleEventsHistoryEntry {
  nodeId: string;
  subscriber: string;
  context: 'cli' | 'web';
}

export interface StampHistoryEntry {
  eventId: string;
  subscriber: string;
  action: string;
  data?: Record<string, unknown>;
}

// ── FakeNodeEventService ────────────────────────────────

/**
 * Test fake for INodeEventService.
 *
 * Records all calls for assertion. `raise()` creates minimal events
 * without validation (no registry needed). `handleEvents()` is a no-op
 * that records the call. Test helpers enable inspection.
 */
export class FakeNodeEventService implements INodeEventService {
  private events: NodeEvent[] = [];
  private raiseHistory: RaiseHistoryEntry[] = [];
  private handleEventsHistory: HandleEventsHistoryEntry[] = [];
  private stampHistory: StampHistoryEntry[] = [];
  private raiseErrors: Map<string, RaiseResult> = new Map();
  private eventIdCounter = 0;

  // ── INodeEventService implementation ──────────────────

  async raise(
    graphSlug: string,
    nodeId: string,
    eventType: string,
    payload: unknown,
    source: EventSource
  ): Promise<RaiseResult> {
    this.raiseHistory.push({ graphSlug, nodeId, eventType, payload, source });

    // Check for pre-configured error response
    const errorKey = `${graphSlug}:${nodeId}:${eventType}`;
    const configuredError = this.raiseErrors.get(errorKey);
    if (configuredError) {
      return configuredError;
    }

    // Create a minimal event
    this.eventIdCounter++;
    const event: NodeEvent = {
      event_id: `fake_evt_${this.eventIdCounter}`,
      event_type: eventType,
      source,
      payload: (payload ?? {}) as Record<string, unknown>,
      status: 'new',
      stops_execution: false,
      created_at: new Date().toISOString(),
    };
    this.events.push(event);

    return { ok: true, event, errors: [] };
  }

  handleEvents(_state: State, nodeId: string, subscriber: string, context: 'cli' | 'web'): void {
    this.handleEventsHistory.push({ nodeId, subscriber, context });
  }

  getEventsForNode(state: State, nodeId: string): readonly NodeEvent[] {
    return state.nodes?.[nodeId]?.events ?? [];
  }

  findEvents(state: State, nodeId: string, predicate: (event: NodeEvent) => boolean): NodeEvent[] {
    const events = state.nodes?.[nodeId]?.events ?? [];
    return events.filter(predicate);
  }

  getUnstampedEvents(state: State, nodeId: string, subscriber: string): NodeEvent[] {
    const events = state.nodes?.[nodeId]?.events ?? [];
    return events.filter((e) => !e.stamps?.[subscriber]);
  }

  stamp(
    event: NodeEvent,
    subscriber: string,
    action: string,
    data?: Record<string, unknown>
  ): EventStamp {
    const stamp: EventStamp = {
      stamped_at: new Date().toISOString(),
      action,
      ...(data ? { data } : {}),
    };
    if (!event.stamps) event.stamps = {};
    event.stamps[subscriber] = stamp;
    this.stampHistory.push({ eventId: event.event_id, subscriber, action, data });
    return stamp;
  }

  // ── Test helpers ──────────────────────────────────────

  /** Add an event directly (for test setup) */
  addEvent(event: NodeEvent): void {
    this.events.push(event);
  }

  /** Get all raise() calls */
  getRaiseHistory(): readonly RaiseHistoryEntry[] {
    return this.raiseHistory;
  }

  /** Get all handleEvents() calls */
  getHandleEventsHistory(): readonly HandleEventsHistoryEntry[] {
    return this.handleEventsHistory;
  }

  /** Get all stamp() calls */
  getStampHistory(): readonly StampHistoryEntry[] {
    return this.stampHistory;
  }

  /** Pre-configure a raise() error response */
  setRaiseError(graphSlug: string, nodeId: string, eventType: string, result: RaiseResult): void {
    this.raiseErrors.set(`${graphSlug}:${nodeId}:${eventType}`, result);
  }

  /** Reset all state and history */
  reset(): void {
    this.events = [];
    this.raiseHistory = [];
    this.handleEventsHistory = [];
    this.stampHistory = [];
    this.raiseErrors.clear();
    this.eventIdCounter = 0;
  }
}
