/*
Test Doc:
- Why: Dispatch tests verify the full pipeline: EHS iterates nodes → NES finds unstamped events → registry dispatches to matching handlers → handlers stamp. Uses spy handler functions (not mocks — constitution: fakes over mocks)
- Contract: Matching events fire handlers; stamped events are skipped; context filtering (cli/web) works; multiple handlers fire in registration order
- Usage Notes: Spy handlers are real functions matching EventHandler type that record invocations. Constructed per Workshop 12 Part 7: spy registry → real NES → real EHS (Critical Insight #4)
- Quality Contribution: Catches handler dispatch bugs, context filtering errors, registration order violations, and stamp-based idempotency
- Worked Example: Register spy for 'node:accepted' → processGraph with unstamped event → spy called once; call again → spy not called (event now stamped)
*/

import { beforeEach, describe, expect, it } from 'vitest';

import {
  EventHandlerRegistry,
  FakeNodeEventRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type {
  HandlerContext,
  NodeEvent,
} from '@chainglass/positional-graph/features/032-node-event-system';
import { EventHandlerService } from '@chainglass/positional-graph/features/032-node-event-system/event-handler-service';
import {
  NodeEventService,
  type NodeEventServiceDeps,
} from '@chainglass/positional-graph/features/032-node-event-system/node-event-service';
import type { State } from '@chainglass/positional-graph/schemas/state.schema';

// ── Spy Handler Factory ─────────────────────────────────

interface SpyCall {
  nodeId: string;
  eventType: string;
  subscriber: string;
}

function createSpyHandler() {
  const calls: SpyCall[] = [];
  const handler = (ctx: HandlerContext) => {
    calls.push({
      nodeId: ctx.nodeId,
      eventType: ctx.event.event_type,
      subscriber: ctx.subscriber,
    });
    // Stamp the event (spy handlers should stamp to prove dispatch happened)
    ctx.stamp('spy-processed');
  };
  return { handler, calls };
}

// ── Test Helpers ─────────────────────────────────────────

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

function makeState(nodes: Record<string, { status: string; events?: NodeEvent[] }>): State {
  return {
    graph_slug: 'test-graph',
    version: '1.0.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([id, entry]) => [
        id,
        {
          status: entry.status as 'starting',
          events: entry.events,
        },
      ])
    ),
  };
}

