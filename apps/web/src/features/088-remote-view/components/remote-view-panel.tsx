'use client';

/**
 * RemoteViewPanel — the remote-view content-area mode (Plan 088, Workshop 001).
 *
 * Mounted lazily by browser-client.tsx when `view=remote` (mirrors the RecentFeedView
 * precedent). It is the orchestrator for the mode:
 *   - no `rv` session yet  → the window picker (T003)
 *   - `rv` session active   → the streaming viewport (T004/T005)
 *
 * Data flows through the Phase 2 surface — the `useRemoteViewSession` WS hook (video +
 * telemetry planes) and the `useRemoteViewWindows` loader — against the frame-replay
 * fake, no daemon (AC-12). There is NO client DI; `IRemoteViewService` is server-side,
 * so Phase 5 swaps the fake-backed loader/routes for the real ones without touching this.
 *
 * F007: `rv` arrives from the URL; when re-entering a session by deep link we do NOT
 * synthesise a windowId — the hook learns it from `hello-ok`. The picker is the only
 * place a windowId originates (it flows out via onPickWindow → `rv`).
 */

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRemoteViewWindows } from '../hooks/use-remote-view-windows';
import { Viewport } from './viewport';
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
  /** Return to the window picker (clears `rv`, keeps `view=remote`). */
  onReturnToPicker: () => void;
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

export function RemoteViewPanel({
  rv,
  onPickWindow,
  onReturnToPicker,
  onClose,
}: RemoteViewPanelProps) {
  // slug/worktreePath are consumed by the viewport/service in T004/T005 + Phase 5.
  // F007: the picker is the only place a windowId originates; on a deep-link re-enter
  // (rv from URL, no pick) pickedWindowId stays null and the hook learns it from hello-ok.
  const [pickedWindowId, setPickedWindowId] = useState<number | null>(null);
  const { windows, loading, error, refresh } = useRemoteViewWindows({ enabled: rv == null });

  // T001 (Phase 6, DL-005): the daemon's loopback port comes from `/token` (which reads it from
  // the registry via ensureDaemon). The browser builds the real `ws://127.0.0.1:<port>` base url
  // from it; the Viewport hook appends `/stream?session=…&token=…` and fetches a fresh JWT per
  // connect. `null` = still resolving; `''`-error → the daemon couldn't be reached.
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [daemonUnreachable, setDaemonUnreachable] = useState(false);

  useEffect(() => {
    if (rv == null) return; // picker mode — no socket, no port needed yet
    let cancelled = false;
    setWsUrl(null);
    setDaemonUnreachable(false);
    void (async () => {
      try {
        const res = await fetch('/api/remote-view/token');
        if (!res.ok) throw new Error(`token ${res.status}`);
        const { daemonPort } = (await res.json()) as { daemonPort?: number };
        if (cancelled) return;
        if (typeof daemonPort === 'number') setWsUrl(`ws://127.0.0.1:${daemonPort}`);
        else setDaemonUnreachable(true); // token issued but daemon couldn't be brought up
      } catch {
        if (!cancelled) setDaemonUnreachable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rv]);

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
        ) : daemonUnreachable ? (
          <div
            data-testid="remote-view-daemon-unreachable"
            className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black p-6 text-center text-sm text-white/80"
          >
            <div className="font-medium">Streamer not reachable</div>
            <div className="text-xs text-white/60">
              The host streamer (streamd) could not be started. Check that the bundle is installed (
              <code>just streamd-install</code>) and Screen Recording is granted.
            </div>
            <button
              type="button"
              onClick={onReturnToPicker}
              className="rounded border border-white/30 px-3 py-1 text-white hover:bg-white/10"
            >
              Back to windows
            </button>
          </div>
        ) : wsUrl == null ? (
          <div
            data-testid="remote-view-connecting"
            className="flex h-full w-full items-center justify-center bg-black text-sm text-white/70"
          >
            Connecting to streamer…
          </div>
        ) : (
          <Viewport url={wsUrl} session={rv} windowId={pickedWindowId} onExit={onReturnToPicker} />
        )}
      </div>
    </div>
  );
}
