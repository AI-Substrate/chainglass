import type { NodeStateEntry } from '../../schemas/state.schema.js';
import type { EventStamp } from './event-stamp.schema.js';
import type { NodeEvent } from './node-event.schema.js';

/**
 * Structured context passed to every event handler.
 *
 * Handlers receive this instead of raw `(state, nodeId, event)` — no casting,
 * no plumbing, just business logic. Constructed by `handleEvents()`.
 *
 * `stamp()` writes to `event.stamps[subscriber]`. It does NOT write
 * `event.status`, `handled_at`, or `handler_notes` (DYK #4).
 */
export interface HandlerContext {
  /** The node state entry being acted on (mutable) */
  readonly node: NodeStateEntry;

  /** The event being processed (mutable) */
  readonly event: NodeEvent;

  /** All events for this node (read-only reference to the array) */
  readonly events: readonly NodeEvent[];

  /** The subscriber processing this event (e.g. 'cli', 'web') */
  readonly subscriber: string;

  /** The target node ID */
  readonly nodeId: string;

  /**
   * Stamp the current event for this subscriber.
   * Writes to `event.stamps[subscriber]`.
   */
  stamp(action: string, data?: Record<string, unknown>): void;

  /**
   * Stamp a different event for this subscriber.
   * Used for cross-event linking (e.g. answer → ask cross-stamp).
   */
  stampEvent(event: NodeEvent, action: string, data?: Record<string, unknown>): void;

  /**
   * Find events in this node's event log matching a predicate.
   */
  findEvents(predicate: (event: NodeEvent) => boolean): NodeEvent[];
}

/**
 * An event handler receives a HandlerContext and mutates state through it.
 * Handlers are registered in the EventHandlerRegistry with a context tag.
 */
export type EventHandler = (ctx: HandlerContext) => void;
