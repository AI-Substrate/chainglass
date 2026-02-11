import type { State } from '../../schemas/state.schema.js';
import type { EventHandlerRegistry } from './event-handler-registry.js';
import type { EventSource } from './event-source.schema.js';
import type { EventStamp } from './event-stamp.schema.js';
import type { HandlerContext } from './handler-context.interface.js';
import type { INodeEventRegistry } from './node-event-registry.interface.js';
import type { INodeEventService, RaiseResult } from './node-event-service.interface.js';
import type { NodeEvent } from './node-event.schema.js';
import { raiseEvent } from './raise-event.js';

// ── Dependencies ────────────────────────────────────────

/**
 * Dependencies for NodeEventService construction.
 *
 * `registry` is the INodeEventRegistry (Phase 1) for event type validation.
 * `loadState` and `persistState` are the state I/O functions.
 */
export interface NodeEventServiceDeps {
  readonly registry: INodeEventRegistry;
  readonly loadState: (graphSlug: string) => Promise<State>;
  readonly persistState: (graphSlug: string, state: State) => Promise<void>;
}

// ── Implementation ──────────────────────────────────────

/**
 * First-class domain service for node event operations (ADR-0011).
 *
 * - `raise()` delegates to the proven raiseEvent() pipeline (record-only after T007)
 * - `handleEvents()` scans unstamped events, filters handlers by context, runs handlers with HandlerContext
 * - Query methods read from state
 * - `stamp()` writes to event.stamps[subscriber]
 *
 * Constructor takes two registries with distinct concerns (DYK5 #5):
 * - `deps.registry` (INodeEventRegistry) — event type validation, used by raise()
 * - `handlerRegistry` (EventHandlerRegistry) — handler dispatch, used by handleEvents()
 */
export class NodeEventService implements INodeEventService {
  private readonly deps: NodeEventServiceDeps;
  private readonly handlerRegistry: EventHandlerRegistry;

  constructor(deps: NodeEventServiceDeps, handlerRegistry: EventHandlerRegistry) {
    this.deps = deps;
    this.handlerRegistry = handlerRegistry;
  }

  async raise(
    graphSlug: string,
    nodeId: string,
    eventType: string,
    payload: unknown,
    source: EventSource
  ): Promise<RaiseResult> {
    return raiseEvent(this.deps, graphSlug, nodeId, eventType, payload, source);
  }

  /**
   * Process unstamped events for a node.
   *
   * Scans events for the node, filters to those not yet stamped by `subscriber`,
   * resolves handlers from the EventHandlerRegistry filtered by `context`,
   * constructs HandlerContext for each event, runs handlers, and stamps.
   *
   * **WARNING**: State must be loaded AFTER `raise()` returns to avoid stale-state
   * bugs. `raise()` persists internally, so state loaded before raise is stale.
   *
   * The caller is responsible for persisting state after this method returns.
   */
  handleEvents(state: State, nodeId: string, subscriber: string, context: 'cli' | 'web'): void {
    const nodeEntry = state.nodes?.[nodeId];
    if (!nodeEntry) return;

    const events = nodeEntry.events ?? [];
    const unstamped = events.filter((e) => !e.stamps?.[subscriber]);
    if (unstamped.length === 0) return;

    for (const event of unstamped) {
      const registrations = this.handlerRegistry.getHandlers(event.event_type, context);
      if (registrations.length === 0) continue;

      const ctx = this.buildHandlerContext(state, nodeId, event, events, subscriber);

      for (const reg of registrations) {
        reg.handler(ctx);
      }
    }
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
    return stamp;
  }

  // ── Private ─────────────────────────────────────────────

  private buildHandlerContext(
    state: State,
    nodeId: string,
    event: NodeEvent,
    events: NodeEvent[],
    subscriber: string
  ): HandlerContext {
    // Node existence validated by handleEvents before this call
    const nodeEntry = (state.nodes as NonNullable<State['nodes']>)[nodeId];
    const service = this;

    return {
      node: nodeEntry,
      event,
      events,
      subscriber,
      nodeId,

      stamp(action: string, data?: Record<string, unknown>): void {
        service.stamp(event, subscriber, action, data);
      },

      stampEvent(targetEvent: NodeEvent, action: string, data?: Record<string, unknown>): void {
        service.stamp(targetEvent, subscriber, action, data);
      },

      findEvents(predicate: (e: NodeEvent) => boolean): NodeEvent[] {
        return events.filter(predicate);
      },
    };
  }
}
