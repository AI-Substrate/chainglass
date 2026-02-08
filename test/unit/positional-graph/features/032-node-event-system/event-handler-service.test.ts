/*
Test Doc:
- Why: EventHandlerService is the graph-wide event processor (Settle phase) — must correctly iterate nodes, count unstamped events, delegate to INodeEventService, and return accurate ProcessGraphResult
- Contract: processGraph() visits all nodes, counts unstamped events BEFORE handling (Critical Insight #1), delegates per-node handling to INodeEventService, returns correct counts; idempotent via stamps
- Usage Notes: Tests use FakeNodeEventService (handleEvents is no-op — no stamping). Tests verify orchestration logic only; dispatch and integration tested separately in T006/T007
- Quality Contribution: Catches iteration bugs, off-by-one counting, missed nodes, incorrect delegation to NES
- Worked Example: 2-node state with 1 unstamped event each → processGraph() → { nodesVisited: 2, eventsProcessed: 2, handlerInvocations: 2 }
*/

import { beforeEach, describe, expect, it } from 'vitest';

import { FakeNodeEventService } from '@chainglass/positional-graph/features/032-node-event-system';
import type { NodeEvent } from '@chainglass/positional-graph/features/032-node-event-system';
import type { State } from '@chainglass/positional-graph/schemas/state.schema';

// Import will fail until T004 — these tests are RED
import { EventHandlerService } from '@chainglass/positional-graph/features/032-node-event-system/event-handler-service';

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

// ── Tests ─────────────────────────────────────────────────

describe('EventHandlerService — Orchestration Logic', () => {
  let fakeNes: FakeNodeEventService;
  let ehs: EventHandlerService;

  beforeEach(() => {
    fakeNes = new FakeNodeEventService();
    ehs = new EventHandlerService(fakeNes);
  });

  describe('empty graph', () => {
    it('should return all-zero counts for a graph with no nodes', () => {
      const state: State = {
        graph_slug: 'empty',
        version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result).toEqual({
        nodesVisited: 0,
        eventsProcessed: 0,
        handlerInvocations: 0,
      });
    });

    it('should return all-zero counts for a graph with empty nodes object', () => {
      const state: State = {
        graph_slug: 'empty-nodes',
        version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        nodes: {},
      };

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result).toEqual({
        nodesVisited: 0,
        eventsProcessed: 0,
        handlerInvocations: 0,
      });
    });
  });

  describe('single node', () => {
    it('should count unstamped events and call handleEvents', () => {
      const evt1 = makeEvent('node:accepted');
      const evt2 = makeEvent('progress:update');
      const state = makeState({
        'node-1': { status: 'starting', events: [evt1, evt2] },
      });

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result.nodesVisited).toBe(1);
      expect(result.eventsProcessed).toBe(2);
      expect(result.handlerInvocations).toBe(2);

      // Verify handleEvents was called with correct args
      const history = fakeNes.getHandleEventsHistory();
      expect(history).toHaveLength(1);
      expect(history[0].nodeId).toBe('node-1');
      expect(history[0].subscriber).toBe('orchestrator');
      expect(history[0].context).toBe('cli');
    });

    it('should skip nodes with no events', () => {
      const state = makeState({
        'node-1': { status: 'starting' },
      });

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result.nodesVisited).toBe(1);
      expect(result.eventsProcessed).toBe(0);
      expect(result.handlerInvocations).toBe(0);

      // handleEvents should NOT be called when there are 0 unstamped events
      expect(fakeNes.getHandleEventsHistory()).toHaveLength(0);
    });

    it('should skip already-stamped events', () => {
      const stampedEvent = makeEvent('node:accepted', {
        stamps: {
          orchestrator: {
            stamped_at: new Date().toISOString(),
            action: 'state-transition',
          },
        },
      });
      const unstampedEvent = makeEvent('progress:update');
      const state = makeState({
        'node-1': { status: 'agent-accepted', events: [stampedEvent, unstampedEvent] },
      });

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result.nodesVisited).toBe(1);
      expect(result.eventsProcessed).toBe(1); // Only the unstamped one
      expect(result.handlerInvocations).toBe(1);
    });
  });

  describe('multiple nodes', () => {
    it('should process events across all nodes', () => {
      const state = makeState({
        'node-1': { status: 'starting', events: [makeEvent('node:accepted')] },
        'node-2': {
          status: 'starting',
          events: [makeEvent('node:accepted'), makeEvent('progress:update')],
        },
        'node-3': { status: 'complete' }, // No events
      });

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result.nodesVisited).toBe(3);
      expect(result.eventsProcessed).toBe(3); // 1 + 2 + 0
      expect(result.handlerInvocations).toBe(3);

      // handleEvents called for node-1 and node-2 only
      const history = fakeNes.getHandleEventsHistory();
      expect(history).toHaveLength(2);
      expect(history.map((h) => h.nodeId).sort()).toEqual(['node-1', 'node-2']);
    });

    it('should count correctly when some nodes have all events stamped', () => {
      const stampedEvent = makeEvent('node:accepted', {
        stamps: {
          orchestrator: {
            stamped_at: new Date().toISOString(),
            action: 'state-transition',
          },
        },
      });
      const state = makeState({
        'node-1': { status: 'agent-accepted', events: [stampedEvent] },
        'node-2': { status: 'starting', events: [makeEvent('node:accepted')] },
      });

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result.nodesVisited).toBe(2);
      expect(result.eventsProcessed).toBe(1); // Only node-2's event
      expect(result.handlerInvocations).toBe(1);

      // handleEvents called only for node-2
      const history = fakeNes.getHandleEventsHistory();
      expect(history).toHaveLength(1);
      expect(history[0].nodeId).toBe('node-2');
    });
  });

  describe('subscriber isolation', () => {
    it('should only count events unstamped for the given subscriber', () => {
      const eventStampedByOther = makeEvent('node:accepted', {
        stamps: {
          'other-subscriber': {
            stamped_at: new Date().toISOString(),
            action: 'processed',
          },
        },
      });
      const state = makeState({
        'node-1': { status: 'starting', events: [eventStampedByOther] },
      });

      // Event IS unstamped for 'orchestrator' (only stamped by 'other-subscriber')
      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      expect(result.eventsProcessed).toBe(1);
    });
  });

  describe('context passthrough', () => {
    it('should pass context to handleEvents', () => {
      const state = makeState({
        'node-1': { status: 'starting', events: [makeEvent('node:accepted')] },
      });

      ehs.processGraph(state, 'orchestrator', 'web');

      const history = fakeNes.getHandleEventsHistory();
      expect(history[0].context).toBe('web');
    });
  });

  describe('count-before-stamp ordering (Critical Insight #1)', () => {
    it('should count unstamped events before calling handleEvents', () => {
      // This test verifies the ORDERING constraint:
      // getUnstampedEvents() must be called BEFORE handleEvents()
      // because handleEvents stamps inside the loop.
      // With FakeNES (no-op handleEvents), the count is always correct,
      // but this test documents the intent.
      const evt = makeEvent('node:accepted');
      const state = makeState({
        'node-1': { status: 'starting', events: [evt] },
      });

      const result = ehs.processGraph(state, 'orchestrator', 'cli');

      // Count must reflect events BEFORE handling
      expect(result.eventsProcessed).toBe(1);
    });
  });
});
