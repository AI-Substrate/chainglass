# Phase 3: Workgraph Domain Event Adapter and Toast — Execution Log

**Plan**: 027-central-notify-events
**Phase**: Phase 3: Workgraph Domain Event Adapter and Toast
**Started**: 2026-02-02

---

## Task T001: Write Unit Tests for DomainEventAdapter Base Class and WorkgraphDomainEventAdapter (RED)
**Started**: 2026-02-02
**Dossier Task**: T001 | **Plan Task**: 3.1
**Status**: ✅ Complete

### What I Did
Created `test/unit/web/027-central-notify-events/workgraph-domain-event-adapter.test.ts` with 5 tests:
- B01: handleEvent() emits with configured domain, eventType, and extracted data
- B02: extractData return value reaches emit()
- A01: handleEvent() emits graph-updated event
- A02: multiple events emit in order
- A03: event data contains only graphSlug (ADR-0007)

Base class tests use a trivial `TestAdapter extends DomainEventAdapter<{id:string, extra:number}>`.
All tests use `FakeCentralEventNotifier` — no `vi.mock()`. All have Test Doc blocks.

### Evidence
```
Test Files  1 failed (1)
     Tests  no tests
```
Import fails because `DomainEventAdapter` and `WorkgraphDomainEventAdapter` don't exist yet — correct RED state.

### Files Changed
- `test/unit/web/027-central-notify-events/workgraph-domain-event-adapter.test.ts` — created (5 tests, RED)

**Completed**: 2026-02-02
---

## Task T002: Create DomainEventAdapter Base Class and WorkgraphDomainEventAdapter (GREEN)
**Started**: 2026-02-02
**Dossier Task**: T002 | **Plan Task**: 3.2
**Status**: ✅ Complete

### What I Did
1. Created `packages/shared/src/features/027-central-notify-events/domain-event-adapter.ts` — abstract generic `DomainEventAdapter<TEvent>` with constructor `(notifier, domain, eventType)`, abstract `extractData(event)`, and `handleEvent(event)` that calls `notifier.emit()`.
2. Created `apps/web/src/features/027-central-notify-events/workgraph-domain-event-adapter.ts` — extends `DomainEventAdapter<WorkGraphChangedEvent>`, constructor calls `super(notifier, WorkspaceDomain.Workgraphs, 'graph-updated')`, `extractData()` returns `{ graphSlug: event.graphSlug }`.
3. Updated shared barrel to export `DomainEventAdapter`.
4. Updated web barrel to export `WorkgraphDomainEventAdapter`.

### Evidence
```
Test Files  1 passed (1)
     Tests  5 passed (5)
```
All T001 tests pass — clean RED→GREEN transition.

### Files Changed
- `packages/shared/src/features/027-central-notify-events/domain-event-adapter.ts` — created
- `apps/web/src/features/027-central-notify-events/workgraph-domain-event-adapter.ts` — created
- `packages/shared/src/features/027-central-notify-events/index.ts` — added DomainEventAdapter export
- `apps/web/src/features/027-central-notify-events/index.ts` — added WorkgraphDomainEventAdapter export

**Completed**: 2026-02-02
---

## Task T003: Remove Suppression Code from Phases 1-2
**Started**: 2026-02-02
**Dossier Task**: T003 | **Plan Task**: 3.3
**Status**: ✅ Complete

### What I Did
Removed all suppression infrastructure across 8+ files:
1. **Interface**: Stripped `suppressDomain()` and `isSuppressed()` from `ICentralEventNotifier`. Interface is now `emit()` only.
2. **Real service**: Stripped `suppressions` map, `suppressDomain()`, `isSuppressed()`, suppression check in `emit()`, `extractSuppressionKey` import. `emit()` is now a direct passthrough.
3. **Fake**: Stripped suppressions map, clockOffset, now(), suppressDomain(), isSuppressed(), advanceTime(), suppression check in emit(). ~60 lines removed.
4. **Shared utility**: Deleted `extract-suppression-key.ts` entirely. Removed barrel export.
5. **Contract tests**: Removed C02-C05, C07-C08, companion B02-B03. Updated NotifierFactory type. Remaining: C01, C06, C09, C10, C11, B01, B04.
6. **Unit tests**: Removed U04-U08. Remaining: U01-U03, U09.
7. **DI comment cleanup**: Removed obsolete "Stateful suppression map requires identity stability" comment.
8. **Symlink cleanup**: Removed broken symlink for deleted `extract-suppression-key.ts`.

