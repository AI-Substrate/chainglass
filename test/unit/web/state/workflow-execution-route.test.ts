/**
 * workflowExecutionRoute — mapEvent unit tests.
 * Plan 074 Phase 3 T010.
 */

import type { ServerEvent } from '@/lib/state/server-event-router';
import { workflowExecutionRoute } from '@/lib/state/workflow-execution-route';
import { describe, expect, it } from 'vitest';

describe('workflowExecutionRoute', () => {
  it('has correct channel and stateDomain', () => {
    expect(workflowExecutionRoute.channel).toBe('workflow-execution');
    expect(workflowExecutionRoute.stateDomain).toBe('workflow-execution');
    expect(workflowExecutionRoute.multiInstance).toBe(true);
  });

  it('declares 4 properties', () => {
    expect(workflowExecutionRoute.properties).toHaveLength(4);
    const keys = workflowExecutionRoute.properties.map((p) => p.key);
    expect(keys).toEqual(['status', 'iterations', 'lastEventType', 'lastMessage']);
  });

  describe('mapEvent — execution-update', () => {
    it('maps all 4 properties from an execution-update event', () => {
      const event: ServerEvent = {
        type: 'execution-update',
        key: '/wt:pipeline',
        status: 'running',
        iterations: 5,
        lastEventType: 'iteration',
        lastMessage: 'Completed iteration 5',
      };

      const updates = workflowExecutionRoute.mapEvent(event);

      expect(updates).toEqual([
        { instanceId: '/wt:pipeline', property: 'status', value: 'running' },
        { instanceId: '/wt:pipeline', property: 'iterations', value: 5 },
        { instanceId: '/wt:pipeline', property: 'lastEventType', value: 'iteration' },
        { instanceId: '/wt:pipeline', property: 'lastMessage', value: 'Completed iteration 5' },
      ]);
    });

    it('handles missing optional fields gracefully', () => {
      const event: ServerEvent = {
        type: 'execution-update',
        key: '/wt:pipeline',
        status: 'starting',
      };

      const updates = workflowExecutionRoute.mapEvent(event);
      expect(updates).toEqual([
        { instanceId: '/wt:pipeline', property: 'status', value: 'starting' },
        { instanceId: '/wt:pipeline', property: 'iterations', value: undefined },
        { instanceId: '/wt:pipeline', property: 'lastEventType', value: undefined },
        { instanceId: '/wt:pipeline', property: 'lastMessage', value: undefined },
      ]);
    });
  });

  describe('mapEvent — execution-removed', () => {
    it('returns remove update for execution-removed event', () => {
      const event: ServerEvent = {
        type: 'execution-removed',
        key: '/wt:pipeline',
      };

      const updates = workflowExecutionRoute.mapEvent(event);
      expect(updates).toEqual([
        { instanceId: '/wt:pipeline', property: 'status', value: null, remove: true },
      ]);
    });
  });

  describe('mapEvent — edge cases', () => {
    it('returns null for unknown event types (forward compatibility)', () => {
      const event: ServerEvent = { type: 'unknown-future-event', key: '/wt:pipeline' };
      expect(workflowExecutionRoute.mapEvent(event)).toBeNull();
    });

    it('returns null when key is missing', () => {
      const event: ServerEvent = { type: 'execution-update', status: 'running' };
      expect(workflowExecutionRoute.mapEvent(event)).toBeNull();
    });
  });
});
