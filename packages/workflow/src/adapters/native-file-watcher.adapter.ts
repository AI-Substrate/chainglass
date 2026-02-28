/**
 * Native File Watcher Adapter — uses Node.js fs.watch({recursive: true}).
 *
 * Per Plan 060: Replace Chokidar with Native File Watcher
 * Replaces ChokidarFileWatcherAdapter to eliminate file descriptor exhaustion.
 *
 * fs.watch({recursive: true}) uses FSEvents on macOS (~1 FD per tree) vs
 * chokidar v5 which uses kqueue (~1 FD per file). Measured 667x FD reduction.
 *
 * Event normalization:
 * - fs.watch 'change' → IFileWatcher 'change' (with write stabilization)
 * - fs.watch 'rename' + stat() exists + isFile → 'add'
 * - fs.watch 'rename' + stat() exists + isDir → 'addDir'
 * - fs.watch 'rename' + stat() ENOENT → 'unlink' (DYK#4: no dir tracking)
 *
 * Platform notes:
 * - macOS: Uses FSEvents (single kernel stream per tree)
 * - Linux: Uses inotify (one watch per subdirectory)
 *   ⚠️ Linux inotify limit: /proc/sys/fs/inotify/max_user_watches (default 8192)
 *   Fix: echo 65536 | sudo tee /proc/sys/fs/inotify/max_user_watches
 */

import { type FSWatcher, watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  FileWatcherEvent,
  FileWatcherOptions,
  IFileWatcher,
  IFileWatcherFactory,
} from '../interfaces/file-watcher.interface.js';

/** Internal watcher entry — one per add() call */
interface WatcherEntry {
  watcher: FSWatcher;
  rootPath: string;
}

/**
 * File watcher adapter using Node.js native fs.watch({recursive: true}).
 *
 * One FSWatcher per add() call. Uses FSEvents on macOS, inotify on Linux.
 * Negligible FD cost: ~1-2 FDs per watched tree (vs ~2,750 per tree with chokidar v5).
 */
export class NativeFileWatcherAdapter implements IFileWatcher {
  private readonly watchers = new Map<string, WatcherEntry>();
  private readonly listeners = new Map<
    FileWatcherEvent,
    Set<(pathOrError: string | Error) => void>
  >();
  private readonly ignored: ((absolutePath: string) => boolean)[];
  private readonly stabilizationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly stabilityThreshold: number;
  private readonly ignoreInitial: boolean;
  private closed = false;

  constructor(options: FileWatcherOptions = {}) {
    this.ignored = this.compileIgnorePatterns(options.ignored ?? []);
    this.ignoreInitial = options.ignoreInitial ?? false;

    // DYK#3: Write stabilization only applies to 'change' events
    if (options.awaitWriteFinish && typeof options.awaitWriteFinish === 'object') {
      this.stabilityThreshold = options.awaitWriteFinish.stabilityThreshold ?? 200;
    } else if (options.awaitWriteFinish === true) {
      this.stabilityThreshold = 200;
    } else {
      this.stabilityThreshold = 0;
    }
  }

