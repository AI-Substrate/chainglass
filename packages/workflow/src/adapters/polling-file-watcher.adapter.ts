/**
 * Polling File Watcher Adapter — fixed-interval recursive stat-walk fallback.
 *
 * Per Plan 085: env-forced polling fallback for WSL workspaces on Windows mounts.
 * On WSL with the workspace on a Windows mount (`/mnt/c/...`, drvfs/9P), Node's
 * native `fs.watch` (inotify) silently delivers NO events — Chain Glass goes blind
 * to file changes. This adapter reaches the SAME normalized IFileWatcher events as
 * the native adapter by a different mechanism: it walks each watched root on a fixed
 * interval, builds a `(path -> {size, mtimeMs, isDir})` snapshot, and diffs
 * consecutive snapshots.
 *
 * Design is fully specified in the workshop (authoritative):
 *   docs/plans/085-watch-polling-fallback/workshops/001-polling-file-watcher-adapter.md
 *
 * Event parity with NativeFileWatcherAdapter (the whole point — the swap must be
 * invisible to consumers):
 * - new file        → 'add'
 * - new directory   → 'addDir'
 * - modified file   → 'change'  (size/mtime diff; debounced per awaitWriteFinish)
 * - removed path    → 'unlink'  (file OR dir — native never emits 'unlinkDir')
 * - file<->dir reuse → 'unlink' then 'add'/'addDir'
 *
 * Cost control on 9P (Findings 03/04):
 * - ignore list prunes ignored directories BEFORE descending (never stat node_modules)
 * - `scanning` guard makes a tick a no-op while a scan is in progress (self-throttles)
 * - (size, mtimeMs) short-circuit avoids reading file contents
 */

import { lstat, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  FileWatcherEvent,
  FileWatcherOptions,
  IFileWatcher,
} from '../interfaces/file-watcher.interface.js';
import { compileIgnorePatterns } from './ignore-patterns.js';

/** One filesystem entry captured in a snapshot. */
interface Entry {
  mtimeMs: number;
  size: number;
  isDir: boolean;
}

/** One snapshot per watched root: absolutePath → Entry. */
type Snapshot = Map<string, Entry>;

/** Default poll interval (ms) — balances responsiveness vs 9P stat cost (Workshop Q1). */
const DEFAULT_INTERVAL_MS = 1000;

/** Default write-stabilization window (ms) when `awaitWriteFinish` is enabled (native parity). */
const DEFAULT_STABILITY_THRESHOLD_MS = 200;

/**
 * File watcher adapter using fixed-interval recursive polling.
 *
 * Emits the identical normalized event shape as NativeFileWatcherAdapter, so the
 * DI factory can swap one for the other transparently.
 */
export class PollingFileWatcherAdapter implements IFileWatcher {
  private readonly listeners = new Map<
    FileWatcherEvent,
    Set<(pathOrError: string | Error) => void>
  >();
  private readonly snapshots = new Map<string, Snapshot>(); // root → snapshot (seeded only)
  private readonly watched = new Set<string>(); // intended roots, set synchronously in add()
  private readonly ignored: ((absolutePath: string) => boolean)[];
  private readonly ignoreInitial: boolean;
  private readonly interval: number;
  private readonly persistent: boolean;
  private readonly stabilityThreshold: number;
  private readonly stabilizationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;
  private closed = false;

  constructor(options: FileWatcherOptions = {}) {
    this.ignored = compileIgnorePatterns(options.ignored ?? []);
    this.ignoreInitial = options.ignoreInitial ?? false;
    this.interval =
      options.interval && options.interval > 0 ? options.interval : DEFAULT_INTERVAL_MS;
    this.persistent = options.persistent ?? true;

    // DYK#3 (native parity): write stabilization only applies to 'change' events.
    if (options.awaitWriteFinish && typeof options.awaitWriteFinish === 'object') {
      this.stabilityThreshold =
        options.awaitWriteFinish.stabilityThreshold ?? DEFAULT_STABILITY_THRESHOLD_MS;
    } else if (options.awaitWriteFinish === true) {
      this.stabilityThreshold = DEFAULT_STABILITY_THRESHOLD_MS;
    } else {
      this.stabilityThreshold = 0;
    }
  }

  /** Effective poll interval in ms after option/env defaulting. Exposed for introspection/tests (AC5). */
  get intervalMs(): number {
    return this.interval;
  }

