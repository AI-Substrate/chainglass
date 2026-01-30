# Subtask 001: File Watching for CLI Changes – Execution Log

**Subtask**: [001-subtask-file-watching-for-cli-changes.md](./001-subtask-file-watching-for-cli-changes.md)
**Plan**: [../../workgraph-ui-plan.md](../../workgraph-ui-plan.md)
**Parent Task**: T006 (Implement file polling)
**Started**: 2026-01-30T05:19

---

## SETUP-1: Install chokidar dependency
**Started**: 2026-01-30T05:20
**Status**: ✅ Complete

### What I Did
Installed chokidar v5.x in the workflow package.

### Commands
```bash
pnpm add chokidar --filter @chainglass/workflow
```

### Evidence
```
packages/workflow/package.json:
  "chokidar": "^5.0.0"
```

**Completed**: 2026-01-30T05:20

---

## ST003-1: Create IFileWatcher and IFileWatcherFactory interfaces
**Started**: 2026-01-30T05:21
**Status**: ✅ Complete

### What I Did
Created the adapter interfaces for file watching:
- `FileWatcherEvent`: Union type for events (add, change, unlink, etc.)
- `FileWatcherOptions`: Options matching chokidar config
- `IFileWatcher`: Interface for watcher instances with `add()`, `unwatch()`, `close()`, `on()`
- `IFileWatcherFactory`: Factory interface for creating watchers

### Files Created
- `packages/workflow/src/interfaces/file-watcher.interface.ts`

### Files Modified
- `packages/workflow/src/interfaces/index.ts` — Added exports

**Completed**: 2026-01-30T05:22

---

## ST003-2: Create IWorkspaceChangeNotifierService interface
**Started**: 2026-01-30T05:22
**Status**: ✅ Complete

### What I Did
Created the service interface and event types:
- `GraphChangedEvent`: Event payload with graphSlug, workspaceSlug, worktreePath, filePath, timestamp
- `GraphChangedCallback`: Callback type
- `IWorkspaceChangeNotifierService`: Service interface with `start()`, `stop()`, `onGraphChanged()`, `isWatching()`, `rescan()`

### Files Created
- `packages/workflow/src/interfaces/workspace-change-notifier.interface.ts`

### Files Modified
- `packages/workflow/src/interfaces/index.ts` — Added exports

**Completed**: 2026-01-30T05:22

---

## ST003-3: Create FakeFileWatcher and FakeFileWatcherFactory
**Started**: 2026-01-30T05:23
**Status**: ✅ Complete

### What I Did
Created the fake implementations for file watching:
- `FakeFileWatcher`: Implements `IFileWatcher` with test hooks for event simulation
- `FakeFileWatcherFactory`: Creates FakeFileWatchers and tracks them for test access

### Test Hooks Provided
- `simulateChange()`, `simulateAdd()`, `simulateUnlink()` — emit events
- `getWatchedPaths()`, `isWatching()`, `isClosed()` — inspect state
- Factory: `getLastWatcher()`, `getWatcherCount()` — access created watchers

### Files Created
- `packages/workflow/src/fakes/fake-file-watcher.ts`

### Files Modified
- `packages/workflow/src/fakes/index.ts` — Added exports

**Completed**: 2026-01-30T05:24

---

## ST003-4: Create FakeWorkspaceChangeNotifierService
**Started**: 2026-01-30T05:24
**Status**: ✅ Complete

### What I Did
Created the fake service for testing:
- Implements full `IWorkspaceChangeNotifierService` interface
- Call tracking: `startCalls`, `stopCalls`, `onGraphChangedCalls`, `rescanCalls`
- Stub configuration: `startError`, `stopError`, `rescanError`
- Test hooks: `emitGraphChanged()`, `createEvent()`, `reset()`

### Files Created
- `packages/workflow/src/fakes/fake-workspace-change-notifier.service.ts`

### Files Modified
- `packages/workflow/src/fakes/index.ts` — Added exports

**Completed**: 2026-01-30T05:25

---

## ST003-5: Write unit tests (TDD RED phase)
**Started**: 2026-01-30T05:25
**Status**: ✅ Complete

