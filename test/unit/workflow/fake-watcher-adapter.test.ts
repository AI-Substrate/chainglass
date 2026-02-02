/**
 * Tests for FakeWatcherAdapter class.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 1 (T004)
 * Per Constitution Principle 4: Use fakes over mocks for testing
 *
 * TDD RED phase: These tests define the FakeWatcherAdapter contract
 * before any implementation exists.
 */

import { FakeWatcherAdapter } from '@chainglass/workflow';
import type { WatcherEvent } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('FakeWatcherAdapter', () => {
  let adapter: FakeWatcherAdapter;

  beforeEach(() => {
    adapter = new FakeWatcherAdapter('test-adapter');
  });

  describe('handleEvent call tracking', () => {
    it('should record handleEvent calls', () => {
      /*
      Test Doc:
      - Why: Fakes must track calls for test assertions in Phase 2
      - Contract: Every handleEvent() call is recorded in calls array
      - Usage Notes: Access via adapter.calls; reset with adapter.reset()
      - Quality Contribution: Ensures fake faithfully records all dispatched events
      - Worked Example: handleEvent(event) -> calls.length === 1, calls[0] === event
      */
      const event: WatcherEvent = {
        path: '/worktree/.chainglass/data/work-graphs/my-graph/state.json',
        eventType: 'change',
        worktreePath: '/worktree',
        workspaceSlug: 'my-workspace',
      };

      adapter.handleEvent(event);

      expect(adapter.calls).toHaveLength(1);
      expect(adapter.calls[0]).toEqual(event);
    });

    it('should record multiple calls in order', () => {
      /*
      Test Doc:
      - Why: Phase 2 tests need to verify event dispatch ordering
      - Contract: calls array preserves insertion order
      - Usage Notes: Use calls[i] to verify specific events by index
      - Quality Contribution: Ensures ordering is preserved across multiple dispatches
      - Worked Example: handleEvent(e1), handleEvent(e2) -> calls[0] === e1, calls[1] === e2
      */
      const event1: WatcherEvent = {
        path: '/wt/.chainglass/data/work-graphs/g1/state.json',
        eventType: 'change',
        worktreePath: '/wt',
        workspaceSlug: 'ws-1',
      };
      const event2: WatcherEvent = {
        path: '/wt/.chainglass/data/work-graphs/g2/state.json',
        eventType: 'add',
        worktreePath: '/wt',
        workspaceSlug: 'ws-1',
      };

      adapter.handleEvent(event1);
      adapter.handleEvent(event2);

      expect(adapter.calls).toHaveLength(2);
      expect(adapter.calls[0]).toEqual(event1);
      expect(adapter.calls[1]).toEqual(event2);
    });
  });

  describe('name property', () => {
    it('should expose name property', () => {
      /*
      Test Doc:
      - Why: Adapter identity needed for debugging and logging in Phase 2
      - Contract: name property returns the value passed to constructor
      - Usage Notes: Pass unique name per adapter instance for test clarity
      - Quality Contribution: Verifies adapter identity contract from IWatcherAdapter
      - Worked Example: new FakeWatcherAdapter('test-adapter') -> adapter.name === 'test-adapter'
      */
      expect(adapter.name).toBe('test-adapter');
    });
  });

  describe('reset', () => {
    it('should reset calls', () => {
      /*
      Test Doc:
      - Why: Test isolation between assertions within the same test
      - Contract: reset() clears calls array to empty
      - Usage Notes: Call reset() between assertion groups when reusing adapter
      - Quality Contribution: Enables test isolation without creating new instances
      - Worked Example: handleEvent(e) -> calls.length === 1 -> reset() -> calls.length === 0
      */
      const event: WatcherEvent = {
        path: '/wt/.chainglass/data/work-graphs/g1/state.json',
        eventType: 'change',
        worktreePath: '/wt',
        workspaceSlug: 'ws-1',
      };

      adapter.handleEvent(event);
      expect(adapter.calls).toHaveLength(1);

      adapter.reset();
      expect(adapter.calls).toHaveLength(0);
    });
  });
});
