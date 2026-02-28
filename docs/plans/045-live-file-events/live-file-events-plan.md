# Live File Events Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [live-file-events-spec.md](./live-file-events-spec.md)
**Status**: COMPLETE

**Workshops**:
- [01-browser-event-hub-design.md](workshops/01-browser-event-hub-design.md) — Client-side event hub, pattern matching, single SSE connection
- [02-worktree-wide-watcher-strategy.md](workshops/02-worktree-wide-watcher-strategy.md) — Server watcher expansion, ignore patterns, debounce
- [03-in-place-tree-viewer-updates.md](workshops/03-in-place-tree-viewer-updates.md) — Tree/viewer update behavior, scroll preservation, banners

---

## Summary

The file browser currently requires manual refresh to see filesystem changes. This plan extends the existing CentralWatcherService to watch entire worktrees (not just `.chainglass/data/`), feeds file change events through the established SSE pipeline via a new `file-changes` channel, and builds a browser-side `FileChangeHub` that lets any component subscribe to file changes with a single `useFileChanges('pattern')` hook call. The result: the file tree updates in-place, the viewer shows "externally changed" banners, and preview mode auto-refreshes — all without scroll jumps.

---

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/events | existing | **modify** | Expand CentralWatcherService with source watchers, add FileChangeWatcherAdapter + FileChangeDomainEventAdapter, add WorkspaceDomain.FileChanges channel, build FileChangeHub + FileChangeProvider + useFileChanges on client side |
| file-browser | existing | **modify** | Wire BrowserClient to FileChangeProvider, add useTreeDirectoryChanges hook, add "externally changed" banner to FileViewerPanel, add new-entry animation to FileTree, integrate ChangesView refresh |
| _platform/file-ops | existing | consume | No changes |
| _platform/viewer | existing | consume | No changes |
| _platform/workspace-url | existing | consume | No changes |

---

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` | events | contract | Add `FileChanges: 'file-changes'` entry |
| `packages/workflow/src/interfaces/file-watcher.interface.ts` | events | contract | Add `ignored` option to `FileWatcherOptions` |
| `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts` | events | internal | Pass `ignored` option through to chokidar |
| `packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts` | events | internal | SOURCE_WATCHER_IGNORED patterns array |
| `packages/workflow/src/features/023-central-watcher-notifications/file-change-watcher.adapter.ts` | events | internal | FileChangeWatcherAdapter — self-filtering, debounced |
| `packages/workflow/src/features/023-central-watcher-notifications/fake-file-change-watcher.ts` | events | internal | Test fake (follows fake-watcher-adapter.ts naming) |
| `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | events | internal | Add `sourceWatchers` map + `createSourceWatchers()` |
| `apps/web/src/features/027-central-notify-events/file-change-domain-event-adapter.ts` | events | internal | FileChangeDomainEventAdapter |
| `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` | events | internal | Wire FileChangeWatcherAdapter + FileChangeDomainEventAdapter |
| `apps/web/src/features/045-live-file-events/file-change-hub.ts` | events | contract | FileChangeHub class — pattern-based subscriber dispatch |
| `apps/web/src/features/045-live-file-events/file-change-provider.tsx` | events | contract | FileChangeProvider React context + SSE lifecycle |
| `apps/web/src/features/045-live-file-events/use-file-changes.ts` | events | contract | useFileChanges hook — pattern subscription |
| `apps/web/src/features/045-live-file-events/index.ts` | events | contract | Barrel export |
| `apps/web/src/features/041-file-browser/hooks/use-tree-directory-changes.ts` | file-browser | internal | useTreeDirectoryChanges — multi-directory subscription |
| `apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts` | file-browser | internal | Added handleRefreshDir for live cache-bypass directory refresh |
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | file-browser | internal | Add `newlyAddedPaths` prop + fade-in animation |
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | file-browser | internal | Add `externallyChanged` prop + blue info banner |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Wrap with FileChangeProvider, wire event subscriptions |

