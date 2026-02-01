# Phase 2: CentralWatcherService (TDD) — Execution Log

**Plan**: 023-central-watcher-notifications
**Phase**: Phase 2: CentralWatcherService (TDD)
**Started**: 2026-01-31

---

## Tasks T001–T004: RED Phase — All Tests Written {#tasks-t001-t004-red}
**Dossier Tasks**: [T001](tasks.md#T001), [T002](tasks.md#T002), [T003](tasks.md#T003), [T004](tasks.md#T004) | **Plan Tasks**: 2.1, 2.2, 2.3, 2.4
**Started**: 2026-01-31

### What I Did
- Wrote 24 tests in `test/unit/workflow/central-watcher.service.test.ts` across 4 `describe` blocks
- T001 (Lifecycle): 11 tests — watcher creation, watch paths, registry watcher, isWatching state, stop closes watchers, CF-08 adapter preservation, double-start throws, stop-when-not-watching, empty workspaces, skip missing data dir
- T002 (Dispatch): 6 tests — change/add/unlink forwarding, worktreePath+workspaceSlug metadata, late registration, multi-worktree dispatch
- T003 (Registry): 4 tests — new workspace on rescan, removed workspace on rescan, registry watcher triggers rescan, rapid change dedup
- T004 (Error): 3 tests — watcher creation failure isolation, adapter exception isolation, registry read failure handling
- All tests include 5-field Test Doc comments
- Used shared helpers: `setupSingleWorktree()`, `setupTwoWorktrees()`, `createTestWorkspace()`

### Evidence
```
Test Files  1 failed (1)
     Tests  24 failed (24)
TypeError: CentralWatcherService is not a constructor
```
All 24 tests fail because `CentralWatcherService` does not exist yet. RED confirmed.

### Files Changed
- `test/unit/workflow/central-watcher.service.test.ts` — Created (24 tests)

**Completed**: 2026-01-31
---

## Tasks T005–T008: GREEN Phase — Full Implementation {#tasks-t005-t008-green}
**Dossier Tasks**: [T005](tasks.md#T005), [T006](tasks.md#T006), [T007](tasks.md#T007), [T008](tasks.md#T008) | **Plan Tasks**: 2.5, 2.6, 2.7, 2.8
**Started**: 2026-01-31

### What I Did
- Created `central-watcher.service.ts` implementing `ICentralWatcherService`
- Constructor takes: `IWorkspaceRegistryAdapter`, `IGitWorktreeResolver`, `IFileSystem`, `IFileWatcherFactory`, `registryPath: string`, optional `ILogger`
- **T005 (Lifecycle)**: `start()` discovers worktrees via `registry.list()` → `worktreeResolver.detectWorktrees()` → `fs.exists()` → creates `IFileWatcher` per worktree. `stop()` closes all watchers, preserves adapters (CF-08). Double-start throws.
- **T006 (Dispatch)**: `Set<IWatcherAdapter>` stores adapters. Each data watcher's `on('change'|'add'|'unlink')` builds `WatcherEvent` with correct metadata and calls `handleEvent()` on all adapters. Late-registered adapters work because handlers reference live adapter set.
- **T007 (Registry)**: Registry watcher fires `rescan()` on change. `rescan()` diffs current vs new worktrees, creates/closes watchers. `isRescanning` + `rescanQueued` pattern serializes rapid changes.
- **T008 (Error + Barrel)**: try/catch around watcher creation, adapter dispatch, and registry reads. `ILogger.error()` with `console.error` fallback. Updated feature barrel and main barrel to export `CentralWatcherService`.

### Evidence
```
Test Files  1 passed (1)
     Tests  24 passed (24)
just typecheck → clean
```

### Discoveries
- Implementation was done holistically (T005-T008 together) because the service is a single cohesive unit where lifecycle, dispatch, registry, and error handling are deeply intertwined.
- The `isRescanning` + `rescanQueued` pattern (queue exactly one pending rescan) handles rapid registry changes cleanly without needing a full async queue.
- `FakeWorkspaceRegistryAdapter` doesn't have `injectListError` support — test T004's registry error test overrides `list()` method directly. Not ideal but functional.

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` — Created
- `packages/workflow/src/features/023-central-watcher-notifications/index.ts` — Added `CentralWatcherService` export
- `packages/workflow/src/index.ts` — Added `CentralWatcherService` re-export

**Completed**: 2026-01-31
---

## Task T009: REFACTOR — Quality Pass {#task-t009-refactor}
**Dossier Task**: [T009](tasks.md#T009) | **Plan Task**: 2.9
**Started**: 2026-01-31

### What I Did
- **AC12 verification**: Grepped `central-watcher.service.ts` for domain-specific imports (workgraph, agent, sample) — zero matches
- **Lint fix**: Resolved `noImplicitAnyLet` errors by refactoring `let` + try/catch to `const` + `.catch()` pattern — avoids needing `Workspace`/`Worktree` type imports in service file
- **Lint fix**: Resolved `noNonNullAssertion` errors in test file by replacing `!` with `as FakeFileWatcher` pattern (matching existing test conventions)
- **Lint fix**: Resolved `useImportType` by moving `FakeFileWatcher` to `import type` (used only in type position via `as` casts)
- **Format fix**: Ran `just format` to auto-format both files per biome conventions
- **Full validation**: `just fft` passes clean

### Evidence
```
AC12: grep "workgraph|agent|sample" central-watcher.service.ts → No matches found
just fft → 190 test files passed, 2731 tests passed, 0 failures
```

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` — Refactored error handling to avoid implicit any
- `test/unit/workflow/central-watcher.service.test.ts` — Fixed lint/format issues

**Completed**: 2026-01-31
---

## Review Fix Pass {#review-fix-pass}
**Review**: review.phase-2-centralwatcherservice-tdd.md
**Started**: 2026-02-01

### What I Did
Fixed 15 HIGH severity findings from code review:

**Correctness (CORR-001)**: Added `.catch()` handler to fire-and-forget `this.rescan()` in registry watcher callback — prevents unhandled promise rejections.

**Performance (PERF-001, PERF-002)**: Parallelized `createDataWatchers()` and `performRescan()` using `Promise.all()` — workspace discovery, watcher creation, watcher closure, and watcher addition all run concurrently instead of sequential N+1 loops.

**Observability (OBS-001, OBS-002, OBS-003)**: Added `logInfo()` and `logDebug()` helpers. `start()` logs worktree count, `stop()` logs watcher count, `createWatcherForWorktree()` logs each watcher creation with worktreePath/workspaceSlug.

**Graph Integrity (LINK-001 to LINK-012)**: Added `[📋 log](execution.log.md#anchor)` links in all 9 task Notes columns. Added `[T00N](tasks.md#T00N)` backlinks in all 3 log entry headers.

### Evidence
```
npx vitest run central-watcher.service.test.ts → 25 passed (25)
just typecheck → clean
just fft → 190 test files passed, 2732 tests passed, 0 failures
```

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` — CORR-001, PERF-001, PERF-002, OBS-001/002/003
- `test/unit/workflow/central-watcher.service.test.ts` — V5 test (rescan-after-stop), V6 fix (setTimeout→flushMicrotasks)
- `docs/.../tasks/phase-2-centralwatcherservice-tdd/tasks.md` — LINK-001 to LINK-009
- `docs/.../tasks/phase-2-centralwatcherservice-tdd/execution.log.md` — LINK-010 to LINK-012, this entry

**Completed**: 2026-02-01
---

## Final Validation
**Started**: 2026-02-01

### Evidence
```
just fft → 190 test files passed, 2732 tests passed, 0 failures
just typecheck → clean
AC12 verified: zero domain-specific imports
```

All Phase 2 acceptance criteria met. All HIGH review findings resolved.

**Completed**: 2026-02-01
---