  add(paths: string | string[]): void {
    if (this.closed) return;
    const pathList = Array.isArray(paths) ? paths : [paths];

    for (const watchPath of pathList) {
      const resolved = resolve(watchPath);
      if (this.watchers.has(resolved)) continue;

      try {
        const fsWatcher = watch(resolved, { recursive: true }, (eventType, filename) => {
          if (!filename || this.closed) return;

          // Skip parent-directory 'change' events (fs.watch fires 'change' on
          // the watched root when its contents change — this is noise)
          if (eventType === 'change' && !filename.includes('/') && !filename.includes('\\')) {
            // Could be a root-level file OR the directory itself.
            // Only skip if filename matches the watched directory basename.
            const watchedBasename = resolved.split('/').pop() || '';
            if (filename === watchedBasename) return;
          }

          const absolutePath = join(resolved, filename);

          if (this.isIgnored(absolutePath)) return;

          if (eventType === 'change') {
            this.handleChange(absolutePath);
          } else if (eventType === 'rename') {
            this.handleRename(absolutePath);
          }
        });

        fsWatcher.on('error', (err) => {
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
        });

        this.watchers.set(resolved, { watcher: fsWatcher, rootPath: resolved });
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  unwatch(paths: string | string[]): void {
    if (this.closed) return;
    const pathList = Array.isArray(paths) ? paths : [paths];

    for (const watchPath of pathList) {
      const resolved = resolve(watchPath);
      const entry = this.watchers.get(resolved);
      if (entry) {
        entry.watcher.close();
        this.watchers.delete(resolved);
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Clear all stabilization timers
    for (const timer of this.stabilizationTimers.values()) {
      clearTimeout(timer);
    }
    this.stabilizationTimers.clear();

    // Close all watchers
    for (const entry of this.watchers.values()) {
      entry.watcher.close();
    }
    this.watchers.clear();
    this.listeners.clear();
  }

  on(event: FileWatcherEvent, callback: (pathOrError: string | Error) => void): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
    return this;
  }

  // --- Private ---

  /** DYK#3: Write stabilization applies ONLY to 'change' events */
  private handleChange(absolutePath: string): void {
    if (this.stabilityThreshold > 0) {
      // Debounce: reset timer on each change for this path
      const existing = this.stabilizationTimers.get(absolutePath);
      if (existing) clearTimeout(existing);

      this.stabilizationTimers.set(
        absolutePath,
        setTimeout(() => {
          this.stabilizationTimers.delete(absolutePath);
          this.emit('change', absolutePath);
        }, this.stabilityThreshold)
      );
    } else {
      this.emit('change', absolutePath);
    }
  }

  /** Rename events: stat() to determine type. DYK#4: ENOENT always → 'unlink' */
  private handleRename(absolutePath: string): void {
    if (this.closed) return;
    stat(absolutePath)
      .then((stats) => {
        if (this.closed) return;
        if (stats.isDirectory()) {
          this.emit('addDir', absolutePath);
        } else {
          // On macOS, fs.watch fires 'rename' for BOTH new files AND modifications
          // (because writeFile does atomic write → rename internally).
          // Emit both 'add' and 'change' — consumers register for specific events,
          // and debounce layers absorb the duplicate.
          this.emit('add', absolutePath);
          if (this.stabilityThreshold > 0) {
            this.handleChange(absolutePath);
          } else {
            this.emit('change', absolutePath);
          }
        }
      })
      .catch(() => {
        if (this.closed) return;
        // DYK#4: No known-paths tracking — ENOENT always emits 'unlink'
        this.emit('unlink', absolutePath);
      });
  }

  private emit(event: FileWatcherEvent, pathOrError: string | Error): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const callback of set) {
      try {
        callback(pathOrError);
      } catch {
        // Error isolation: one failing listener doesn't block others
      }
    }
  }

  private isIgnored(absolutePath: string): boolean {
    return this.ignored.some((fn) => fn(absolutePath));
  }

  /** Compile mixed ignore patterns (string, RegExp, function) into uniform predicates */
  private compileIgnorePatterns(
    patterns: (string | RegExp | ((path: string) => boolean))[]
  ): ((absolutePath: string) => boolean)[] {
    return patterns.map((pattern) => {
      if (typeof pattern === 'function') return pattern;
      if (pattern instanceof RegExp) return (p: string) => pattern.test(p);
      // String pattern: match as substring in path
      return (p: string) => p.includes(pattern);
    });
  }
}

/**
 * Factory that creates NativeFileWatcherAdapter instances.
 *
 * Drop-in replacement for ChokidarFileWatcherFactory.
 * Uses Node.js fs.watch({recursive: true}) — FSEvents on macOS, inotify on Linux.
 */
export class NativeFileWatcherFactory implements IFileWatcherFactory {
  create(options?: FileWatcherOptions): IFileWatcher {
    return new NativeFileWatcherAdapter(options);
  }
}