---

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `FileWatcherOptions` interface does NOT include `ignored` field — source watchers without ignore patterns will fire for node_modules/.git/dist | Add `ignored` field to interface + pass through in ChokidarFileWatcherAdapter. Phase 1 task. |
| 02 | Critical | `WorkspaceDomain` only has `Workgraphs` and `Agents` — no file-change channel | Add `FileChanges: 'file-changes'` entry. Phase 1 task. |
| 03 | High | `CentralWatcherService.start()` throws on double-start; source watcher partial failure leaves service half-initialized | Wrap source watcher creation in try/catch separate from data watchers. Log error but don't block data watcher startup. Phase 1 task. |
| 04 | High | Test suite uses watcher-by-index (`factory.getWatcher(0)`) — adding source watchers shifts indices | Refactor test helpers to query watchers by path/purpose. Phase 1 task. |
| 05 | High | `FileViewerPanel` has no `externallyChanged` prop or blue info banner | Add prop + banner component. Phase 3 task. |
| 06 | High | `BrowserClient` (post-Plan 043) has no SSE integration or FileChangeProvider | Wrap with FileChangeProvider in Phase 3. |

---

## Testing Philosophy

**Full TDD** — established codebase pattern.

- **Phase 1 (server)**: Unit tests for FileChangeWatcherAdapter (debounce, dedup, filtering), contract test for fake parity, integration test for watcher → adapter → notifier pipeline. Refactor existing CentralWatcherService tests for source watcher indices.
- **Phase 2 (client)**: Unit tests for FileChangeHub (pattern matching, subscriber dispatch, error isolation), unit test for useFileChanges hook (lifecycle, debounce, cleanup).
- **Phase 3 (UI wiring)**: Component tests for FileViewerPanel banner, FileTree animation prop. Integration test for double-event suppression.
- **No mocks**: Use fakes (FakeFileChangeWatcherAdapter, FakeFileChangeHub). Follow existing contract test pattern from Plan 027.

---

## Phase 1: Server-Side Event Pipeline

**Objective**: Enable worktree-wide file watching and route file change events through the SSE pipeline.
**Domain**: _platform/events
**Delivers**:
- `FileWatcherOptions.ignored` support in interface + chokidar adapter
- `SOURCE_WATCHER_IGNORED` constants
- `FileChangeWatcherAdapter` with 300ms debounce + dedup
- `FakeFileChangeWatcherAdapter` + contract tests
- `FileChangeDomainEventAdapter` (domain adapter → SSE)
- `CentralWatcherService` expansion (source watchers alongside data watchers)
- `WorkspaceDomain.FileChanges` channel entry
- Bootstrap wiring in `startCentralNotificationSystem()`
- Refactored CentralWatcherService tests for source watcher awareness
**Depends on**: None
**Key risks**: FileWatcherOptions interface change is cross-cutting; source watcher partial failure during start().

