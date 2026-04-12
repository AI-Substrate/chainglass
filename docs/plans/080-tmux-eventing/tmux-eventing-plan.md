# tmux Eventing System — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-04-09
**Spec**: [tmux-eventing-spec.md](./tmux-eventing-spec.md)
**Status**: COMPLETE

## Summary

When a tmux pane rings the bell (`\a`), the user hears a notification sound and sees a `🔔` flash in the browser tab title. A monitor loop inside the terminal sidecar polls all tmux sessions for state changes (bell, busy/idle, cwd, title), POSTs events to a localhost-only API route, which broadcasts via the existing SSE mux to browser hooks. Only bell triggers user-visible notifications in this version; other events are captured for future use.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| terminal | existing | **modify** | tmux monitor loop in sidecar; event posting |
| _platform/events | existing | **consume** | `sseManager.broadcast()` — no code changes to domain |
| _platform/sdk | existing | **modify** | TitleManager: no code changes needed — `setTitlePrefix`/`clearTitlePrefix` already sufficient |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/064-terminal/server/tmux-monitor.ts` | terminal | internal | New: tmux state polling + event POST logic |
| `apps/web/src/features/064-terminal/server/terminal-ws.ts` | terminal | internal | Modified: start monitor on sidecar boot |
| `apps/web/app/api/tmux/events/route.ts` | terminal | cross-domain | New: localhost-only API route, broadcasts via sseManager |
| `apps/web/src/features/064-terminal/hooks/use-tmux-bell-notification.ts` | terminal | internal | New: browser hook — audio + title flash on bell |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | workspace | cross-domain | Modified: add `'tmux-events'` to WORKSPACE_SSE_CHANNELS |
| `apps/web/public/sounds/bell.wav` | terminal | internal | New: notification sound asset (user-provided) |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Sidecar is a separate process from Next.js — cannot call `sseManager.broadcast()` directly | POST events to a localhost-only API route (like event-popper's `localhostGuard` pattern) |
| 02 | Critical | API routes use `auth()` session cookies — sidecar doesn't have them | Create a localhost-only route without session auth, using `localhostGuard` from event-popper |
| 03 | High | Session→workspace mapping is lossy (sanitized names) | Broadcast to all workspace tabs; client-side filtering by session name match |
| 04 | High | No audio infrastructure exists — Audio API is new to the codebase | Simple `new Audio(url).play().catch(noop)` — degrade gracefully on autoplay block |
| 05 | High | TitleManager has no flash/timer behavior | Use existing `setTitlePrefix`/`clearTitlePrefix` with a `setTimeout` — no TitleManager changes needed |
| 06 | Medium | Existing pane-title poll loop in terminal-ws.ts must not be modified (PL-10) | New monitor is a separate function/module, not coupled to the existing activity log polling |

## Implementation

**Objective**: Raise tmux events to the central event service and play a notification sound + flash the browser tab title on bell events.
**Testing Approach**: Lightweight — minimal validation tests for core functionality; no mocks, real fixtures only.
**Harness**: Not applicable (user override — lightweight tests + manual verification).

### Architecture

```
terminal-ws.ts (sidecar process)
  └─ tmux-monitor.ts
       ├─ polls: tmux list-panes -a -F "..." every 1s
       ├─ tracks: previous state per pane (cmd, title, path, bell, dead, mode)
       └─ on change: POST /api/tmux/events { session, pane, event, data }
                          │
                          ▼
              API route (Next.js process)
                ├─ localhostGuard (no session auth)
                └─ sseManager.broadcast('tmux-events', eventType, payload)
                          │
                          ▼
              Browser (SSE mux → useChannelCallback)
                ├─ useTmuxBellNotification hook
                ├─ filters: event.session matches workspace terminal session
                ├─ plays: /sounds/bell.wav via Audio API
                └─ flashes: setTitlePrefix('bell', '🔔') → setTimeout → clearTitlePrefix('bell')
