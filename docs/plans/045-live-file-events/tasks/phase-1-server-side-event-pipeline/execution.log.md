# Execution Log: Phase 1 — Server-Side Event Pipeline

**Plan**: [live-file-events-plan.md](../../live-file-events-plan.md)
**Phase**: Phase 1: Server-Side Event Pipeline
**Started**: 2026-02-24

---

## Task T001: Add `ignored` field to FileWatcherOptions + ChokidarAdapter passthrough
**Started**: 2026-02-24T10:02
**Status**: ✅ Complete

### What I Did
Added optional `ignored?: (string | RegExp)[]` field to `FileWatcherOptions` interface and passed it through in `ChokidarFileWatcherAdapter` constructor to chokidar options.

### Evidence
All 25 existing CentralWatcherService tests pass without modification (additive change).

### Files Changed
- `packages/workflow/src/interfaces/file-watcher.interface.ts` — Added `ignored` field
- `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts` — Added `ignored: options.ignored` to chokidar config

**Completed**: 2026-02-24T10:02
---

## Task T002: Create SOURCE_WATCHER_IGNORED constants
**Started**: 2026-02-24T10:02
**Status**: ✅ Complete

### What I Did
Created `source-watcher.constants.ts` with `SOURCE_WATCHER_IGNORED` array containing 23 ignore patterns covering: .git, node_modules, vendor, .pnpm-store, dist, build, .next, .turbo, .cache, coverage, __pycache__, .idea, .vscode, *.swp, *.swo, *~, .DS_Store, Thumbs.db, .chainglass, pnpm-lock.yaml, package-lock.json, yarn.lock. Uses both string globs and RegExp for editor swap files.

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts` — New file

**Completed**: 2026-02-24T10:02
---

## Task T003: Add FileChanges to WorkspaceDomain
**Started**: 2026-02-24T10:02
**Status**: ✅ Complete

### What I Did
Added `FileChanges: 'file-changes'` entry to the `WorkspaceDomain` const. The `WorkspaceDomainType` union automatically includes the new value.

### Evidence
Build compiles. All existing tests pass.

### Files Changed
- `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` — Added FileChanges entry

**Completed**: 2026-02-24T10:02
---

## Task T004: Create FileChangeWatcherAdapter
**Started**: 2026-02-24T10:03
**Status**: ✅ Complete

### What I Did
Created `FileChangeWatcherAdapter` implementing `IWatcherAdapter` with:
- .chainglass/ path filtering
- Absolute→relative path conversion (from worktree root)
- 300ms debounce batching (configurable)
- Last-event-wins deduplication per `worktreePath:relativePath` key
- Callback-set subscriber pattern with error isolation
- `flushNow()` for testing, `destroy()` for cleanup
- Exported `FileChangeBatchItem` interface

### Evidence
20 unit tests pass covering filtering, path conversion, debounce, dedup, dispatch, error isolation, flushNow, destroy, and event shape.

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/file-change-watcher.adapter.ts` — New file
- `packages/workflow/src/features/023-central-watcher-notifications/index.ts` — Added exports
- `packages/workflow/src/index.ts` — Added exports
- `test/unit/workflow/file-change-watcher.adapter.test.ts` — New file (20 tests)

**Completed**: 2026-02-24T10:05
---

## Task T005: Create FileChangeDomainEventAdapter
**Started**: 2026-02-24T10:06
**Status**: ✅ Complete

### What I Did
Created `FileChangeDomainEventAdapter` extending `DomainEventAdapter<FileChangeBatchEvent>`. Constructor: `super(notifier, WorkspaceDomain.FileChanges, 'file-changed')`. `extractData()` maps changes array to `{ changes: [{path, eventType, worktreePath, timestamp}] }`.

### Evidence
3 unit tests pass: correct domain/event type, payload shape, empty changes array.

### Files Changed
- `apps/web/src/features/027-central-notify-events/file-change-domain-event-adapter.ts` — New file
- `test/unit/web/027/file-change-domain-event-adapter.test.ts` — New file (3 tests)

**Completed**: 2026-02-24T10:07
---

## Task T006: Create FakeFileChangeWatcherAdapter + contract tests
**Started**: 2026-02-24T10:06
**Status**: ✅ Complete

### What I Did
Created `FakeFileChangeWatcherAdapter` with: event recording via `handledEvents`, same .chainglass filtering and path conversion as real adapter, dedup, `flushNow()`, `subscriberCount`, `destroy()`, `reset()`. Created shared contract test suite with 8 tests (C01-C08) covering filtering, path conversion, dispatch, error isolation, dedup, unsubscribe, no-op flush. Both real and fake pass all 8.

