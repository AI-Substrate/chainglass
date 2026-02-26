# File Tree Quick Filter — Implementation Plan

**Mode**: Simple
**Plan Version**: 2.0.0
**Created**: 2026-02-26
**Spec**: [spec.md](./spec.md)
**Status**: DRAFT

> **v2.0.0**: UX pivoted from LeftPanel filter bar to ExplorerPanel integration per [Workshop 003](./003-ux-pivot-explorer-bar.md). Plan rewritten.

## Summary

File search integrated into the ExplorerPanel's existing mode system. When the user types without `>` or `#` prefix, the CommandPaletteDropdown shows live file search results (replacing the "Search coming soon" stub). Results are a flat list with git status badges, sorted by mtime or alphabetically. Powered by a client-side cache (git ls-files + fs.stat) with SSE delta updates.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `file-browser` | existing | **modify** | New file-list service, file-filter utilities, useFileFilter hook, server action, BrowserClient wiring |
| `_platform/panel-layout` | existing | **modify** | Extend ExplorerPanel with file search props, extend CommandPaletteDropdown search mode, extend keyboard delegation |
| `_platform/events` | existing | **consume** | `useFileChanges('*')` for cache delta updates (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/041-file-browser/services/file-list.ts` | file-browser | internal | New — git ls-files + fs.stat wrapper |
| `apps/web/src/features/041-file-browser/services/file-filter.ts` | file-browser | internal | New — glob/substring matching + sort + dot-path filter |
| `apps/web/src/features/041-file-browser/hooks/use-file-filter.ts` | file-browser | internal | New — cache lifecycle, delta updates, debounce, sort state |
| `apps/web/app/actions/file-actions.ts` | file-browser | internal | Add `fetchFileList` server action wrapper |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Wire useFileFilter, pass results to ExplorerPanel |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | _platform/panel-layout | contract | Add file search props (results, callbacks, sort/hidden state) |
| `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | _platform/panel-layout | contract | Extend `search` mode to render file results with badges + toggles |
| `apps/web/package.json` | — | dependency | Add `micromatch` npm dependency |
| `test/unit/web/features/041-file-browser/file-list.test.ts` | file-browser | internal | TDD tests for git ls-files + fs.stat service |
| `test/unit/web/features/041-file-browser/file-filter.test.ts` | file-browser | internal | TDD tests for glob/substring matching + sort |
| `test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx` | _platform/panel-layout | internal | Extend tests for search mode file results |
| `test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx` | _platform/panel-layout | internal | Extend tests for search mode keyboard delegation |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | micromatch not installed. Required for glob patterns. | Install. Dynamic import to defer bundle. |
| 02 | Critical | CommandPaletteDropdown `search` mode shows static hints. | Replace with live file results when inputValue has text. |
| 03 | High | ExplorerPanel keyboard delegation only covers `paletteMode`. | Extend to delegate ↑↓ Enter for search mode with results. |
| 04 | High | ExplorerPanel needs new props for file search results. | Add fileSearchResults, fileSearchLoading, sort/hidden callbacks. |
| 05 | High | Dropdown positions `absolute left-0 right-0 top-full` — full width. | No Portal needed. Results readable without truncation. |
| 06 | High | CachedFileEntry needs `mtime` from fs.stat() for sort-by-recent. | getFileList returns `{ path, mtime }[]`. |
| 07 | Medium | Two `useFileChanges('*')` subscriptions coexist safely. | FileChangeHub handles multiple subscribers efficiently. |

## Implementation

**Objective**: Integrate file search into ExplorerPanel + CommandPaletteDropdown, powered by cached file list with SSE deltas.
**Testing Approach**: Full TDD. Fakes only, no mocks.

### Tasks

| Status | ID | Task | Domain | Done When | Notes |
|--------|-----|------|--------|-----------|-------|
| [x] | T001 | Install micromatch dependency | — | pnpm add succeeds, imports resolve | Dynamic import in file-filter.ts |
| [x] | T002 | Create `getFileList()` service + TDD tests | file-browser | Tests pass: git ls-files + fs.stat mtime, --exclude-standard toggle, non-git fallback, empty, deleted-between-list-and-stat | Return `{ok, files: FileListEntry[]}`. Node `fs.stat()` via Promise.all. |
| [x] | T003 | Add `fetchFileList` server action wrapper | file-browser | Exports `fetchFileList(worktreePath, includeHidden)` | Lazy-import pattern after fetchDiffStats |
| [x] | T004 | Create `file-filter.ts` matching + sort + TDD tests | file-browser | Tests pass: substring, glob, isGlobPattern, sortByRecent (mtime), sortAlpha, hideDotPaths | Pure functions. Dynamic import micromatch. |
| [x] | T005 | Create `useFileFilter()` hook | file-browser | Manages Map<CachedFileEntry> with mtime, lazy populate, SSE delta (accumulate), 300ms debounce, sort (sessionStorage), includeHidden | Delta ≤50, full re-fetch >50. |
| [x] | T006 | Extend ExplorerPanel with file search props + keyboard delegation | _platform/panel-layout | New props accepted. Search mode delegates ↑↓ Enter. Existing > and # unaffected. Tests pass. | Props: fileSearchResults, loading, sort, hidden callbacks, onFileSelect, workingChanges |
| [x] | T007 | Extend CommandPaletteDropdown `search` mode for file results | _platform/panel-layout | Search mode renders file list with badges, sort/hidden toggles, match count, keyboard nav, empty/loading/error. Tests pass. | Reuse STATUS_BADGE from ChangesView |
| [x] | T008 | Wire everything in BrowserClient | file-browser | useFileFilter → ExplorerPanel props. Click/Enter → fileNav.handleSelect. workingChanges for badges. | Minimal wiring — one hook + props |

### Acceptance Criteria

- [ ] AC-1: Typing without > or # prefix shows live file search results in dropdown
- [ ] AC-2: Empty input shows Quick Access hints (unchanged)
- [ ] AC-3: Existing > and # modes unaffected
- [ ] AC-4: Escape exits, closes dropdown
- [ ] AC-5: Flat list with M/A/D/?/R badges
- [ ] AC-6: Muted dir + emphasized filename, full width readable
- [ ] AC-7: Selected result bg-primary/15
- [ ] AC-8: Click navigates + exits. Enter with selection navigates + exits. Enter without selection → handler chain.
- [ ] AC-9: Arrow keys navigate, auto-scroll
- [ ] AC-10: Dropdown header: count + sort toggle + hidden toggle with tooltips
- [ ] AC-11: Substring default, glob on *?{
- [ ] AC-12: 3-state sort (recent/alpha-asc/alpha-desc), sessionStorage
- [ ] AC-13: Map<CachedFileEntry> with mtime, lazy populated
- [ ] AC-14: SSE delta updates, full re-fetch >50
- [ ] AC-15: Hidden toggle: --exclude-standard + dot-path filter
- [ ] AC-16: Non-git fallback (readDir depth 10), empty/error/loading states
- [ ] AC-17: Context menu (Copy Full Path, Relative, Content, Download)
- [ ] AC-18: 300ms debounce

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| micromatch bundle (~10KB) | Medium | Low | Dynamic import |
| Dropdown extension affects command palette | Low | High | Only search mode changes |
| Keyboard delegation regression | Medium | Medium | TDD + non-regression tests for > and # |
| Two * subscriptions | Low | Low | Acceptable timing diff |
| Slow initial scan (50K files ~500ms) | Low | Medium | Spinner + lazy |
