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

import { Lock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRemoteViewDisplays } from '../hooks/use-remote-view-displays';
import { useRemoteViewHealth } from '../hooks/use-remote-view-health';
import { useRemoteViewWindows } from '../hooks/use-remote-view-windows';
import { PermissionPreflightCard } from './permission-preflight-card';
import { missingGrants } from './permissions-ux';
import { buildStreamUrl } from './stream-url';
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

/** A picked capture target — a window OR a whole display (multi-target capture). The numeric `id`
 *  is the CGWindowID or CGDirectDisplayID; `kind` decides the `/token` param + the daemon env. */
type PickedTarget = { kind: 'window'; id: number } | { kind: 'display'; id: number };

/**
 * Phase 3 mints the session id client-side (no daemon/route yet); Phase 5 moves
 * session creation server-side via the attach route. The id persists in the `rv`
 * URL param so a browser refresh re-attaches the same session (AC-6). The `w`/`d`
 * prefix records the target kind so the id is human-distinguishable in the URL.
 */
function mintSessionId(target: PickedTarget): string {
  const prefix = target.kind === 'display' ? 'd' : 'w';
  return `ses_${prefix}${target.id.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function RemoteViewPanel({
  rv,
  onPickWindow,
  onReturnToPicker,
  onClose,
}: RemoteViewPanelProps) {
  // slug/worktreePath are consumed by the viewport/service in T004/T005 + Phase 5.
  // F007: the picker is the only place a target originates; on a deep-link re-enter
  // (rv from URL, no pick) pickedTarget stays null and the hook learns it from hello-ok.
  const [pickedTarget, setPickedTarget] = useState<PickedTarget | null>(null);
  const {
    windows,
    loading,
    error,
    code: windowsCode,
    refresh,
  } = useRemoteViewWindows({
    enabled: rv == null,
  });
  // Multi-target capture: the picker's "Whole Desktop" section. Loads alongside the windows.
  const {
    displays,
    code: displaysCode,
    refresh: refreshDisplays,
  } = useRemoteViewDisplays({ enabled: rv == null });
  // AC-14 preflight: read the daemon's TCC grants while the picker is shown so a missing grant is
  // named up front (a card), not discovered as a black frame. Non-blocking — the picker loads either way.
  const health = useRemoteViewHealth({ enabled: rv == null });
  const missing = health.permissions ? missingGrants(health.permissions) : [];
  // Host-locked guard: a locked Mac returns a stale/empty SCK set, so the catalogs come back empty
  // and the picker would look like "no windows" with no hint why. The one-shots flag it (exit 4 →
  // `E_LOCKED` → 423); flip to an explicit "unlock the host" card so the cause — and the fix — is
  // obvious. Either catalog reporting it is enough (they share the same lock check).
  const hostLocked = windowsCode === 'E_LOCKED' || displaysCode === 'E_LOCKED';
  const recheck = () => {
    health.refresh();
    refresh();
    refreshDisplays();
  };

  // The Viewport hook appends `/stream?session=…&token=…` and re-mints a fresh JWT per connect;
  // here we resolve the BASE url for the context (T001 + T003):
  //   - HTTPS page → same-origin `wss://host/<path>` bridged to the loopback daemon by a reverse
  //     proxy (Caddy) — no daemon port needed client-side (T003, INS-003).
  //   - http://localhost → the daemon's loopback port from `/token` (registry, via ensureDaemon)
  //     → `ws://127.0.0.1:<port>` direct (T001, DL-005).
  // `null` = still resolving; `daemonUnreachable` → the daemon couldn't be reached on localhost.
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [daemonUnreachable, setDaemonUnreachable] = useState(false);

  // This effect resolves the WS url ONCE per session transition — it must fire on `rv` only.
  // `pickedTarget` is set synchronously in the same click that flips `rv` (handleAttach*), so it is
  // already current when the effect runs; adding it would re-fetch `/token` on unrelated target
  // churn and defeat the deep-link reuse path.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire on `rv` only (see note above)
  useEffect(() => {
    if (rv == null) return; // picker mode — no socket, no port needed yet
    let cancelled = false;
    setWsUrl(null);
    setDaemonUnreachable(false);
    const { protocol, host } = window.location;

    // HTTPS: the reverse proxy bridges same-origin wss → loopback daemon; no `/token` port needed.
    if (protocol === 'https:') {
      setWsUrl(buildStreamUrl({ protocol, host }));
      return;
    }

    // http://localhost: connect directly to the loopback daemon, whose port comes from `/token`.
    // Pass the picked target so the daemon is spawned CAPTURING it (one-target-per-spawn) — a window
    // via `?windowId=` or a whole display via `?displayId=`. On a deep-link re-enter (rv from URL, no
    // pick yet) we omit both and reuse a running daemon.
    void (async () => {
      try {
        const tokenUrl =
          pickedTarget == null
            ? '/api/remote-view/token'
            : pickedTarget.kind === 'display'
              ? `/api/remote-view/token?displayId=${pickedTarget.id}`
              : `/api/remote-view/token?windowId=${pickedTarget.id}`;
        const res = await fetch(tokenUrl);
        if (!res.ok) throw new Error(`token ${res.status}`);
        const { daemonPort } = (await res.json()) as { daemonPort?: number };
        if (cancelled) return;
        const url = buildStreamUrl({ protocol, host, daemonPort });
        if (url) setWsUrl(url);
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
    const target: PickedTarget = { kind: 'window', id: windowId };
    setPickedTarget(target);
    onPickWindow(mintSessionId(target));
  };

  const handleAttachDisplay = (displayId: number) => {
    const target: PickedTarget = { kind: 'display', id: displayId };
    setPickedTarget(target);
    onPickWindow(mintSessionId(target));
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
          hostLocked ? (
            <div
              data-testid="remote-view-host-locked"
              className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground"
            >
              <Lock className="h-8 w-8" />
              <div className="font-medium text-foreground">The host Mac is locked</div>
              <div className="max-w-sm text-xs">
                macOS won't let the streamer see the screen while the host is locked, so there are
                no windows or displays to pick. Unlock the host Mac, then re-check.
              </div>
              <button
                type="button"
                onClick={recheck}
                className="rounded border px-3 py-1 text-foreground hover:bg-muted"
              >
                Re-check
              </button>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col">
              <PermissionPreflightCard missing={missing} onRecheck={recheck} />
              <div className="min-h-0 flex-1">
                <WindowPicker
                  windows={windows}
                  loading={loading}
                  // Only the WINDOW load error blanks the grid — a displays-only failure must not
                  // hide windows (displays are additive/optional; the locked case is handled above).
                  error={error}
                  onAttach={handleAttach}
                  onRefresh={recheck}
                  displays={displays}
                  onAttachDisplay={handleAttachDisplay}
                />
              </div>
            </div>
          )
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
          <Viewport
            url={wsUrl}
            session={rv}
            windowId={pickedTarget?.id ?? null}
            onExit={onReturnToPicker}
          />
        )}
      </div>
    </div>
  );
}
