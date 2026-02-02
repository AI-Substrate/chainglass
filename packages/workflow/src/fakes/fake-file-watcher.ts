/**
 * Fake File Watcher for unit testing.
 *
 * Per Subtask 001: File Watching for CLI Changes (used by CentralWatcherService)
 * Per Constitution Principle 4: Use fakes over mocks for testing
 *
 * This fake provides:
 * - Programmatic event simulation (simulateChange, simulateAdd, etc.)
 * - Test hooks to inspect watched paths
 * - No real filesystem interaction
 *
 * Example usage in tests:
 * ```typescript
 * const factory = new FakeFileWatcherFactory();
 * const service = new CentralWatcherService(
 *   fakeRegistry,
 *   fakeWorktreeResolver,
 *   factory,
 * );
 *
 * await service.start();
 *
 * // Get the watcher that was created
 * const watcher = factory.getLastWatcher()!;
 *
 * // Simulate a file change
 * watcher.simulateChange('/path/to/work-graphs/demo/state.json');
 *
 * // Assert callback was called
 * expect(events).toHaveLength(1);
 * ```
 */

import type {
  FileWatcherEvent,
  FileWatcherOptions,
  IFileWatcher,
  IFileWatcherFactory,
} from '../interfaces/file-watcher.interface.js';

/**
 * Fake implementation of IFileWatcher for unit testing.
 *
 * Provides test hooks to:
 * - Simulate file system events
 * - Inspect which paths are being watched
 * - Verify cleanup behavior
 */
export class FakeFileWatcher implements IFileWatcher {
  /** Event handlers by event type */
  private handlers = new Map<string, Set<(pathOrError: string | Error) => void>>();

  /** Currently watched paths */
  private watchedPaths = new Set<string>();

  /** Whether watcher has been closed */
  private closed = false;

  /** Options passed to constructor (for inspection) */
  public readonly options: FileWatcherOptions;

  constructor(options: FileWatcherOptions = {}) {
    this.options = options;
  }

  // ═══════════════════════════════════════════════════════════════
  // IFileWatcher interface implementation
  // ═══════════════════════════════════════════════════════════════

  add(paths: string | string[]): void {
    if (this.closed) {
      throw new Error('Cannot add paths to closed watcher');
    }
    const pathArray = Array.isArray(paths) ? paths : [paths];
    for (const p of pathArray) {
      this.watchedPaths.add(p);
    }
  }

  unwatch(paths: string | string[]): void {
    if (this.closed) {
      return; // Silently ignore unwatch on closed watcher
    }
    const pathArray = Array.isArray(paths) ? paths : [paths];
    for (const p of pathArray) {
      this.watchedPaths.delete(p);
    }
  }

  async close(): Promise<void> {
    this.handlers.clear();
    this.watchedPaths.clear();
    this.closed = true;
  }

  on(event: FileWatcherEvent, callback: (pathOrError: string | Error) => void): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(callback);
    return this;
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST HOOKS - programmatic event emission for unit tests
  // ═══════════════════════════════════════════════════════════════

  /**
   * Simulate a 'change' event (file modified).
   *
   * @param path - Absolute path to the changed file
   */
  simulateChange(path: string): void {
    this.emit('change', path);
  }

  /**
   * Simulate an 'add' event (file created).
   *
   * @param path - Absolute path to the added file
   */
  simulateAdd(path: string): void {
    this.emit('add', path);
  }

  /**
   * Simulate an 'unlink' event (file deleted).
   *
   * @param path - Absolute path to the deleted file
   */
  simulateUnlink(path: string): void {
    this.emit('unlink', path);
  }

  /**
   * Simulate an 'addDir' event (directory created).
   *
   * @param path - Absolute path to the added directory
   */
  simulateAddDir(path: string): void {
    this.emit('addDir', path);
  }

  /**
   * Simulate an 'unlinkDir' event (directory deleted).
   *
   * @param path - Absolute path to the deleted directory
   */
  simulateUnlinkDir(path: string): void {
    this.emit('unlinkDir', path);
  }

  /**
   * Simulate an 'error' event.
   *
   * @param error - Error to emit
   */
  simulateError(error: Error): void {
    const handlers = this.handlers.get('error');
    if (handlers) {
      for (const cb of handlers) {
        cb(error);
      }
    }
  }

  /**
   * Get all currently watched paths.
   *
   * @returns Array of watched path strings
   */
  getWatchedPaths(): string[] {
    return [...this.watchedPaths];
  }

  /**
   * Check if the watcher has been closed.
   *
   * @returns true if close() has been called
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Check if a specific path is being watched.
   *
   * @param path - Path to check
   * @returns true if path is in the watch list
   */
  isWatching(path: string): boolean {
    return this.watchedPaths.has(path);
  }

  /**
   * Emit an event to all registered handlers.
   *
   * @param event - Event type
   * @param path - Path associated with the event
   */
  private emit(event: string, path: string): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const cb of handlers) {
        cb(path);
      }
    }
  }
}

/**
 * Fake implementation of IFileWatcherFactory for unit testing.
 *
 * Tracks all watchers created, allowing tests to:
 * - Access watchers to simulate events
 * - Verify watchers were created with correct options
 */
export class FakeFileWatcherFactory implements IFileWatcherFactory {
  /** All watchers created by this factory */
  public readonly watchers: FakeFileWatcher[] = [];

  /**
   * Create a new FakeFileWatcher.
   *
   * @param options - Watcher options (stored for inspection)
   * @returns New FakeFileWatcher instance
   */
  create(options?: FileWatcherOptions): IFileWatcher {
    const watcher = new FakeFileWatcher(options);
    this.watchers.push(watcher);
    return watcher;
  }

  /**
   * Get the most recently created watcher.
   *
   * @returns Last watcher created, or undefined if none
   */
  getLastWatcher(): FakeFileWatcher | undefined {
    return this.watchers[this.watchers.length - 1];
  }

  /**
   * Get a watcher by index.
   *
   * @param index - Zero-based index
   * @returns Watcher at index, or undefined if out of bounds
   */
  getWatcher(index: number): FakeFileWatcher | undefined {
    return this.watchers[index];
  }

  /**
   * Get the total number of watchers created.
   *
   * @returns Number of watchers
   */
  getWatcherCount(): number {
    return this.watchers.length;
  }

  /**
   * Clear all tracked watchers (for test reset).
   */
  clear(): void {
    this.watchers.length = 0;
  }
}
