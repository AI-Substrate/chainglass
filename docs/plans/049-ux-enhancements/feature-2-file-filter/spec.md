# File Tree Quick Filter

**Mode**: Simple

📚 This specification incorporates findings from [research-dossier.md](./research-dossier.md) and three workshops:
- [001-file-scanner-cache-events.md](./001-file-scanner-cache-events.md) — Cache architecture & event integration
- [002-file-filter-ux.md](./002-file-filter-ux.md) — Original UX design (partially superseded)
- [003-ux-pivot-explorer-bar.md](./003-ux-pivot-explorer-bar.md) — **UX pivot**: integrate with ExplorerPanel instead of LeftPanel

---

## Research Context

- **Components affected**: ExplorerPanel (extend search mode), CommandPaletteDropdown (render file results), BrowserClient wiring, new hook + services
- **Critical dependencies**: Existing ExplorerPanel mode system (Plan 043/047 — `>` commands, `#` symbols, blank search stub), file change event system (Plan 045), FileTree navigation handlers, ChangesView badge pattern
- **Modification risks**: Extending CommandPaletteDropdown's `search` mode from static hints to live results. ExplorerPanel keyboard delegation needs extension for search mode. Cache adds a new `useFileChanges('*')` subscription.
- **Existing assets**: `useFileChanges` hook (Plan 045), `ChangesView` badge pattern (Plan 043), CommandPaletteDropdown keyboard nav + positioning, ExplorerPanel mode detection + handler chain
- **Prior learnings**: 10 relevant from plans 041, 043, 045 — established patterns for debounce, git ls-files, lazy fetching, event-driven refresh
- **Link**: See `research-dossier.md` for full analysis

---

## Summary

**WHAT**: File search integrated into the ExplorerPanel's existing mode system. When the user types in the ExplorerPanel without a `>` or `#` prefix, the CommandPaletteDropdown shows live file search results (replacing the "Search coming soon" stub). Results are a flat list with git status badges (M/A/D/?/R), sorted by recently changed (default) or alphabetically. The search is powered by a client-side cache of file paths + mtimes (from `git ls-files` + `fs.stat()`) that stays fresh via SSE file change event deltas.

**WHY**: Navigating large worktrees by expanding directories is slow when you roughly know the filename. Integrating with the ExplorerPanel provides VS Code-like file search using the existing command palette infrastructure — no new UI panels, no Portals, no LeftPanel changes. The ExplorerPanel already spans the full page width, so file paths are readable without truncation.

---

## Goals

- Users can type in the ExplorerPanel (without `>` or `#` prefix) to search files by partial name (substring) or glob pattern (`*.tsx`, `src/**/*.test`)
- Search results appear in the CommandPaletteDropdown as a flat list with git status badges (M/A/D/?/R)
- Clicking a result navigates to that file (loads in viewer, updates URL) and exits edit mode
- Pressing Enter on a selected result navigates to the file and exits edit mode
- Arrow keys navigate results in the dropdown (same keyboard pattern as command palette)
- Results are sorted by recently changed (default), alpha A→Z, or Z→A via a 3-state cycle toggle in the dropdown header
- Sort preference persists for the session (sessionStorage)
- A cached file list (from `git ls-files` + `fs.stat()` for mtime) powers instant in-memory filtering
- Cache stays fresh via SSE file change events (delta updates for add/change/unlink, full re-fetch for mass changes >50)
- A toggle in the dropdown header controls hidden/ignored file visibility
- Dot-path filtering (`.github/`, `.env`) is client-side
- Non-git workspaces fall back to recursive readDir
- When the ExplorerPanel input is empty, the existing Quick Access hints still display (unchanged)
- Existing `>` command palette and `#` symbol stub modes are unaffected

---

## Non-Goals

- Full-text file content search (this is filename-only matching)
- Regex support (glob patterns only, via `*`, `?`, `{` characters)
- Fuzzy matching (substring or glob, not approximate/typo-tolerant)
- Virtual scrolling for results (simple overflow-y-auto; most filters match <100 files)
- Server-side caching (all caching is client-side state, matching codebase conventions)
- Pre-warming the cache on page load (lazy population on first keystroke)
- LSP/Flowspace symbol search (the `#` stub remains unchanged)
- URL-persisted filter text (search is transient, like command palette)
- LeftPanel modifications (no filterSlot, no filter bar in sidebar)

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `file-browser` | existing | **modify** | New file-list service, file-filter utilities, useFileFilter hook, server action, BrowserClient wiring |
| `_platform/panel-layout` | existing | **modify** | Extend ExplorerPanel with file search props, extend CommandPaletteDropdown `search` mode to render file results, extend keyboard delegation for search mode |
| `_platform/events` | existing | **consume** | `useFileChanges('*')` for cache delta updates (no changes to domain) |

