# Replace Chokidar with Native File Watcher — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-28
**Spec**: [native-file-watcher-spec.md](./native-file-watcher-spec.md)
**Status**: COMPLETE

## Summary

The Next.js dev server crashes with `spawn EBADF` because chokidar v5 uses kqueue (1 FD per file) instead of FSEvents. With 4 worktrees, this creates ~12,700 FDs; `fork()` fails. We replace `ChokidarFileWatcherAdapter` with `NativeFileWatcherAdapter` using Node.js `fs.watch({recursive: true})` which uses FSEvents on macOS (measured: 38 FDs vs 25,341 for the same directory). The `IFileWatcher`/`IFileWatcherFactory` interfaces are unchanged. Single-phase, TDD, no new docs.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/events | existing | **modify** | Replace chokidar adapter with native fs.watch adapter |
| _platform/file-ops | existing | consume | No changes |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/workflow/src/adapters/native-file-watcher.adapter.ts` | _platform/events | internal | New adapter replacing chokidar |
| `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts` | _platform/events | internal | Remove (replaced) |
| `packages/workflow/src/index.ts` | _platform/events | contract | Update exports: remove Chokidar, add Native |
| `apps/web/src/lib/di-container.ts` | _platform/events | internal | Swap factory in DI registration |
| `test/integration/workflow/features/023/central-watcher.integration.test.ts` | _platform/events | internal | Update to use NativeFileWatcherFactory |
| `packages/workflow/package.json` | _platform/events | internal | Remove chokidar dependency |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | chokidar v5 uses kqueue on macOS (1 FD/file). `fs.watch({recursive: true})` uses FSEvents (1 FD/tree). Measured 667x FD reduction. | Replace adapter — this is the entire plan |
| 02 | High | `fs.watch` emits only `'rename'`/`'change'`, not add/unlink/addDir/unlinkDir. But it provides full relative paths (verified: `sub/deep/file.txt`). | Adapter normalizes via `stat()` on rename events |
| 03 | High | `fs.watch` doesn't support `awaitWriteFinish`. CentralWatcherService passes `{stabilityThreshold: 200-300, pollInterval: 100}`. | Implement per-file debounce timer in adapter (accept option, apply internally) |
| 04 | High | `SOURCE_WATCHER_IGNORED` uses function-based predicates. `fs.watch` has no `ignored` option. | Apply ignored filters in adapter's event callback before emitting |
| 05 | Medium | `fs.watch` is one-path-per-watcher. IFileWatcher.add() called once per worktree. 3 watchers = 4 FDs total (verified). | One `FSWatcher` per `add()` call in internal Map — negligible FD cost |
| 06 | Low | `unwatch()` only implemented in chokidar adapter, never called by any consumer. | Implement as: close the FSWatcher for that path |
| 07 | Low | Integration test directly imports `ChokidarFileWatcherFactory` and has chokidar-specific timing. | Update import + adjust timing for native watcher latency |

## Implementation

**Objective**: Replace chokidar with native `fs.watch({recursive: true})` to eliminate FD exhaustion
**Testing Approach**: Full TDD — real filesystem operations, no mocks
**Complexity**: CS-2 (small)

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Create `NativeFileWatcherAdapter` implementing `IFileWatcher` | _platform/events | `/packages/workflow/src/adapters/native-file-watcher.adapter.ts` | Unit test: add() path, receive change/rename events, close() stops watcher | TDD: write integration test first against real fs |
| [ ] | T002 | Implement event normalization (rename→add/unlink/addDir/unlinkDir via stat) | _platform/events | same file | Test: create file → 'add', delete file → 'unlink', mkdir → 'addDir', rmdir → 'unlinkDir' | Per finding 02. Maintain known-paths Set for delete detection |
| [ ] | T003 | Implement `ignored` pattern filtering (string, RegExp, function predicates) | _platform/events | same file | Test: events for ignored paths are suppressed; function predicates work with SOURCE_WATCHER_IGNORED | Per finding 04 |
| [ ] | T004 | Implement write stabilization (awaitWriteFinish equivalent) | _platform/events | same file | Test: rapid writes to same file produce single event after stabilityThreshold | Per finding 03. Per-file debounce map |
| [ ] | T005 | Implement `add()` multi-path support via internal FSWatcher Map | _platform/events | same file | Test: add() multiple paths, events from each path fire correctly | Per finding 05. One FSWatcher per add() call |
| [ ] | T006 | Implement `unwatch()` and `close()` | _platform/events | same file | Test: unwatch() stops events for that path; close() stops all watchers | Per finding 06 |
| [ ] | T007 | Create `NativeFileWatcherFactory` implementing `IFileWatcherFactory` | _platform/events | same file | Factory create() returns NativeFileWatcherAdapter with options mapped | Alongside adapter in same file |
| [ ] | T008 | Swap DI registration: `NativeFileWatcherFactory` replaces `ChokidarFileWatcherFactory` | _platform/events | `/apps/web/src/lib/di-container.ts` | DI container resolves NativeFileWatcherFactory | Single line change |
| [ ] | T009 | Update barrel exports in `packages/workflow/src/index.ts` | _platform/events | `/packages/workflow/src/index.ts` | Export NativeFileWatcherFactory; deprecate/remove ChokidarFileWatcherFactory | |
| [ ] | T010 | Update integration test to use NativeFileWatcherFactory | _platform/events | `/test/integration/workflow/features/023/central-watcher.integration.test.ts` | Integration test passes with native watcher | Per finding 07. Adjust timing constants |
| [ ] | T011 | Remove chokidar from `packages/workflow/package.json` + `pnpm install` | _platform/events | `/packages/workflow/package.json` | `pnpm why chokidar` returns empty; build passes | |
| [ ] | T012 | Delete `chokidar-file-watcher.adapter.ts` | _platform/events | `/packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts` | File removed, no import references remain | After all tests pass |
| [ ] | T013 | Smoke test: start dev server with 4+ worktrees, verify no EBADF | _platform/events | — | Dev server serves pages; `lsof -p <pid>` shows < 200 FDs | AC-01, AC-06 |

### Acceptance Criteria

- [ ] AC-01: Dev server starts and serves pages without `spawn EBADF` with 4+ worktrees
- [ ] AC-02: `NativeFileWatcherAdapter` implements `IFileWatcher` (add, unwatch, close, on)
- [ ] AC-03: File change events (add, change, unlink, addDir, unlinkDir) fire correctly
- [ ] AC-04: `SOURCE_WATCHER_IGNORED` patterns applied as filters (no events for ignored paths)
- [ ] AC-05: Write stabilization implemented (equivalent to awaitWriteFinish)
- [ ] AC-06: FD count after startup with 4 worktrees < 200
- [ ] AC-07: All existing unit tests pass unchanged (they use FakeFileWatcher)
- [ ] AC-08: Integration test passes with real filesystem events
- [ ] AC-09: `chokidar` removed from package.json
- [ ] AC-10: Startup log shows watcher backend info

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `fs.watch` fires duplicate events on some platforms | Medium | Low | FileChangeWatcherAdapter already deduplicates (300ms debounce) |
| Write stabilization timing differs from chokidar | Medium | Medium | Use same thresholds (200-300ms); integration test validates |
| `fs.watch({recursive: true})` behavior differs on Linux | Low | Medium | Node >=20.19 supports it; CI runs on Linux to catch regressions |
| Removing chokidar breaks a transitive consumer | Low | Low | `pnpm why chokidar` audit shows no other consumers |
