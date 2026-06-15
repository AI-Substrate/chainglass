'use client';

/**
 * RemoteViewPanel — the remote-view content-area mode (Plan 088, Workshop 001).
 *
 * Mounted lazily by browser-client.tsx when `view=remote` (mirrors the RecentFeedView
 * precedent). It is the orchestrator for the mode:
 *   - no `rv` session yet  → the window picker (T003)
 *   - `rv` session active   → the streaming viewport (T004/T005)
 *
 * All data flows through the Phase 2 surface (IRemoteViewService via DI, the
 * useRemoteViewSession hook, the frame-replay fake) — no daemon (AC-12). The panel
 * is daemon-agnostic so Phase 5 can swap the fake-backed service for the real one
 * without touching this component.
 *
 * F007: `rv` arrives from the URL; when re-entering a session by deep link we do NOT
 * synthesise a windowId — the hook learns it from `hello-ok`. The picker is the only
 * place a windowId originates (it flows out via onPickWindow → `rv`).
 */

import { X } from 'lucide-react';

export interface RemoteViewPanelProps {
  /** Workspace slug (for scoping routes/service calls). */
  slug: string;
  /** Active worktree path (workspace scoping). */
  worktreePath: string;
  /** Active remote-view session id from the `rv` URL param, or `null` (show picker). */
  rv: string | null;
  /** Picker attached a window → carries the new session id up to set `rv`. */
  onPickWindow: (sessionId: string) => void;
  /** Close the mode (clears `view` + `rv`, returns to file/dir view). */
  onClose: () => void;
}

export function RemoteViewPanel({ rv, onClose }: RemoteViewPanelProps) {
  // slug/worktreePath/onPickWindow are consumed in T003 (picker) and T004/T005 (viewport).
  return (
    <div className="flex h-full w-full flex-col" data-testid="remote-view-panel">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium text-muted-foreground">Remote View</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close remote view"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        {rv == null ? (
          // T003 replaces this with <WindowPicker slug … onAttach={onPickWindow} />
          <div
            data-testid="remote-view-picker-slot"
            className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
          >
            Window picker — coming up (T003)
          </div>
        ) : (
          // T004/T005 replace this with <Viewport session={rv} … />
          <div
            data-testid="remote-view-viewport-slot"
            className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
          >
            Viewport — coming up (T004/T005) · session {rv}
          </div>
        )}
      </div>
    </div>
  );
}
