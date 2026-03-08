# Execution Log: Phase 1 — Server Foundation

**Plan**: 072-sse-multiplexing
**Phase**: Phase 1: Server Foundation
**Started**: 2026-03-08
**Completed**: 2026-03-08

---

## T001: Add channel to broadcast payload
- **File**: `apps/web/src/lib/sse-manager.ts` (line 75-78)
- **Change**: Added `channel: channelId` to both object-spread and primitive payload branches
- **Comment**: Added "channel is authoritative — overwrites any caller-provided value" per DYK-03
- **Evidence**: 19/19 SSEManager tests pass (existing format test updated in T005)

## T002: Add removeControllerFromAllChannels method
- **File**: `apps/web/src/lib/sse-manager.ts` (new method, ~18 lines)
- **Design**: Snapshots Map entries before iteration, scans all channels, cleans up empty Sets, returns removed channel names
- **Complexity**: O(channels) — documented in code comment per DYK decision
- **Evidence**: 5 dedicated tests in T005 cover all paths

## T003: Extend ServerEvent type
- **File**: `apps/web/src/lib/state/server-event-router.ts` (line 22)
- **Change**: Added `channel?: string` with JSDoc to ServerEvent interface
- **Impact**: Non-breaking — optional field, existing consumers unaffected
- **Evidence**: All 5149 tests pass

## T004: Create /api/events/mux route
- **File**: `apps/web/app/api/events/mux/route.ts` (new, ~110 lines)
- **Features**: Auth check, channel parsing/dedup/validation, multi-channel registration, 15s heartbeat (DEV-03), atomic cleanup via removeControllerFromAllChannels on both abort and heartbeat failure
- **Pattern**: Follows [channel]/route.ts exactly with mux-specific adaptations
- **Evidence**: Route created, follows established pattern

## T005: SSEManager tests extension
- **File**: `test/unit/web/services/sse-manager.test.ts` (10 existing + 9 new = 19 total)
- **New tests**: channel tagging (3 tests: object, primitive, overwrite), multi-channel delivery (1), removeControllerFromAllChannels (5 tests: all channels, return value, empty Sets, isolation, no-op)
- **Updated**: Existing "format SSE message correctly" test now asserts `channel` field
- **Command**: `pnpm vitest run test/unit/web/services/sse-manager.test.ts --reporter=verbose`
- **Evidence**: 19/19 passed (3ms total test time)

## T006: Mux route contract tests
- **File**: `test/unit/web/api/events-mux-route.test.ts` (new, 10 tests)
- **Tests**: Auth (1: 401 no session), channel validation (4: missing, empty, invalid, max), SSE response (2: headers, dedup), registration (1: multi-channel), abort cleanup (1: cleanup contract), heartbeat (1: 15s constant)
- **Command**: `pnpm vitest run test/unit/web/api/events-mux-route.test.ts --reporter=verbose`
- **Evidence**: 10/10 passed (44ms total test time)
- **Note**: Tests call real `handleMuxRequest` with injectable MuxDeps (FT-001 refactor). Auth uses fakeAuthOk/fakeAuthFail. AbortSignal not directly testable via NextRequest (jsdom realm mismatch) — cleanup verified at SSEManager level + manual testing.

## FT-001: Route handler test refactor
- **Change**: Extracted `handleMuxRequest(request, deps)` with injectable `MuxDeps` (authFn, manager). Tests now call real handler code, not duplicated helpers. Route `GET()` delegates to `handleMuxRequest(request)` with default deps.
- **Evidence**: 10/10 tests call real handler, verify auth (401), validation (400), headers (200), registration, and cleanup

## FT-002: Manifest domain alignment
- **Change**: T003 domain corrected from `_platform/events` to `_platform/state` in tasks.md. Added `server-event-router.ts` to plan domain manifest.

## FT-003: Domain doc updates
- **Change**: `_platform/events` domain.md: added `/api/events/mux` to Contracts, Source Location; added `_platform/auth` to Dependencies; added Concepts table (5 concepts). `_platform/state` domain.md: added Plan 072 Phase 1 to History; added Concepts table (4 concepts).

## FT-004: Architecture evidence
- **Change**: Added `events -->|"auth() session check"| auth` edge to domain-map.md. Updated execution log with actual test commands and evidence.

## Full Suite
- **Command**: `pnpm test`
- **Evidence**: 5149 tests pass, 80 skipped, 0 failures (172s)