---

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=0, F=0, T=2
  - Surface Area (S=2): Extends ExplorerPanel + CommandPaletteDropdown (panel-layout), new hook + services (file-browser), BrowserClient wiring
  - Integration (I=1): One new npm dependency (micromatch for glob matching)
  - Data/State (D=0): No schema changes. Cache is ephemeral client-side state.
  - Novelty (N=0): Well-specified via three workshops. Extends proven ExplorerPanel/dropdown patterns.
  - Non-Functional (F=0): Standard — no new security concerns, no performance issues
  - Testing/Rollout (T=2): New service tests, dropdown extension tests, hook tests, glob matching tests.
- **Confidence**: 0.90
- **Assumptions**:
  - micromatch works in browser bundle (pure JS library, no Node APIs)
  - `fs.stat()` via Promise.all is fast enough for 50K files (~500ms)
  - Existing `FileChangeProvider` handles a second `useFileChanges('*')` subscriber without issues
  - ExplorerPanel keyboard delegation extends cleanly to search mode
  - sessionStorage is available (standard browser API)
- **Dependencies**:
  - micromatch (new npm dependency)
  - Plan 045 live file events (stable)
  - Plan 043/047 panel-layout ExplorerPanel + CommandPaletteDropdown (stable)
- **Risks**:
  - micromatch bundle size (~10KB) — mitigated by dynamic import
  - Extending CommandPaletteDropdown may affect command palette UX — mitigated by mode isolation (only `search` mode changes)
  - Large worktrees (50K+) slow initial cache (~500ms) — mitigated by spinner + lazy loading
- **Phases**: Single phase (Simple mode)

---

## Acceptance Criteria

### Explorer Bar Integration

1. Typing in the ExplorerPanel without `>` or `#` prefix activates file search mode. The CommandPaletteDropdown switches from static "Quick Access" hints to live file search results after 300ms debounce.
2. When the ExplorerPanel input is empty, the existing Quick Access hints display (unchanged).
3. Existing `>` command palette mode and `#` symbol stub mode are unaffected by file search.
4. Pressing Escape exits edit mode and closes the dropdown (existing behavior, unchanged).

### File Search Results

5. Results render in the CommandPaletteDropdown as a flat list with git status badges (M=amber, A=green, D=red, ?=muted, R=blue) for files with working changes, and a plain file icon for unmodified files.
6. File paths display with the directory portion muted and the filename emphasized. Full paths are readable (dropdown spans full ExplorerPanel width).
7. The selected result has `bg-primary/15` background (matching command palette selection style).
8. Clicking a result navigates to the file (load in viewer, update URL) and exits edit mode.
9. Pressing Enter on the selected result navigates to the file and exits edit mode. If no result is selected, the existing handler chain runs (filePathHandler tries exact path match).
10. Arrow keys navigate up/down through results. The active result scrolls into view (same as command palette keyboard nav).
11. The dropdown header shows match count, a sort toggle button, and a hidden files toggle button.
12. All toggle buttons have descriptive `title` and `aria-label` attributes for tooltips and accessibility.
13. Context menu on results provides: Copy Full Path, Copy Relative Path, Copy Content, Download. Actions that fail (e.g., file deleted between display and action) show a toast error.

### Matching

14. By default, the filter performs case-insensitive substring matching on the full relative path.
15. When the input contains glob characters (`*`, `?`, `{`), the filter switches to glob matching via micromatch.
16. Glob patterns support: `*.tsx` (extension), `src/**/*.test` (recursive), `comp*` (prefix).

### Sorting

17. A 3-state cycle toggle button in the dropdown header switches between: recently changed (Clock icon), alpha A→Z (ArrowDownAZ icon), alpha Z→A (ArrowUpZA icon).
18. Recently changed sort (default) orders by filesystem mtime descending (most recently modified files first). Files with SSE-observed changes (`lastChanged`) sort above same-mtime files.
19. The sort preference persists in `sessionStorage` for the browser session.

### File Cache

20. The file list is cached client-side as a `Map<string, CachedFileEntry>` where each entry has `{ path, mtime, modified, lastChanged }`. The `mtime` field is populated from `fs.stat()` during cache building.
21. The cache is populated lazily on the first search keystroke via `git ls-files` + `fs.stat()` per file (~100ms for 2.6K files).
22. SSE file change events update the cache via deltas: `change` → set `modified=true` + `lastChanged`, `add` → insert new entry with `mtime=Date.now()` and `modified=true`, `unlink` → delete entry.
23. When >50 events arrive in a single batch (branch switch), the cache does a full re-fetch instead of applying individual deltas.
24. The cache auto-refreshes search results when deltas are applied and the search is active.

### Hidden Files Toggle

25. A toggle button (EyeOff/Eye icon) in the dropdown header controls visibility of hidden and gitignored files.
26. Default OFF: git ls-files uses `--exclude-standard` and dot-prefixed path segments are filtered client-side.
27. Toggle ON: git ls-files runs without `--exclude-standard` and dot-path filtering is disabled.
28. Toggling re-fetches the cache (different git flags produce different file lists).

