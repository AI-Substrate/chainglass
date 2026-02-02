/**
 * WorkGraph watcher adapter — filters filesystem events for workgraph state changes.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 3
 * Per AC5: Filters for state.json under work-graphs/ and emits WorkGraphChangedEvent
 * Per CF-09: WorkGraphChangedEvent matches old GraphChangedEvent shape
 * Per ADR-02: Self-filtering adapter — receives all events, filters internally
 */

import type { WatcherEvent } from './watcher-adapter.interface.js';
import type { IWatcherAdapter } from './watcher-adapter.interface.js';

/**
 * Domain-specific event emitted when a workgraph state.json file changes.
 *
 * Matches the old GraphChangedEvent shape exactly (CF-09) for trivial consumer migration.
 */
export interface WorkGraphChangedEvent {
  /** Slug of the workgraph that changed — extracted from path: .../work-graphs/{graphSlug}/state.json */
  graphSlug: string;

  /** Slug of the workspace containing this graph — from the WatcherEvent metadata */
  workspaceSlug: string;

  /** Absolute path to the worktree where the change occurred */
  worktreePath: string;

  /** Absolute path to the changed state.json file */
  filePath: string;

  /** Timestamp when the change was detected */
  timestamp: Date;
}

/** Callback type for WorkGraphChangedEvent subscribers */
type GraphChangedCallback = (event: WorkGraphChangedEvent) => void;

/** Regex to match and extract graph slug from state.json paths under work-graphs/ */
const STATE_JSON_REGEX = /work-graphs\/([^/]+)\/state\.json$/;

/**
 * Watcher adapter that filters raw filesystem events for workgraph state.json
 * changes and dispatches domain-specific WorkGraphChangedEvent to subscribers.
 *
 * Implements IWatcherAdapter for registration with CentralWatcherService.
 * Uses callback-set pattern (not EventEmitter) for subscriber management.
 */
export class WorkGraphWatcherAdapter implements IWatcherAdapter {
  readonly name = 'workgraph-watcher';

  private readonly subscribers = new Set<GraphChangedCallback>();

  handleEvent(event: WatcherEvent): void {
    const match = event.path.match(STATE_JSON_REGEX);
    if (!match) {
      return;
    }

    const graphSlug = match[1];
    const changedEvent: WorkGraphChangedEvent = {
      graphSlug,
      workspaceSlug: event.workspaceSlug,
      worktreePath: event.worktreePath,
      filePath: event.path,
      timestamp: new Date(),
    };

    for (const callback of this.subscribers) {
      try {
        callback(changedEvent);
      } catch (error) {
        // Error isolation: one throwing subscriber must not block others
        console.warn(`[${this.name}] Subscriber callback threw`, {
          graphSlug: changedEvent.graphSlug,
          workspaceSlug: changedEvent.workspaceSlug,
          error,
        });
      }
    }
  }

  onGraphChanged(callback: GraphChangedCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }
}
