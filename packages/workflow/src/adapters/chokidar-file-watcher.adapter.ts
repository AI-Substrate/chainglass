/**
 * Chokidar File Watcher Adapter - wraps chokidar for production use.
 *
 * Per Subtask 001: WorkspaceChangeNotifierService - File Watching for CLI Changes
 * Per Constitution Principle 4: Use fakes over mocks - adapters enable testability
 *
 * This adapter wraps chokidar's FSWatcher to implement IFileWatcher,
 * allowing WorkspaceChangeNotifierService to be tested with FakeFileWatcher.
 *
 * Configuration optimized for detecting atomic file writes from CLI:
 * - atomic: true — handles temp→rename pattern from atomicWriteFile()
 * - awaitWriteFinish — waits for file to stabilize before emitting
 */

import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type {
  FileWatcherEvent,
  FileWatcherOptions,
  IFileWatcher,
  IFileWatcherFactory,
} from '../interfaces/file-watcher.interface.js';

/**
 * Adapter that wraps chokidar's FSWatcher to implement IFileWatcher.
 *
 * Maps our simplified interface to chokidar's API.
 */
export class ChokidarFileWatcherAdapter implements IFileWatcher {
  private watcher: FSWatcher;

  constructor(options: FileWatcherOptions = {}) {
    // Create chokidar watcher with mapped options
    this.watcher = chokidar.watch([], {
      atomic: options.atomic ?? false,
      awaitWriteFinish: options.awaitWriteFinish,
      ignoreInitial: options.ignoreInitial ?? false,
      persistent: options.persistent ?? true,
      usePolling: options.usePolling,
      interval: options.interval,
    });
  }

  add(paths: string | string[]): void {
    this.watcher.add(paths);
  }

  unwatch(paths: string | string[]): void {
    this.watcher.unwatch(paths);
  }

  async close(): Promise<void> {
    await this.watcher.close();
  }

  on(event: FileWatcherEvent, callback: (pathOrError: string | Error) => void): this {
    // Map our events to chokidar events
    if (event === 'error') {
      this.watcher.on('error', (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        callback(error);
      });
    } else {
      this.watcher.on(event, (path: string) => callback(path));
    }
    return this;
  }
}

/**
 * Factory that creates ChokidarFileWatcherAdapter instances.
 *
 * Use this in production. For testing, use FakeFileWatcherFactory.
 */
export class ChokidarFileWatcherFactory implements IFileWatcherFactory {
  create(options?: FileWatcherOptions): IFileWatcher {
    return new ChokidarFileWatcherAdapter(options);
  }
}
