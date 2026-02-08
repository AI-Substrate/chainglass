import { describe, expect, it } from 'vitest';

import {
  EventHandlerRegistry,
  FakeNodeEventRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type {
  HandlerContext,
  NodeEvent,
} from '@chainglass/positional-graph/features/032-node-event-system';
import {
  NodeEventService,
  type NodeEventServiceDeps,
} from '@chainglass/positional-graph/features/032-node-event-system/node-event-service';

import type { State } from '@chainglass/positional-graph/schemas/state.schema';

/*
Test Doc:
- Why: NodeEventService is the first-class domain service (ADR-0011) — must correctly delegate raise(), process unstamped events with handleEvents(), query, and stamp
- Contract: raise() delegates to raiseEvent pipeline; handleEvents() processes unstamped events via HandlerContext; stamp() writes to event.stamps[subscriber]
- Usage Notes: Constructor takes two registries (INodeEventRegistry + EventHandlerRegistry); handleEvents() does NOT persist; stale-state trap documented
- Quality Contribution: Catches service wiring bugs, handler dispatch errors, stamp corruption, stale-state regression
- Worked Example: service.raise() → event created; service.handleEvents() → handlers invoked for unstamped events; service.stamp() → stamp on event
*/

// ── Helpers ───────────────────────────────────────────────

function createFakeStateStore(initial: Record<string, State> = {}): {
  store: Record<string, State>;
  getState: (slug: string) => State | undefined;
  deps: Pick<NodeEventServiceDeps, 'loadState' | 'persistState'>;
} {
  const store: Record<string, State> = {};
  for (const [key, value] of Object.entries(initial)) {
    store[key] = structuredClone(value);
  }

  return {
    store,
    getState: (slug: string) => (store[slug] ? structuredClone(store[slug]) : undefined),
    deps: {
      loadState: async (slug: string) => structuredClone(store[slug]),
      persistState: async (slug: string, state: State) => {
        store[slug] = structuredClone(state);
      },
    },
  };
}

function makeState(nodeId: string, status: string, events: NodeEvent[] = []): State {
  return {
    graph_slug: 'test-graph',
    version: '1.0.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nodes: {
      [nodeId]: {
        status: status as 'starting',
        events: events.length > 0 ? events : undefined,
      },
    },
  };
}