### Evidence
```
Test Files  4 passed (4)
     Tests  23 passed (23)
pnpm tsc --noEmit → clean
```

### Files Changed
- `packages/shared/src/features/027-central-notify-events/central-event-notifier.interface.ts` — stripped suppressDomain + isSuppressed
- `packages/shared/src/features/027-central-notify-events/fake-central-event-notifier.ts` — stripped ~60 lines
- `packages/shared/src/features/027-central-notify-events/extract-suppression-key.ts` — deleted
- `packages/shared/src/features/027-central-notify-events/index.ts` — removed extractSuppressionKey export
- `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts` — stripped suppression
- `test/contracts/central-event-notifier.contract.ts` — removed 6 suppression tests
- `test/contracts/central-event-notifier.contract.test.ts` — removed B02-B03, updated factory
- `test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts` — removed U04-U08
- `apps/web/src/lib/di-container.ts` — removed obsolete suppression comment
- `docs/plans/027-central-notify-events/files/extract-suppression-key.ts` — removed broken symlink

**Completed**: 2026-02-02
---

## Task T004: Wire startCentralNotificationSystem() Body and Create instrumentation.ts
**Started**: 2026-02-02
**Dossier Task**: T004 | **Plan Task**: 3.4
**Status**: ✅ Complete

