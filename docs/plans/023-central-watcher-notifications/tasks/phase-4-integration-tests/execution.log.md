# Phase 4: Integration Tests — Execution Log

**Plan**: 023-central-watcher-notifications
**Phase**: Phase 4: Integration Tests
**Started**: 2026-02-01

---

## Task T001: Write integration test — service detects file creation {#task-t001-file-detection}
**Dossier Task**: [T001](tasks.md#T001) | **Plan Task**: 4.1
**Started**: 2026-02-01

### What I Did
- Created test file at `test/integration/workflow/features/023/central-watcher.integration.test.ts`
- Established shared `beforeEach`/`afterEach` with:
  - Unique temp dir with `.chainglass/data/work-graphs/demo-graph/` structure
  - Initial `state.json` written (chokidar `ignoreInitial=true` requires existing file for `change` events)
  - Real `NodeFileSystemAdapter` + `ChokidarFileWatcherFactory`
  - `FakeWorkspaceRegistryAdapter` + `FakeGitWorktreeResolver` for controlled test state
  - `CentralWatcherService` construction with real + fake deps
  - `afterEach` stops service if running + cleans up temp dir
- Wrote T001 test: registers `FakeWatcherAdapter`, starts service, writes file, asserts `WatcherEvent` fields
- Uses poll-based capture: `sleep(1000)` then check `calls[]` array
- 5-field Test Doc comment included

### Evidence
```
npx vitest run central-watcher.integration.test.ts → 1 passed (1) in 1.83s
Test took 1210ms (200ms init + ~300ms awaitWriteFinish + margin)
```

### Files Changed
- `test/integration/workflow/features/023/central-watcher.integration.test.ts` — Created (shared setup + T001 test)

**Completed**: 2026-02-01
---

## Task T002: Write integration test — workgraph adapter E2E pipeline {#task-t002-adapter-e2e}
**Dossier Task**: [T002](tasks.md#T002) | **Plan Task**: 4.2
**Started**: 2026-02-01

### What I Did
- Added second `describe` block: "WorkGraphWatcherAdapter end-to-end"
- Wrote T002 test: registers `WorkGraphWatcherAdapter` + subscribes with `onGraphChanged`, writes `state.json`, asserts all 5 `WorkGraphChangedEvent` fields (CF-09)
- Uses promise-resolve-from-callback bridge: `new Promise(resolve => { adapter.onGraphChanged(resolve) })` + `Promise.race` with 5s timeout
- 5-field Test Doc comment included

### Evidence
```
npx vitest run central-watcher.integration.test.ts → 2 passed (2)
T002 took 405ms (200ms init + ~300ms awaitWriteFinish + margin, well within 5s timeout)
```

### Files Changed
- `test/integration/workflow/features/023/central-watcher.integration.test.ts` — Added T002 test + imports

**Completed**: 2026-02-01
---

## Task T003: Write integration test — non-matching file ignored {#task-t003-filter}
**Dossier Task**: [T003](tasks.md#T003) | **Plan Task**: 4.3
**Started**: 2026-02-01

### What I Did
- Added T003 test in "WorkGraphWatcherAdapter end-to-end" describe block
- Writes `layout.json` (not `state.json`), waits 500ms, asserts zero `WorkGraphChangedEvent` emitted
- 5-field Test Doc comment included

### Evidence
```
npx vitest run central-watcher.integration.test.ts → 3 passed (3)
T003 took 704ms (200ms init + 500ms wait)
```

### Files Changed
- `test/integration/workflow/features/023/central-watcher.integration.test.ts` — Added T003 test

**Completed**: 2026-02-01
---

## Task T004: Write integration test — cleanup on stop {#task-t004-cleanup}
**Dossier Task**: [T004](tasks.md#T004) | **Plan Task**: 4.4
**Started**: 2026-02-01

### What I Did
- Added T004 test in "CentralWatcherService integration" describe block
- Start service, stop it, write file, wait 500ms, assert zero events
- 5-field Test Doc comment included

### Discoveries
- Biome `organizeImports` rule required merging `import type { WorkGraphChangedEvent }` into the value import block (using `type` keyword inline). Same pattern discovered in Phase 3 (T005).

### Evidence
```
npx vitest run central-watcher.integration.test.ts → 4 passed (4)
T004 took 705ms (200ms init + 500ms wait)
just typecheck → clean
just fft → 192 test files passed, 2752 tests passed, 0 failures
```

### Files Changed
- `test/integration/workflow/features/023/central-watcher.integration.test.ts` — Added T004 test, fixed import sorting

**Completed**: 2026-02-01
---

## Final Validation {#final-validation}
**Started**: 2026-02-01

### Evidence
```
just fft → 192 test files passed, 2752 tests passed (up from 2748), 0 failures
just typecheck → clean
AC1 verified: Service detects real file creation via chokidar (T001)
AC3 verified: Events dispatched to registered adapter end-to-end (T001)
AC4+AC5 verified: WorkGraphWatcherAdapter filters state.json E2E (T002, T003)
AC8 verified: stop() prevents further events (T004)
AC10 verified: All 4 tests use real ChokidarFileWatcherFactory + NodeFileSystemAdapter
CF-04 timing verified: 200ms init, 1000ms poll, 500ms "no event" waits all stable
CF-09 verified: All 5 WorkGraphChangedEvent fields correct in E2E test
```

All Phase 4 acceptance criteria met.

**Completed**: 2026-02-01
---
