# Replace Chokidar with Native File Watcher

**Mode**: Simple
**Testing**: Full TDD (real filesystem, no mocks/fakes)
**Documentation**: No new documentation
**Fallback**: None — requires Node >=20.19.0 (already enforced)

📚 This specification incorporates findings from `../059-fix-agents/research-dossier.md` and live diagnostic measurements from session 2026-02-28.

## Research Context

**Problem discovered**: The Next.js dev server fails with `spawn EBADF` when the `CentralWatcherService` (Plans 023, 027, 045) watches multiple worktrees. Root cause analysis and live measurements revealed:

- **Chokidar v5 dropped FSEvents support** — it exclusively uses Node.js `fs.watch()` which on macOS falls back to kqueue, opening **1 file descriptor per watched file**
- **Measured**: Watching `packages/` (~5,000 files) with chokidar v5 = **25,341 FDs**
- **Measured**: Same directory with native `fs.watch({recursive: true})` = **38 FDs** (667x reduction)
- **4 chainglass worktrees + Fermi + studio-agent** accumulate ~12,700 FDs at dev server startup
- **Node.js `fork()`** (used by jest-worker for `getStaticPaths`) fails when it can't inherit all FDs → `spawn EBADF`
- **Node 24 supports `fs.watch({recursive: true})` on macOS** (confirmed via test) — uses FSEvents natively
- **The architecture is sound** (domain-agnostic watcher, adapter self-filtering, SSE pipeline) — only the chokidar backend is wrong

## Summary

Replace the `ChokidarFileWatcherAdapter` and `ChokidarFileWatcherFactory` with a native Node.js `fs.watch({recursive: true})` implementation. This eliminates the file descriptor exhaustion that prevents the dev server from functioning when multiple workspaces and worktrees are registered. The existing `IFileWatcher` / `IFileWatcherFactory` interfaces remain unchanged — only the concrete implementation swaps.

**WHY**: Every developer running the Chainglass dev server with more than ~2 workspaces or ~3 worktrees hits `spawn EBADF`. The application is unusable for multi-workspace development, which is the primary intended use case.

## Goals

- **Eliminate FD exhaustion**: Dev server must function with 10+ worktrees across multiple workspaces without hitting spawn EBADF
- **Zero architecture changes**: The `IFileWatcher` / `IFileWatcherFactory` interfaces, `CentralWatcherService`, all watcher adapters, domain event adapters, and SSE pipeline remain untouched
- **Maintain event fidelity**: All existing file change events (add, change, unlink, addDir, unlinkDir) continue to fire correctly
- **Remove chokidar dependency**: Eliminate the npm dependency that caused the regression (chokidar v5)
- **Add basic resource observability**: Log FD usage after watcher startup so future regressions are visible

## Non-Goals

- Changing the `CentralWatcherService` architecture or adapter pattern
- Adding watcher budgets or lazy watching (future work)
- Moving `IFileWatcherFactory` to a different domain package (known boundary issue, separate plan)
- Supporting non-macOS/Linux platforms (Windows uses different fs.watch behavior — deferred)
- Changing debounce timing, ignore patterns, or event batching logic

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/events | existing | **modify** | Replace chokidar adapter with native fs.watch adapter |
| _platform/file-ops | existing | **consume** | Uses IFileSystem contract (no changes) |

No new domains required — this is a backend swap within the existing Events domain boundary.

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=1, T=1
  - S=1: Multiple files touched (adapter, factory, tests, package.json) but all within one package
  - I=0: Replacing an external dep with a built-in — net reduction
  - D=0: No data/state changes
  - N=0: Well-specified — exact replacement with measured proof
  - F=1: Performance-critical (FD consumption must stay low, events must fire correctly)
  - T=1: Integration tests needed (real filesystem events, cross-platform behavior)
- **Confidence**: 0.90
- **Assumptions**:
  - Node.js `fs.watch({recursive: true})` is stable on macOS (confirmed in Node 24)
  - Node.js `fs.watch({recursive: true})` works on Linux (supported since Node 19.1)
  - The `ignored` option from chokidar can be replicated as a filter in the adapter
  - `awaitWriteFinish` behavior can be replicated with a stabilization timer
  - `atomic` write detection (temp→rename pattern) is handled by fs.watch natively
- **Dependencies**: None — uses only Node.js built-in APIs
- **Risks**:
  - `fs.watch({recursive: true})` event format differs from chokidar — adapter must normalize
  - `fs.watch` does not provide `awaitWriteFinish` — must implement stabilization manually
  - `fs.watch` does not support `ignored` patterns — must filter in adapter code
  - Linux `fs.watch({recursive: true})` may behave differently than macOS — needs integration test
- **Phases**:
  1. Implement `NativeFileWatcherAdapter` + `NativeFileWatcherFactory` with TDD, wire into DI, remove chokidar, verify dev server

## Acceptance Criteria