### What I Did
1. Filled in `startCentralNotificationSystem()` body:
   - Resolves `ICentralWatcherService` and `ICentralEventNotifier` from DI via `getContainer()`
   - Creates `WorkgraphDomainEventAdapter(notifier)`
   - Creates `WorkGraphWatcherAdapter()` and registers with watcher
   - Subscribes domain adapter to watcher adapter via `onGraphChanged`
   - Calls `await watcher.start()`
   - Wraps in try/catch with flag reset on failure (per DYK Insight #2)
2. Created `apps/web/instrumentation.ts`:
   - Exports `register()` async function (Next.js server startup hook)
   - Dynamic import of `startCentralNotificationSystem` to avoid module load at import time

### Evidence
```
Bootstrap tests: 2 passed (2)
pnpm tsc --noEmit → clean
```
S01 and S02 still pass. Test actually exercises real bootstrap path with test container fakes (log shows CentralWatcherService started).

### Files Changed
- `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` — filled body
- `apps/web/instrumentation.ts` — created

**Completed**: 2026-02-02
---

## Task T005: Integration Test — Filesystem Change → Domain Event
**Started**: 2026-02-02
**Dossier Task**: T005 | **Plan Task**: 3.5
**Status**: ✅ Complete

### What I Did
Created `test/integration/027-central-notify-events/watcher-to-notifier.integration.test.ts` with 2 tests:
- I01: filesystem change flows through to domain event (full chain)
- I02: non-state.json event does not produce domain event (filter correctness)

Setup: real `WorkGraphWatcherAdapter`, `WorkgraphDomainEventAdapter(fakeNotifier)`. Subscription wired via `onGraphChanged`. Simulate events via `watcherAdapter.handleEvent()`.

### Evidence
```
Test Files  1 passed (1)
     Tests  2 passed (2)
```

### Files Changed
- `test/integration/027-central-notify-events/watcher-to-notifier.integration.test.ts` — created

**Completed**: 2026-02-02
---

## Task T006: Toast Verification in Workgraph Detail Page
**Started**: 2026-02-02
**Dossier Task**: T006 | **Plan Task**: 3.6
**Status**: ✅ Complete

### What I Did
1. Verified `workgraph-detail-client.tsx` already has `onExternalChange` callback wired to `setToast()` with 3s auto-dismiss (lines 102-105).
2. Updated toast message from `'Graph updated externally'` to `'Graph updated from external change'` to match AC-08 wording.
3. No structural changes needed — existing wiring handles watcher-driven events correctly.

### Evidence
Toast is already wired:
- `useWorkGraphSSE` receives `graph-updated` events and calls `onExternalChange()`
- `onExternalChange` calls `setToast('Graph updated from external change')` with `setTimeout(() => setToast(null), 3000)`
- Toast renders as blue banner in the UI (line 170-173)

### Files Changed
- `apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx` — updated toast message text

**Completed**: 2026-02-02
---

## Task T007: Refactor and Validate
**Started**: 2026-02-02
**Dossier Task**: T007 | **Plan Task**: 3.7
**Status**: ✅ Complete

### What I Did
1. Ran `just format` — biome fixed 2 files (trailing comma removal in domain-event-adapter.ts and start-central-notifications.ts)
2. Ran `just lint` — found 2 issues in `start-central-notifications.ts`: import ordering and unused biome-ignore suppression comment. Both fixed.
3. Re-ran lint — clean (pre-existing symlink warnings only, no code errors)
4. Ran `pnpm tsc --noEmit` — clean
5. Ran `pnpm test` — all 2736 tests pass (194 files pass, 5 skipped — pre-existing)
6. Ran `pnpm build` — 6 tasks successful (17.174s)

### Evidence
```
$ just lint (on changed files)
Checked 9 files in 1988µs. No fixes applied.

$ pnpm tsc --noEmit
(clean output)

$ pnpm test
Test Files  194 passed | 5 skipped (199)
     Tests  2736 passed | 41 skipped (2777)
Duration  71.96s

$ pnpm build
Tasks:    6 successful, 6 total
Time:    17.174s
```

New tests: 7 total (5 unit B01-B02/A01-A03 + 2 integration I01-I02)
Removed tests: 13 total (6 contract C02-C05/C07-C08 + 2 companion B02-B03 + 5 unit U04-U08)
Net change: -6 tests (from 2749 to 2736 — 13 removed + 7 added)

### Files Changed
- `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` — import ordering fix, removed unused biome-ignore

**Completed**: 2026-02-02
---

## Phase 3 Summary

**All 7 tasks complete**: T001, T002, T003, T004, T005, T006, T007

**TDD Cycle Evidence**:
- RED: T001 (5 unit tests) fail — adapter classes don't exist
- GREEN: T002 creates base + concrete adapter — all 5 tests pass
- REFACTOR: T007 fixes import ordering and formatting

**Files Created (5)**:
- `packages/shared/src/features/027-central-notify-events/domain-event-adapter.ts`
- `apps/web/src/features/027-central-notify-events/workgraph-domain-event-adapter.ts`
- `apps/web/instrumentation.ts`
- `test/unit/web/027-central-notify-events/workgraph-domain-event-adapter.test.ts`
- `test/integration/027-central-notify-events/watcher-to-notifier.integration.test.ts`

**Files Modified (9)**:
- `packages/shared/src/features/027-central-notify-events/central-event-notifier.interface.ts` — stripped suppression methods
- `packages/shared/src/features/027-central-notify-events/fake-central-event-notifier.ts` — stripped suppression code
- `packages/shared/src/features/027-central-notify-events/index.ts` — removed extractSuppressionKey, added DomainEventAdapter
- `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts` — stripped suppression
- `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` — filled bootstrap body
- `apps/web/src/features/027-central-notify-events/index.ts` — added WorkgraphDomainEventAdapter export
- `test/contracts/central-event-notifier.contract.ts` — removed suppression tests
- `test/contracts/central-event-notifier.contract.test.ts` — removed suppression companion tests
- `test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts` — removed suppression unit tests
- `apps/web/src/lib/di-container.ts` — removed obsolete suppression comment
- `apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx` — updated toast message

**Files Deleted (2)**:
- `packages/shared/src/features/027-central-notify-events/extract-suppression-key.ts`
- `docs/plans/027-central-notify-events/files/extract-suppression-key.ts` (broken symlink)

**Quality Gate**: typecheck clean, build clean, 2736 tests pass, lint clean (pre-existing symlink warnings only)
**New Tests**: 7 (5 unit B01-B02/A01-A03 + 2 integration I01-I02)
**Removed Tests**: 13 suppression tests

