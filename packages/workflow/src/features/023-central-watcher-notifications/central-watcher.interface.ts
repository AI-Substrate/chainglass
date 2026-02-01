/**
 * Central watcher service interface for domain-agnostic filesystem watching.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 1
 * Per AC1: Single service watches <worktree>/.chainglass/data/ recursively
 * Per AC12: No domain-specific imports (workgraph, agent, sample)
 *
 * The central watcher monitors all workspace data directories and forwards
 * raw filesystem events to registered adapters. Domain knowledge lives
 * entirely in the adapters, not in this service.
 */

import type { IWatcherAdapter } from './watcher-adapter.interface.js';

/**
 * Interface for the central watcher service.
 *
 * Watches `<worktree>/.chainglass/data/` for every worktree across all
 * registered workspaces. Forwards ALL filesystem events to ALL registered
 * adapters. Adapters self-filter for relevance.
 *
 * Lifecycle: construct → registerAdapter() → start() → [events flow] → stop()
 * Adapters can be registered before or after start() (AC2).
 * stop() preserves registered adapters (CF-08).
 */
export interface ICentralWatcherService {
  /**
   * Start watching all worktree data directories.
   *
   * Creates one IFileWatcher per worktree plus one registry watcher.
   * Discovers worktrees via workspace registry and git worktree resolver.
   *
   * @throws Error if already watching (double-start prevention)
   */
  start(): Promise<void>;

  /**
   * Stop watching all directories and release watcher resources.
   *
   * Closes all IFileWatcher instances but preserves registered adapters.
   * Safe to call when not watching (no-op).
   */
  stop(): Promise<void>;

  /**
   * Check whether the service is currently watching.
   *
   * @returns true if start() has been called and stop() has not
   */
  isWatching(): boolean;

  /**
   * Re-scan workspaces and update watchers.
   *
   * Diffs current watchers against current worktrees. Creates watchers
   * for new worktrees, closes watchers for removed worktrees.
   */
  rescan(): Promise<void>;

  /**
   * Register an adapter to receive filesystem events.
   *
   * Can be called before or after start(). Adapters registered after
   * start() immediately begin receiving events from existing watchers.
   *
   * @param adapter - The watcher adapter to register
   */
  registerAdapter(adapter: IWatcherAdapter): void;
}
