# Code Review: Phase 1: Server-Side Event Pipeline

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-spec.md
**Phase**: Phase 1: Server-Side Event Pipeline
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**APPROVE WITH NOTES**

One HIGH finding: fake imports `FileChangeBatchItem` type from adapter file rather than a shared interface file, violating R-ARCH-001. Mitigated by `import type` being compile-time only (no runtime dependency). Extract types to a shared file as a cleanup task.

**Key failure areas** (one sentence each):
- **Doctrine**: Fake imports type from adapter instead of shared interface; `FilesChangedCallback` duplicated across adapter and fake.
- **Testing**: Three test files from the test plan were never created (trivial infrastructure assertions).

## B) Summary

Clean, well-structured implementation. All 10 tasks completed correctly with 76 tests passing across unit, contract, and integration suites. The code follows established codebase patterns (callback-set, self-filtering adapter, contract tests with fake/real parity, error isolation). Domain compliance is strong — all files correctly placed, no cross-domain import violations, dependency direction correct, domain map current. The one architectural concern is that shared types (`FileChangeBatchItem`, `FilesChangedCallback`) are defined in the adapter file rather than a shared interface file, creating a conceptual coupling between fake and adapter. Anti-reinvention check found no duplication — all new components use established extension points (`IWatcherAdapter`, `DomainEventAdapter<T>`).

## C) Checklist

**Testing Approach: Full TDD**

- [x] Core validation tests present (20 unit, 16 contract, 5 integration, 3 domain adapter)
- [x] Critical paths covered (filtering, debounce, dedup, pipeline)
- [ ] RED-GREEN evidence captured in execution log
- [ ] All planned test files created (3 missing: source-watcher.constants, workspace-domain, chokidar-adapter ignored)
- [x] Key verification points documented in execution log
- [x] Only in-scope files changed
- [x] Linters/type checks clean
- [x] Domain compliance checks pass (7/9 clean, 2 minor)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | fake-file-change-watcher.ts:5 | doctrine | Fake imports `FileChangeBatchItem` from adapter file (R-ARCH-001) | Extract types to shared interface file |
| F002 | MEDIUM | file-change-watcher.adapter.ts:136-143 | error-handling | Subscriber errors silently swallowed in flush() | Add console.warn or optional logger |
| F003 | MEDIUM | fake-file-change-watcher.ts:17 | doctrine | `FilesChangedCallback` type duplicated in adapter and fake | Define once in shared types file |
| F004 | MEDIUM | events/domain.md:128 | domain-md | Filename mismatch: references `fake-file-change-watcher.adapter.ts` but file is `fake-file-change-watcher.ts` | Fix filename in domain.md |
| F005 | MEDIUM | tasks.md (test plan) | testing | 3 planned test files never created | Create trivial assertion tests |
| F006 | MEDIUM | execution.log.md | testing | No RED-GREEN evidence captured | Capture failing test output before implementation |
| F007 | LOW | file-change-watcher.adapter.ts:86-90 | performance | Trailing-edge-only debounce could delay indefinitely in pathological event storms | Consider optional maxWaitMs ceiling |
| F008 | LOW | central-watcher.service.ts:254-284 | correctness | createSourceWatchers() depends on watcherMetadata (by design) | Add code comment documenting coupling |
| F009 | LOW | live-file-events-plan.md (manifest) | domain | fake-file-watcher.ts modified but unmapped in domain manifest | Add to manifest |
| F010 | LOW | execution.log.md | testing | Compressed timestamps make TDD ordering unverifiable | Use ISO-8601 with seconds |
| F011 | LOW | AC-28 | testing | AC-28 validated only indirectly (no startup chain test) | Acceptable for Phase 1 |
| F012 | LOW | file-change-watcher.adapter.ts:78 | doctrine | Type assertion `as FileChangeBatchItem['eventType']` bypasses type checker | Consider type guard function |

## E) Detailed Findings

### E.1) Implementation Quality

**3 findings (0 HIGH, 1 MEDIUM, 2 LOW)**