| # | Task | Domain | CS | Success Criteria | Notes |
|---|------|--------|----|-----------------|-------|
| 1.1 | Add `ignored` field to `FileWatcherOptions` interface | events | 1 | Interface compiles with new optional field. ChokidarFileWatcherAdapter passes `ignored` to chokidar options. Unit test verifies patterns reach chokidar. | Per finding 01. Cross-package change. |
| 1.2 | Create `SOURCE_WATCHER_IGNORED` constants | events | 1 | Constants file exports array with .git, node_modules, dist, .next, .chainglass, lock files, IDE dirs, OS files. | Per workshop 02. |
| 1.3 | Add `FileChanges: 'file-changes'` to `WorkspaceDomain` | events | 1 | Const object includes new entry. Type union updated. | Per finding 02. |
| 1.4 | Create `FileChangeWatcherAdapter` + fake + tests | events | 3 | Adapter: receives WatcherEvents, filters .chainglass/, converts abs→rel paths, batches in 300ms debounce window, deduplicates (last-event-wins), emits via `onFilesChanged()` callback-set. Fake (`fake-file-change-watcher.ts`): records events, exposes `flushNow()`. Contract test: both pass same suite. | Core server-side logic. Per workshop 02. |
| 1.5 | Create `FileChangeDomainEventAdapter` + test | events | 1 | Extends `DomainEventAdapter<FileChangeBatchEvent>`. `extractData()` returns `{ changes: [{path, eventType, worktreePath, timestamp}] }`. Unit test verifies payload shape. | Follows WorkgraphDomainEventAdapter pattern. |
| 1.6 | Expand `CentralWatcherService` with source watchers | events | 3 | New `sourceWatchers` map. `createSourceWatchers()` creates one chokidar watcher per worktree root with `SOURCE_WATCHER_IGNORED`. `start()` calls both `createDataWatchers()` and `createSourceWatchers()`. `stop()` closes both. `rescan()` handles both. Source watcher failures don't block data watchers. | Per finding 03. Refactor existing tests (finding 04). |
| 1.7 | Wire adapters in `startCentralNotificationSystem()` | events | 2 | Bootstrap creates FileChangeWatcherAdapter(300), FileChangeDomainEventAdapter(notifier). Wires `onFilesChanged → handleEvent`. Registers adapter with watcher service. Integration test: file change → adapter → notifier.emit('file-changes', ...). | Follows existing workgraph wiring pattern. |

### Acceptance Criteria (Phase 1)
- [x] AC-01: File created → `file-changed` SSE event with `add` type within ~700ms
- [x] AC-02: File modified → `file-changed` SSE event with `change` type
- [x] AC-03: File deleted → `file-changed` SSE event with `unlink` type
- [x] AC-04: node_modules/.git/dist/.next/.chainglass changes produce NO SSE events
- [x] AC-05: Rapid changes within 300ms batched + deduped
- [x] AC-06: WorkspaceDomain.FileChanges === 'file-changes'
- [x] AC-28: Server watcher starts at startup via instrumentation.ts

---

## Phase 2: Browser-Side Event Hub

**Objective**: Build the client-side event distribution system that components subscribe to via `useFileChanges()`.
**Domain**: _platform/events
**Delivers**:
- `FileChangeHub` class with pattern-based subscriber dispatch
- `FileChangeProvider` React context + SSE connection lifecycle
- `useFileChanges` hook with debounce + automatic cleanup
- `045-live-file-events` feature folder + barrel export
- Unit tests for hub (pattern matching, dispatch, error isolation) + hook (lifecycle, cleanup)
**Depends on**: Phase 1 (SSE events must be flowing)
**Key risks**: None — well-specified by workshop 01.

| # | Task | Domain | CS | Success Criteria | Notes |
|---|------|--------|----|-----------------|-------|
| 2.1 | Create `FileChangeHub` class + tests | events | 2 | Pattern matching: exact (`src/App.tsx`), directory (`src/components/`), recursive (`src/**`), wildcard (`*`). Subscriber dispatch: filters changes per-subscriber, calls callback with matching subset. Error isolation: throwing subscriber doesn't block others. Unit tests for all 4 patterns + edge cases. | Per workshop 01. |
| 2.2 | Create `FileChangeProvider` + SSE lifecycle | events | 2 | React context provides hub instance. Opens EventSource to `/api/events/file-changes`. Parses SSE messages, filters by worktreePath, dispatches to hub. Closes EventSource on unmount. Throws context error if used outside provider. | Per workshop 01. Raw EventSource (browser auto-reconnect). |
| 2.3 | Create `useFileChanges` hook + tests | events | 2 | Hook subscribes to hub via pattern. Returns `{ changes, hasChanges, clearChanges }`. Debounce configurable (default 100ms). Mode: `replace` (default) or `accumulate`. Auto-unsubscribe on unmount. Unit test with fake hub verifies lifecycle + cleanup. | Per workshop 01. |
| 2.4 | Create feature folder scaffold + barrel export | events | 1 | `apps/web/src/features/045-live-file-events/index.ts` exports FileChangeHub, FileChangeProvider, useFileChanges. | PlanPak pattern. |

