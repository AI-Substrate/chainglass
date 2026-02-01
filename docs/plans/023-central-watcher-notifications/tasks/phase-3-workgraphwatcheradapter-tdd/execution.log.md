# Phase 3: WorkGraphWatcherAdapter (TDD) — Execution Log

**Plan**: 023-central-watcher-notifications
**Phase**: Phase 3: WorkGraphWatcherAdapter (TDD)
**Started**: 2026-02-01

---

## Task T001: Define WorkGraphChangedEvent {#task-t001-setup}
**Dossier Task**: [T001](tasks.md#T001) | **Plan Task**: 3.1
**Started**: 2026-02-01

### What I Did
- Created `workgraph-watcher.adapter.ts` with `WorkGraphChangedEvent` interface
- 5 fields matching old `GraphChangedEvent` (CF-09): `graphSlug`, `workspaceSlug`, `worktreePath`, `filePath`, `timestamp: Date`
- Used `interface` (not `type`) per Insight #4 decision
- Added import stubs for `WatcherEvent` and `IWatcherAdapter` (used later in T005)

### Evidence
```
just typecheck → clean
```

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts` — Created

**Completed**: 2026-02-01
---

## Tasks T002–T004: RED Phase — All Tests Written {#tasks-t002-t004-red}
**Dossier Tasks**: [T002](tasks.md#T002), [T003](tasks.md#T003), [T004](tasks.md#T004) | **Plan Tasks**: 3.2, 3.3, 3.4
**Started**: 2026-02-01

### What I Did
- Wrote 16 tests in `test/unit/workflow/workgraph-watcher.adapter.test.ts` across 3 `describe` blocks
- T002 (Filtering): 6 tests — state.json change/add/unlink emit events, graph.yaml ignored, layout.json ignored, non-workgraph domain state.json ignored
- T003 (Slug extraction): 4 tests — simple slug, hyphens, dots, nested node data paths ignored
- T004 (Subscriber pattern): 6 tests — unsubscribe returns function, unsubscribe stops events, multiple subscribers, correct event fields (CF-09 shape + instanceof Date), name is 'workgraph-watcher', error isolation (throwing subscriber doesn't block others)
- All tests include 5-field Test Doc comments
- Used shared helpers: `makeEvent()`, `stateJsonPath()`

### Evidence
```
Test Files  1 failed (1)
     Tests  16 failed (16)
TypeError: WorkGraphWatcherAdapter is not a constructor
```
All 16 tests fail because `WorkGraphWatcherAdapter` class does not exist yet. RED confirmed.

### Files Changed
- `test/unit/workflow/workgraph-watcher.adapter.test.ts` — Created (16 tests)

**Completed**: 2026-02-01
---

## Task T005: Implement WorkGraphWatcherAdapter (GREEN) {#task-t005-green}
**Dossier Task**: [T005](tasks.md#T005) | **Plan Task**: 3.5
**Started**: 2026-02-01

### What I Did
- Implemented `WorkGraphWatcherAdapter` class in `workgraph-watcher.adapter.ts`
- `readonly name = 'workgraph-watcher'`
- `private readonly subscribers = new Set<GraphChangedCallback>()`
- `handleEvent(event)`: regex match `/work-graphs\/([^/]+)\/state\.json$/`, extract slug, build `WorkGraphChangedEvent`, dispatch to all subscribers with per-callback try/catch
- `onGraphChanged(callback)`: add to set, return removal function
- Extracted `STATE_JSON_REGEX` as module-level constant
- `GraphChangedCallback` type alias for subscriber function signature

### Discoveries
- Barrel exports (T006) had to be done simultaneously with T005 because tests import from `@chainglass/workflow` which resolves through the barrel chain. Tests couldn't pass without exports being wired up first.
- Biome lint required import sorting fix in test file (`organizeImports` rule)

### Evidence
```
npx vitest run workgraph-watcher.adapter.test.ts → 16 passed (16)
just typecheck → clean
just fft → 191 test files passed, 2748 tests passed, 0 failures
```

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts` — Added class implementation

**Completed**: 2026-02-01
---

## Task T006: Update Barrel Exports {#task-t006-barrel}
**Dossier Task**: [T006](tasks.md#T006) | **Plan Task**: 3.6
**Started**: 2026-02-01

### What I Did
- Added `WorkGraphWatcherAdapter` (value export) and `WorkGraphChangedEvent` (type export) to feature barrel `index.ts`
- Added corresponding re-exports to main barrel `packages/workflow/src/index.ts`
- Done simultaneously with T005 (see discovery above)

### Evidence
```
just typecheck → clean
just fft → 191 test files passed, 2748 tests passed, 0 failures
```

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/index.ts` — Added adapter + type exports
- `packages/workflow/src/index.ts` — Added re-exports

**Completed**: 2026-02-01
---

## Final Validation
**Started**: 2026-02-01

### Evidence
```
just fft → 191 test files passed, 2748 tests passed, 0 failures
just typecheck → clean
AC4 verified: adapter self-filters (6 filtering tests)
AC5 verified: state.json under work-graphs/ only (16 tests)
CF-09 verified: WorkGraphChangedEvent matches old GraphChangedEvent shape (5 fields)
```

All Phase 3 acceptance criteria met.

**Completed**: 2026-02-01
---