```

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Create tmux monitor module | terminal | `apps/web/src/features/064-terminal/server/tmux-monitor.ts` | Module exports `startTmuxMonitor(port)` that polls all tmux sessions every 1s, tracks state, and POSTs change events to `http://localhost:{port}/api/tmux/events`. Handles errors gracefully (try/catch per tick, log and continue). Supports all event types: BELL, BUSY_START, BUSY_END, TITLE_CHANGE, DIR_CHANGE, CMD_CHANGE. | Reuse TmuxSessionManager.execCommand for tmux CLI calls. Per finding 06, this is a separate module from the existing pane-title poll loop. |
| [x] | T002 | Create API route for tmux events | terminal | `apps/web/app/api/tmux/events/route.ts` | POST route accepts `{ session, pane, event, data }`, validates localhost origin (reuse `localhostGuard` pattern from event-popper), broadcasts via `sseManager.broadcast('tmux-events', event, payload)`. Returns 200 on success, 400 on bad body, 403 on non-localhost. | Per findings 01+02: sidecar can't access sseManager directly, and doesn't have session auth. |
| [x] | T003 | Add tmux-events to SSE channel list | workspace | `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | `'tmux-events'` appears in `WORKSPACE_SSE_CHANNELS` array. | One-line change. |
| [x] | T004 | Create bell notification hook | terminal | `apps/web/src/features/064-terminal/hooks/use-tmux-bell-notification.ts` | Hook uses `useChannelCallback('tmux-events', handler)`. On BELL event where session matches workspace: (1) plays `/sounds/bell.wav` via `new Audio()`, (2) calls `setTitlePrefix('bell', '🔔')` then `setTimeout(() => clearTitlePrefix('bell'), 5000)`. Handles autoplay failure gracefully. | Per finding 04, degrade to title-only on autoplay block. Audio object can be pre-created and reused. Use `sanitizeSessionName()` from `064-terminal/lib/sanitize-session-name.ts` with the worktree path from `worktreeIdentity` to derive the expected tmux session name, then filter incoming events by matching `event.session`. |
| [x] | T005 | Wire bell notification into workspace layout | workspace | `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` or a new wrapper | The `useTmuxBellNotification` hook is mounted in the workspace layout tree (client component) so it runs on all workspace pages. | Must be inside MultiplexedSSEProvider. Consider a small client wrapper component. |
| [x] | T006 | Add sound file | terminal | `apps/web/public/sounds/bell.mp3` | A valid mp3 file exists at the path and is served by Next.js. | User provided mp3 instead of wav. |
| [x] | T007 | Start monitor from terminal sidecar | terminal | `apps/web/src/features/064-terminal/server/terminal-ws.ts` | After `server.start(wsPort)`, call `startTmuxMonitor(nextPort)` passing the Next.js port. Monitor runs in background, logs startup, does not block sidecar. Sidecar shutdown kills the monitor interval. | Per finding 06 + PL-10: separate from existing pane-title poll. Per risk finding 05: wrap in try/catch so monitor crash doesn't kill sidecar. |
| [x] | T008 | Quality gate | — | — | `just fft` passes: lint clean, typecheck clean, all tests pass. | Pre-existing manifest.json lint error is acceptable. |

### Acceptance Criteria

- [ ] AC-01: Bell (`\a`) in any tmux pane → notification sound plays in browser tabs viewing that workspace
- [ ] AC-02: Bell → browser tab title shows `🔔` prefix that auto-clears after 5 seconds
- [ ] AC-03: Monitor detects bells across ALL tmux sessions, not just the current workspace
- [ ] AC-04: Bell notifications work on any workspace page (browser, terminal, workflows, settings)
- [ ] AC-05: Monitor starts as part of terminal sidecar lifecycle
- [ ] AC-06: Monitor crash doesn't break terminal or UI — graceful degradation
- [ ] AC-07: SSE channel `tmux-events` registered and events flow through existing mux
- [ ] AC-08: All tmux state changes (bell, busy/idle, cwd, title) raised as events
- [ ] AC-09: Wav file at `public/sounds/bell.wav` plays via Audio API
- [ ] AC-10: Title flash doesn't interfere with existing prefix slots (question popper `❗`, attention)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Audio autoplay blocked by browser | Medium | Sound won't play until user interaction | Degrade to title-only flash; pre-create Audio on first user click |
| Session→workspace mapping collision | Low | Wrong workspace gets notified | Client-side session name filtering; broadcast to all, filter locally |
| Monitor crash kills sidecar | Low | Terminal stops working | Wrap monitor in try/catch; log errors, continue polling |
| localhostGuard bypass on shared machine | Very Low | Unauthorized event injection | Same risk as event-popper; accepted for dev tool |
