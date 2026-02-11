import type { ResultError } from '@chainglass/shared';

import type { State } from '../../schemas/state.schema.js';
import type { EventSource } from './event-source.schema.js';
import type { EventStamp } from './event-stamp.schema.js';
import type { NodeEvent } from './node-event.schema.js';

/** Context tag for filtering handlers: CLI handlers, web handlers, or both */
export type EventHandlerContextTag = 'cli' | 'web' | 'both';

/**
 * Result of a raise() call.
 */
export interface RaiseResult {
  readonly ok: boolean;
  readonly event?: NodeEvent;
  readonly errors: ResultError[];
}

/**
 * First-class domain service for node event operations (ADR-0011).
 *
 * Owns the complete event lifecycle:
 * - `raise()` — record-only: validate, create, append, persist
 * - `handleEvents()` — process unstamped events with subscriber stamps
 * - Query methods — read access to events
 * - `stamp()` — write a subscriber stamp to an event
 *
 * Service methods (`endNode`, `askQuestion`, `answerQuestion`) delegate to `raise()`.
 * The caller is responsible for calling `handleEvents()` and persisting afterward.
 */
export interface INodeEventService {
  /**
   * Record an event. Validates, creates, appends, and persists atomically.
   * Does NOT invoke handlers — call `handleEvents()` separately.
   */
  raise(
    graphSlug: string,
    nodeId: string,
    eventType: string,
    payload: unknown,
    source: EventSource
  ): Promise<RaiseResult>;

  /**
   * Process unstamped events for a node. Scans events, filters handlers by context
   * via EventHandlerRegistry, constructs HandlerContext, runs handlers, stamps.
   *
   * **WARNING**: State must be loaded AFTER `raise()` returns to avoid stale-state
   * bugs. `raise()` persists internally, so state loaded before raise is stale.
   *
   * The caller is responsible for persisting state after handleEvents returns.
   */
  handleEvents(state: State, nodeId: string, subscriber: string, context: 'cli' | 'web'): void;

  /** Get all events for a node */
  getEventsForNode(state: State, nodeId: string): readonly NodeEvent[];

  /** Find events matching a predicate */
  findEvents(state: State, nodeId: string, predicate: (event: NodeEvent) => boolean): NodeEvent[];

  /** Get events not yet stamped by the given subscriber */
  getUnstampedEvents(state: State, nodeId: string, subscriber: string): NodeEvent[];

  /** Write a subscriber stamp to an event. Caller persists. */
  stamp(
    event: NodeEvent,
    subscriber: string,
    action: string,
    data?: Record<string, unknown>
  ): EventStamp;
}
