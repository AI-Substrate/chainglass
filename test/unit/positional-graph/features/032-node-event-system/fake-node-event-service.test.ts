import { describe, expect, it } from 'vitest';

import type { NodeEvent } from '@chainglass/positional-graph/features/032-node-event-system';
import { FakeNodeEventService } from '@chainglass/positional-graph/features/032-node-event-system/fake-node-event-service';

import type { State } from '@chainglass/positional-graph/schemas/state.schema';

/*
Test Doc:
- Why: FakeNodeEventService is the test double for INodeEventService — must record calls and support test setup
- Contract: raise() records history + creates events; handleEvents() records calls; stamp() mutates event; helpers expose history
- Usage Notes: Use setRaiseError() to simulate failures; addEvent() for pre-populating; reset() between tests
- Quality Contribution: Ensures fakes behave correctly so downstream tests using them are reliable
- Worked Example: fake.raise('g','n','node:accepted',{},'agent') → ok:true, getRaiseHistory() has 1 entry
*/

function makeState(nodeId: string, events: NodeEvent[] = []): State {
  return {
    graph_slug: 'test-graph',
    version: '1.0.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nodes: {
      [nodeId]: {
        status: 'agent-accepted',
        events,
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

describe('FakeNodeEventService', () => {
  describe('raise()', () => {
    it('returns ok with created event', async () => {
      const fake = new FakeNodeEventService();
      const result = await fake.raise('my-graph', 'node-1', 'node:accepted', {}, 'agent');

      expect(result.ok).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.event_type).toBe('node:accepted');
      expect(result.event?.status).toBe('new');
      expect(result.errors).toEqual([]);
    });

    it('records raise history', async () => {
      const fake = new FakeNodeEventService();
      await fake.raise('g1', 'n1', 'node:accepted', {}, 'agent');
      await fake.raise('g2', 'n2', 'node:completed', { message: 'done' }, 'agent');

      const history = fake.getRaiseHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({
        graphSlug: 'g1',
        nodeId: 'n1',
        eventType: 'node:accepted',
        payload: {},
        source: 'agent',
      });
      expect(history[1].eventType).toBe('node:completed');
    });

    it('returns pre-configured error when set', async () => {
      const fake = new FakeNodeEventService();
      fake.setRaiseError('g', 'n', 'node:accepted', {
        ok: false,
        errors: [{ code: 'E193', message: 'test error', action: 'fix it' }],
      });

      const result = await fake.raise('g', 'n', 'node:accepted', {}, 'agent');
      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe('E193');
    });

    it('generates unique event IDs', async () => {
      const fake = new FakeNodeEventService();
      const r1 = await fake.raise('g', 'n', 'node:accepted', {}, 'agent');
      const r2 = await fake.raise('g', 'n', 'node:completed', {}, 'agent');
      expect(r1.event?.event_id).not.toBe(r2.event?.event_id);
    });
  });

  describe('handleEvents()', () => {
    it('records handle events history', () => {
      const fake = new FakeNodeEventService();
      const state = makeState('node-1');

      fake.handleEvents(state, 'node-1', 'cli', 'cli');

      const history = fake.getHandleEventsHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        nodeId: 'node-1',
        subscriber: 'cli',
        context: 'cli',
      });
    });
  });

  describe('query methods', () => {
    it('getEventsForNode returns events from state', () => {
      const fake = new FakeNodeEventService();
      const event = makeEvent('node:accepted');
      const state = makeState('node-1', [event]);

      const events = fake.getEventsForNode(state, 'node-1');
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('node:accepted');
    });

    it('getEventsForNode returns empty for missing node', () => {
      const fake = new FakeNodeEventService();
      const state = makeState('node-1');

      expect(fake.getEventsForNode(state, 'nonexistent')).toEqual([]);
    });

    it('findEvents filters by predicate', () => {
      const fake = new FakeNodeEventService();
      const events = [makeEvent('node:accepted'), makeEvent('node:completed')];
      const state = makeState('node-1', events);

      const found = fake.findEvents(state, 'node-1', (e) => e.event_type === 'node:completed');
      expect(found).toHaveLength(1);
      expect(found[0].event_type).toBe('node:completed');
    });

    it('getUnstampedEvents returns events without subscriber stamp', () => {
      const fake = new FakeNodeEventService();
      const stamped = makeEvent('node:accepted', {
        stamps: { cli: { stamped_at: new Date().toISOString(), action: 'state-transition' } },
      });
      const unstamped = makeEvent('node:completed');
      const state = makeState('node-1', [stamped, unstamped]);

      const result = fake.getUnstampedEvents(state, 'node-1', 'cli');
      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('node:completed');
    });
  });

  describe('stamp()', () => {
    it('writes stamp to event and records history', () => {
      const fake = new FakeNodeEventService();
      const event = makeEvent('node:accepted');

      const stamp = fake.stamp(event, 'cli', 'state-transition');

      expect(event.stamps).toBeDefined();
      expect(event.stamps?.cli).toBe(stamp);
      expect(stamp.action).toBe('state-transition');
      expect(stamp.stamped_at).toBeDefined();

      const history = fake.getStampHistory();
      expect(history).toHaveLength(1);
      expect(history[0].eventId).toBe(event.event_id);
      expect(history[0].subscriber).toBe('cli');
    });

    it('writes stamp with optional data', () => {
      const fake = new FakeNodeEventService();
      const event = makeEvent('question:answer');

      fake.stamp(event, 'cli', 'answer-linked', { question_event_id: 'evt_ask_1' });

      expect(event.stamps?.cli.data).toEqual({ question_event_id: 'evt_ask_1' });
    });
  });

  describe('reset()', () => {
    it('clears all history and events', async () => {
      const fake = new FakeNodeEventService();
      await fake.raise('g', 'n', 'node:accepted', {}, 'agent');
      fake.handleEvents({} as State, 'n', 'cli', 'cli');
      fake.stamp(makeEvent('x'), 'cli', 'test');

      fake.reset();

      expect(fake.getRaiseHistory()).toEqual([]);
      expect(fake.getHandleEventsHistory()).toEqual([]);
      expect(fake.getStampHistory()).toEqual([]);
    });
  });
});