function makeEvent(eventType: string, overrides: Partial<NodeEvent> = {}): NodeEvent {
  return {
    event_id: `evt_test_${Math.random().toString(16).slice(2, 6)}`,
    event_type: eventType,
    source: 'agent',
    payload: {},
    status: 'new',
    stops_execution: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createService(
  stateStore: ReturnType<typeof createFakeStateStore>,
  handlerRegistry?: EventHandlerRegistry
): NodeEventService {
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);

  return new NodeEventService(
    { registry: eventRegistry, ...stateStore.deps },
    handlerRegistry ?? new EventHandlerRegistry()
  );
}

// ── Tests ─────────────────────────────────────────────────

describe('NodeEventService', () => {
  describe('raise()', () => {
    it('delegates to raiseEvent and returns result', async () => {
      const stateStore = createFakeStateStore({
        'my-graph': makeState('node-1', 'starting'),
      });
      const service = createService(stateStore);

      const result = await service.raise('my-graph', 'node-1', 'node:accepted', {}, 'agent');

      expect(result.ok).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.event_type).toBe('node:accepted');
      expect(result.errors).toEqual([]);
    });

    it('returns validation errors from raiseEvent pipeline', async () => {
      const stateStore = createFakeStateStore({
        'my-graph': makeState('node-1', 'pending'),
      });
      const service = createService(stateStore);

      const result = await service.raise('my-graph', 'node-1', 'node:accepted', {}, 'agent');

      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe('E193');
    });

    it('persists event to state', async () => {
      const stateStore = createFakeStateStore({
        'my-graph': makeState('node-1', 'starting'),
      });
      const service = createService(stateStore);

      await service.raise('my-graph', 'node-1', 'node:accepted', {}, 'agent');

      const state = stateStore.store['my-graph'];
      expect(state.nodes?.['node-1'].events).toHaveLength(1);
    });
  });

  describe('handleEvents()', () => {
    it('invokes handlers for unstamped events', () => {
      const calls: string[] = [];
      const registry = new EventHandlerRegistry();
      registry.on(
        'node:accepted',
        (ctx: HandlerContext) => {
          calls.push(`handled:${ctx.event.event_id}`);
          ctx.stamp('state-transition');
        },
        { context: 'both', name: 'test-handler' }
      );

      const event = makeEvent('node:accepted', { event_id: 'evt_1' });
      const state = makeState('node-1', 'starting', [event]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      service.handleEvents(state, 'node-1', 'cli', 'cli');

      expect(calls).toEqual(['handled:evt_1']);
      expect(event.stamps?.cli).toBeDefined();
      expect(event.stamps?.cli.action).toBe('state-transition');
    });

    it('skips already-stamped events', () => {
      const calls: string[] = [];
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', () => calls.push('should-not-run'), {
        context: 'both',
        name: 'test-handler',
      });

      const event = makeEvent('node:accepted', {
        stamps: { cli: { stamped_at: new Date().toISOString(), action: 'state-transition' } },
      });
      const state = makeState('node-1', 'agent-accepted', [event]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      service.handleEvents(state, 'node-1', 'cli', 'cli');

      expect(calls).toEqual([]);
    });

    it('is a no-op for empty events array', () => {
      const calls: string[] = [];
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', () => calls.push('should-not-run'), {
        context: 'both',
        name: 'test-handler',
      });

      const state = makeState('node-1', 'starting');
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      service.handleEvents(state, 'node-1', 'cli', 'cli');

      expect(calls).toEqual([]);
    });

    it('is a no-op for missing node', () => {
      const registry = new EventHandlerRegistry();
      const state: State = {
        graph_slug: 'g',
        version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      // Should not throw
      service.handleEvents(state, 'nonexistent', 'cli', 'cli');
    });

    it('filters handlers by context', () => {
      const calls: string[] = [];
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', () => calls.push('both'), {
        context: 'both',
        name: 'both-handler',
      });
      registry.on('node:accepted', () => calls.push('web-only'), {
        context: 'web',
        name: 'web-handler',
      });

      const event = makeEvent('node:accepted');
      const state = makeState('node-1', 'starting', [event]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      service.handleEvents(state, 'node-1', 'cli', 'cli');

      expect(calls).toEqual(['both']); // web-only filtered out
    });

    it('provides HandlerContext with correct fields', () => {
      let capturedCtx: HandlerContext | undefined;
      const registry = new EventHandlerRegistry();
      registry.on(
        'node:accepted',
        (ctx: HandlerContext) => {
          capturedCtx = ctx;
          ctx.stamp('test');
        },
        { context: 'both', name: 'capture' }
      );

      const event = makeEvent('node:accepted');
      const state = makeState('node-1', 'starting', [event]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      service.handleEvents(state, 'node-1', 'my-subscriber', 'cli');

      expect(capturedCtx).toBeDefined();
      expect(capturedCtx?.nodeId).toBe('node-1');
      expect(capturedCtx?.subscriber).toBe('my-subscriber');
      expect(capturedCtx?.event).toBe(event);
      expect(capturedCtx?.node).toBe(state.nodes?.['node-1']);
      expect(capturedCtx?.events).toHaveLength(1);
    });

    it('ctx.stampEvent() stamps a different event', () => {
      const registry = new EventHandlerRegistry();
      registry.on(
        'question:answer',
        (ctx: HandlerContext) => {
          const askEvent = ctx.findEvents((e) => e.event_type === 'question:ask')[0];
          if (askEvent) {
            ctx.stampEvent(askEvent, 'answer-linked');
          }
          ctx.stamp('state-transition');
        },
        { context: 'both', name: 'answer-handler' }
      );

      const askEvent = makeEvent('question:ask', { event_id: 'evt_ask_1' });
      const answerEvent = makeEvent('question:answer', { event_id: 'evt_answer_1' });
      const state = makeState('node-1', 'waiting-question', [askEvent, answerEvent]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      service.handleEvents(state, 'node-1', 'cli', 'cli');

      expect(askEvent.stamps?.cli).toBeDefined();
      expect(askEvent.stamps?.cli.action).toBe('answer-linked');
      expect(answerEvent.stamps?.cli).toBeDefined();
      expect(answerEvent.stamps?.cli.action).toBe('state-transition');
    });

    it('ctx.findEvents() returns matching events', () => {
      let foundEvents: NodeEvent[] = [];
      const registry = new EventHandlerRegistry();
      registry.on(
        'question:answer',
        (ctx: HandlerContext) => {
          foundEvents = ctx.findEvents((e) => e.event_type === 'question:ask');
          ctx.stamp('test');
        },
        { context: 'both', name: 'find-test' }
      );

      const askEvent = makeEvent('question:ask');
      const answerEvent = makeEvent('question:answer');
      const state = makeState('node-1', 'waiting-question', [askEvent, answerEvent]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      service.handleEvents(state, 'node-1', 'cli', 'cli');

      expect(foundEvents).toHaveLength(1);
      expect(foundEvents[0].event_type).toBe('question:ask');
    });

    it('processes multiple unstamped events in order', () => {
      const calls: string[] = [];
      const registry = new EventHandlerRegistry();
      registry.on(
        'node:accepted',
        (ctx: HandlerContext) => {
          calls.push(`accepted:${ctx.event.event_id}`);
          ctx.stamp('state-transition');
        },
        { context: 'both', name: 'accepted' }
      );
      registry.on(
        'node:completed',
        (ctx: HandlerContext) => {
          calls.push(`completed:${ctx.event.event_id}`);
          ctx.stamp('state-transition');
        },
        { context: 'both', name: 'completed' }
      );

      const e1 = makeEvent('node:accepted', { event_id: 'evt_1' });
      const e2 = makeEvent('node:completed', { event_id: 'evt_2' });
      const state = makeState('node-1', 'starting', [e1, e2]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore, registry);

      service.handleEvents(state, 'node-1', 'cli', 'cli');

      expect(calls).toEqual(['accepted:evt_1', 'completed:evt_2']);
    });
  });

  describe('query methods', () => {
    it('getEventsForNode returns events for existing node', () => {
      const event = makeEvent('node:accepted');
      const state = makeState('node-1', 'agent-accepted', [event]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore);

      const events = service.getEventsForNode(state, 'node-1');
      expect(events).toHaveLength(1);
    });

    it('getEventsForNode returns empty for missing node', () => {
      const state = makeState('node-1', 'starting');
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore);

      expect(service.getEventsForNode(state, 'nonexistent')).toEqual([]);
    });

    it('findEvents filters by predicate', () => {
      const e1 = makeEvent('node:accepted');
      const e2 = makeEvent('node:completed');
      const state = makeState('node-1', 'complete', [e1, e2]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore);

      const found = service.findEvents(state, 'node-1', (e) => e.event_type === 'node:completed');
      expect(found).toHaveLength(1);
    });

    it('getUnstampedEvents returns events without subscriber stamp', () => {
      const stamped = makeEvent('node:accepted', {
        stamps: { cli: { stamped_at: new Date().toISOString(), action: 'state-transition' } },
      });
      const unstamped = makeEvent('node:completed');
      const state = makeState('node-1', 'complete', [stamped, unstamped]);
      const stateStore = createFakeStateStore({ g: state });
      const service = createService(stateStore);

      const result = service.getUnstampedEvents(state, 'node-1', 'cli');
      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('node:completed');
    });
  });

  describe('stamp()', () => {
    it('writes stamp to event', () => {
      const stateStore = createFakeStateStore({});
      const service = createService(stateStore);
      const event = makeEvent('node:accepted');

      const stamp = service.stamp(event, 'cli', 'state-transition');

      expect(event.stamps).toBeDefined();
      expect(event.stamps?.cli).toBe(stamp);
      expect(stamp.action).toBe('state-transition');
      expect(stamp.stamped_at).toBeDefined();
    });

    it('writes stamp with optional data', () => {
      const stateStore = createFakeStateStore({});
      const service = createService(stateStore);
      const event = makeEvent('question:answer');

      const stamp = service.stamp(event, 'cli', 'answer-linked', { target: 'evt_ask_1' });

      expect(stamp.data).toEqual({ target: 'evt_ask_1' });
    });

    it('overwrites existing stamp for same subscriber', () => {
      const stateStore = createFakeStateStore({});
      const service = createService(stateStore);
      const event = makeEvent('node:accepted', {
        stamps: { cli: { stamped_at: '2026-01-01T00:00:00.000Z', action: 'old' } },
      });

      service.stamp(event, 'cli', 'new-action');

      expect(event.stamps?.cli.action).toBe('new-action');
    });

    it('preserves stamps from other subscribers', () => {
      const stateStore = createFakeStateStore({});
      const service = createService(stateStore);
      const event = makeEvent('node:accepted', {
        stamps: { web: { stamped_at: '2026-01-01T00:00:00.000Z', action: 'web-transition' } },
      });

      service.stamp(event, 'cli', 'cli-transition');

      expect(event.stamps?.web.action).toBe('web-transition');
      expect(event.stamps?.cli.action).toBe('cli-transition');
    });
  });
});
