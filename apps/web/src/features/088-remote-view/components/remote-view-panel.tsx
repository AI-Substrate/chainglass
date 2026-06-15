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
import { useState } from 'react';
import { useRemoteViewWindows } from '../hooks/use-remote-view-windows';
import { WindowPicker } from './window-picker';

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

/**
 * Phase 3 mints the session id client-side (no daemon/route yet); Phase 5 moves
 * session creation server-side via the attach route. The id persists in the `rv`
 * URL param so a browser refresh re-attaches the same session (AC-6).
 */
function mintSessionId(windowId: number): string {
  return `ses_w${windowId.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function RemoteViewPanel({ rv, onPickWindow, onClose }: RemoteViewPanelProps) {
  // slug/worktreePath are consumed by the viewport/service in T004/T005 + Phase 5.
  // F007: the picker is the only place a windowId originates; on a deep-link re-enter
  // (rv from URL, no pick) pickedWindowId stays null and the hook learns it from hello-ok.
  const [pickedWindowId, setPickedWindowId] = useState<number | null>(null);
  const { windows, loading, error, refresh } = useRemoteViewWindows({ enabled: rv == null });

  const handleAttach = (windowId: number) => {
    setPickedWindowId(windowId);
    onPickWindow(mintSessionId(windowId));
  };

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
          <WindowPicker
            windows={windows}
            loading={loading}
            error={error}
            onAttach={handleAttach}
            onRefresh={refresh}
          />
        ) : (
          // T004/T005 replace this with <Viewport session={rv} windowId={pickedWindowId} … />
          <div
            data-testid="remote-view-viewport-slot"
            className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
          >
            Viewport — coming up (T004/T005) · session {rv}
            {pickedWindowId != null ? ` · window ${pickedWindowId}` : ' · (deep-link)'}
          </div>
        )}
      </div>
    </div>
  );
}
