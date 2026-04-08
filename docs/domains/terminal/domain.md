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
