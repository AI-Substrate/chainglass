'use client';

/**
 * WindowPicker — the capture-target picker: a "Whole Desktop" (per-screen) section plus a grid of
 * capturable windows to attach (Plan 088 Phase 3 AC-1 + multi-target capture).
 *
 * Pure/presentational: it renders the display + window lists, the states (loading / error /
 * empty / grid) and emits `onAttach(windowId)` / `onAttachDisplay(displayId)`. The data sources are
 * injected (useRemoteViewWindows + useRemoteViewDisplays in Phase 3/multi-target, the routes in
 * Phase 5), so the picker never couples to the daemon.
 *
 * Displays are optional + additive: when `displays` is absent/empty the component renders exactly
 * as before (windows only), so the original AC-1 contract is unchanged. A host with multiple
 * screens gets a tile per screen so it can choose WHICH to stream before attaching.
 */

import { Monitor, MonitorPlay, RefreshCw } from 'lucide-react';
import type { DisplayDescriptor, WindowDescriptor } from '../protocol/messages';

export interface WindowPickerProps {
  windows: WindowDescriptor[];
  loading: boolean;
  error: string | null;
  onAttach: (windowId: number) => void;
  onRefresh: () => void;
  /** Capturable displays (whole-desktop targets). Omit/empty → no screen section (back-compat). */
  displays?: DisplayDescriptor[];
  /** Attach a whole display (screen). Required only when `displays` is non-empty. */
  onAttachDisplay?: (displayId: number) => void;
}

export function WindowPicker({
  windows,
  loading,
  error,
  onAttach,
  onRefresh,
  displays,
  onAttachDisplay,
}: WindowPickerProps) {
  const hasDisplays = !!displays && displays.length > 0;

  return (
    <div className="flex h-full w-full flex-col" data-testid="remote-view-window-picker">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-medium">Pick what to stream</h2>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh windows"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {hasDisplays && (
        <div data-testid="remote-view-display-section" className="px-4 pb-1">
          <h3 className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Whole Desktop
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {/* biome-ignore lint/style/noNonNullAssertion: hasDisplays guards displays is defined */}
            {displays!.map((d) => (
              <li key={`d-${d.id}`}>
                <button
                  type="button"
                  onClick={() => onAttachDisplay?.(d.id)}
                  data-testid={`remote-view-display-${d.id}`}
                  className="flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted"
                >
                  <div className="flex aspect-video items-center justify-center rounded bg-muted text-muted-foreground">
                    <MonitorPlay className="h-8 w-8" />
                  </div>
                  <div
                    className="flex items-center gap-1.5 truncate text-sm font-medium"
                    title={d.label}
                  >
                    <span className="truncate">{d.label}</span>
                    {d.isPrimary && (
                      <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] text-primary">
                        Main
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Entire screen</div>
                  <div className="text-xs text-muted-foreground">
                    {d.pixelWidth}×{d.pixelHeight}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <h3 className="pb-2 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Windows
          </h3>
        </div>
      )}

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
