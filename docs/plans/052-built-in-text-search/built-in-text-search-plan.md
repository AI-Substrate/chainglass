# Built-in Content Search — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-26
**Spec**: [built-in-text-search-spec.md](./built-in-text-search-spec.md)
**Status**: IN PROGRESS

## Summary

Replace the `#` prefix FlowSpace text search with a zero-dependency `git grep` content search. A server action calls `git grep -n -i` via `execFile` (same pattern as `git-diff-action.ts`), a client hook debounces queries, and the existing `symbols` dropdown mode renders file:line results with context snippets. No npm packages, no indexing, always in sync. Plan 051's FlowSpace wiring for `$` (semantic) mode is untouched.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/panel-layout | existing | **modify** | Update `symbols` mode rendering to show git grep results (file:line:context), update types |
| file-browser | existing | **modify** | New server action + hook, wire through browser-client |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/lib/server/git-grep-action.ts` | file-browser | internal | Server action: `git grep` wrapper |
| `apps/web/src/features/041-file-browser/hooks/use-git-grep-search.ts` | file-browser | internal | Client hook: debounce + state |
| `apps/web/src/features/_platform/panel-layout/types.ts` | _platform/panel-layout | contract | Add `GitGrepResult` type |
| `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | _platform/panel-layout | contract | Update `symbols` mode to render grep results |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | _platform/panel-layout | contract | Update `onFlowspaceQueryChange` to call git grep for `#` mode |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Wire `useGitGrepSearch` hook |
| `test/unit/web/features/041-file-browser/git-grep-action.test.ts` | file-browser | internal | Tests for output parsing |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **`git grep -n -i` returns `filepath:line:content`** — stable format, ~60ms for full codebase. Parsing is trivial `split(':')`. | Parse stdout line-by-line, extract filepath/lineNo/content |
| 02 | Critical | **Plan 051 already wired `#` to FlowSpace** — `symbols` mode, keyboard delegation, props, browser-client all exist. Must replace the FlowSpace data source for `#` without breaking `$`. | Modify the hook/action layer only. `onFlowspaceQueryChange` becomes the dispatch point: `#` → git grep, `$` → FlowSpace. |
| 03 | High | **`git grep --count` gives per-file match counts** — `filepath:N`. Can combine with `-n` for grouped results (AC-03). Two-pass approach: first `--count` for file list + counts, then `-n` for top 20 files' context lines. | Single pass with `-n` + limit, group client-side. Simpler than two-pass. |
| 04 | High | **Existing git availability check** — `git-diff-action.ts` already caches `gitAvailableCache` and checks `isGitRepository()`. Reuse directly, don't duplicate. | Import from `git-diff-action.ts` or extract shared util. |
| 05 | High | **Result shape differs from FlowSpace** — FlowSpace returns `nodeId/name/category/smartContent/score`. Git grep returns `filePath/lineNumber/matchContent`. Need either: (a) unified type, or (b) separate type + separate rendering path. | Add `GitGrepResult` type. Share the rendering row layout but with different fields (line content instead of smart_content). |

### Constitution Deviations

| Principle | Deviation | Justification | Risk Mitigation |
|-----------|-----------|---------------|-----------------|
| P2: Interface-First | No interface for git grep wrapper | Thin `execFile` shim, not a domain service | Tested via real output fixtures |
| P3: TDD | Lightweight testing | Agreed in spec clarifications | Key paths tested: output parsing, error handling |

## Implementation

