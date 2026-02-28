# Phase 3: Implementation + Fake — Tasks & Brief

**Plan**: [global-state-system-plan.md](../../global-state-system-plan.md)
**Phase**: Phase 3: Implementation + Fake
**Generated**: 2026-02-27
**Status**: Complete

---

## Executive Briefing

**Purpose**: Build GlobalStateSystem (real implementation) and FakeGlobalStateSystem (test double), both passing all 19 contract tests from Phase 2. This is the core engineering phase — everything else (hooks, provider, exemplar) depends on this.

**What We're Building**:
- `GlobalStateSystem` class in `apps/web/src/lib/state/` — the real IStateService implementation with Map-based store, pattern-matched subscriber dispatch, error isolation, stable references
- `FakeGlobalStateSystem` in `packages/shared/src/fakes/` — test double with inspection methods (getPublished, getSubscribers, wasPublishedWith, reset)
- Contract test runner that executes `globalStateContractTests()` against both

**Key Technical Challenges**:
- **Stable get() references** (AC-03): Return same object identity from Map — no defensive copies
- **Stable list() arrays** (AC-26): Version-counter caching — rebuild array only when matching entries change
- **Error isolation** (AC-22/PL-07): try/catch per subscriber callback in dispatch loop
- **Store-first ordering** (AC-24/PL-01): Update Map before notifying subscribers
- **Domain validation on publish** (AC-08/13/14): Check registration, singleton vs multi-instance

---

## Prior Phase Context

**Phase 1** created types, interface, path parser, path matcher, DI tokens, barrel exports.
**Phase 2** created 47 unit tests (parser + matcher) and 19 contract cases (C01–C19).

All Phase 2 tests pass GREEN against Phase 1 pure functions. Contract factory is defined but has no runner yet — that's T004 in this phase.

---

## Pre-Implementation Check

| File | Exists? | Domain Check | Notes |
|------|---------|-------------|-------|
| `test/unit/web/state/global-state-system.test.ts` | ❌ Create | `_platform/state` ✅ | TDD unit tests |
| `packages/shared/src/fakes/fake-state-system.ts` | ❌ Create | `_platform/state` ✅ | 14 existing fakes in dir |
| `apps/web/src/lib/state/global-state-system.ts` | ❌ Create | `_platform/state` ✅ | New directory needed |
| `test/contracts/state-system.contract.test.ts` | ❌ Create | `_platform/state` ✅ | Runner for existing factory |

---

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Create TDD unit tests for GlobalStateSystem store operations | `_platform/state` | `test/unit/web/state/global-state-system.test.ts` | RED tests covering: publish/get, subscribe/unsubscribe, error isolation, store-first ordering, remove, removeInstance, registerDomain (duplicate throws), listDomains, listInstances, singleton/multi-instance validation, list with patterns, stable get reference, stable list reference, subscriberCount, entryCount, previousValue tracking | AC-01 through AC-10, AC-13/14, AC-21 through AC-26, AC-36/37. Write RED first. |
| [x] | T002 | Create FakeGlobalStateSystem | `_platform/state` | `packages/shared/src/fakes/fake-state-system.ts` | Implements IStateService. Inspection methods: getPublished(path), getSubscribers(), wasPublishedWith(path, value), reset(). Follows FakeUSDK pattern (class with inspection). Export from fakes barrel. | AC-33. Per Finding 06. |
| [x] | T003 | Create GlobalStateSystem implementation | `_platform/state` | `apps/web/src/lib/state/global-state-system.ts` | Map-based store. Pattern-matched dispatch via createStateMatcher. Error isolation (try/catch per callback). Store-first ordering. Stable get() refs (no copies). Version-counter list() caching. Domain registration with singleton/multi-instance validation. All T001 tests pass GREEN. | Per Finding 04, PL-01, PL-07. |
| [x] | T004 | Create contract test runner | `_platform/state` | `test/contracts/state-system.contract.test.ts` | Imports globalStateContractTests from factory. Runs against both GlobalStateSystem and FakeGlobalStateSystem. All 19 contracts pass for both. | AC-34. Depends on T002 + T003. |

---

## Context Brief

### Key Patterns

| Source | Pattern | Usage |
|--------|---------|-------|
| `apps/web/src/lib/sdk/settings-store.ts` | `Map<key, entry>`, `Map<key, Set<callback>>`, no defensive copies in get(), dispatch with `for (const cb of cbs) cb(value)` | Model for store + listener dispatch |
| `apps/web/src/features/045-live-file-events/file-change-hub.ts` | Subscription Map with auto-incrementing IDs, `try/catch` per subscriber in dispatch | Model for error isolation |
| `packages/shared/src/fakes/fake-usdk.ts` | Fake class with inspection methods, implements interface | Model for FakeGlobalStateSystem |

### Prior Learnings

| PL | What | Impact |
|----|------|--------|
| PL-01 | Store-first, then broadcast | Update Map BEFORE iterating subscribers |
| PL-07 | Error isolation per subscriber | try/catch in dispatch loop, console.warn on error |
| PL-03 | Stateful services = useValue singleton in DI | GlobalStateSystem will use useValue registration in Phase 5 |

### DYK Items

| DYK | Impact |
|-----|--------|
| DYK-04 | StateEntry.updatedAt is `number` (Unix ms) — used for list() version tracking |
| DYK-07 | C06 store-first test calls get() inside subscriber callback |
| DYK-08 | Every contract test calls registerTestDomain() before publish() |
| DYK-09 | C15 tests list() stable array reference |

### Implementation Strategy for list() Stable References

```
list(pattern) flow:
1. Create StateMatcher for pattern
2. Check listCache for this pattern
3. If cache exists and maxUpdatedAt hasn't changed → return cached array
4. Iterate values Map, filter by matcher, build new StateEntry[]
5. Store in listCache: { maxUpdatedAt, result }
6. Return result

Invalidation: on publish/remove, delete all listCache entries
(simple but correct; O(patterns) per publish — acceptable at expected scale)
```

---

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
