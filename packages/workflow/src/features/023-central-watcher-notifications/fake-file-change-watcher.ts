/**
 * Plan 045: Live File Events
 *
 * Fake implementation of file change watcher adapter for testing.
 *
 * Per Constitution Principle 4: Use fakes over mocks for testing
 * Follows FakeWatcherAdapter pattern from Plan 023.
 *
 * Records events and provides test hooks for inspection.
 * Must pass the same contract tests as the real FileChangeWatcherAdapter.
 */

import type { FileChangeBatchItem } from './file-change-watcher.adapter.js';
import type { IWatcherAdapter, WatcherEvent } from './watcher-adapter.interface.js';

/** Callback type for batch subscribers */
type FilesChangedCallback = (changes: FileChangeBatchItem[]) => void;

/**
 * Fake file change watcher adapter for unit testing.
 *
 * Simplified behavior: no debounce, immediate dispatch on flushNow().
 * Records all events for test assertions.
 */
export class FakeFileChangeWatcherAdapter implements IWatcherAdapter {
  readonly name = 'fake-file-change-watcher';

  /** All events received via handleEvent() */
  public readonly handledEvents: WatcherEvent[] = [];

  /** Pending batch items (accumulated, not yet dispatched) */
  private readonly pendingBatch = new Map<string, FileChangeBatchItem>();

  /** Subscribers */
  private readonly subscribers = new Set<FilesChangedCallback>();

  handleEvent(event: WatcherEvent): void {
    // Filter .chainglass/ paths (same as real adapter)
    if (event.path.includes('/.chainglass/') || event.path.endsWith('/.chainglass')) {
      return;
    }

    this.handledEvents.push(event);

    // Convert absolute → relative path
    const relativePath = event.path.startsWith(`${event.worktreePath}/`)
      ? event.path.slice(event.worktreePath.length + 1)
      : event.path === event.worktreePath
        ? ''
        : event.path;

    if (event.eventType === 'error') return;

    const item: FileChangeBatchItem = {
      path: relativePath,
      eventType: event.eventType as FileChangeBatchItem['eventType'],
      worktreePath: event.worktreePath,
      timestamp: Date.now(),
    };

    // Dedup: last-event-wins per key
    const key = `${event.worktreePath}:${relativePath}`;
    this.pendingBatch.set(key, item);
  }

  /** Subscribe to batched file change events (callback-set pattern). */
  onFilesChanged(callback: FilesChangedCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /** Number of active subscribers (for test inspection). */
  get subscriberCount(): number {
    return this.subscribers.size;
  }

  /** Flush pending batch immediately (no debounce in fake). */
  flushNow(): void {
    if (this.pendingBatch.size === 0) return;

    const changes = [...this.pendingBatch.values()];
    this.pendingBatch.clear();

    for (const subscriber of this.subscribers) {
      try {
        subscriber(changes);
      } catch {
        // Error isolation: same as real adapter
      }
    }
  }

  /** Cancel pending and clear state. */
  destroy(): void {
    this.pendingBatch.clear();
    this.subscribers.clear();
  }

  /** Clear tracked events for test isolation. */
  reset(): void {
    this.handledEvents.length = 0;
    this.pendingBatch.clear();
  }
}