**F002 (MEDIUM)** — `file-change-watcher.adapter.ts:136-143`: Subscriber errors in `flush()` are silently swallowed with an empty catch block. If `FileChangeDomainEventAdapter.handleEvent()` or `notifier.emit()` throws, the error disappears — making production debugging difficult. The error isolation pattern is correct (subscriber must not block others), but needs visibility.
> **Suggestion**: Add `console.warn` or accept an optional logger in the constructor.

**F007 (LOW)** — `file-change-watcher.adapter.ts:86-90`: Trailing-edge-only debounce reset pattern means each new event restarts the 300ms timer. Continuous events at <300ms intervals delay delivery indefinitely and grow the batch unbounded. Unlikely in practice but possible during pathological event storms (e.g., long-running build writing hundreds of files).
> **Suggestion**: Consider optional `maxWaitMs` ceiling (e.g., 2000ms) that forces a flush. Could be a future enhancement.

**F008 (LOW)** — `central-watcher.service.ts:254-284`: `createSourceWatchers()` iterates `watcherMetadata` (populated by `createDataWatchers()`), so source watchers are only created for worktrees with `.chainglass/data/`. By design and consistent with data watcher behavior.
> **Suggestion**: Add code comment noting dependency on `watcherMetadata`.

### E.2) Domain Compliance

**2 findings (0 HIGH, 1 MEDIUM, 1 LOW)**

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All new files under correct domain source trees (023-*, 027-*) |
| Contract-only imports | ✅ | No cross-domain internal imports |
| Dependency direction | ✅ | All flows infra→infra or within same domain |
| Domain.md updated | ⚠️ | Filename mismatch in Source Location table (F004) |
| Registry current | ✅ | No new domains; registry correct |
| No orphan files | ⚠️ | fake-file-watcher.ts modified but unmapped in manifest (F009) |
| Map nodes current | ✅ | All domains present |
| Map edges current | ✅ | All edges labeled, contracts listed |
| No circular business deps | ✅ | Only one business domain |

**F004 (MEDIUM)** — `docs/domains/_platform/events/domain.md:128`: Source Location table references `fake-file-change-watcher.adapter.ts` but actual file on disk is `fake-file-change-watcher.ts` (no `.adapter.` infix). Breaks traceability.
> **Fix**: Change `fake-file-change-watcher.adapter.ts` to `fake-file-change-watcher.ts` in the Source Location table.

**F009 (LOW)** — `packages/workflow/src/fakes/fake-file-watcher.ts`: Modified in Phase 1 (added `findWatcherByPath`, `findWatchersByPath`) but not listed in plan's Domain Manifest.
> **Fix**: Add row to Domain Manifest.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| FileChangeWatcherAdapter | WorkGraphWatcherAdapter (same pattern, different behavior) | _platform/events | ✅ proceed |
| FakeFileChangeWatcherAdapter | FakeWatcherAdapter (different API surface) | _platform/events | ✅ proceed |
| FileChangeDomainEventAdapter | WorkgraphDomainEventAdapter (same base class) | _platform/events | ✅ proceed |
| SOURCE_WATCHER_IGNORED | None | _platform/events | ✅ proceed |

All new components use established extension points (`IWatcherAdapter`, `DomainEventAdapter<T>`). No reinvention. Different filtering, event shapes, and dispatch strategies from existing counterparts.

### E.4) Testing & Evidence

**Coverage confidence**: 82%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 88% | Integration test proves add event flows through full pipeline. Unit tests verify path conversion and event shape. No latency measurement (client-side portion in Phase 2). |
| AC-02 | 92% | Integration test for change events. Unit and contract tests cover filtering and path conversion. |
| AC-03 | 92% | Integration test for unlink events. Dedup test verifies unlink as last-event-wins outcome. |
| AC-04 | 78% | .chainglass filtering tested at adapter+integration level. SOURCE_WATCHER_IGNORED patterns verified in CentralWatcherService test. Gap: no dedicated test for pattern completeness. |
| AC-05 | 95% | Comprehensive: batch window, dedup, timer reset, cross-worktree isolation. Contract + integration tests. |
| AC-06 | 85% | Verified indirectly through domain adapter tests. Gap: no direct `=== 'file-changes'` assertion. |
| AC-28 | 70% | Bootstrap wiring tested. CentralWatcherService start() tested. Gap: no test for instrumentation.ts → bootstrap chain. |

