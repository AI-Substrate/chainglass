/**
 * Selecting File Watcher Factory — env-forced polling fallback (Plan 085).
 *
 * A thin factory that returns either the native or the polling adapter:
 * - `CHAINGLASS_WATCH_POLLING=true`  → force the PollingFileWatcherAdapter for
 *   every watcher (the WSL/Windows-mount escape hatch).
 * - otherwise                         → NativeFileWatcherAdapter (default, unchanged).
 *
 * `CHAINGLASS_WATCH_POLL_INTERVAL` (ms) tunes the poll interval; an invalid or
 * unset value falls back to the adapter default (1000ms).
 *
 * The env is read ONCE at construction. An explicit `options.usePolling` always
 * wins over the env flag, so callers can opt a single watcher in/out regardless.
 * `NativeFileWatcherFactory` is deliberately left untouched (Workshop D10) — this
 * keeps each adapter single-responsibility and makes the DI swap one line.
 */

import type {
  FileWatcherOptions,
  IFileWatcher,
  IFileWatcherFactory,
} from '../interfaces/file-watcher.interface.js';
import { NativeFileWatcherAdapter } from './native-file-watcher.adapter.js';
import { PollingFileWatcherAdapter } from './polling-file-watcher.adapter.js';

/** Fallback poll interval (ms) when neither option nor env supplies a valid value. */
const DEFAULT_INTERVAL_MS = 1000;

/**
 * Factory that selects between native and polling file watchers based on the
 * `CHAINGLASS_WATCH_POLLING` environment flag (or an explicit `usePolling` option).
 */
export class FileWatcherFactory implements IFileWatcherFactory {
  private readonly forcePolling: boolean;
  private readonly envInterval?: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.forcePolling = env.CHAINGLASS_WATCH_POLLING === 'true';
    const raw = Number(env.CHAINGLASS_WATCH_POLL_INTERVAL);
    // AC5: invalid / unset (NaN, <= 0) → undefined, so the adapter default applies.
    this.envInterval = Number.isFinite(raw) && raw > 0 ? raw : undefined;
  }

  create(options: FileWatcherOptions = {}): IFileWatcher {
    const usePolling = options.usePolling ?? this.forcePolling; // explicit option wins
    if (usePolling) {
      return new PollingFileWatcherAdapter({
        ...options,
        interval: options.interval ?? this.envInterval ?? DEFAULT_INTERVAL_MS,
      });
    }
    return new NativeFileWatcherAdapter(options);
  }
}