### Evidence
16 contract tests pass (8 per implementation).

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/fake-file-change-watcher.ts` — New file
- `packages/workflow/src/features/023-central-watcher-notifications/index.ts` — Added export
- `packages/workflow/src/index.ts` — Added export
- `test/contracts/file-change-watcher.contract.ts` — New file (contract suite)
- `test/contracts/file-change-watcher.contract.test.ts` — New file (runner)

**Completed**: 2026-02-24T10:07
---

## Task T007: Write comprehensive unit tests for FileChangeWatcherAdapter
**Started**: 2026-02-24T10:03
**Status**: ✅ Complete

### What I Did
Unit tests for T004 were written as part of T004 (TDD — tests first). 20 tests in `file-change-watcher.adapter.test.ts` covering: 3 filtering tests, 3 path conversion tests, 4 debounce tests, 3 dedup tests, 3 subscriber dispatch tests, 3 flushNow/destroy tests, 1 event shape test.

### Evidence
All 20 tests pass.

### Files Changed
- `test/unit/workflow/file-change-watcher.adapter.test.ts` — Same file as T004

**Completed**: 2026-02-24T10:05
---

## Task T008: Expand CentralWatcherService with source watchers
**Started**: 2026-02-24T10:08
**Status**: ✅ Complete

### What I Did
- Added `sourceWatchers: Map<string, IFileWatcher>` alongside existing `dataWatchers`
- Added `createSourceWatchers()` method: creates one chokidar watcher per worktree root with `SOURCE_WATCHER_IGNORED` patterns, `awaitWriteFinish: { stabilityThreshold: 300 }`, and event handlers for change/add/unlink/addDir/unlinkDir
- Updated `start()`: calls `createSourceWatchers()` wrapped in try-catch after `createDataWatchers()` so source watcher failure doesn't block data watchers
- Updated `stop()`: closes both data and source watchers
- Updated `performRescan()`: closes source watchers for removed worktrees, creates source watchers for new worktrees (wrapped in try-catch)

### Evidence
32 tests pass (25 original + 7 new source watcher tests).

### Files Changed
- `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` — Added sourceWatchers map, createSourceWatchers(), updated start/stop/rescan

**Completed**: 2026-02-24T10:09
---

## Task T009: Refactor existing CentralWatcherService tests
**Started**: 2026-02-24T10:09
**Status**: ✅ Complete

### What I Did
- Added `findWatcherByPath()` and `findWatchersByPath()` helper methods to `FakeFileWatcherFactory` (query by path instead of index)
- Updated 3 watcher count assertions to account for source watchers (N*2 + 1 registry)
- Added 7 new tests for source watchers: creation per worktree, multiple worktrees, ignored patterns, event dispatch, stop cleanup, partial failure isolation, rescan cleanup

### Discoveries
- Source watcher creation order is: data(1) → source(2) → registry(3), not data → registry → source. Important for factory.create count-based tests.

### Evidence
All 32 tests pass (25 updated + 7 new).

### Files Changed
- `packages/workflow/src/fakes/fake-file-watcher.ts` — Added findWatcherByPath/findWatchersByPath
- `test/unit/workflow/central-watcher.service.test.ts` — Updated 3 assertions, added 7 new tests

**Completed**: 2026-02-24T10:11
---

## Task T010: Wire adapters in bootstrap + integration test
**Started**: 2026-02-24T10:11
**Status**: ✅ Complete

### What I Did
- Updated `startCentralNotificationSystem()` to create and wire `FileChangeWatcherAdapter(300)` and `FileChangeDomainEventAdapter(notifier)` alongside existing workgraph adapters
- Wired `fileChangeWatcherAdapter.onFilesChanged → fileChangeDomainAdapter.handleEvent({ changes })`
- Created integration test proving full pipeline: WatcherEvent → FileChangeWatcherAdapter → FileChangeDomainEventAdapter → notifier.emit('file-changes', 'file-changed', { changes }). Tests cover: modify, add, unlink, .chainglass filtering, batch+dedup.

### Evidence
5 integration tests pass.

### Files Changed
- `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` — Added file change adapter wiring
- `test/integration/045-live-file-events/watcher-to-file-change-notifier.integration.test.ts` — New file (5 tests)

**Completed**: 2026-02-24T10:13
---
