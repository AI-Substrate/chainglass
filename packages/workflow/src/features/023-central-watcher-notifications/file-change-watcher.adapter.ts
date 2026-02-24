/**
 * Plan 045: Live File Events
 *
 * Watcher adapter for source file changes. Receives ALL filesystem events
 * from CentralWatcherService, filters out .chainglass/ paths, converts
 * absolute paths to relative, batches events in a debounce window, and
 * deduplicates with last-event-wins per worktreePath:relativePath key.
 *
 * Per ADR-02: Self-filtering adapter — receives all events, filters internally
 * Per ADR-0007: SSE carries only identifiers (path, eventType)
 * Per ADR-0008: .chainglass/ excluded (watched by data watchers separately)
 * Per PL-03: Callback-set pattern, NOT EventEmitter
 * Per Workshop 02: 300ms debounce, last-event-wins dedup
 */

import type { FileChangeBatchItem, FilesChangedCallback } from './file-change.types.js';
import type { IWatcherAdapter, WatcherEvent } from './watcher-adapter.interface.js';

export type { FileChangeBatchItem } from './file-change.types.js';

/**
 * Adapter that filters, batches, and deduplicates source file change events.
 *
 * - Filters: drops `.chainglass/` paths (watched by data watchers)
 * - Converts: absolute → relative paths (from worktree root)
 * - Batches: accumulates events in a configurable debounce window
 * - Deduplicates: last-event-wins per `worktreePath:relativePath` key
 * - Dispatches: callback-set pattern with error isolation
 */
export class FileChangeWatcherAdapter implements IWatcherAdapter {
  readonly name = 'file-change-watcher';

  private readonly debounceMs: number;
  private readonly subscribers = new Set<FilesChangedCallback>();
  private readonly pendingBatch = new Map<string, FileChangeBatchItem>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  handleEvent(event: WatcherEvent): void {
    // Filter .chainglass/ paths (watched by data watchers per ADR-0008)
    if (event.path.includes('/.chainglass/') || event.path.endsWith('/.chainglass')) {
      return;
    }

    // Convert absolute path to relative from worktree root
    const relativePath = event.path.startsWith(`${event.worktreePath}/`)
      ? event.path.slice(event.worktreePath.length + 1)
      : event.path === event.worktreePath
        ? ''
        : event.path;

    // Exclude non-file events (error) from batching
    if (event.eventType === 'error') {
      return;
    }

    const item: FileChangeBatchItem = {
      path: relativePath,
      eventType: event.eventType as FileChangeBatchItem['eventType'],
      worktreePath: event.worktreePath,
      timestamp: Date.now(),
    };

    // Dedup key: worktreePath:relativePath — last event wins
    const key = `${event.worktreePath}:${relativePath}`;
    this.pendingBatch.set(key, item);

    // Reset debounce timer
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  /**
   * Subscribe to batched file change events.
   * Returns an unsubscribe function (callback-set pattern per PL-03).
   */
  onFilesChanged(callback: FilesChangedCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /** Flush pending batch immediately (for testing). */
  flushNow(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  /** Cancel pending flush and clear state. */
  destroy(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingBatch.clear();
    this.subscribers.clear();
  }

  // ═══════════════════════════════════════════════════════════════
  // Private
  // ═══════════════════════════════════════════════════════════════

  private flush(): void {
    this.flushTimer = null;
    if (this.pendingBatch.size === 0) {
      return;
    }

    const changes = [...this.pendingBatch.values()];
    this.pendingBatch.clear();

    for (const subscriber of this.subscribers) {
      try {
        subscriber(changes);
      } catch (err) {
        // Error isolation: throwing subscriber must not block others
        console.warn(`[${this.name}] Subscriber threw during flush`, err);
      }
    }
  }
}
