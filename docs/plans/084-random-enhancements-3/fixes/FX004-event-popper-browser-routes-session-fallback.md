# Fix FX004: Event-popper browser routes need session-auth fallback

**Created**: 2026-05-03
**Status**: Proposed (not started)
**Plan**: [auth-bootstrap-code-plan.md](../auth-bootstrap-code-plan.md)
**Source**: minih code-review run `2026-05-03T15-04-...` (round 4 of Phase 7), F001 HIGH
**Domain(s)**: `_platform/auth` (composite-auth contract); `event-popper` (route-handler call sites)

---

## Problem

Plan 084 Phase 5 T002 applied `requireLocalAuth()` to ALL `/api/event-popper/*` routes — closing Finding 02 (any loopback process could post). That was the right fix for the **CLI sinks** (`ask-question`, `send-alert`, `tmux/events`), but `requireLocalAuth` rejects non-loopback callers with `403 not-localhost` BEFORE attempting any cookie or session validation.

Six of those routes are also fetched **from the browser** by `QuestionPopperProvider` (mounted in `app/(dashboard)/workspaces/[slug]/question-popper-overlay-wrapper.tsx`):

| Route | Browser fetch site (`apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx`) |
|---|---|
| `GET /api/event-popper/list` | line 122 |
| `POST /api/event-popper/answer-question/[id]` | line 189 |
| `POST /api/event-popper/dismiss/[id]` | line 206 |
| `POST /api/event-popper/clarify/[id]` | line 219 |
| `POST /api/event-popper/acknowledge/[id]` | line 236 |
| `GET /api/event-popper/question/[id]` | line 251 |

The route-helper file at `apps/web/src/features/067-question-popper/lib/route-helpers.ts` lines 201/216/251/283/299/322 explicitly comments these as "**— shared**" (browser + CLI).

**Reproduced in-process by the minih agent**: `GET /api/event-popper/list` from a remote-host request returned `403 {"error":"not-localhost"}` even with a valid bootstrap cookie + `DISABLE_GITHUB_OAUTH=true`. So any LAN/proxied/remote workspace session loses the question-popper UI entirely.

The two CLI-only sinks (`ask-question`, `send-alert`) and the tmux-event sink (`tmux/events`) are correctly localhost-only — they should keep the strict `requireLocalAuth` gate.

## Proposed Fix

Introduce a composite helper `requireLocalOrSessionAuth(req)` in `apps/web/src/lib/local-auth.ts` (or a sibling file) that:

1. If the request is localhost → delegate to `requireLocalAuth(req)` (same composite cookie/X-Local-Token behaviour as today).
2. Else (non-loopback) → fall through to the bootstrap-cookie path: if the bootstrap cookie verifies, accept as `{ ok: true, via: 'cookie' }`; otherwise reject as `{ ok: false, reason: 'no-credential' | 'bad-credential' }`.

The OAuth chain (`auth()`) is **not** added here — Plan 084's contract is the bootstrap-cookie, not session auth. Browser fetches from a remote host that have completed the bootstrap popup carry the cookie, so they pass cleanly.

Update the six **browser-shared** event-popper routes to use `requireLocalOrSessionAuth`. Keep the strict `requireLocalAuth` on:

- `POST /api/event-popper/ask-question`
- `POST /api/event-popper/send-alert`
- `POST /api/tmux/events`

Add an integration test that exercises a remote-host request to `/api/event-popper/list` with only the bootstrap cookie → must return 200 (or whatever the route's success shape is) instead of 403.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/auth` | **modify (additive contract)** | New helper `requireLocalOrSessionAuth(req)` in `apps/web/src/lib/local-auth.ts`. `requireLocalAuth` itself is unchanged (CLI sinks still use it). `domain.md` § Concepts gains one row for the composite. |
| `event-popper` | **modify (call-site swap)** | Six browser-shared routes swap `requireLocalAuth` → `requireLocalOrSessionAuth`. Three CLI-only routes (`ask-question`, `send-alert`, `tmux/events`) keep `requireLocalAuth`. |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX004-1 | Add `requireLocalOrSessionAuth` helper that falls through to bootstrap-cookie validation when not on localhost | `_platform/auth` | `apps/web/src/lib/local-auth.ts` | Helper exists with discriminated-union return; unit tests cover localhost-pass, localhost-fail, remote+valid-cookie, remote+invalid-cookie, remote+no-cookie | Follows `LocalAuthResult` pattern — share or extend the discriminator |
| [ ] | FX004-2 | Swap browser-shared event-popper routes to the new helper | event-popper | `apps/web/app/api/event-popper/{list,question/[id],answer-question/[id],dismiss/[id],clarify/[id],acknowledge/[id]}/route.ts` | All 6 routes import `requireLocalOrSessionAuth`; CLI sinks (`ask-question`, `send-alert`) keep `requireLocalAuth` | Single-line import + call swap each |
| [ ] | FX004-3 | Add integration test: remote-host fetch of `/api/event-popper/list` with valid bootstrap cookie returns 200 (not 403) | event-popper | `test/integration/web/event-popper-remote-browser.integration.test.ts` (new file) | Test passes; round-3 minih repro is now green | Use Phase 7's `setupBootstrapTestEnv` + a `NextRequest` with non-loopback XFF + valid bootstrap cookie |
| [ ] | FX004-4 | Update `_platform/auth/domain.md` § Concepts with the new helper row + History entry | `_platform/auth` | `docs/domains/_platform/auth/domain.md` | Concepts table has a row for "Gate a route that allows both localhost+token AND browser+cookie"; History row added | Mirror Phase 5 T002 row format |

## Acceptance

- [ ] Browser fetches from a non-loopback host (with valid bootstrap cookie) succeed against the 6 shared event-popper routes.
- [ ] CLI-only sinks (`ask-question`, `send-alert`, `tmux/events`) still 403 non-loopback callers (regression guard kept).
- [ ] All 4 reasons in the discriminated union are exercised in unit tests.
- [ ] No new vi.mocks of own-domain internals (Constitution P4).

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