### Acceptance Criteria (Phase 2)
- [x] AC-07: `useFileChanges('src/App.tsx')` → hasChanges true on modification
- [x] AC-08: `useFileChanges('src/components/')` → direct children only
- [x] AC-09: `useFileChanges('src/**')` → recursive match
- [x] AC-10: `useFileChanges('*')` → wildcard match
- [x] AC-11: Unmount cleans up subscription, no memory leaks
- [x] AC-12: Single SSE connection per worktree
- [x] AC-13: useFileChanges outside FileChangeProvider throws

---

## Phase 3: UI Wiring

**Objective**: Connect the event hub to FileTree, FileViewerPanel, and ChangesView for live updates.
**Domain**: file-browser
**Delivers**:
- `useTreeDirectoryChanges` hook for multi-directory subscription
- FileTree `newlyAddedPaths` prop + fade-in animation CSS
- FileViewerPanel `externallyChanged` prop + blue info banner
- Preview mode auto-refresh
- Diff mode stale banner
- ChangesView auto-refresh on file changes
- Double-event suppression (2s window after editor save)
- BrowserClient wired with FileChangeProvider + all subscriptions
**Depends on**: Phase 2 (hub + hook must exist)
**Key risks**: Scroll position preservation relies on React key stability; double-event suppression timing.

| # | Task | Domain | CS | Success Criteria | Notes |
|---|------|--------|----|-----------------|-------|
| 3.1 | Create `useTreeDirectoryChanges` hook | file-browser | 2 | Accepts `expandedDirs: Set<string>`. Subscribes to hub for each expanded dir. Unsubscribes from collapsed dirs. Returns `Map<string, FileChange[]>`. Unit test with fake hub. | Per workshop 01. |
| 3.2 | Add `newlyAddedPaths` prop + animation to FileTree | file-browser | 2 | New optional prop `newlyAddedPaths?: Set<string>`. Entries in set get `tree-entry-new` CSS class. CSS `@keyframes tree-entry-appear` fade-in (green bg → transparent, 1.5s). Component test verifies class applied. | Per workshop 03. |
| 3.3 | Add `externallyChanged` prop + blue banner to FileViewerPanel | file-browser | 2 | New prop `externallyChanged?: boolean`. When true, renders blue info banner above content: "This file was modified outside the editor" + Refresh button. Calls `onRefreshFile` on click. Banner distinct from amber conflict banner. Component test verifies render. | Per workshop 03, finding 05. |
| 3.4 | Wire FileChangeProvider into BrowserClient | file-browser | 2 | BrowserClient wraps PanelShell content with `<FileChangeProvider worktreePath={worktreePath}>`. useFileChanges for current open file → externallyChanged prop. useTreeDirectoryChanges for expanded dirs → re-fetch changed dirs. Preview mode auto-refresh via useEffect. | Per finding 06. |
| 3.5 | Wire ChangesView auto-refresh | file-browser | 1 | useFileChanges('*', { debounce: 500 }) in ChangesView or BrowserClient. On changes, re-fetch working changes (fetchWorkingChanges server action). | Per spec goal. |
| 3.6 | Implement double-event suppression | file-browser | 2 | In BrowserClient: track recently-saved paths in ref. After save, add path to set. Clear after 2s. Filter SSE events against suppression set before showing banner. Test: save → no banner; external change after 2s → banner appears. | Per workshop 01 suppression design. |
| 3.7 | Update existing tests for new props | file-browser | 1 | FileTree test: verify newlyAddedPaths class application. FileViewerPanel test: verify externallyChanged banner renders + Refresh button click. | Per finding 05. |