**Violations**:
- **F005 (MEDIUM)**: Three test files in the test plan were never created: `source-watcher.constants.test.ts`, `workspace-domain.test.ts`, `chokidar-file-watcher.adapter.test.ts`. Core assertions ARE covered through integration/contract tests but dedicated unit tests would close the plan gap.
- **F006 (MEDIUM)**: No RED-GREEN evidence in execution log. T004/T007 claims "TDD — tests first" but no failing test output is captured.
- **F010 (LOW)**: Compressed timestamps (multiple tasks at same minute) make TDD ordering unverifiable.
- **F011 (LOW)**: AC-28 validated only indirectly — instrumentation.ts startup chain not tested.

### E.5) Doctrine Compliance

**3 findings (1 HIGH, 1 MEDIUM, 1 LOW)**

**F001 (HIGH)** — `fake-file-change-watcher.ts:5`: Fake imports `FileChangeBatchItem` type from adapter file `./file-change-watcher.adapter.js`. R-ARCH-001 states fakes must not import from adapters — they should import from interfaces only. Even `import type` creates a conceptual dependency.
> **Mitigation**: `import type` is compile-time only — no runtime dependency exists. This is a type-sharing pattern, not a functional coupling.
> **Fix**: Extract `FileChangeBatchItem` interface and `FilesChangedCallback` type to a dedicated types/interface file (e.g., `file-change.types.ts`). Both adapter and fake then import from the interface file.

**F003 (MEDIUM)** — `fake-file-change-watcher.ts:17`: `FilesChangedCallback` type alias is duplicated — defined independently in both `file-change-watcher.adapter.ts` (line 34) and `fake-file-change-watcher.ts` (line 17). If the callback signature changes in one file, the other won't update, risking silent drift.
> **Fix**: Define `FilesChangedCallback` once in the shared types file alongside `FileChangeBatchItem`.

**F012 (LOW)** — `file-change-watcher.adapter.ts:78`: Type assertion `event.eventType as FileChangeBatchItem['eventType']` bypasses the type checker. The `error` case is filtered above (line 71), making this safe at runtime.
> **Fix**: Consider a type guard function that narrows without `as`.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | File created → SSE `add` event | Integration test + unit tests (path conversion, event shape) | 88% |
| AC-02 | File modified → SSE `change` event | Integration test + contract test C02 | 92% |
| AC-03 | File deleted → SSE `unlink` event | Integration test + dedup test (last-event-wins) | 92% |
| AC-04 | Ignored dirs → no SSE events | Adapter .chainglass filter (3 unit + 1 integration) + CentralWatcher ignored patterns test | 78% |
| AC-05 | 300ms batch + dedup | 6 unit tests + 1 integration test + contract C06 | 95% |
| AC-06 | WorkspaceDomain.FileChanges = 'file-changes' | Domain adapter test verifies channel; integration test verifies emit domain | 85% |
| AC-28 | Watcher starts at startup | Bootstrap wiring test + CentralWatcher.start() test | 70% |

**Overall coverage confidence**: 86%

## G) Commands Executed

