/**
 * Plan 059 Subtask 001: ServerEventRoute — Unit Tests
 *
 * Tests for the SSE→GlobalStateSystem bridge logic:
 * - Route mapping: ServerEventRouteDescriptor.mapEvent → state publishes
 * - Source propagation: server-origin tagging on published entries
 * - Remove-instance behavior: StateUpdate.remove triggers removeInstance
 * - Burst processing: all queued messages processed, not just last
 * - Error isolation: one bad event doesn't abort remaining
 *
 * Per spec: Hybrid testing, no mocks, Fakes only.
 * Uses FakeGlobalStateSystem for state assertions.
 */

import type { StateChange, StateEntrySource } from '@chainglass/shared/state';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ServerEvent,
  ServerEventRouteDescriptor,
  StateUpdate,
} from '../../../../apps/web/src/lib/state/server-event-router';
import { FakeGlobalStateSystem } from '../../../../packages/shared/src/fakes/fake-state-system';

/**
 * We test the route mapping logic directly (not the React component)
 * since the component is a thin wrapper around useSSE + useEffect.
 * This exercises the core contract: mapEvent → publish with source.
 */

// -- Test Helpers --

function createTestRoute(
  overrides?: Partial<ServerEventRouteDescriptor>
): ServerEventRouteDescriptor {
  return {
    channel: 'test-channel' as ServerEventRouteDescriptor['channel'],
    stateDomain: 'test-domain',
    multiInstance: true,
    properties: [
      { key: 'status', description: 'Status', typeHint: 'string' },
      { key: 'intent', description: 'Intent', typeHint: 'string' },
      { key: 'has-question', description: 'Has question', typeHint: 'boolean' },
    ],
    mapEvent: (event: ServerEvent): StateUpdate[] | null => {
      if (event.type === 'status-changed') {
        return [
          { instanceId: event.unitId as string, property: 'status', value: event.status },
          { instanceId: event.unitId as string, property: 'intent', value: event.intent ?? '' },
        ];
      }
      if (event.type === 'question-asked') {
        return [{ instanceId: event.unitId as string, property: 'has-question', value: true }];
      }
      if (event.type === 'unit-terminated') {
        return [
          {
            instanceId: event.unitId as string,
            property: 'status',
            value: 'terminated',
            remove: true,
          },
        ];
      }
      return null;
    },
    ...overrides,
  };
}

function registerTestDomain(state: FakeGlobalStateSystem): void {
  state.registerDomain({
    domain: 'test-domain',
    description: 'Test domain for route tests',
    multiInstance: true,
    properties: [
      { key: 'status', description: 'Status', typeHint: 'string' },
      { key: 'intent', description: 'Intent', typeHint: 'string' },
      { key: 'has-question', description: 'Has question', typeHint: 'boolean' },
    ],
  });
}

/**
 * Simulates what ServerEventRoute.useEffect does: processes messages
 * from startIndex, publishes to state with source metadata.
 * Extracted from the component to enable unit testing without React rendering.
 */
function processMessages(
  route: ServerEventRouteDescriptor,
  messages: ServerEvent[],
  state: FakeGlobalStateSystem,
  startIndex: number
): number {
  for (let i = startIndex; i < messages.length; i++) {
    try {
      const event = messages[i];
      const updates = route.mapEvent(event);
      if (!updates) continue;

      const source: StateEntrySource = {
        origin: 'server',
        channel: route.channel,
        eventType: event.type,
      };

      for (const update of updates) {
        if (update.remove && update.instanceId) {
          state.removeInstance(route.stateDomain, update.instanceId);
          continue;
        }

        const path = update.instanceId
          ? `${route.stateDomain}:${update.instanceId}:${update.property}`
          : `${route.stateDomain}:${update.property}`;

        state.publish(path, update.value, source);
      }
    } catch (error) {
      console.warn('[ServerEventRoute] Failed to process event', {
        channel: route.channel,
        index: i,
        error,
      });
    }
  }
  return messages.length - 1;
}

// -- Tests --

