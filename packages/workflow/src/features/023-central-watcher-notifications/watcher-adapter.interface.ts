/**
 * Watcher adapter interfaces for the central watcher notification system.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 1
 * Per ADR-02: Adapters receive ALL events and self-filter.
 *
 * These interfaces define the contract for domain-specific adapters
 * that register with the CentralWatcherService. Each adapter receives
 * every filesystem event and is responsible for filtering to its domain.
 */

import type { FileWatcherEvent } from '../../interfaces/file-watcher.interface.js';

/**
 * A filesystem event from the central watcher service.
 *
 * Dispatched to all registered adapters for self-filtering.
 * Adapters decide which events are relevant to their domain.
 */
export interface WatcherEvent {
  /** Absolute path to the file that changed */
  path: string;
  /** Type of filesystem event (reuses chokidar event types) */
  eventType: FileWatcherEvent;
  /** Absolute path to the worktree root where the change occurred */
  worktreePath: string;
  /** Slug identifying the workspace that owns this worktree */
  workspaceSlug: string;
}

/**
 * Interface for domain-specific watcher adapters.
 *
 * Adapters register with the CentralWatcherService and receive ALL
 * filesystem events. Each adapter self-filters for events relevant
 * to its domain (e.g., workgraph state changes, agent config changes).
 *
 * Per ADR-02: "Receive all, self-filter" — simplest service implementation;
 * adapters own all domain knowledge including filtering and debouncing.
 */
export interface IWatcherAdapter {
  /** Human-readable name for debugging and logging */
  readonly name: string;

  /**
   * Handle a filesystem event from the central watcher.
   *
   * Called for EVERY event from EVERY watched worktree.
   * The adapter is responsible for filtering to relevant events.
   *
   * @param event - The filesystem event to process
   */
  handleEvent(event: WatcherEvent): void;
}
