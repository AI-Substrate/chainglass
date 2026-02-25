# Live File Events

**Mode**: Full
**File Management**: PlanPak

📚 This specification incorporates findings from `research.md` and three workshops:
- `workshops/01-browser-event-hub-design.md` — Client-side event hub with pattern-based subscriptions
- `workshops/02-worktree-wide-watcher-strategy.md` — Server-side watcher expansion, ignore patterns, debouncing
- `workshops/03-in-place-tree-viewer-updates.md` — UI update behaviors for tree, viewer, editor, preview

---

## Research Context

- **Components affected**: CentralWatcherService, WorkspaceDomain const, bootstrap function, SSE pipeline, FileTree, FileViewerPanel, BrowserClient, CodeEditor
- **Critical dependencies**: Existing three-layer notification pipeline (Plans 023, 027), chokidar v4, SSEManager singleton, useSSE hook, file browser components (Plan 041)
- **Modification risks**: CentralWatcherService extension touches a battle-tested service; worktree-wide watching generates significantly more events than current `.chainglass/data/` watching; SSE volume during git operations (checkout/merge/rebase) could overwhelm clients
- **Existing assets**: Mature adapter chain pattern (IWatcherAdapter → DomainEventAdapter → ICentralEventNotifier → SSE), proven chokidar config (`atomic: true`, `awaitWriteFinish`), contract test infrastructure with 7 fake implementations, heartbeat mechanism (30s keepalive)
- **Prior learnings**: 15 discoveries from Plans 023, 027, 041 — including battle-proven chokidar config (PL-01), 200ms init delay (PL-02), callback-set pattern (PL-03), double-broadcast race condition (PL-04), notification-fetch canonical pattern (PL-05)
- **Link**: See `research.md` for full analysis

---

## Summary

Make the file browser feel alive by streaming filesystem changes to the browser in real time. When a file is created, modified, or deleted in a worktree, the file tree updates in-place, the file viewer shows an "externally changed" banner, and preview mode auto-refreshes — all without scroll jumps or page refreshes.

The feature has two halves: (1) expand the existing server-side file watcher from `.chainglass/data/` to the entire worktree and feed file change events through the SSE pipeline, and (2) build a browser-side event hub that components subscribe to with a single hook call — `useFileChanges('src/components/')` — making it trivially easy for any part of the UI to react to file changes.

This is the "SDK For Us" concept: tuck away the complexity of chokidar, SSE channels, debouncing, and event dispatch behind a one-line hook. Encourage the entire application to be reactive to filesystem changes by making it effortless.

---

## Goals

- **Live file tree**: When files are added, modified, or deleted in the worktree, the tree view updates in-place — new entries appear, deleted entries disappear, modified entries show an amber indicator. No manual refresh button needed. The user's scroll position and expanded state are preserved.
- **External change awareness**: When the currently open file is modified outside the editor (by another tool, a git operation, or a build script), the file viewer shows a visible "changed externally" banner. The user can click Refresh to load the new content.
- **Preview auto-refresh**: In preview mode (read-only), the content auto-refreshes when the underlying file changes. No banner needed — just seamlessly show the latest content.
- **Edit mode protection**: In edit mode, external changes show the banner but do NOT auto-replace the editor content. The user's unsaved changes are safe until they explicitly refresh.
- **Working changes live update**: The ChangesView sidebar re-fetches `git status` when files change, showing real-time working changes without manual refresh.
- **One-line subscription API**: Any component can subscribe to file changes with `useFileChanges('pattern')`. Patterns support exact paths (`src/App.tsx`), directory children (`src/components/`), and recursive (`src/**`). Cleanup is automatic on unmount.
- **Efficient event pipeline**: Server-side debouncing (300ms batches) and aggressive ignore patterns (node_modules, .git, dist, .next, etc.) keep SSE volume manageable. No event storms during git operations or dependency installs.
- **Double-event suppression**: When the user saves a file in the editor, the watcher-generated event is suppressed (~2s window) so the user doesn't see a false "changed externally" banner immediately after saving.
- **Graceful lifecycle**: Watcher starts at server startup for all worktrees. SSE connections clean up automatically when the user navigates away or closes the browser (via existing 30s heartbeat mechanism).

---

## Non-Goals

