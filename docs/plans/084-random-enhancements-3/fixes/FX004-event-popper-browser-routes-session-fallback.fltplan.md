# Flight Plan: Fix FX004 — Event-popper browser routes need session-auth fallback

**Fix**: [FX004-event-popper-browser-routes-session-fallback.md](./FX004-event-popper-browser-routes-session-fallback.md)
**Status**: Proposed (not started)

## What → Why

**Problem**: Plan 084 Phase 5 T002 applied `requireLocalAuth` to all `/api/event-popper/*` routes, but 6 of them are browser-shared (consumed by `QuestionPopperProvider`). Remote/LAN browsers with valid bootstrap cookies now get 403 because `requireLocalAuth` rejects non-loopback before checking the cookie.

**Fix**: Add `requireLocalOrSessionAuth(req)` that falls through to bootstrap-cookie validation when not on localhost. Swap the 6 browser-shared event-popper routes to the new helper. Keep strict `requireLocalAuth` on the 3 CLI-only sinks (`ask-question`, `send-alert`, `tmux/events`).

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/auth` | modify (additive) | New `requireLocalOrSessionAuth` helper |
| `event-popper` | modify (call-site swap) | 6 routes swap helper; 3 CLI-only sinks unchanged |

## Stages

- [ ] FX004-1: Add `requireLocalOrSessionAuth` helper + unit tests
- [ ] FX004-2: Swap 6 browser-shared routes to new helper
- [ ] FX004-3: Add integration test for remote-browser + valid cookie → 200
- [ ] FX004-4: Update `_platform/auth/domain.md` § Concepts + History

## Acceptance

- [ ] Remote-host browser fetch of `/api/event-popper/list` with valid bootstrap cookie returns 200 (not 403)
- [ ] CLI-only sinks still 403 non-loopback callers
- [ ] All 4 LocalAuthResult reasons exercised in unit tests
- [ ] No vi.mock of own-domain internals (Constitution P4)
