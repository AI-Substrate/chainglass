/**
 * File Watcher interfaces for abstracting file system watching.
 *
 * Per Subtask 001: WorkspaceChangeNotifierService - File Watching for CLI Changes
 * Per Constitution Principle 4: Use fakes over mocks for testing
 *
 * These interfaces wrap chokidar for file watching, enabling:
 * - Unit testing with FakeFileWatcher (no real filesystem)
 * - Production use with ChokidarFileWatcherAdapter
 *
 * The factory pattern allows injecting different implementations:
 * - ChokidarFileWatcherFactory for production
 * - FakeFileWatcherFactory for testing
 */

/**
 * Events emitted by file watchers.
 */
export type FileWatcherEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'error';

/**
 * Options for creating a file watcher.
 * Maps to chokidar options for production use.
 */
export interface FileWatcherOptions {
  /**
   * Treat atomic writes (temp→rename) as single change event.
   * @default false
   */
  atomic?: boolean;

  /**
   * Wait for file writes to stabilize before emitting.
   * Useful for detecting when a file has finished being written.
   */
  awaitWriteFinish?:
    | boolean
    | {
        /** How long file size must stay unchanged (ms) */
        stabilityThreshold?: number;
        /** How often to poll file size (ms) */
        pollInterval?: number;
      };

  /**
   * Don't emit events for existing files when starting watcher.
   * @default false
   */
  ignoreInitial?: boolean;

  /**
   * Keep the process running while watching.
   * @default true
   */
  persistent?: boolean;

  /**
   * Enable polling instead of native events.
   * Useful for network filesystems.
   */
  usePolling?: boolean;

  /**
   * Polling interval if usePolling is true (ms).
   */
  interval?: number;
}

/**
 * Interface for a file watcher instance.
 *
 * Wraps chokidar.FSWatcher for testability.
 * Use FakeFileWatcher in tests, ChokidarFileWatcherAdapter in production.
 */
export interface IFileWatcher {
  /**
   * Add paths/globs to watch.
   * Can be called multiple times to watch additional paths.
   *
   * @param paths - File path, directory path, or glob pattern(s) to watch
   */
  add(paths: string | string[]): void;

  /**
   * Stop watching specific paths.
   *
   * @param paths - Path(s) to stop watching
   */
  unwatch(paths: string | string[]): void;

  /**
   * Close the watcher and release all resources.
   * After closing, the watcher cannot be reused.
   */
  close(): Promise<void>;

  /**
   * Register an event handler.
   *
   * Events:
   * - 'add': File added
   * - 'change': File modified
   * - 'unlink': File deleted
   * - 'addDir': Directory added
   * - 'unlinkDir': Directory deleted
   * - 'error': Error occurred
   *
   * @param event - Event type to listen for
   * @param callback - Handler function (receives path for file events, Error for error event)
   * @returns this for chaining
   */
  on(event: FileWatcherEvent, callback: (pathOrError: string | Error) => void): this;
}

/**
 * Factory interface for creating file watchers.
 *
 * Inject this into services that need file watching.
 * Use FakeFileWatcherFactory in tests, ChokidarFileWatcherFactory in production.
 */
export interface IFileWatcherFactory {
  /**
   * Create a new file watcher with the given options.
   *
   * @param options - Watcher configuration
   * @returns New file watcher instance
   */
  create(options?: FileWatcherOptions): IFileWatcher;
}
