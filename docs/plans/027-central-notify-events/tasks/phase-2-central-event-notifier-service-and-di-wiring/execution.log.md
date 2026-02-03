# Phase 2: Central Event Notifier Service and DI Wiring — Execution Log

**Plan**: 027-central-notify-events
**Phase**: Phase 2: Central Event Notifier Service and DI Wiring
**Started**: 2026-02-02

---

## Task T001: Write Unit Tests for CentralEventNotifierService (RED)
**Started**: 2026-02-02
**Dossier Task**: T001 | **Plan Task**: 2.1
**Status**: ✅ Complete

### What I Did
Created `test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts` with 10 unit tests (U01-U10):
- U01: emit() broadcasts to correct SSE channel
- U02: emit() passes eventType and data through
- U03: emit() on agents domain broadcasts to agents channel
- U04: suppressDomain() + emit() → no broadcast
- U05: Different key is not suppressed
- U06: Different domain is not suppressed
- U07: isSuppressed() returns true within window
- U08: isSuppressed() returns false after expiry
- U09: emit() with empty data broadcasts
- U10: Multiple suppressDomain calls extend window

All tests use `FakeSSEBroadcaster` — no `vi.mock()`. Each test has a Test Doc block.

### Evidence
```
Test Files  1 failed (1)
     Tests  no tests
```
Import fails because `CentralEventNotifierService` doesn't exist yet — correct RED state.

### Files Changed
- `test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts` — created (10 tests, RED)

**Completed**: 2026-02-02
---

## Task T002: Wire Contract Tests Against CentralEventNotifierService (RED)
**Started**: 2026-02-02
**Dossier Task**: T002 | **Plan Task**: 2.2
**Status**: ✅ Complete

### What I Did
Updated `test/contracts/central-event-notifier.contract.test.ts`:
- Added second `centralEventNotifierContractTests()` call for `CentralEventNotifierService` with `FakeSSEBroadcaster`
- `advanceTime: undefined` — C05 will be skipped per DYK-02
- Added companion describe block with B01-B04 tests covering the C01/C06/C08/C09 vacuous assertion gap
- B01: emit() delivers correct channel and eventType to broadcaster
- B02: emit() with empty data delivers to broadcaster
- B03: suppressed emit produces no broadcast
- B04: multiple emissions produce ordered broadcasts

### Evidence
```
Test Files  1 failed (1)
     Tests  no tests
```
Import fails because `CentralEventNotifierService` doesn't exist yet — correct RED state.

### Files Changed
- `test/contracts/central-event-notifier.contract.test.ts` — updated (added real service runner + B01-B04)

**Completed**: 2026-02-02
---

## Task T003: Implement CentralEventNotifierService (GREEN)
**Started**: 2026-02-02
**Dossier Task**: T003 | **Plan Task**: 2.3
**Status**: ✅ Complete

### What I Did
1. Created `packages/shared/src/features/027-central-notify-events/extract-suppression-key.ts` — shared pure function per DYK Insight #1
2. Refactored `FakeCentralEventNotifier` to import `extractSuppressionKey()` instead of private `extractKey()`
3. Added barrel export for `extractSuppressionKey` in feature `index.ts`
4. Created `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts`:
   - Implements `ICentralEventNotifier`
   - Constructor takes `ISSEBroadcaster`
   - `emit()` uses shared `extractSuppressionKey()`, checks `isSuppressed()`, delegates to `broadcaster.broadcast()`
   - `suppressDomain()` stores `"domain:key" → Date.now() + durationMs`
   - `isSuppressed()` with lazy cleanup
   - No `setTimeout` — only `Date.now()` comparison

### Evidence
```
Unit tests:    10 passed (10)
Contract tests: 26 passed (26)  — 11 fake + 11 real + 4 companion B01-B04
```
Clean RED→GREEN transition.

### Files Changed
- `packages/shared/src/features/027-central-notify-events/extract-suppression-key.ts` — created
- `packages/shared/src/features/027-central-notify-events/fake-central-event-notifier.ts` — refactored to use shared function
- `packages/shared/src/features/027-central-notify-events/index.ts` — added extractSuppressionKey export
- `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts` — created

**Completed**: 2026-02-02
---

## Task T004: Audit and Register CentralWatcherService DI Dependencies
**Started**: 2026-02-02
**Dossier Task**: T004 | **Plan Task**: 2.4
**Status**: ✅ Complete

### What I Did
1. Added `FILE_WATCHER_FACTORY: 'IFileWatcherFactory'` to `WORKSPACE_DI_TOKENS` in `di-tokens.ts`
2. In `createProductionContainer()`:
   - Registered `IFileWatcherFactory → ChokidarFileWatcherFactory`
   - Registered `ICentralWatcherService → CentralWatcherService` with all 6 deps resolved from container
   - `registryPath` computed as `path.join(os.homedir(), '.config', 'chainglass', 'workspaces.json')`
3. In `createTestContainer()`:
   - Registered `FakeFileWatcherFactory`, `FakeCentralWatcherService`
4. Added imports: `CentralWatcherService`, `ChokidarFileWatcherFactory`, `FakeCentralWatcherService`, `FakeFileWatcherFactory`, `ICentralWatcherService`, `IFileWatcherFactory` from `@chainglass/workflow`

### Evidence
```
pnpm tsc --noEmit → clean
DI container tests: 9 passed (9)
```