### What I Did
Created comprehensive unit test file with 32 tests covering:
- `start()`: 10 tests for initialization, watcher creation, multiple workspaces/worktrees
- `onGraphChanged()`: 8 tests for event emission, filtering, callbacks
- `rescan()`: 4 tests for dynamic workspace management
- `stop()`: 5 tests for cleanup behavior
- Edge cases: 5 tests for error handling, graceful degradation

### Evidence (TDD RED phase)
```
TypeError: WorkspaceChangeNotifierService is not a constructor
 ❯ test/unit/workflow/workspace-change-notifier.service.test.ts:66:15

 Test Files  1 failed (1)
      Tests  32 failed (32)
```

All 32 tests fail because the service doesn't exist yet - exactly the expected TDD RED state.

### Files Created
- `test/unit/workflow/workspace-change-notifier.service.test.ts`

**Completed**: 2026-01-30T05:28

---

## ST004-1: Create ChokidarFileWatcherAdapter
**Started**: 2026-01-30T05:28
**Status**: ✅ Complete

### What I Did
Created the production adapter that wraps chokidar:
- `ChokidarFileWatcherAdapter`: Implements `IFileWatcher` using chokidar.FSWatcher
- `ChokidarFileWatcherFactory`: Factory for creating adapters

### Files Created
- `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts`

### Files Modified
- `packages/workflow/src/adapters/index.ts` — Added exports

**Completed**: 2026-01-30T05:30

---

## ST004-2: Implement WorkspaceChangeNotifierService
**Started**: 2026-01-30T05:30
**Status**: ✅ Complete

### What I Did
Implemented the full service:
- Constructor injects: `IWorkspaceRegistryAdapter`, `IGitWorktreeResolver`, `IFileSystem`, `IFileWatcherFactory`, `registryPath`
- `start()`: Creates registry watcher + workgraph watcher, scans all workspaces
- `stop()`: Closes watchers, clears callbacks
- `onGraphChanged()`: Registers callbacks, returns unsubscribe function
- `rescan()`: Diffs current vs new watch paths, adds/removes as needed
- `handleFileChange()`: Filters for state.json, extracts graphSlug, emits events

### Files Created
- `packages/workflow/src/services/workspace-change-notifier.service.ts`

### Files Modified
- `packages/workflow/src/services/index.ts` — Added export

**Completed**: 2026-01-30T05:32

---

## ST004-3: Run unit tests (TDD GREEN phase)
**Started**: 2026-01-30T05:32
**Status**: ✅ Complete

### What I Did
Fixed test issues and achieved GREEN state:
1. Fixed `FakeFilesystem` → `FakeFileSystem` import
2. Fixed `stubExists` → `setDir` for filesystem fake
3. Fixed `stubDetectWorktrees` → `setWorktrees` for worktree resolver
4. Fixed `removeWorkspace` → `remove` for registry adapter
5. Fixed Worktree object structure (isMain/commit → head/isDetached/isBare/isPrunable)
6. Fixed Workspace instantiation (`new Workspace()` → `Workspace.create()`)

### Evidence (TDD GREEN phase)
```
 ✓ test/unit/workflow/workspace-change-notifier.service.test.ts (32 tests) 17ms

 Test Files  1 passed (1)
      Tests  32 passed (32)
```

### Discovery
⚠️ **Gotcha**: `Workspace` class has a private constructor. Tests must use `Workspace.create({...})` factory method, not `new Workspace({...})`. Using `new` with an object argument silently creates a broken instance with all properties undefined.

**Completed**: 2026-01-30T05:38

---

## ST004-4: Update workflow package exports
**Started**: 2026-01-30T05:38
**Status**: ✅ Complete

### What I Did
Updated all package exports:
- `packages/workflow/src/index.ts` — Added all new types, interfaces, classes, fakes
- `packages/workflow/src/interfaces/index.ts` — Added interface exports
- `packages/workflow/src/fakes/index.ts` — Added fake exports
- `packages/workflow/src/adapters/index.ts` — Added adapter exports
- `packages/workflow/src/services/index.ts` — Added service export

**Completed**: 2026-01-30T05:38

---

## ST005-1: Create integration test file
**Started**: 2026-01-30T05:39
**Status**: ✅ Complete