- **Full file sync / collaboration**: This is a single-user tool. No conflict resolution between multiple editors, no operational transform, no CRDT.
- **File content in SSE messages**: Per ADR-0007 (notification-fetch pattern), SSE carries only file paths and event types. Clients fetch full content via REST when needed.
- **Configurable ignore patterns per workspace**: The default ignore set covers 95% of use cases. Per-workspace configuration is a future enhancement.
- **Virtual scrolling for the tree**: The tree uses standard DOM rendering with React key stability. Virtual scrolling is out of scope — most worktrees have <1000 visible entries.
- **Watching files outside the worktree**: Only files within the worktree root are watched. External symlink targets, network mounts, or files in other worktrees are excluded.
- **Lazy watching (only expanded directories)**: The watcher watches the entire worktree eagerly. Lazy per-directory watching adds complexity for marginal resource savings.
- **Editor merge/diff on external change**: When a file changes externally, the user sees a banner and can refresh. There is no inline merge UI showing what changed.
- **Custom event channels per component**: The hub uses one SSE connection per worktree. Components subscribe via pattern matching, not dedicated channels.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/events | existing | **modify** | Expand CentralWatcherService with source watchers, add FileChangeWatcherAdapter + FileChangeDomainEventAdapter, add WorkspaceDomain.FileChanges channel, build FileChangeHub + FileChangeProvider + useFileChanges on client side |
| file-browser | existing | **modify** | Wire BrowserClient to FileChangeProvider, add useTreeDirectoryChanges hook, add "externally changed" banner to FileViewerPanel, add new-entry animation to FileTree, integrate ChangesView refresh |
| _platform/file-ops | existing | **consume** | IFileSystem used by directory listing re-fetches (no changes to domain) |
| _platform/viewer | existing | **consume** | FileViewer/MarkdownViewer/DiffViewer render refreshed content (no changes to domain) |
| _platform/workspace-url | existing | **consume** | Worktree URL params provide context for SSE scoping (no changes to domain) |

---

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=1, F=1, T=2
  - Surface Area (S=2): Cross-cutting — touches CentralWatcherService (workflow package), WorkspaceDomain (shared package), bootstrap function (web), SSE pipeline (web), 4+ file browser components (web), new feature folder (045-live-file-events)
  - Integration (I=1): One existing external dependency (chokidar) with expanded scope. No new npm packages.
  - Data/State (D=0): No schema changes, no migrations, no new data models. State is ephemeral (SSE connections, hub subscriptions).
  - Novelty (N=1): Some ambiguity in event volume management and scroll preservation, but workshops have resolved the key design questions. Patterns follow proven exemplars (WorkGraphWatcherAdapter, useWorkGraphSSE).
  - Non-Functional (F=1): Performance matters — event debouncing, ignore patterns, and batch size affect UX latency. Security is covered by existing path validation.
  - Testing/Rollout (T=2): Needs unit tests for adapters/hub, contract tests for fakes, integration tests for end-to-end pipeline, component tests for UI behaviors. Staged phases: server pipeline first, then client hub, then UI wiring.
- **Confidence**: 0.85
- **Assumptions**:
  - chokidar v4 handles worktree-wide watching efficiently with proper ignore patterns
  - 300ms server debounce + 100ms client debounce provides responsive UX (~700ms total latency)
  - React key stability on `entry.path` prevents scroll jump without explicit scroll position management
  - Existing SSE heartbeat (30s) handles connection cleanup without additional lifecycle management
  - Browser-native EventSource auto-reconnect is sufficient (no custom reconnection needed in provider)
- **Dependencies**:
  - Plan 023 (CentralWatcherService) — stable, extending existing service
  - Plan 027 (Central event notifier, SSE pipeline) — stable, adding new channel
  - Plan 041 (File browser components) — stable, adding event integration to existing components
  - Plan 042 (Toast system) — stable, used for feedback
- **Risks**:
  - Event volume during git checkout/merge with 200+ changed files — mitigated by 300ms debounce + dedup within batch
  - chokidar memory for large worktrees (10K+ files) — mitigated by ignore patterns removing node_modules/dist/etc; ~1MB overhead for 10K files
  - False "externally changed" banner after editor save — mitigated by 2s suppression window
  - Race condition: SSE event arrives while directory re-fetch is in-flight — mitigated by React state batching (last-write-wins)
- **Phases**: Suggested high-level phasing:
  1. Server-side: FileChangeWatcherAdapter + FileChangeDomainEventAdapter + CentralWatcherService expansion + bootstrap wiring
  2. Client-side: FileChangeHub + FileChangeProvider + useFileChanges + WorkspaceDomain.FileChanges
  3. UI wiring: FileTree live updates + FileViewerPanel banner + preview auto-refresh + ChangesView refresh + double-event suppression

---