### Acceptance Criteria (Phase 3)
- [x] AC-14: File created in expanded dir → entry appears at correct sorted position
- [x] AC-15: File deleted from expanded dir → entry disappears, parent stays expanded
- [x] AC-16: File modified in expanded dir → amber indicator
- [x] AC-17: Tree updates preserve scroll position + expand state
- [x] AC-17a: Manual refresh button remains as fallback
- [x] AC-18: New files show green fade-in animation (~1.5s)
- [x] AC-19: Edit mode: blue "modified outside editor" banner with Refresh
- [x] AC-20: Edit mode: unsaved content NOT replaced
- [x] AC-21: Preview mode: auto-refresh without banner
- [x] AC-22: Diff mode: blue "diff may be outdated" banner with Refresh
- [x] AC-23: Preview auto-refresh preserves scroll position
- [x] AC-24: Editor save → no false banner for ~2s
- [x] AC-25: External change after suppression window → banner shows
- [x] AC-26: Navigate away → SSE connection closes
- [x] AC-27: Close tab → server cleans up within 30s

---

## Phase Completion Checklist

- [x] Phase 1: Server-Side Event Pipeline
- [x] Phase 2: Browser-Side Event Hub
- [x] Phase 3: UI Wiring

---

## Complexity Tracking

| Component | CS | Breakdown | Justification |
|-----------|-----|-----------|---------------|
| FileWatcherOptions + chokidar adapter (Phase 1) | 1 | S=1,I=0,D=0,N=0,F=0,T=0 | Interface additive change |
| FileChangeWatcherAdapter + fake (Phase 1) | 3 | S=1,I=0,D=0,N=1,F=0,T=1 | Debounce + dedup logic, contract tests |
| CentralWatcherService expansion (Phase 1) | 3 | S=1,I=1,D=0,N=0,F=0,T=1 | Existing service extension, test refactor |
| Bootstrap wiring (Phase 1) | 2 | S=1,I=1,D=0,N=0,F=0,T=0 | Follows existing pattern |
| FileChangeHub (Phase 2) | 2 | S=1,I=0,D=0,N=1,F=0,T=0 | Pattern matching is novel but small |
| FileChangeProvider + useFileChanges (Phase 2) | 2 | S=1,I=0,D=0,N=0,F=0,T=1 | SSE lifecycle + hook tests |
| UI wiring (Phase 3) | 3 | S=2,I=0,D=0,N=0,F=0,T=1 | Multi-component, new props + banners |
| Overall plan | 3 | S=2,I=1,D=0,N=1,F=1,T=2 | Per spec |

---

## ADR Alignment

| ADR | Status | Relevance | Notes |
|-----|--------|-----------|-------|
| ADR-0007 | Aligned | Notification-fetch pattern | SSE carries paths only; clients fetch via REST |
| ADR-0008 | Aligned | Workspace split storage | Source watcher ignores `.chainglass/data/` (watched separately) |
| ADR-0010 | Aligned | Three-layer notification architecture | New adapter follows established pipeline |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Event storm during git checkout (200+ files) | Medium | Medium | 300ms debounce + dedup → 2-5 SSE messages, not 400 |
| chokidar memory for large worktrees | Low | Low | Ignore patterns remove node_modules/dist; ~1MB for 10K files |
| False "externally changed" after save | High | Medium | 2s suppression window post-save |
| FileWatcherOptions change breaks existing watchers | Low | High | Additive optional field; existing callers unaffected |
| Source watcher partial failure on start | Low | Medium | Separate try/catch; data watchers continue |
| Test index regression from source watchers | High | Medium | Refactor tests to query by path, not index |

---

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| [FX001](fixes/FX001-source-watcher-data-dir-coupling.md) | 2026-02-26 | Source watchers gated on `.chainglass/data/` existence — workspaces without data dir get no live file events | _platform/events | Complete | User report |