  add(paths: string | string[]): void {
    if (this.closed) return;
    const pathList = Array.isArray(paths) ? paths : [paths];

    for (const watchPath of pathList) {
      const root = resolve(watchPath);
      // Dedup on `watched` (not `snapshots`) so a still-pending baseline isn't re-added.
      if (this.watched.has(root)) continue;
      this.watched.add(root);

      // Seed the baseline snapshot. Emit add/addDir only when !ignoreInitial (E1/E2).
      // NOTE (v1 limitation): baseline seeding is NOT gated by the `scanning` guard, so
      // adding many roots at once launches that many concurrent walks. Acceptable for the
      // edge-case modality this targets (a handful of worktrees); revisit if startup stat
      // cost on a cold 9P mount proves painful.
      void this.walk(root)
        .then((snap) => {
          // Bail if closed or unwatched while the baseline scan was in flight.
          if (this.closed || !this.watched.has(root)) return;
          if (!this.ignoreInitial) {
            for (const [abs, entry] of snap) {
              this.emit(entry.isDir ? 'addDir' : 'add', abs);
            }
          }
          this.snapshots.set(root, snap);
          // AC6: visible startup line naming each watched root + interval. Use stderr
          // (console.warn) to match sibling watcher adapters and avoid writing to stdout,
          // which would corrupt an MCP STDIO JSON-RPC stream if the poller runs under it.
          console.warn(
            `[file-watcher] polling ${root} every ${this.interval}ms (CHAINGLASS_WATCH_POLLING)`
          );
        })
        .catch((err) => this.emit('error', err instanceof Error ? err : new Error(String(err))));
    }

    this.ensureTimer();
  }

  unwatch(paths: string | string[]): void {
    if (this.closed) return;
    const pathList = Array.isArray(paths) ? paths : [paths];
    for (const watchPath of pathList) {
      const root = resolve(watchPath);
      this.watched.delete(root); // cancels a still-pending baseline scan too
      this.snapshots.delete(root);
    }
    if (this.snapshots.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const t of this.stabilizationTimers.values()) {
      clearTimeout(t);
    }
    this.stabilizationTimers.clear();
    this.snapshots.clear();
    this.watched.clear();
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

  private ensureTimer(): void {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => void this.tick(), this.interval);
    // E11: don't hold the process open when persistent:false.
    if (!this.persistent && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  private async tick(): Promise<void> {
    if (this.scanning || this.closed) return; // D3: never run overlapping scans.
    this.scanning = true;
    try {
      for (const root of [...this.snapshots.keys()]) {
        const next = await this.walk(root);
        if (this.closed) return;
        this.diff(this.snapshots.get(root) ?? new Map(), next);
        this.snapshots.set(root, next);
      }
    } finally {
      this.scanning = false;
    }
  }

  private async walk(root: string): Promise<Snapshot> {
    const out: Snapshot = new Map();

    const visit = async (dir: string): Promise<void> => {
      // EACCES/ENOENT on a dir → skip the subtree (E7).
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
      if (entries === null) return;
      for (const dirent of entries) {
        const abs = join(dir, dirent.name);
        if (this.isIgnored(abs)) continue; // D7: prune BEFORE descending.
        try {
          if (dirent.isSymbolicLink()) {
            // D8: don't follow symlinks — record as a leaf to avoid cycles.
            const s = await lstat(abs);
            out.set(abs, { mtimeMs: s.mtimeMs, size: s.size, isDir: false });
          } else if (dirent.isDirectory()) {
            const s = await stat(abs);
            out.set(abs, { mtimeMs: s.mtimeMs, size: s.size, isDir: true });
            await visit(abs);
          } else {
            const s = await stat(abs);
            out.set(abs, { mtimeMs: s.mtimeMs, size: s.size, isDir: false });
          }
        } catch {
          // Vanished mid-walk → treat as absent (no entry recorded).
        }
      }
    };

    await visit(root);
    return out;
  }

  private diff(prev: Snapshot, next: Snapshot): void {
    for (const [abs, entry] of next) {
      const before = prev.get(abs);
      if (!before) {
        this.emit(entry.isDir ? 'addDir' : 'add', abs);
        continue;
      }
      if (before.isDir !== entry.isDir) {
        // E5: path reused as a different type.
        this.emit('unlink', abs);
        this.emit(entry.isDir ? 'addDir' : 'add', abs);
      } else if (!entry.isDir && (before.mtimeMs !== entry.mtimeMs || before.size !== entry.size)) {
        this.emitChange(abs);
      }
    }
    // Removed paths — file OR dir (native parity: 'unlink', never 'unlinkDir'). E6.
    for (const abs of prev.keys()) {
      if (!next.has(abs)) this.emit('unlink', abs);
    }
  }

  /** Mirror the native adapter's awaitWriteFinish debounce for 'change' events. */
  private emitChange(abs: string): void {
    if (this.stabilityThreshold <= 0) {
      this.emit('change', abs);
      return;
    }
    const existing = this.stabilizationTimers.get(abs);
    if (existing) clearTimeout(existing);
    this.stabilizationTimers.set(
      abs,
      setTimeout(() => {
        this.stabilizationTimers.delete(abs);
        this.emit('change', abs);
      }, this.stabilityThreshold)
    );
  }

  private isIgnored(absolutePath: string): boolean {
    return this.ignored.some((fn) => fn(absolutePath));
  }

  private emit(event: FileWatcherEvent, pathOrError: string | Error): void {
    if (this.closed) return; // no events after close() — covers debounced 'change' timers too
    const set = this.listeners.get(event);
    if (!set) return;
    for (const callback of set) {
      try {
        callback(pathOrError);
      } catch {
        // Error isolation: one failing listener doesn't block others.
      }
    }
  }
}