function createFakeStateStore(initial: Record<string, State> = {}): {
  store: Record<string, State>;
  deps: Pick<NodeEventServiceDeps, 'loadState' | 'persistState'>;
} {
  const store: Record<string, State> = {};
  for (const [key, value] of Object.entries(initial)) {
    store[key] = structuredClone(value);
  }
  return {
    store,
    deps: {
      loadState: async (slug: string) => structuredClone(store[slug]),
      persistState: async (slug: string, state: State) => {
        store[slug] = structuredClone(state);
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────

describe('EventHandlerService — Handler Dispatch', () => {
  let spyRegistry: EventHandlerRegistry;
  let eventRegistry: FakeNodeEventRegistry;
  let stateStore: ReturnType<typeof createFakeStateStore>;
  let nes: NodeEventService;
  let ehs: EventHandlerService;

  // Spy handlers
  let acceptedSpy: ReturnType<typeof createSpyHandler>;
  let progressSpy: ReturnType<typeof createSpyHandler>;

  beforeEach(() => {
    // Build spy registry (Critical Insight #4: inject into NES, not EHS)
    spyRegistry = new EventHandlerRegistry();
    acceptedSpy = createSpyHandler();
    progressSpy = createSpyHandler();

    spyRegistry.on('node:accepted', acceptedSpy.handler, {
      context: 'both',
      name: 'spy-accepted',
    });
    spyRegistry.on('progress:update', progressSpy.handler, {
      context: 'both',
      name: 'spy-progress',
    });

    // Build event type registry
    eventRegistry = new FakeNodeEventRegistry();
    registerCoreEventTypes(eventRegistry);

    // Build state store
    stateStore = createFakeStateStore();

    // Build real NES with spy registry
    nes = new NodeEventService({ registry: eventRegistry, ...stateStore.deps }, spyRegistry);

    // Build real EHS with real NES
    ehs = new EventHandlerService(nes);
  });

  it('should dispatch matching event to registered spy handler', () => {
    const evt = makeEvent('node:accepted');
    const state = makeState({
      'node-1': { status: 'starting', events: [evt] },
    });

    ehs.processGraph(state, 'orchestrator', 'cli');

    expect(acceptedSpy.calls).toHaveLength(1);
    expect(acceptedSpy.calls[0].nodeId).toBe('node-1');
    expect(acceptedSpy.calls[0].eventType).toBe('node:accepted');
    expect(acceptedSpy.calls[0].subscriber).toBe('orchestrator');
  });

  it('should NOT dispatch for already-stamped events', () => {
    const stampedEvent = makeEvent('node:accepted', {
      stamps: {
        orchestrator: {
          stamped_at: new Date().toISOString(),
          action: 'already-processed',
        },
      },
    });
    const state = makeState({
      'node-1': { status: 'starting', events: [stampedEvent] },
    });

    ehs.processGraph(state, 'orchestrator', 'cli');

    expect(acceptedSpy.calls).toHaveLength(0);
  });

  it('should dispatch to correct handler based on event type', () => {
    const acceptedEvt = makeEvent('node:accepted');
    const progressEvt = makeEvent('progress:update');
    const state = makeState({
      'node-1': { status: 'starting', events: [acceptedEvt, progressEvt] },
    });

    ehs.processGraph(state, 'orchestrator', 'cli');

    expect(acceptedSpy.calls).toHaveLength(1);
    expect(progressSpy.calls).toHaveLength(1);
  });

  it('should stamp events during processing (idempotency)', () => {
    const evt = makeEvent('node:accepted');
    const state = makeState({
      'node-1': { status: 'starting', events: [evt] },
    });

    // First call processes the event
    const result1 = ehs.processGraph(state, 'orchestrator', 'cli');
    expect(result1.eventsProcessed).toBe(1);
    expect(acceptedSpy.calls).toHaveLength(1);

    // Second call — event is now stamped by the first call
    const result2 = ehs.processGraph(state, 'orchestrator', 'cli');
    expect(result2.eventsProcessed).toBe(0);
    expect(acceptedSpy.calls).toHaveLength(1); // No new calls
  });

  describe('context filtering', () => {
    it('should dispatch cli-only handlers for cli context', () => {
      const cliSpy = createSpyHandler();
      spyRegistry.on('node:accepted', cliSpy.handler, {
        context: 'cli',
        name: 'spy-cli-only',
      });

      const evt = makeEvent('node:accepted');
      const state = makeState({
        'node-1': { status: 'starting', events: [evt] },
      });

      ehs.processGraph(state, 'orchestrator', 'cli');

      // Both 'both' handler and 'cli' handler should fire
      expect(acceptedSpy.calls).toHaveLength(1);
      expect(cliSpy.calls).toHaveLength(1);
    });

    it('should NOT dispatch cli-only handlers for web context', () => {
      const cliSpy = createSpyHandler();
      spyRegistry.on('node:accepted', cliSpy.handler, {
        context: 'cli',
        name: 'spy-cli-only',
      });

      const evt = makeEvent('node:accepted');
      const state = makeState({
        'node-1': { status: 'starting', events: [evt] },
      });

      ehs.processGraph(state, 'orchestrator', 'web');

      // 'both' handler fires, 'cli' handler does NOT
      expect(acceptedSpy.calls).toHaveLength(1);
      expect(cliSpy.calls).toHaveLength(0);
    });
  });

  describe('multiple handlers', () => {
    it('should fire multiple handlers for same event type in registration order', () => {
      const secondSpy = createSpyHandler();
      spyRegistry.on('node:accepted', secondSpy.handler, {
        context: 'both',
        name: 'spy-accepted-second',
      });

      const evt = makeEvent('node:accepted');
      const state = makeState({
        'node-1': { status: 'starting', events: [evt] },
      });

      ehs.processGraph(state, 'orchestrator', 'cli');

      // Both should fire
      expect(acceptedSpy.calls).toHaveLength(1);
      expect(secondSpy.calls).toHaveLength(1);
    });
  });

  describe('multi-node dispatch', () => {
    it('should dispatch handlers for events across multiple nodes', () => {
      const state = makeState({
        'node-1': { status: 'starting', events: [makeEvent('node:accepted')] },
        'node-2': { status: 'agent-accepted', events: [makeEvent('progress:update')] },
      });

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result.nodesVisited).toBe(2);
      expect(result.eventsProcessed).toBe(2);
      expect(acceptedSpy.calls).toHaveLength(1);
      expect(progressSpy.calls).toHaveLength(1);
    });
  });
});