**Objective**: Replace `#` FlowSpace text search with `git grep` content search. Zero deps, always available, ~60ms.
**Testing Approach**: Lightweight — verify git grep output parsing, error handling.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Refactor code search types with discriminated union | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/types.ts` | Replace `FlowSpaceSearchResult` with discriminated union: `CodeSearchResult = GrepSearchResult \| FlowSpaceSearchResult`. Both extend a `kind` discriminant (`'grep' \| 'flowspace'`). `GrepSearchResult`: `{ kind: 'grep', filePath, filename, lineNumber, matchContent, matchCount }`. `FlowSpaceSearchResult` gains `kind: 'flowspace'`. Rename all `symbolSearch*` props across ExplorerPanel and CommandPaletteDropdown to `codeSearch*` (e.g., `codeSearchResults`, `codeSearchLoading`, `codeSearchError`). Update barrel exports. | Discriminated union lets the dropdown `switch(result.kind)` for rendering. Props are source-agnostic — dropdown doesn't know or care if data came from git grep or FlowSpace. |
| [x] | T002 | Create git grep server action | file-browser | `apps/web/src/lib/server/git-grep-action.ts` | `'use server'` exports `gitGrepSearch(query, cwd)` → `{ results: GrepSearchResult[] } \| { error: string }`. Uses `--fixed-strings` (`-F`) by default for safe literal matching. Auto-upgrades to regex mode only if query contains intentional regex patterns (`.*`, `^`, `$`, `\b`). Uses `execFileAsync('git', ['grep', '-n', '-i', '-F', '--untracked', '--max-count=5', '-I', query, '--', '*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.md', '*.yaml', '*.yml', '*.css'], { cwd, timeout: 3000 })`. Parses `filepath:line:content` format. Truncates match content to 200 chars server-side. Groups by file, limits to 20 files. Duplicates the 10-line git availability pattern (module-private, not worth extracting). | Per DYK-02: `-F` prevents `console.log(` from crashing as invalid regex. Per DYK-05: truncate minified lines. `--max-count=5` limits per-file. `-I` skips binary. |
| [x] | T003 | Create `useGitGrepSearch` hook | file-browser | `apps/web/src/features/041-file-browser/hooks/use-git-grep-search.ts` | Hook exports: `results: GitGrepResult[] \| null`, `loading`, `error`, `setQuery(q)`. 300ms debounce. `fetchInProgressRef` guard. Calls `gitGrepSearch` server action. | Follow `use-flowspace-search.ts` pattern exactly but simpler (no availability/graphAge/folders). |
| [x] | T004 | Update `#` mode to use git grep instead of FlowSpace | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `onFlowspaceQueryChange` dispatch: when mode is `'text'` (from `#` prefix), call `gitGrep.setQuery()` instead of `flowspace.setQuery()`. When mode is `'semantic'` (from `$` prefix), call `flowspace.setQuery()` as before. Pass `gitGrep.results` to `symbolSearchResults` prop when in `#` mode, `flowspace.results` when in `$` mode. | Per finding 02. The dispatch point is browser-client — ExplorerPanel/Dropdown don't need to know the source. |
| [x] | T005 | Update dropdown rendering with `result.kind` discriminant | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | Rendering `switch(result.kind)`: **`'grep'`**: filename (bold), `:lineNumber` badge, match content (monospace, truncated to 120 chars). No category icon. **`'flowspace'`**: category icon, name, file path, line range, smart_content. Both share: keyboard nav, context menu, selected highlight. | Clean separation — each kind owns its rendering, shared interaction. |
| [x] | T006 | Update Quick Access hints | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | `#` hint → "Content search" (was "Code search (FlowSpace)"). `$` hint → "Semantic search (FlowSpace)" (unchanged). | AC-11. |
| [ ] | T007 | Write tests for git grep output parsing | file-browser | `test/unit/web/features/041-file-browser/git-grep-action.test.ts` | Tests: (a) parse standard `filepath:line:content` output, (b) group by file with match counts, (c) handle empty results, (d) handle git not available, (e) handle not a git repo. Captured output fixtures. | Lightweight. |
| [x] | T008 | Verify `just fft` passes | cross-domain | — | Build passes, our files lint clean, tests pass. | Quality gate. Pre-existing lint issues in other plans are acceptable. |

### Acceptance Criteria

- [x] AC-01: `# useFileFilter` shows content matches within 500ms
- [x] AC-02: Results show filename, line number, matching line content
- [ ] AC-03: Multiple matches per file grouped with count
- [x] AC-04: Arrow keys navigate, Enter selects (file at line), Escape exits
- [x] AC-05: 300ms debounce
- [x] AC-06: Only source files searched (ts/tsx/js/jsx/json/md/yaml/css)
- [x] AC-07: Regex works (`# function.*search`)
- [x] AC-08: Case-insensitive by default
- [ ] AC-09: "Git repository required" when not in git repo
- [x] AC-10: Loading spinner during search
- [x] AC-11: Quick Access hints: `#` = "Content search"
- [x] AC-12: "No matches" when empty results
- [x] AC-13: Context menu on results
- [x] AC-14: Limited to 20 files

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Broad queries slow | Low | ~200ms worst case | `--max-count=5` per file + 20 file limit |
| Regex syntax errors | Medium | git grep exits non-zero | Catch error, show "Invalid search pattern" |
| Large match content lines | Low | UI overflow | Truncate to 120 chars |
| `$` mode regression | Low | FlowSpace broken | T004 dispatch preserves `$` → FlowSpace path |