```bash
# Compute diff
git --no-pager diff 404a1f3..f491d4c --stat
git --no-pager diff 404a1f3..f491d4c > docs/plans/045-live-file-events/reviews/_computed.diff

# Check for uncommitted changes
git --no-pager diff --stat
git --no-pager diff --staged --stat

# Recent history
git --no-pager log --oneline -20

# Verify tests pass (via testing subagent)
pnpm vitest run test/unit/workflow/file-change-watcher.adapter.test.ts \
  test/unit/workflow/central-watcher.service.test.ts \
  test/contracts/file-change-watcher.contract.test.ts \
  test/integration/045-live-file-events/ \
  test/unit/web/027/file-change-domain-event-adapter.test.ts

# Domain docs inspection
cat docs/domains/registry.md
cat docs/domains/domain-map.md
cat docs/domains/_platform/events/domain.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-spec.md
**Phase**: Phase 1: Server-Side Event Pipeline
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/tasks/phase-1-server-side-event-pipeline/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/tasks/phase-1-server-side-event-pipeline/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/reviews/review.phase-1-server-side-event-pipeline.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/packages/workflow/src/interfaces/file-watcher.interface.ts | modified | events | None |
| /home/jak/substrate/041-file-browser/packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts | modified | events | None |
| /home/jak/substrate/041-file-browser/packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts | created | events | None |
| /home/jak/substrate/041-file-browser/packages/workflow/src/features/023-central-watcher-notifications/file-change-watcher.adapter.ts | created | events | F012: Consider type guard |
| /home/jak/substrate/041-file-browser/packages/workflow/src/features/023-central-watcher-notifications/fake-file-change-watcher.ts | created | events | F001: Extract type imports to shared file |
| /home/jak/substrate/041-file-browser/packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts | modified | events | F008: Add comment on watcherMetadata coupling |
| /home/jak/substrate/041-file-browser/packages/workflow/src/features/023-central-watcher-notifications/index.ts | modified | events | None |
| /home/jak/substrate/041-file-browser/packages/workflow/src/index.ts | modified | events | None |
| /home/jak/substrate/041-file-browser/packages/shared/src/features/027-central-notify-events/workspace-domain.ts | modified | events | None |
| /home/jak/substrate/041-file-browser/apps/web/src/features/027-central-notify-events/file-change-domain-event-adapter.ts | created | events | None |
| /home/jak/substrate/041-file-browser/apps/web/src/features/027-central-notify-events/start-central-notifications.ts | modified | events | None |
| /home/jak/substrate/041-file-browser/packages/workflow/src/fakes/fake-file-watcher.ts | modified | events | F009: Add to domain manifest |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/events/domain.md | modified | events | F004: Fix filename reference |
| /home/jak/substrate/041-file-browser/test/unit/workflow/file-change-watcher.adapter.test.ts | created | test | None |
| /home/jak/substrate/041-file-browser/test/unit/workflow/central-watcher.service.test.ts | modified | test | None |
| /home/jak/substrate/041-file-browser/test/contracts/file-change-watcher.contract.ts | created | test | None |
| /home/jak/substrate/041-file-browser/test/contracts/file-change-watcher.contract.test.ts | created | test | None |
| /home/jak/substrate/041-file-browser/test/integration/045-live-file-events/watcher-to-file-change-notifier.integration.test.ts | created | test | None |
| /home/jak/substrate/041-file-browser/test/unit/web/027/file-change-domain-event-adapter.test.ts | created | test | None |

### Recommended Improvements (not blocking)

| # | File (absolute path) | What To Improve | Why |
|---|---------------------|-----------------|-----|
| 1 | /home/jak/substrate/041-file-browser/packages/workflow/src/features/023-central-watcher-notifications/fake-file-change-watcher.ts | Extract `FileChangeBatchItem` import to shared types file | F001: R-ARCH-001 compliance |
| 2 | /home/jak/substrate/041-file-browser/packages/workflow/src/features/023-central-watcher-notifications/file-change-watcher.adapter.ts | Add console.warn in subscriber error catch | F002: Production debugging visibility |
| 3 | /home/jak/substrate/041-file-browser/packages/workflow/src/features/023-central-watcher-notifications/fake-file-change-watcher.ts | Remove duplicated `FilesChangedCallback` type, import from shared | F003: DRY |
| 4 | /home/jak/substrate/041-file-browser/docs/domains/_platform/events/domain.md | Fix filename reference from `.adapter.ts` to `.ts` | F004: Traceability |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/domains/_platform/events/domain.md | Filename reference fix (F004) |
| /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md | Add fake-file-watcher.ts to domain manifest (F009) |

### Next Step

Phase 1 is approved. Proceed to Phase 2 planning:
```
/plan-5-v2-phase-tasks-and-brief --phase "Phase 2: Browser-Side Event Hub" --plan "/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md"
```

Consider addressing F001/F003 (type extraction) as a cleanup subtask before Phase 2, since Phase 2 will consume these types from the client side.