1. **AC-01**: Dev server starts and serves pages without `spawn EBADF` when 4+ worktrees are registered across 2+ workspaces
2. **AC-02**: `NativeFileWatcherAdapter` implements `IFileWatcher` interface (add, unwatch, close, on) with identical event semantics
3. **AC-03**: File change events (add, change, unlink, addDir, unlinkDir) fire correctly for watched directories
4. **AC-04**: `SOURCE_WATCHER_IGNORED` patterns are applied as filters (files matching patterns produce no events)
5. **AC-05**: Write stabilization is implemented (no events emitted for in-progress writes — equivalent to chokidar's `awaitWriteFinish`)
6. **AC-06**: File descriptor count after startup with 4 worktrees is < 200 (vs current ~12,700)
7. **AC-07**: All existing unit tests for `CentralWatcherService`, `FileChangeWatcherAdapter`, and `WorkflowWatcherAdapter` continue to pass using `FakeFileWatcher` (no changes needed)
8. **AC-08**: Integration test with real filesystem confirms events fire for file creation, modification, and deletion
9. **AC-09**: `chokidar` is removed from `package.json` dependencies (or moved to dev-only if needed for other consumers)
10. **AC-10**: Startup log includes watcher count and confirms watcher backend (e.g., `[CentralWatcherService] Started: 4 data watchers, 4 source watchers (native fs.watch)`)

## Risks & Assumptions

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| `fs.watch` event format differs from chokidar | Medium | High | Adapter normalizes events to match `FileWatcherEvent` type |
| `fs.watch` fires duplicate events on some platforms | Low | Medium | Deduplication already exists in `FileChangeWatcherAdapter` (300ms debounce) |
| `fs.watch({recursive: true})` not supported on older Linux kernels | Medium | Low | Fallback to non-recursive + manual directory enumeration |
| Missing `awaitWriteFinish` causes premature events | Medium | Medium | Implement stabilization timer in adapter (200-300ms like chokidar config) |
| chokidar used by other packages in monorepo | Low | Low | Audit via `pnpm why chokidar` before removal |

## Open Questions

~~All resolved — see Clarifications below.~~

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Adapter must correctly normalize `fs.watch` events into `IFileWatcher` contract. Real filesystem tests are the only way to verify event fidelity.
- **Focus Areas**: Event normalization (rename→add/unlink/addDir/unlinkDir via stat), ignored pattern filtering, write stabilization, close/cleanup
- **Mock Usage**: None — real filesystem operations only. Existing `FakeFileWatcher` tests for `CentralWatcherService` remain unchanged (they test the service, not the adapter).
- **Excluded**: No performance benchmarks (FD count verified manually during dev server smoke test)

## Event Normalization Design

`fs.watch` emits only two event types. The adapter maps them to `IFileWatcher` events:

| `fs.watch` event | `stat()` result | → `IFileWatcher` event |
|-------------------|----------------|----------------------|
| `'change'` | — | `'change'` |
| `'rename'` | exists + isFile | `'add'` |
| `'rename'` | exists + isDir | `'addDir'` |
| `'rename'` | ENOENT + was file | `'unlink'` |
| `'rename'` | ENOENT + was dir | `'unlinkDir'` |

**Note**: For unlink detection, the adapter maintains a lightweight `Set<string>` of known paths (populated from `rename`→exists events) to distinguish file vs directory deletions when `stat()` returns ENOENT.

## Clarifications

### Session 2026-02-28

**Q1: Workflow Mode** → **Simple** (CS-2, single-phase, quick path)

**Q2: Testing Strategy** → **Full TDD** with real filesystem events. No mocks, no fakes for the new adapter. Existing unit tests using FakeFileWatcher are untouched.

**Q3: Fallback Strategy** → **No fallback**. Node >=20.19.0 already enforced via `engines` in package.json. `fs.watch({recursive: true})` is stable on both macOS (FSEvents) and Linux (inotify) at this version.

**Q4: Event Normalization** → **Stat on rename**. On each `'rename'` event, call `fs.stat()` to determine: exists → add/addDir (isDirectory check), ENOENT → unlink/unlinkDir (track known paths to distinguish).

**Q5: Domain Review** → **Confirmed**. `_platform/events` only. Chokidar is solely in `packages/workflow/package.json`. All `IFileWatcher`/`IFileWatcherFactory` contracts unchanged. No boundary violations.

**Q6: Documentation Strategy** → **No new documentation**. Internal adapter swap, no user-facing changes.

**Q7 (resolved via audit)**: `pnpm why chokidar` + grep confirms chokidar is **only** in `packages/workflow/package.json`. Safe to remove.

**Q8 (resolved via test)**: `fs.watch({recursive: true})` confirmed working on Node 24/macOS. Events tested: mkdir → `rename`, writeFile → `rename`, unlink → `rename`, rmdir → `rename`. All map correctly via stat().
