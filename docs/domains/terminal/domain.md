# Domain: Terminal

**Slug**: terminal
**Type**: business
**Created**: 2026-03-02
**Created By**: Plan 064 — tmux terminal integration
**Status**: active

> **Authoritative domain specification**: [`apps/web/src/features/064-terminal/domain.md`](../../../apps/web/src/features/064-terminal/domain.md)
>
> This file is a summary pointer. Do not duplicate contracts, composition, or source listings here — see the feature-level domain doc for full details.

## Purpose

Workspace-scoped terminal access via tmux. Users open terminal sessions for worktrees, run commands, monitor builds, and interact with the system — all within the browser. Sessions persist across page refreshes and browser restarts via tmux.

## Quick Reference

- **Surface 1**: Terminal page at `/workspaces/[slug]/terminal`
- **Surface 2**: Right-edge overlay panel (toggle via `Ctrl+\`` or sidebar button)
- **Backend**: Sidecar WebSocket server (node-pty + tmux), port = NEXT_PORT + 1500
- **Key contracts**: `TerminalView`, `TerminalOverlayPanel`, `useTerminalOverlay()`, `copyTmuxBuffer()`, `createTerminalServer()`
- **Source**: `apps/web/src/features/064-terminal/`
- **Tests**: `test/unit/web/features/064-terminal/` + `test/fakes/fake-pty.ts`, `fake-tmux-executor.ts`

## Dependencies

| Depends On | Contract Used |
|-----------|-------------|
| _platform/panel-layout | PanelShell, PanelMode |
| _platform/events | sonner toast |
| _platform/sdk | registerCommand, registerKeybinding |
| _platform/workspace-url | workspaceHref() |
| activity-log | appendActivityLogEntry(), shouldIgnorePaneTitle() |
| _platform/auth | activeSigningSecret(cwd), findWorkspaceRoot(), verifyCookieValue(), BOOTSTRAP_COOKIE_NAME (Plan 084 Phase 4) |
| _platform/external-events | readServerInfo() — port discovery for the WS sidecar's default Origin allowlist (Plan 084 Phase 4) |

activity-log depends on terminal as an event source (terminal sidecar polls tmux and writes activity entries).

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 064 Phase 1 | Sidecar WS server, tmux session manager, types, fakes | 2026-03-02 |
| 064 Phase 2 | TerminalView, WS hook, status badge, skeleton | 2026-03-02 |
| 064 Phase 3 | Terminal page, session list, API route, nav item | 2026-03-02 |
| 064 Phase 4 | Overlay panel, provider, SDK command, sidebar button | 2026-03-03 |
| 064 Post-P4 | Copy buffer (deferred clipboard), HTTPS/WSS, ESM fix | 2026-03-03 |
| 065 Phase 2 | getPaneTitles() multi-pane method, activity log integration, pane title badge removal | 2026-03-06 |
| 064 Phase 5 | tmux fallback toast, domain docs, dev setup guide | 2026-03-03 |
| 065 Phase 3 | Added overlay:close-all mutual exclusion to TerminalOverlayProvider | 2026-03-06 |
| Plan 078 | Removed copilot status bar and window badges from overlay panel | 2026-04-08 |
| Plan 079 | TerminalPageClient sets worktreeIdentity with pageTitle 'Terminal' for tab title | 2026-04-08 |
| Plan 080 | tmux eventing: monitor polls all sessions, POSTs events to API route; bell hook plays sound + flashes title | 2026-04-09 |
| Plan 081 | 25 terminal color themes via SDK setting + Palette popover picker in header | 2026-04-10 |
| 084 Phase 4 | Closed silent-bypass (`authEnabled = true` always); switched to `activeSigningSecret(findWorkspaceRoot)`; JWT now carries `iss=chainglass` / `aud=terminal-ws` / `cwd` claims; Origin allowlist (with TERMINAL_WS_ALLOWED_ORIGINS opt-in for remote dev); startup assertion on missing `bootstrap-code.json`; new pure module `terminal-auth.ts` to keep route handlers free of sidecar deps. | 2026-05-03 |
| 084 Phase 7 | Operator documentation now reflects this domain's `_platform/auth` dependency: `docs/how/auth/bootstrap-code.md` § 8.3 documents the CSWSH defence (Origin allowlist) + JWT iss/aud/cwd binding; `docs/how/auth/migration-bootstrap-code.md` § (a) explains the behaviour change (terminal-WS auth always on; previously bypassed when `AUTH_SECRET` unset); the `terminal → _platform/auth` edge in `docs/domains/domain-map.md` is verified + carries Plan-084 attribution comments. No code changes in this domain — this is documentation/audit only. | 2026-05-03 |
| Plan 084 split-terminal-view | Added inline consumer surface (`file-browser` browse page) attaching to the shared worktree session via the existing `TerminalView` contract. Added a one-shot `{type:'resync'}` send in `terminal-inner.tsx` after the first WS `connected` event (re-armed on reconnect) so tmux refreshes geometry for newly-attached clients regardless of prior attached-client size. State machine extracted to `lib/resync-on-connect.ts` as `applyResyncOnStatus(status, ref, send)` — pure, testable. Cross-domain edit policy satisfied (5 criteria documented in plan; reviewer dual sign-off required on PR). | 2026-05-19 |
| Plan 084 FX012 (singleton xterm) | Introduced `TerminalSingletonProvider` + `TerminalViewport` primitives: one `<TerminalInner>` mounted at the workspace `[slug]` layout, reparented via `appendChild` into three viewport slots (`overlay`, `inline-3rd`, `terminal-page`). `TerminalOverlayPanel` and `TerminalPageClient` swap their direct xterm mounts for `<TerminalViewport id="..." active={...} />`; `useTerminalOverlay` public API unchanged. Singleton owns the WS / scrollback / tmux client so backtick toggles + split toggles + cross-page nav preserve state across the desktop tree. Lazy-mount: WS doesn't connect until the first viewport activates. Mobile path (`MobilePanelShell` Terminal tab) keeps its own `TerminalView`. Context value extended with `connectionStatus` so consumers can render the badge. | 2026-05-21 |
| FX001 (PTY teardown) | Deterministic PTY teardown in `server/terminal-ws.ts` (+ new `server/pty-registry.ts`) — stops the macOS `/dev/ttys*` leak that exhausted `kern.tty.ptmx_max`. Idempotent `disposePty` + missing `ws.on('error')`; force-kill `cleanup()` on SIGTERM/SIGINT/SIGHUP/beforeExit; per-listen-port startup reaper for `tmux attach` clients orphaned by a hard-killed sidecar (ps-guarded vs PID reuse; never `kill-session`, so sessions persist); max-PTY ceiling. Optional internal `killProcess` seam on `TerminalServerDeps`; no consumer-facing contract change. | 2026-06-03 |