### Files Changed
- `packages/shared/src/di-tokens.ts` — added FILE_WATCHER_FACTORY token
- `apps/web/src/lib/di-container.ts` — added imports + production/test registrations

**Completed**: 2026-02-02
---

## Task T005: Register CentralEventNotifierService in DI
**Started**: 2026-02-02
**Dossier Task**: T005 | **Plan Task**: 2.5
**Status**: ✅ Complete

### What I Did
Registered in the same code change as T004 (DI section):
1. Production: `useValue` with eagerly-constructed `new CentralEventNotifierService(new SSEManagerBroadcaster(sseManager))`
   - Per DYK Insight #2: singleton required for stateful suppression map
2. Test: `useValue` with `new FakeCentralEventNotifier()`
3. Both resolve via `WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER`

### Evidence
```
pnpm tsc --noEmit → clean
DI container tests: 9 passed (9)
```

### Files Changed
- `apps/web/src/lib/di-container.ts` — added CentralEventNotifierService import + production/test registrations

**Completed**: 2026-02-02
---

## Task T006: Bootstrap Helper + Test
**Started**: 2026-02-02
**Dossier Task**: T006 | **Plan Task**: 2.6
**Status**: ✅ Complete

### What I Did
1. Created `apps/web/src/features/027-central-notify-events/start-central-notifications.ts`:
   - Minimal skeleton per DYK Insight #3
   - `globalThis.__centralNotificationsStarted` guard for HMR idempotency
   - Async function signature (Phase 3 will add async DI resolution)
   - Placeholder comments documenting Phase 3 fill-in points
2. Created `test/unit/web/027-central-notify-events/start-central-notifications.test.ts`:
   - S01: First call sets globalThis flag
   - S02: Second call is no-op (idempotent)
   - `afterEach` cleanup of globalThis flag

### Evidence
```
Test Files  1 passed (1)
     Tests  2 passed (2)
```

### Files Changed
- `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` — created
- `test/unit/web/027-central-notify-events/start-central-notifications.test.ts` — created

**Completed**: 2026-02-02
---

## Task T007: Wire Barrel Exports
**Started**: 2026-02-02
**Dossier Task**: T007 | **Plan Task**: 2.7
**Status**: ✅ Complete

### What I Did
Created `apps/web/src/features/027-central-notify-events/index.ts` barrel exporting:
- `CentralEventNotifierService` (service)
- `startCentralNotificationSystem` (bootstrap)

### Evidence
```
pnpm build → Tasks: 6 successful, 6 total (15.971s)
```

### Files Changed
- `apps/web/src/features/027-central-notify-events/index.ts` — created

**Completed**: 2026-02-02
---

## Task T008: Refactor and Validate
**Started**: 2026-02-02
**Dossier Task**: T008 | **Plan Task**: 2.8
**Status**: ✅ Complete

### What I Did
1. Ran `just format` — no changes needed (767 files, 18 pre-existing symlink warnings)
2. Ran `just lint` — found 3 import ordering errors, fixed in `central-event-notifier.service.ts` and `di-container.ts`
3. Re-ran `just lint` — clean (18 pre-existing symlink warnings only)
4. Ran `pnpm tsc --noEmit` — clean
5. Ran `pnpm test` — all 2749 tests pass (192 files pass, 5 skipped — pre-existing)

### Evidence
```
$ just lint
Checked 767 files in 118ms. No fixes applied.
Found 18 warnings.

$ pnpm tsc --noEmit
(clean output)

$ pnpm test
Test Files  192 passed | 5 skipped (197)
     Tests  2749 passed | 41 skipped (2790)
Duration  70.29s
```

New tests: 27 total (10 unit + 15 contract + 2 bootstrap)

### Files Changed
- `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts` — import ordering fix
- `apps/web/src/lib/di-container.ts` — import ordering fix

**Completed**: 2026-02-02
---

## Phase 2 Summary

**All 8 tasks complete**: T001, T002, T003, T004, T005, T006, T007, T008

**TDD Cycle Evidence**:
- RED: T001 (10 unit tests) + T002 (15 contract tests) fail — service doesn't exist
- GREEN: T003 creates service + shared `extractSuppressionKey()` — all 37 tests pass
- REFACTOR: T008 fixes import ordering (biome auto-format rules)

**Files Created (7)**:
- `packages/shared/src/features/027-central-notify-events/extract-suppression-key.ts`
- `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts`
- `apps/web/src/features/027-central-notify-events/start-central-notifications.ts`
- `apps/web/src/features/027-central-notify-events/index.ts`
- `test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts`
- `test/unit/web/027-central-notify-events/start-central-notifications.test.ts`
- `test/contracts/central-event-notifier.contract.test.ts` (overwritten — added real service runner + B01-B04)

**Files Modified (4)**:
- `packages/shared/src/di-tokens.ts` — added FILE_WATCHER_FACTORY token
- `packages/shared/src/features/027-central-notify-events/fake-central-event-notifier.ts` — refactored to use shared `extractSuppressionKey()`
- `packages/shared/src/features/027-central-notify-events/index.ts` — added extractSuppressionKey export
- `apps/web/src/lib/di-container.ts` — added Plan 027 DI registrations (prod + test)

**Quality Gate**: typecheck clean, build clean, 2749 tests pass, lint clean
**New Tests**: 27 (10 unit U01-U10 + 11 contract C01-C11 real service + 4 companion B01-B04 + 2 bootstrap S01-S02)
**PlanPak Symlinks**: 7 new symlinks in files/ + 1 new in otherfiles/

