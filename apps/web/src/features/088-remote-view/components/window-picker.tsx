'use client';

/**
 * WindowPicker — grid of capturable windows to attach (Plan 088 Phase 3, AC-1).
 *
 * Pure/presentational: it renders the window list + states (loading / error /
 * empty / grid) and emits `onAttach(windowId)`. The data source is injected
 * (useRemoteViewWindows in Phase 3, the route in Phase 5), so the picker never
 * couples to the daemon — Phase 5 swaps the loader with zero picker changes.
 *
 * Thumbnails are a Phase 5 affordance (the `/windows` route returns one-shot
 * thumbnails); Phase 3 shows a placeholder tile keyed by app.
 */

import { Monitor, RefreshCw } from 'lucide-react';
import type { WindowDescriptor } from '../protocol/messages';

export interface WindowPickerProps {
  windows: WindowDescriptor[];
  loading: boolean;
  error: string | null;
  onAttach: (windowId: number) => void;
  onRefresh: () => void;
}

export function WindowPicker({ windows, loading, error, onAttach, onRefresh }: WindowPickerProps) {
  return (
    <div className="flex h-full w-full flex-col" data-testid="remote-view-window-picker">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-medium">Pick a window to stream</h2>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh windows"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div
          data-testid="remote-view-window-picker-loading"
          className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        >
          Loading windows…
        </div>
      ) : error ? (
        <div
          data-testid="remote-view-window-picker-error"
          role="alert"
          className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <span>Couldn't load windows: {error}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border px-2 py-1 hover:bg-muted"
          >
            Retry
          </button>
        </div>
      ) : windows.length === 0 ? (
        <div
          data-testid="remote-view-window-picker-empty"
          className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        >
          No capturable windows.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 overflow-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
          {windows.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onAttach(w.id)}
                data-testid={`remote-view-window-${w.id}`}
                className="flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted"
              >
                <div className="flex aspect-video items-center justify-center rounded bg-muted text-muted-foreground">
                  <Monitor className="h-8 w-8" />
                </div>
                <div className="truncate text-sm font-medium" title={w.app}>
                  {w.app}
                </div>
                <div className="truncate text-xs text-muted-foreground" title={w.title}>
                  {w.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {w.pixelWidth}×{w.pixelHeight}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
