# Execution Log — Plan 080: tmux Eventing System

**Plan**: `tmux-eventing-plan.md`
**Mode**: Simple
**Started**: 2026-04-09

## Tasks

### T001: Create tmux monitor module
Created `apps/web/src/features/064-terminal/server/tmux-monitor.ts`. Exports `startTmuxMonitor(nextPort)` which polls all tmux sessions via `tmux list-panes -a -F ...` every 1s, tracks per-pane state (cmd, title, path, bell, dead, mode, activity), detects transitions, and POSTs events to `http://localhost:{port}/api/tmux/events`. Uses `execFileSync` directly (not TmuxSessionManager) since it needs `-a` (all sessions) which the manager doesn't support. Graceful error handling: try/catch per tick, empty array on tmux failure.

### T002: Create API route for tmux events
Created `apps/web/app/api/tmux/events/route.ts`. POST route using `localhostGuard` (same pattern as event-popper). Validates body shape and event type, broadcasts via `sseManager.broadcast('tmux-events', event, payload)`. No session auth needed — localhost only.

### T003: Add tmux-events to SSE channel list
Added `'tmux-events'` to `WORKSPACE_SSE_CHANNELS` in workspace layout. One-line change.

### T004: Create bell notification hook
Created `apps/web/src/features/064-terminal/hooks/use-tmux-bell-notification.ts`. Uses `useChannelCallback('tmux-events', handler)`. On BELL event: derives expected tmux session name from workspace context via `sanitizeSessionName(basename)`, filters events by session match, plays `/sounds/bell.mp3` via Audio API, and flashes `🔔` title prefix via `setTitlePrefix`/`clearTitlePrefix` with 5s auto-clear timeout.

### T005: Wire bell notification into workspace layout
Created `apps/web/app/(dashboard)/workspaces/[slug]/tmux-bell-wrapper.tsx` — thin client wrapper mounting `useTmuxBellNotification`. Inserted inside `MultiplexedSSEProvider` in workspace layout, wrapping all content.

### T006: Add sound file
Copied user-provided mp3 to `apps/web/public/sounds/bell.mp3`. Updated hook to use `.mp3` instead of `.wav`.

### T007: Start monitor from terminal sidecar
Added dynamic import of `startTmuxMonitor(nextPort)` to `terminal-ws.ts` CLI entry point, after `server.start()`. Wrapped in try/catch so monitor failure doesn't kill the sidecar.

### T008: Quality gate
- Typecheck: clean
- Tests: 391 files, 5576 passed, 80 skipped
- Lint: clean (pre-existing manifest.json symlink error only)