## Acceptance Criteria

### Server-Side Event Pipeline

- **AC-01**: When a file is created in a watched worktree (outside `.chainglass/`), a `file-changed` SSE event is broadcast on the `file-changes` channel within ~700ms, containing the relative path and `add` event type.
- **AC-02**: When a file is modified in a watched worktree, a `file-changed` SSE event is broadcast with the relative path and `change` event type.
- **AC-03**: When a file is deleted in a watched worktree, a `file-changed` SSE event is broadcast with the relative path and `unlink` event type.
- **AC-04**: Changes to files inside `node_modules/`, `.git/`, `dist/`, `.next/`, `.chainglass/`, and other ignored patterns do NOT produce SSE events.
- **AC-05**: Rapid file changes within a 300ms window are batched into a single SSE message containing all changes. If the same file changes multiple times in a batch, only the last event is kept (deduplication).
- **AC-06**: The `WorkspaceDomain` const includes a `FileChanges` entry whose value matches the SSE channel name (`'file-changes'`).

### Browser-Side Event Hub

- **AC-07**: `useFileChanges('src/App.tsx')` returns `{ hasChanges: true }` when `src/App.tsx` is modified, and `{ hasChanges: false }` otherwise.
- **AC-08**: `useFileChanges('src/components/')` returns changes only for direct children of `src/components/`, not nested subdirectories.
- **AC-09**: `useFileChanges('src/**')` returns changes for any file recursively under `src/`.
- **AC-10**: `useFileChanges('*')` returns changes for any file in the worktree.
- **AC-11**: When a component using `useFileChanges` unmounts, its subscription is automatically cleaned up. No memory leaks, no stale callbacks.
- **AC-12**: Only one SSE connection is created per worktree regardless of how many components subscribe via `useFileChanges`.
- **AC-13**: `FileChangeProvider` wraps the browser page; components outside the provider cannot call `useFileChanges` (throws context error).

### File Tree Live Updates

- **AC-14**: When a file is created in an expanded directory, a new entry appears in the tree at the correct sorted position without the user clicking refresh.
- **AC-15**: When a file is deleted from an expanded directory, its entry disappears from the tree without collapsing its parent directory.
- **AC-16**: When a file is modified in an expanded directory, its entry shows the amber "changed" indicator.
- **AC-17**: Tree updates do not change the user's scroll position or collapse/expand state.
- **AC-17a**: The manual refresh button remains as a fallback alongside live updates, for cases where SSE disconnects or the user wants to force a full re-scan.
- **AC-18**: Newly added files briefly show a green highlight animation (fade-in over ~1.5s) to draw attention.

### File Viewer External Change Awareness

- **AC-19**: In edit mode, when the open file is modified externally, a blue info banner appears: "This file was modified outside the editor" with a Refresh button.
- **AC-20**: In edit mode, the user's unsaved editor content is NOT replaced by external changes. Only clicking Refresh loads the new content.
- **AC-21**: In preview mode, when the open file is modified externally, the content auto-refreshes without a banner. The user sees the latest file content.
- **AC-22**: In diff mode, when the open file is modified externally, a blue info banner appears: "This file was modified. Diff may be outdated" with a Refresh button.
- **AC-23**: Preview auto-refresh does not cause scroll position to jump.

### Double-Event Suppression

- **AC-24**: When the user saves a file via the editor, the watcher-generated event for that save is suppressed for ~2 seconds. No "externally changed" banner appears after saving.
- **AC-25**: External changes to the same file (by another tool) that occur AFTER the 2s suppression window DO show the banner correctly.

### Lifecycle & Cleanup

- **AC-26**: When the user navigates away from the browser page (different workspace page), the `FileChangeProvider` unmounts and the SSE connection closes.
- **AC-27**: When the user closes the browser tab, the server-side SSE connection is cleaned up via heartbeat failure detection (within 30 seconds).
- **AC-28**: The server watcher starts at Next.js server startup via `instrumentation.ts` and watches all worktrees. No client-to-server "start watching" signal is needed.

---

## Risks & Assumptions

### Risks
- **Event storm during git operations**: A `git checkout` changing 200 files produces ~400 filesystem events in ~100ms. Mitigated by 300ms debounce window + deduplication (last event per file wins). After debounce, this becomes ~2-5 SSE messages, not 400.
- **Memory for large worktrees**: chokidar uses ~50-100 bytes per watched path. A 10K-file worktree = ~1MB overhead. Acceptable. A 50K-file monorepo = ~5MB — may need opt-in config later.
- **Stale scroll position after content change**: If auto-refreshed preview content changes length significantly, scroll position (pixels from top) is preserved but the visible content shifts. Accepted as natural browser behavior.
- **chokidar event ordering**: chokidar can emit spurious `unlink` → `add` sequences during atomic writes. The "last event wins" deduplication handles this correctly (the `add` event overwrites the `unlink`).

