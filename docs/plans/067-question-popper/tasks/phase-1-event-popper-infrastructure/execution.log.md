# Phase 1: Event Popper Infrastructure — Execution Log

**Phase**: Phase 1: Event Popper Infrastructure (`_platform/external-events`)
**Started**: 2026-03-07T05:52:00Z
**Status**: Complete

---

## T001: Zod Envelope Schemas
**Started**: 2026-03-07T05:52:00Z | **Completed**: 2026-03-07T05:55:00Z
Created `packages/shared/src/event-popper/schemas.ts` with `EventPopperRequestSchema` and `EventPopperResponseSchema`. Both use `.strict()`. Discovery: Zod v4 requires `z.record(z.string(), z.unknown())` — the single-arg `z.record(z.unknown())` crashes with `_zod` undefined error.

## T002: GUID Generation
**Completed**: 2026-03-07T05:55:00Z
Created `packages/shared/src/event-popper/guid.ts`. Format: `{ISO-timestamp}_{6-char-hex}` with colons replaced by hyphens.

## T003: Port Discovery
**Completed**: 2026-03-07T05:56:00Z
Created `packages/shared/src/event-popper/port-discovery.ts`. Includes PID liveness check and PID recycling guard (startedAt timestamp cross-check).

## T004: Server Boot Hook
**Completed**: 2026-03-07T05:57:00Z
Modified `apps/web/instrumentation.ts`. Writes `server.json` after `startCentralNotificationSystem()`. SIGTERM/SIGINT cleanup. globalThis HMR guard.

## T005: Localhost Guard
**Completed**: 2026-03-07T05:57:00Z
Created `apps/web/src/lib/localhost-guard.ts`. Rejects X-Forwarded-For. Checks request.ip for loopback. Updated `proxy.ts` matcher to exclude `api/event-popper`.

## T006: Tmux Detection
**Completed**: 2026-03-07T05:58:00Z
Created `packages/shared/src/utils/tmux-context.ts`. Verified live: session="067-question-popper", window="0", pane="%31".

## T007: SSE Channel
**Completed**: 2026-03-07T05:58:00Z
Added `EventPopper: 'event-popper'` to `WorkspaceDomain` in `workspace-domain.ts`.

## T008: Unit Tests
**Completed**: 2026-03-07T06:00:00Z
Created `test/unit/event-popper/infrastructure.test.ts`. 22/22 tests pass (schemas, GUID, port discovery, tmux).

## T009: Barrel Exports + Domain Doc
**Completed**: 2026-03-07T06:02:00Z
Created `packages/shared/src/event-popper/index.ts` barrel. Created `docs/domains/_platform/external-events/domain.md`.

---

## Discoveries

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-03-07 | T001 | gotcha | Zod v4 `z.record(z.unknown())` crashes — must use `z.record(z.string(), z.unknown())` | Fixed by adding explicit key type |

