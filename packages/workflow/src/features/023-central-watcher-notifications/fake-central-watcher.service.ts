/**
 * Fake central watcher service for unit testing.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 1 (T007)
 * Per Constitution Principle 4: Use fakes over mocks for testing
 * Per CF-08: stop() does NOT clear registered adapters
 *
 * Provides lifecycle tracking, adapter registration tracking, and
 * event simulation for Phase 3 adapter tests.
 */

import type { ICentralWatcherService } from './central-watcher.interface.js';
import type { IWatcherAdapter, WatcherEvent } from './watcher-adapter.interface.js';

/** Record of a start() call */
export interface StartCall {
  timestamp: number;
}

/** Record of a stop() call */
export interface StopCall {
  timestamp: number;
}

/** Record of a registerAdapter() call */
export interface RegisterAdapterCall {
  adapter: IWatcherAdapter;
  timestamp: number;
}

/**
 * Fake implementation of ICentralWatcherService for unit testing.
 *
 * Tracks all lifecycle calls and supports event simulation for testing
 * adapters without real file watchers.
 */
export class FakeCentralWatcherService implements ICentralWatcherService {
  /** All start() calls, in order */
  public readonly startCalls: StartCall[] = [];

  /** All stop() calls, in order */
  public readonly stopCalls: StopCall[] = [];

  /** All registerAdapter() calls, in order */
  public readonly registerAdapterCalls: RegisterAdapterCall[] = [];

  /** Set to an Error to make start() reject */
  public startError: Error | null = null;

  /** Set to an Error to make stop() reject */
  public stopError: Error | null = null;

  /** Registered adapters (preserved across stop per CF-08) */
  private readonly adapters = new Set<IWatcherAdapter>();

  /** Whether the service is currently "watching" */
  private watching = false;

  async start(): Promise<void> {
    if (this.startError) {
      throw this.startError;
    }
    if (this.watching) {
      throw new Error('Already watching');
    }
    this.watching = true;
    this.startCalls.push({ timestamp: Date.now() });
  }

  async stop(): Promise<void> {
    if (this.stopError) {
      throw this.stopError;
    }
    this.watching = false;
    this.stopCalls.push({ timestamp: Date.now() });
    // Per CF-08: do NOT clear adapters
  }

  isWatching(): boolean {
    return this.watching;
  }

  async rescan(): Promise<void> {
    // No-op in fake — rescan behavior is tested on the real service
  }

  registerAdapter(adapter: IWatcherAdapter): void {
    this.adapters.add(adapter);
    this.registerAdapterCalls.push({ adapter, timestamp: Date.now() });
  }

  /**
   * Simulate a filesystem event, dispatching to all registered adapters.
   *
   * This is the primary test hook — call this to trigger adapter behavior
   * without real file watchers.
   *
   * @param event - The event to dispatch to all adapters
   */
  simulateEvent(event: WatcherEvent): void {
    for (const adapter of this.adapters) {
      try {
        adapter.handleEvent(event);
      } catch {
        // Isolate adapter failures — all adapters should receive events
      }
    }
  }
}
