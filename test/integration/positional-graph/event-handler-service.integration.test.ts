/*
Test Doc:
- Why: Integration test verifies real EHS + real NES + real handlers process a multi-node graph correctly — state mutations applied, counts accurate, idempotent on second call
- Contract: processGraph() with real handlers triggers status transitions; second call returns eventsProcessed: 0; node iteration order is insertion order (Critical Insight #5)
- Usage Notes: Constructs real NodeEventService with real EventHandlerRegistry (createEventHandlerRegistry), builds state with multiple nodes and different event types
- Quality Contribution: Catches wiring bugs between EHS → NES → handlers → state; proves the Settle phase works end-to-end
- Worked Example: 2 nodes (starting with node:accepted, agent-accepted with progress:update) → processGraph() → node-1 status=agent-accepted, node-2 progress stamped; second call → 0 events
*/

import { beforeEach, describe, expect, it } from 'vitest';

import {
  FakeNodeEventRegistry,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type { NodeEvent } from '@chainglass/positional-graph/features/032-node-event-system';
import { EventHandlerService } from '@chainglass/positional-graph/features/032-node-event-system/event-handler-service';
import {
  NodeEventService,
  type NodeEventServiceDeps,
} from '@chainglass/positional-graph/features/032-node-event-system/node-event-service';
import type { State } from '@chainglass/positional-graph/schemas/state.schema';

// ── Helpers ───────────────────────────────────────────────

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

// ── Integration Tests ─────────────────────────────────────

describe('EventHandlerService — Integration', () => {
  let eventRegistry: FakeNodeEventRegistry;
  let stateStore: ReturnType<typeof createFakeStateStore>;
  let nes: NodeEventService;
  let ehs: EventHandlerService;

  beforeEach(() => {
    eventRegistry = new FakeNodeEventRegistry();
    registerCoreEventTypes(eventRegistry);

    stateStore = createFakeStateStore();

    // Real handler registry with all 6 core handlers
    const handlerRegistry = createEventHandlerRegistry();

    nes = new NodeEventService({ registry: eventRegistry, ...stateStore.deps }, handlerRegistry);

    ehs = new EventHandlerService(nes);
  });

  it('should process multi-node graph with mixed event types', () => {
    const state: State = {
      graph_slug: 'integration-test',
      version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      nodes: {
        'node-1': {
          status: 'starting' as const,
          events: [makeEvent('node:accepted')],
        },
        'node-2': {
          status: 'agent-accepted' as const,
          events: [makeEvent('progress:update')],
        },
        'node-3': {
          status: 'complete' as const,
          // No events
        },
      },
    };

    const result = ehs.processGraph(state, 'orchestrator', 'cli');

    // Counts
    expect(result.nodesVisited).toBe(3);
    expect(result.eventsProcessed).toBe(2);
    expect(result.handlerInvocations).toBe(2);

    // State mutations from real handlers
    const nodes = state.nodes ?? {};
    expect(nodes['node-1'].status).toBe('agent-accepted'); // node:accepted handler
    expect(nodes['node-2'].status).toBe('agent-accepted'); // progress:update doesn't change status

    // Events should be stamped
    const node1Events = nodes['node-1'].events ?? [];
    expect(node1Events[0].stamps?.orchestrator).toBeDefined();
    expect(node1Events[0].stamps?.orchestrator.action).toBe('state-transition');

    const node2Events = nodes['node-2'].events ?? [];
    expect(node2Events[0].stamps?.orchestrator).toBeDefined();
  });

  it('should be idempotent — second call returns eventsProcessed: 0', () => {
    const state: State = {
      graph_slug: 'idempotency-test',
      version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      nodes: {
        'node-1': {
          status: 'starting' as const,
          events: [makeEvent('node:accepted')],
        },
        'node-2': {
          status: 'agent-accepted' as const,
          events: [makeEvent('progress:update')],
        },
      },
    };

    // First call processes events
    const result1 = ehs.processGraph(state, 'orchestrator', 'cli');
    expect(result1.eventsProcessed).toBe(2);

    // Second call — all events now stamped
    const result2 = ehs.processGraph(state, 'orchestrator', 'cli');
    expect(result2.nodesVisited).toBe(2);
    expect(result2.eventsProcessed).toBe(0);
    expect(result2.handlerInvocations).toBe(0);
  });

  it('should process nodes in insertion order (Critical Insight #5)', () => {
    const processedNodeIds: string[] = [];

    // Create a custom handler that records node order
    const orderTrackingRegistry = createEventHandlerRegistry();
    orderTrackingRegistry.on(
      'node:accepted',
      (ctx) => {
        processedNodeIds.push(ctx.nodeId);
        ctx.stamp('order-tracked');
      },
      { context: 'both', name: 'order-tracker' }
    );

    const orderNes = new NodeEventService(
      { registry: eventRegistry, ...stateStore.deps },
      orderTrackingRegistry
    );
    const orderEhs = new EventHandlerService(orderNes);

    // Insert nodes in specific order
    const state: State = {
      graph_slug: 'order-test',
      version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      nodes: {
        alpha: { status: 'starting' as const, events: [makeEvent('node:accepted')] },
        beta: { status: 'starting' as const, events: [makeEvent('node:accepted')] },
        gamma: { status: 'starting' as const, events: [makeEvent('node:accepted')] },
      },
    };

    orderEhs.processGraph(state, 'orchestrator', 'cli');

    // V8 guarantees insertion order for string keys
    expect(processedNodeIds).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('should handle nodes with empty events arrays', () => {
    const state: State = {
      graph_slug: 'empty-events',
      version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      nodes: {
        'node-1': {
          status: 'starting' as const,
          events: [],
        },
      },
    };

    const result = ehs.processGraph(state, 'orchestrator', 'cli');

    expect(result.nodesVisited).toBe(1);
    expect(result.eventsProcessed).toBe(0);
  });

  it('should handle state with completed node:completed handler', () => {
    const state: State = {
      graph_slug: 'completion-test',
      version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      nodes: {
        'node-1': {
          status: 'agent-accepted' as const,
          events: [makeEvent('node:completed')],
        },
      },
    };

    const result = ehs.processGraph(state, 'orchestrator', 'cli');

    expect(result.eventsProcessed).toBe(1);
    // Real handler should transition to 'complete'
    const completionNodes = state.nodes ?? {};
    expect(completionNodes['node-1'].status).toBe('complete');
    expect(completionNodes['node-1'].completed_at).toBeDefined();
  });
});