### Assumptions
- chokidar's `awaitWriteFinish: { stabilityThreshold: 300ms }` absorbs editor write-rename-write sequences
- Browser-native EventSource auto-reconnect is sufficient (no custom reconnection logic in FileChangeProvider)
- `entry.path` as React key is sufficiently stable for scroll preservation without explicit scrollTop management
- The existing SSE route `/api/events/[channel]` supports the new `file-changes` channel without modification (dynamic channel routing)
- Single SSE connection per worktree is sufficient (no per-directory channel splitting needed)

---

## Open Questions

None — all significant design questions were resolved in the three workshops and clarification session.

---

## Clarifications

### Session 2026-02-24

**Q1 (Workflow Mode)**: Pre-set to Full — CS-3 feature with multi-phase plan, 28 ACs, 2 domains modified.

**Q2 (Testing Strategy)**: Pre-set to Full TDD with fakes (no mocks) — clear contracts ideal for test-first development.

**Q3 (Documentation Strategy)**: No new documentation. Existing `docs/how/dev/central-events/` guides cover the adapter pattern, SSE pipeline, and testing. Code comments and JSDoc on new hooks/classes are sufficient.

**Q4 (Domain Review)**: Domain topology confirmed correct. `_platform/events` owns all event infrastructure (server + client hub). `file-browser` owns feature-specific wiring. No new domains, no breaking changes, no circular deps.

**Q5 (Tree refresh button)**: Manual refresh button kept as fallback alongside live updates — useful when SSE disconnects or user wants to force re-scan. Added AC-17a.

---

## Workshop Opportunities

All identified workshops have been completed:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| Browser-Side Event Hub Design | Integration Pattern | ✅ Complete | `workshops/01-browser-event-hub-design.md` |
| Worktree-Wide Watcher Strategy | Integration Pattern | ✅ Complete | `workshops/02-worktree-wide-watcher-strategy.md` |
| In-Place Tree & Viewer Updates | Integration Pattern / UX Design | ✅ Complete | `workshops/03-in-place-tree-viewer-updates.md` |

No additional workshops are needed before architecture.

---

## Documentation Strategy

- **Location**: No new documentation
- **Rationale**: The existing `docs/how/dev/central-events/` guides (1-overview, 2-usage, 3-adapters, 4-testing) already document the adapter pattern, SSE pipeline, and testing approach. Plan 045 follows the same patterns — code comments and JSDoc on the new hooks/classes are sufficient. The `useFileChanges` hook API is self-documenting (one pattern parameter, returns `{ changes, hasChanges, clearChanges }`).

---

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Event pipeline has clear contracts (IWatcherAdapter, DomainEventAdapter, FileChangeHub) ideal for test-first development. Existing fake infrastructure (7 fakes) provides proven patterns. Multi-layered debouncing and deduplication logic benefits from precise unit tests.
- **Mock Usage**: No mocks. Use fakes — the project has established fake implementations. New fakes: `FakeFileChangeWatcherAdapter`, `FakeFileChangeHub`.
- **Focus Areas**:
  - FileChangeWatcherAdapter: path filtering, debounce batching, deduplication, `.chainglass/` exclusion
  - FileChangeDomainEventAdapter: event transformation, SSE payload shape
  - FileChangeHub: pattern matching (exact, directory, recursive, wildcard), subscriber dispatch, error isolation
  - useFileChanges hook: subscription lifecycle, debounce, cleanup on unmount
  - Integration: watcher event → adapter → domain adapter → notifier → SSE → hub → component
  - Double-event suppression: save → suppress → external change after window → show banner
- **Excluded**:
  - Visual animation testing (green fade-in for new entries) — verify via browser MCP
  - chokidar internals — tested via integration with real filesystem
  - Scroll position preservation — verify via browser MCP, not unit testable
- **Established Patterns**:
  - Contract tests in `test/contracts/` for adapter interfaces (ensures fake/real parity)
  - Unit tests in `test/unit/` for adapters, hooks, hub class
  - Integration tests in `test/integration/` for end-to-end pipeline
  - Fakes co-located with real implementations in `packages/*/src/`
  - `createTestContainer()` for DI-based test isolation