### Edge Cases

29. Non-git workspaces use recursive readDir (depth-limited to 10 levels) instead of git ls-files.
30. Empty worktrees show "No files found" in the dropdown.
31. Git command failure shows "Could not scan files" — next keystroke retries.
32. First keystroke shows a loading spinner (AsciiSpinner) while the cache populates.

---

## Risks & Assumptions

- **Risk**: micromatch adds bundle size (~10KB). **Mitigation**: Dynamic import defers cost to first glob usage.
- **Risk**: Two `useFileChanges('*')` subscriptions (existing allChanges + new filterChanges). **Mitigation**: FileChangeHub handles multiple subscribers efficiently — just one extra callback per event batch.
- **Risk**: Extending CommandPaletteDropdown may affect command palette UX. **Mitigation**: Only `search` mode changes — `commands`, `symbols`, `param` modes untouched.
- **Risk**: Cache grows stale if SSE disconnects. **Mitigation**: Full re-fetch on next search interaction after reconnect.
- **Assumption**: `CachedFileEntry.mtime` from `fs.stat()` provides accurate sort-by-recent from first keystroke. SSE events (`lastChanged`) layer real-time edits on top.
- **Assumption**: sessionStorage for sort preference is acceptable (cleared on tab close).

---

## Open Questions

None — all significant design questions were resolved in the three workshops.

---

## Workshop Opportunities

All identified workshops have been completed:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| File Scanner Cache & Event Integration | Integration Pattern | ✅ Complete | [001-file-scanner-cache-events.md](./001-file-scanner-cache-events.md) |
| File Filter UX & Interaction Design | UX Design | ✅ Complete (partially superseded) | [002-file-filter-ux.md](./002-file-filter-ux.md) |
| UX Pivot: Explorer Bar Integration | UX Design / Remediation | ✅ Complete | [003-ux-pivot-explorer-bar.md](./003-ux-pivot-explorer-bar.md) |

No additional workshops are needed before architecture.

---

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: New service (git ls-files + fs.stat), new hook (cache lifecycle + event integration), dropdown extension (file results rendering + keyboard nav) — all benefit from test-first development.
- **Mock Usage**: No mocks — fakes only (per codebase convention QT-08).
- **Focus Areas**:
  - `getFileList()` service — git ls-files parsing + fs.stat mtime, non-git fallback
  - `file-filter.ts` utilities — substring match, glob match, isGlobPattern, sortByRecent, sortAlpha, hideDotPaths
  - `useFileFilter()` hook — cache lifecycle, delta updates, debounce, sort modes, includeHidden
  - CommandPaletteDropdown `search` mode — file result rendering, badges, keyboard nav, sort/hidden toggles
  - ExplorerPanel keyboard delegation — search mode ↑↓ Enter delegation to dropdown
- **Excluded**:
  - Visual styling verification (manual via browser)
  - SSE event pipeline (already tested in plan 045)
  - Existing `>` and `#` modes (unchanged, already tested)

---

## Documentation Strategy

- **Location**: No new documentation
- **Rationale**: Search integrates with existing ExplorerPanel patterns. `CachedFileEntry` type and `useFileFilter` hook are self-documenting via TypeScript interfaces.

---

## Clarifications

### Session 2026-02-26

**Pre-declared by user**: Simple mode, Full TDD.

| # | Question | Answer | Spec Impact |
|---|----------|--------|-------------|
| Q1 | Workflow Mode? | **Simple** — pre-set in spec header. | Already set. |
| Q2 | Testing Strategy? | **Full TDD** — red-green-refactor for service, hook, and components. | Already set. |
| Q3 | Mock Usage? | **No mocks — fakes only** (per codebase convention QT-08). | Already set. |
| Q4 | Domain Review? | **Confirmed correct.** `file-browser` owns cache/service/hook, `panel-layout` owns dropdown/ExplorerPanel extension. | Updated for UX pivot. |
| Q5 | Documentation Strategy? | **No new documentation.** TypeScript interfaces are self-documenting. | Already set. |
| Q6 | UX Pivot? | **Integrate with ExplorerPanel** instead of LeftPanel. Results in CommandPaletteDropdown. No Portal, no filterSlot, no filter URL param. | Major spec rewrite — Workshop 003 applied. |
| Q7 | mtime for sort? | **fs.stat() per file** during cache population. Enables sort-by-recent from first keystroke. | AC-18, AC-20, AC-21 updated. |

### Coverage Summary

| Status | Count | Items |
|--------|-------|-------|
| Resolved | 7 | Mode (Simple), Testing (Full TDD), Mocks (Fakes only), Domains (Updated), Docs (None), UX Pivot (ExplorerPanel), mtime (fs.stat) |
| Deferred | 0 | — |
| Outstanding | 0 | — |