describe('ServerEventRoute mapping logic', () => {
  let state: FakeGlobalStateSystem;
  let route: ServerEventRouteDescriptor;

  beforeEach(() => {
    state = new FakeGlobalStateSystem();
    registerTestDomain(state);
    route = createTestRoute();
  });

  describe('route mapping', () => {
    it('maps status-changed event to state path updates', () => {
      const messages: ServerEvent[] = [
        { type: 'status-changed', unitId: 'agent-1', status: 'working', intent: 'building tests' },
      ];

      processMessages(route, messages, state, 0);

      expect(state.get('test-domain:agent-1:status')).toBe('working');
      expect(state.get('test-domain:agent-1:intent')).toBe('building tests');
    });

    it('maps question-asked event to has-question state', () => {
      const messages: ServerEvent[] = [{ type: 'question-asked', unitId: 'agent-2' }];

      processMessages(route, messages, state, 0);

      expect(state.get('test-domain:agent-2:has-question')).toBe(true);
    });

    it('returns null for unknown event types (forward compatibility)', () => {
      const messages: ServerEvent[] = [{ type: 'unknown-future-event', unitId: 'agent-1' }];

      processMessages(route, messages, state, 0);

      // No state published for unknown events
      expect(state.entryCount).toBe(0);
    });
  });

  describe('source propagation', () => {
    it('tags server-origin source metadata on published state entries', () => {
      const messages: ServerEvent[] = [
        { type: 'status-changed', unitId: 'agent-1', status: 'idle' },
      ];

      processMessages(route, messages, state, 0);

      const source = state.getPublishedSource('test-domain:agent-1:status');
      expect(source).toBeDefined();
      expect(source?.origin).toBe('server');
      expect(source?.channel).toBe('test-channel');
      expect(source?.eventType).toBe('status-changed');
    });

    it('preserves channel and eventType in source metadata', () => {
      const messages: ServerEvent[] = [{ type: 'question-asked', unitId: 'agent-3' }];

      processMessages(route, messages, state, 0);

      const source = state.getPublishedSource('test-domain:agent-3:has-question');
      expect(source?.channel).toBe('test-channel');
      expect(source?.eventType).toBe('question-asked');
    });
  });

  describe('remove-instance behavior', () => {
    it('removes instance from state when update has remove flag', () => {
      // First publish some state
      const setupMessages: ServerEvent[] = [
        { type: 'status-changed', unitId: 'agent-1', status: 'working', intent: 'coding' },
      ];
      processMessages(route, setupMessages, state, 0);
      expect(state.get('test-domain:agent-1:status')).toBe('working');

      // Now send termination event
      const terminateMessages: ServerEvent[] = [{ type: 'unit-terminated', unitId: 'agent-1' }];
      processMessages(route, terminateMessages, state, 0);

      // Instance should be removed
      expect(state.get('test-domain:agent-1:status')).toBeUndefined();
      expect(state.get('test-domain:agent-1:intent')).toBeUndefined();
    });
  });

  describe('burst processing', () => {
    it('processes all queued messages, not just the last one', () => {
      const messages: ServerEvent[] = [
        { type: 'status-changed', unitId: 'agent-1', status: 'working', intent: 'step 1' },
        { type: 'status-changed', unitId: 'agent-2', status: 'idle', intent: '' },
        { type: 'question-asked', unitId: 'agent-3' },
      ];

      processMessages(route, messages, state, 0);

      // All three messages should have been processed
      expect(state.get('test-domain:agent-1:status')).toBe('working');
      expect(state.get('test-domain:agent-2:status')).toBe('idle');
      expect(state.get('test-domain:agent-3:has-question')).toBe(true);
    });

    it('respects startIndex to skip already-processed messages', () => {
      const batch1: ServerEvent[] = [
        { type: 'status-changed', unitId: 'agent-1', status: 'working', intent: '' },
      ];
      const lastIdx = processMessages(route, batch1, state, 0);
      expect(lastIdx).toBe(0);

      // Simulate second batch arriving (messages array grows)
      const fullMessages: ServerEvent[] = [
        ...batch1,
        { type: 'status-changed', unitId: 'agent-1', status: 'idle', intent: 'done' },
      ];
      processMessages(route, fullMessages, state, lastIdx + 1);

      // Status should reflect latest message
      expect(state.get('test-domain:agent-1:status')).toBe('idle');
      expect(state.get('test-domain:agent-1:intent')).toBe('done');
    });

    it('handles empty messages array gracefully', () => {
      const lastIdx = processMessages(route, [], state, 0);
      expect(lastIdx).toBe(-1);
      expect(state.entryCount).toBe(0);
    });
  });

  describe('error isolation', () => {
    it('continues processing after one event throws in mapEvent', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const badRoute = createTestRoute({
        mapEvent: (event: ServerEvent) => {
          if (event.type === 'bad-event') {
            throw new Error('Simulated mapEvent failure');
          }
          if (event.type === 'status-changed') {
            return [
              { instanceId: event.unitId as string, property: 'status', value: event.status },
            ];
          }
          return null;
        },
      });

      const messages: ServerEvent[] = [
        { type: 'status-changed', unitId: 'agent-1', status: 'working' },
        { type: 'bad-event', unitId: 'agent-2' },
        { type: 'status-changed', unitId: 'agent-3', status: 'idle' },
      ];

      processMessages(badRoute, messages, state, 0);

      // First and third events should be processed despite second throwing
      expect(state.get('test-domain:agent-1:status')).toBe('working');
      expect(state.get('test-domain:agent-3:status')).toBe('idle');
      expect(warnSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
    });
  });

  describe('StateChange subscriber receives source metadata', () => {
    it('source metadata flows through to subscribers via StateChange', () => {
      const changes: StateChange[] = [];
      state.subscribe('test-domain:**', (change) => changes.push(change));

      const messages: ServerEvent[] = [
        { type: 'status-changed', unitId: 'agent-1', status: 'working' },
      ];
      processMessages(route, messages, state, 0);

      expect(changes.length).toBeGreaterThan(0);
      const statusChange = changes.find((c) => c.property === 'status');
      expect(statusChange?.source?.origin).toBe('server');
      expect(statusChange?.source?.channel).toBe('test-channel');
    });
  });
});
