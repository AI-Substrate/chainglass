/**
 * Fake watcher adapter for unit testing.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 1 (T005)
 * Per Constitution Principle 4: Use fakes over mocks for testing
 *
 * Provides call tracking for test assertions in Phase 2 and Phase 3.
 * Records every handleEvent() call for later inspection.
 */

import type { IWatcherAdapter, WatcherEvent } from './watcher-adapter.interface.js';

/**
 * Fake implementation of IWatcherAdapter for unit testing.
 *
 * Records all handleEvent() calls in the `calls` array for assertions.
 * Use `reset()` to clear tracked calls between test assertions.
 */
export class FakeWatcherAdapter implements IWatcherAdapter {
  /** All events received via handleEvent(), in order */
  public readonly calls: WatcherEvent[] = [];

  /** Human-readable name for debugging and logging */
  public readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  handleEvent(event: WatcherEvent): void {
    this.calls.push(event);
  }

  /** Clear all tracked calls. Use for test isolation. */
  reset(): void {
    this.calls.length = 0;
  }
}
