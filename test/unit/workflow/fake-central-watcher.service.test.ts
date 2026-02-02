/**
 * Tests for FakeCentralWatcherService class.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 1 (T006)
 * Per Constitution Principle 4: Use fakes over mocks for testing
 *
 * TDD RED phase: These tests define the FakeCentralWatcherService contract
 * before any implementation exists.
 */

import { FakeCentralWatcherService, FakeWatcherAdapter } from '@chainglass/workflow';
import type { WatcherEvent } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('FakeCentralWatcherService', () => {
  let service: FakeCentralWatcherService;

  beforeEach(() => {
    service = new FakeCentralWatcherService();
  });

  describe('start() lifecycle tracking', () => {
    it('should track start() calls', async () => {
      /*
      Test Doc:
      - Why: Phase 3 tests need to verify adapter interaction with service lifecycle
      - Contract: Every start() call is recorded in startCalls array
      - Usage Notes: startCalls records timestamp of each call
      - Quality Contribution: Ensures lifecycle tracking for consumer test assertions
      - Worked Example: await service.start() -> startCalls.length === 1
      */
      await service.start();

      expect(service.startCalls).toHaveLength(1);
    });

    it('should throw when calling start() twice without stop()', async () => {
      /*
      Test Doc:
      - Why: Validates interface contract @throws Error if already watching (double-start prevention)
      - Contract: start() rejects when service is already watching, preventing resource leaks
      - Usage Notes: Run after basic start tracking test; verifies lifecycle state machine
      - Quality Contribution: Catches double-start bugs in real CentralWatcherService and adapters
      - Worked Example:
          Create fake → await start() (watching=true) →
          await start() again → expect Error('Already watching')
      */
      await service.start();
      expect(service.isWatching()).toBe(true);

      await expect(service.start()).rejects.toThrow('Already watching');

      // State should remain watching after rejected second start
      expect(service.isWatching()).toBe(true);
      expect(service.startCalls).toHaveLength(1); // Only first start recorded
    });
  });

  describe('stop() lifecycle tracking', () => {
    it('should track stop() calls', async () => {
      /*
      Test Doc:
      - Why: Phase 3 tests need to verify adapter interaction with service lifecycle
      - Contract: Every stop() call is recorded in stopCalls array
      - Usage Notes: stopCalls records timestamp of each call
      - Quality Contribution: Ensures lifecycle tracking for consumer test assertions
      - Worked Example: await service.stop() -> stopCalls.length === 1
      */
      await service.start();
      await service.stop();

      expect(service.stopCalls).toHaveLength(1);
    });
  });

  describe('registerAdapter() tracking', () => {
    it('should track registerAdapter() calls', () => {
      /*
      Test Doc:
      - Why: Phase 3 tests need to verify adapter was registered with service
      - Contract: Every registerAdapter() call is recorded with the adapter reference
      - Usage Notes: registerAdapterCalls[i].adapter is the registered adapter
      - Quality Contribution: Verifies registration tracking for consumer assertions
      - Worked Example: registerAdapter(adapter) -> registerAdapterCalls[0].adapter === adapter
      */
      const adapter = new FakeWatcherAdapter('test');
      service.registerAdapter(adapter);

      expect(service.registerAdapterCalls).toHaveLength(1);
      expect(service.registerAdapterCalls[0].adapter).toBe(adapter);
    });
  });

  describe('isWatching() state', () => {
    it('should track isWatching() state', async () => {
      /*
      Test Doc:
      - Why: Consumer tests need to verify service state transitions
      - Contract: isWatching() returns false before start, true after start, false after stop
      - Usage Notes: Reflects lifecycle state for assertions
      - Quality Contribution: Ensures state tracking matches real service behavior
      - Worked Example: false -> start() -> true -> stop() -> false
      */
      expect(service.isWatching()).toBe(false);

      await service.start();
      expect(service.isWatching()).toBe(true);

      await service.stop();
      expect(service.isWatching()).toBe(false);
    });
  });

  describe('simulateEvent()', () => {
    it('should dispatch simulateEvent to all adapters', async () => {
      /*
      Test Doc:
      - Why: Core broadcast contract — Phase 3 uses this to test adapter event handling
      - Contract: simulateEvent() calls handleEvent() on ALL registered adapters
      - Usage Notes: Register adapters first, then call simulateEvent()
      - Quality Contribution: Verifies event broadcast without needing real file watchers
      - Worked Example: 2 adapters registered, simulateEvent(e) -> both adapters receive e
      */
      const adapter1 = new FakeWatcherAdapter('adapter-1');
      const adapter2 = new FakeWatcherAdapter('adapter-2');
      service.registerAdapter(adapter1);
      service.registerAdapter(adapter2);

      const event: WatcherEvent = {
        path: '/wt/.chainglass/data/work-graphs/g1/state.json',
        eventType: 'change',
        worktreePath: '/wt',
        workspaceSlug: 'ws-1',
      };

      service.simulateEvent(event);

      expect(adapter1.calls).toHaveLength(1);
      expect(adapter1.calls[0]).toEqual(event);
      expect(adapter2.calls).toHaveLength(1);
      expect(adapter2.calls[0]).toEqual(event);
    });
  });

  describe('adapter preservation after stop', () => {
    it('should preserve adapters after stop()', async () => {
      /*
      Test Doc:
      - Why: Per CF-08 — stop() should NOT clear adapter set
      - Contract: Adapters remain registered after stop(); simulateEvent still dispatches
      - Usage Notes: This matches real CentralWatcherService behavior (stop only closes watchers)
      - Quality Contribution: Prevents regression where stop clears adapters
      - Worked Example: registerAdapter -> start -> stop -> simulateEvent -> adapter receives event
      */
      const adapter = new FakeWatcherAdapter('persistent');
      service.registerAdapter(adapter);

      await service.start();
      await service.stop();

      const event: WatcherEvent = {
        path: '/wt/.chainglass/data/work-graphs/g1/state.json',
        eventType: 'change',
        worktreePath: '/wt',
        workspaceSlug: 'ws-1',
      };

      service.simulateEvent(event);

      expect(adapter.calls).toHaveLength(1);
    });
  });

  describe('configurable error injection', () => {
    it('should throw configurable error on start()', async () => {
      /*
      Test Doc:
      - Why: Consumer tests need to verify error handling when service fails to start
      - Contract: When startError is set, start() rejects with that error
      - Usage Notes: Set service.startError before calling start()
      - Quality Contribution: Enables error path testing without real infrastructure failures
      - Worked Example: service.startError = new Error('fail') -> start() rejects with 'fail'
      */
      service.startError = new Error('start failed');

      await expect(service.start()).rejects.toThrow('start failed');
    });

    it('should throw configurable error on stop()', async () => {
      /*
      Test Doc:
      - Why: Consumer tests need to verify error handling when service fails to stop
      - Contract: When stopError is set, stop() rejects with that error
      - Usage Notes: Set service.stopError before calling stop()
      - Quality Contribution: Enables error path testing without real infrastructure failures
      - Worked Example: service.stopError = new Error('fail') -> stop() rejects with 'fail'
      */
      service.stopError = new Error('stop failed');

      await expect(service.stop()).rejects.toThrow('stop failed');
    });
  });
});