### What I Did
Created integration tests with real filesystem and chokidar:
1. `emits GraphChangedEvent when state.json is modified` — verifies real file change triggers callback
2. `ignores changes to non-state.json files` — verifies filtering works
3. `detects changes to multiple graphs` — verifies multiple graphs in one workspace
4. `stops watching after stop() is called` — verifies cleanup works

### Key Design Decisions
- Uses real `NodeFileSystemAdapter` and `ChokidarFileWatcherFactory`
- Uses fake registry and worktree resolver (we control test data)
- Creates temp directories with unique names per test
- Promise-based event completion (no arbitrary sleeps)

### Files Created
- `test/integration/workflow/workspace-change-notifier.integration.test.ts`

**Completed**: 2026-01-30T05:40

---

## ST005-2: Run integration tests
**Started**: 2026-01-30T05:40
**Status**: ✅ Complete

### Evidence
```
 ✓ test/integration/workflow/workspace-change-notifier.integration.test.ts (4 tests) 2826ms
   ✓ emits GraphChangedEvent when state.json is modified  408ms
   ✓ ignores changes to non-state.json files  705ms
   ✓ detects changes to multiple graphs  1005ms
   ✓ stops watching after stop() is called  707ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

**Completed**: 2026-01-30T05:41

---

## Quality Gates
**Started**: 2026-01-30T05:41
**Status**: ✅ Complete

### QA-1: Run all workflow tests
```
 Test Files  41 passed (41)
      Tests  731 passed (731)
```

### QA-2: Typecheck
Workflow package types pass

### QA-3: Lint
All 8 new files pass biome check.

### QA-4: FFT
Pre-existing lint issues in other files (not related to this subtask).
Our new code passes all checks.

**Completed**: 2026-01-30T05:44

---

# Subtask 001 Complete ✅

## Summary
Implemented the `WorkspaceChangeNotifierService` - a DI-integrated service that watches all registered workspaces for `state.json` changes and emits `GraphChangedEvent` when changes are detected.

## Deliverables

### Files Created (8)
| File | Purpose |
|------|---------|
| `packages/workflow/src/interfaces/file-watcher.interface.ts` | IFileWatcher, IFileWatcherFactory interfaces |
| `packages/workflow/src/interfaces/workspace-change-notifier.interface.ts` | IWorkspaceChangeNotifierService, GraphChangedEvent |
| `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts` | ChokidarFileWatcherAdapter, ChokidarFileWatcherFactory |
| `packages/workflow/src/fakes/fake-file-watcher.ts` | FakeFileWatcher, FakeFileWatcherFactory |
| `packages/workflow/src/services/workspace-change-notifier.service.ts` | WorkspaceChangeNotifierService |
| `packages/workflow/src/fakes/fake-workspace-change-notifier.service.ts` | FakeWorkspaceChangeNotifierService |
| `test/unit/workflow/workspace-change-notifier.service.test.ts` | 32 unit tests |
| `test/integration/workflow/workspace-change-notifier.integration.test.ts` | 4 integration tests |

### Files Modified (6)
| File | Change |
|------|--------|
| `packages/workflow/package.json` | Added chokidar ^5.0.0 |
| `packages/workflow/src/interfaces/index.ts` | Exports |
| `packages/workflow/src/adapters/index.ts` | Exports |
| `packages/workflow/src/fakes/index.ts` | Exports |
| `packages/workflow/src/services/index.ts` | Exports |
| `packages/workflow/src/index.ts` | Exports |

### Test Coverage
- **Unit tests**: 32 passing
- **Integration tests**: 4 passing
- **Total**: 36 new tests

## Key Discoveries

1. **Workspace.create() required**: The `Workspace` class has a private constructor. Tests must use `Workspace.create({...})` factory method, not `new Workspace({...})`.

2. **Worktree interface**: The `Worktree` interface has specific required fields (`head`, `isDetached`, `isBare`, `isPrunable`), not simplified fields like `isMain` or `commit`.

3. **Chokidar debouncing**: Using `atomic: true` + `awaitWriteFinish: { stabilityThreshold: 200 }` handles CLI's atomic write pattern automatically.
