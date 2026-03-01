/**
 * Work unit catalog watcher adapter — filters filesystem events for unit catalog changes.
 *
 * Emits events when unit.yaml or template files change in .chainglass/units/.
 * Per Plan 058 Phase 4: Change Notifications & Workflow Integration.
 * Per ADR-02: Self-filtering adapter — receives all events, filters internally.
 * Per DYK #5: Placed alongside existing adapters in 023-central-watcher-notifications.
 */

import type { IWatcherAdapter, WatcherEvent } from './watcher-adapter.interface.js';

export interface UnitCatalogChangedEvent {
  unitSlug: string;
  workspaceSlug: string;
  worktreePath: string;
  filePath: string;
  timestamp: Date;
}

type UnitCatalogChangedCallback = (event: UnitCatalogChangedEvent) => void;

/** Match unit.yaml or template files in units/{slug}/ */
const UNIT_FILE_REGEX = /units\/([^/]+)\/(unit\.yaml|templates\/.+)$/;

export class WorkUnitCatalogWatcherAdapter implements IWatcherAdapter {
  readonly name = 'workunit-catalog-watcher';

  private readonly subscribers = new Set<UnitCatalogChangedCallback>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEvent: UnitCatalogChangedEvent | null = null;

  constructor(private readonly debounceMs = 200) {}

  handleEvent(event: WatcherEvent): void {
    const match = event.path.match(UNIT_FILE_REGEX);
    if (!match) return;

    const unitSlug = match[1];
    this.debounce({
      unitSlug,
      workspaceSlug: event.workspaceSlug,
      worktreePath: event.worktreePath,
      filePath: event.path,
      timestamp: new Date(),
    });
  }

  onUnitChanged(callback: UnitCatalogChangedCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private debounce(event: UnitCatalogChangedEvent): void {
    this.pendingEvent = event;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (this.pendingEvent) {
        this.dispatch(this.pendingEvent);
        this.pendingEvent = null;
      }
    }, this.debounceMs);
  }

  private dispatch(event: UnitCatalogChangedEvent): void {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (error) {
        console.warn(`[${this.name}] Subscriber callback threw`, {
          unitSlug: event.unitSlug,
          error,
        });
      }
    }
  }
}
