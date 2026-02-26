# FlowSpace Code Search — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-26
**Spec**: [flowspace-search-spec.md](./flowspace-search-spec.md)
**Status**: IN PROGRESS

## Summary

Replace the `#` prefix stub in the command palette with live FlowSpace code search, using two prefixes: `#` for fast text/regex search (no API calls, ~200ms) and `$` for semantic/conceptual search (embedding API, ~500-800ms). A server-side wrapper calls the `fs2` CLI via `execFile`, a client hook debounces queries and manages state, and the `CommandPaletteDropdown`'s `symbols` mode (and new `semantic` mode) renders scored results with category icons, names, file paths, line ranges, and AI summaries. Selecting a result navigates to the file at the relevant line. Graceful degradation when `fs2` is not installed or the graph is not built.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/panel-layout | existing | **modify** | Replace stub handler, enhance `symbols` mode rendering with FlowSpace results |
| file-browser | existing | **modify** | Wire FlowSpace hook through browser-client → ExplorerPanel (same pattern as file search) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/lib/server/flowspace-search-action.ts` | _platform/panel-layout | internal | Server action: `fs2` CLI wrapper with availability detection |
| `apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts` | file-browser | internal | Client hook: debounce, state management, calls server action |
| `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | _platform/panel-layout | contract | Modify: render FlowSpace results in `symbols` mode |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | _platform/panel-layout | contract | Modify: add FlowSpace search props (results, loading, error, onSelect) |
| `apps/web/src/features/_platform/panel-layout/stub-handlers.ts` | _platform/panel-layout | internal | Modify: remove `createSymbolSearchStub` |
| `apps/web/src/features/_platform/panel-layout/index.ts` | _platform/panel-layout | contract | Modify: remove `createSymbolSearchStub` export |
| `apps/web/src/features/_platform/panel-layout/types.ts` | _platform/panel-layout | contract | Modify: add `FlowSpaceSearchResult` and `FlowSpaceAvailability` types |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Modify: wire `useFlowspaceSearch` hook to ExplorerPanel |
| `test/unit/web/features/041-file-browser/flowspace-search-action.test.ts` | file-browser | internal | Tests for server action JSON parsing + availability detection |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Subprocess pattern established**: `git-diff-action.ts` uses `execFileAsync` (promisified `execFile`) with array args + timeout. This is the pattern for `fs2` calls. | Follow same pattern in `flowspace-search-action.ts` |
| 02 | Critical | **PATH resolution risk**: `fs2` may not be in PATH if pip-installed locally. `execFile` returns `ENOENT` if binary not found. | Availability check: try `execFile('fs2', ['--version'])`, cache result. Pass `cwd` to ensure correct working directory. |
| 03 | Critical | **Race condition on fast typing**: `use-file-filter.ts` uses `fetchInProgressRef` guard but doesn't abort prior processes. Multiple `fs2` spawns could occur. | Use `fetchInProgressRef` guard (same as file-filter). Skip rather than abort — `fs2` is read-only, orphan processes die fast. |
| 04 | Critical | **Graph location relative to worktree**: `fs2 search` needs to run from the directory containing `.fs2/graph.pickle`. Must use worktreePath as cwd. | Pass `{ cwd: worktreePath }` to `execFile`. The worktree is where `.fs2/` lives — if it's not there, the availability check will correctly report `'no-graph'`. |
| 05 | High | **No existing fs2 integration**: Safe to build fresh. `createSymbolSearchStub()` in `stub-handlers.ts` must be removed and replaced. `.gitignore` already ignores `.fs2/`. | Remove stub, build real integration. |
| 06 | High | **Hook pattern from file search**: `use-file-filter.ts` exposes `results`, `loading`, `error`, `query`, `setQuery` with 300ms debounce. FlowSpace hook follows same shape but simpler (no cache, no SSE deltas, no sort mode). | Create `useFlowspaceSearch` mirroring `useFileFilter` return shape but calling server action instead. |

### Constitution Deviations

| Principle | Deviation | Justification | Risk Mitigation |
|-----------|-----------|---------------|-----------------|
| P2: Interface-First | No `IFlowspaceService` interface + fake | CS-2 feature: the service is a 30-line `execFile` wrapper, not a domain service. Creating interface+fake for a CLI shim adds ceremony without value. | Server action is easily tested via real `fs2` CLI or captured JSON fixtures. |
| P3: TDD | Lightweight testing, not full RED/GREEN/REFACTOR | Testing strategy agreed in clarification. The service is deterministic JSON parsing; the UI is a rendering variant of tested `search` mode. | Key paths tested: JSON parsing, availability detection, error handling. |

## Implementation

**Objective**: Replace the `#` stub with live FlowSpace code search via `fs2` CLI, with graceful degradation.
**Testing Approach**: Lightweight — verify key paths (JSON parsing, availability detection, error handling). No TDD ceremony.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Add FlowSpace types to panel-layout | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/types.ts` | `FlowSpaceSearchResult` and `FlowSpaceAvailability` types exported. `FlowSpaceSearchMode` type: `'text' \| 'semantic'`. Result has: `nodeId`, `name`, `category`, `filePath`, `startLine`, `endLine`, `smartContent`, `snippet`, `score`, `matchField`. Availability is `'available' \| 'not-installed' \| 'no-graph' \| 'no-embeddings'`. | Per DYK-01. Category icons: file→📄, callable→ƒ, type→📦, section→📝, block→🏗️. `'no-embeddings'` used when `$` mode but embeddings not configured. |
| [x] | T002 | Create server-side fs2 search action | _platform/panel-layout | `apps/web/src/lib/server/flowspace-search-action.ts` | `'use server'` action exports: `checkFlowspaceAvailability(cwd)` returns `FlowSpaceAvailability` + graph mtime; `flowspaceSearch(query, mode, cwd)` returns `{ results: FlowSpaceSearchResult[], folders: Record<string,number> } \| { error: string }`. Mode param: `'text'` uses `--mode text` (auto-upgrades to `--mode regex` if query has metacharacters), `'semantic'` uses `--mode semantic`. Uses `execFileAsync('fs2', [...], { cwd, timeout: 5000 })`. Parses JSON envelope from stdout. **File path extraction**: `node_id` format is `{category}:{filepath}:{qualname}` — split on `:` and take index 1. **File existence check**: verify extracted path exists via `fs.access()` before including in results (stale graph may reference deleted files). | Per DYK-01: text mode is free/fast, semantic mode uses embedding API. Per DYK-04: node_id parsing for file path. |
| [x] | T003 | Create useFlowspaceSearch hook | file-browser | `apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts` | Hook exports: `results`, `loading`, `error`, `availability`, `graphAge`, `folders`, `searchMode`, `setQuery(q, mode)`. 300ms debounce on query. Calls `checkFlowspaceAvailability` once on mount, then `flowspaceSearch` on debounced query changes. Mode passed through from caller (`'text'` for `#`, `'semantic'` for `$`). Uses `fetchInProgressRef` guard to prevent concurrent requests. | Per DYK-01: mode determined by prefix, not auto-detected. |
| [x] | T004 | Enhance CommandPaletteDropdown for both modes | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | Add `'semantic'` to `DropdownMode` union. Both `symbols` and `semantic` modes render: (a) availability messages (AC-07, AC-08, AC-18), (b) loading spinner (AC-11), (c) error message (AC-12), (d) results header with folder distribution + graph age (AC-15, AC-17), (e) result rows with category icon, name, file path, line range badge, smart_content summary (AC-02, AC-03), (f) context menu on results (AC-16). Semantic mode additionally shows "🧠 semantic" badge in header (AC-19). New props: `symbolSearchResults`, `symbolSearchLoading`, `symbolSearchError`, `symbolSearchAvailability`, `symbolSearchGraphAge`, `symbolSearchFolders`, `symbolSearchMode`, `onSymbolSelect`, context menu callbacks. | Both modes share the same result rendering — only the header badge and availability messages differ. |
| [x] | T005 | Wire ExplorerPanel with `$` mode detection + FlowSpace props | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | Add `semanticMode` detection: `editing && inputValue.startsWith('$')`. Update `dropdownMode` derivation to include `'semantic'` when `$` prefix detected. ExplorerPanel accepts and passes through all FlowSpace props to CommandPaletteDropdown. Notify parent of search query via `onFlowspaceQueryChange(query, mode)` for both `#` and `$`. | Same prop-threading pattern as file search (Plan 049). `$` mode is a sibling to `#` mode, not a sub-mode. |
| [x] | T006 | Remove createSymbolSearchStub | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/stub-handlers.ts`<br/>`apps/web/src/features/_platform/panel-layout/index.ts` | `createSymbolSearchStub` function removed. Export removed from barrel. Calling code in browser-client updated to not register the stub handler. `#` prefix no longer triggers toast. | Per finding 05. AC-10. |
| [x] | T007 | Wire browser-client with useFlowspaceSearch | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `useFlowspaceSearch` hook called with `worktreePath`. Results, loading, error, availability, graphAge, folders passed to ExplorerPanel. `onSymbolSelect` navigates to file at line (same as `onFileSelect` but with line param). Context menu callbacks reuse existing clipboard handlers. | Same wiring pattern as `useFileFilter` (Plan 049). |
| [x] | T008 | Update Quick Access hints for both modes | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | Quick Access hints section: `#` shows "Code search (FlowSpace)", `$` shows "Semantic search (FlowSpace)" when available. When not available, both show "(install FlowSpace)". Add `$` row to hints. | AC-09. |
| [x] | T009 | Write tests for server action + hook | file-browser | `test/unit/web/features/041-file-browser/flowspace-search-action.test.ts` | Tests cover: (a) JSON parsing of real fs2 output fixture, (b) availability detection — not installed returns `'not-installed'`, no graph returns `'no-graph'`, (c) timeout handling returns error string, (d) malformed JSON returns error string. | Lightweight: captured JSON fixtures, no mocks. |
| [x] | T010 | Verify `just fft` passes | cross-domain | — | `just fft` passes with zero new failures. All existing tests still pass. | Quality gate. |

### Acceptance Criteria

- [x] AC-01: Typing `# useFileFilter` shows text search results within 1 second
- [x] AC-02: Results show category icon, name, file path, line range
- [x] AC-03: Results with smart_content show one-line AI summary
- [x] AC-04: Results sorted by score (highest first)
- [x] AC-05: Arrow keys navigate, Enter selects, Escape exits
- [x] AC-06: 300ms debounce on search input
- [x] AC-07: "FlowSpace not installed" message + link when fs2 missing
- [x] AC-08: "Run fs2 scan" message when graph missing
- [x] AC-09: Quick Access hints updated: `#` = code search, `$` = semantic search
- [x] AC-10: Stub handler removed, no more toast
- [x] AC-11: Loading spinner while searching
- [x] AC-12: Error message on timeout/failure
- [x] AC-13: `#` uses `--mode text` (auto-upgrade to regex if metacharacters)
- [x] AC-14: Results limited to 20
- [x] AC-15: Folder distribution in results header (display-only)
- [x] AC-16: Context menu: Copy Full Path, Copy Relative Path, Copy Content, Download
- [x] AC-17: Graph age shown as relative time ("indexed 19 mins ago")
- [x] AC-18: `$` uses `--mode semantic`; shows "requires embeddings" if not configured
- [x] AC-19: `$` mode shows "🧠 semantic" badge in header
- [x] AC-20: Empty `#` shows "FlowSpace text search"; empty `$` shows "FlowSpace semantic search"; not installed shows URL with copy button

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `fs2` not in PATH | Medium | Feature shows "not installed" (graceful) | Availability check on mount, cache result |
| CLI startup overhead (~200ms) | Low | Acceptable with 300ms debounce | Spinner shown, results arrive within 1s total |
| Graph goes stale | Medium | Results don't match current code | AC-17 shows graph age so user knows |
| Race condition on fast typing | Low | Stale results briefly shown | `fetchInProgressRef` guard prevents concurrent calls |
| Large graph slows search | Low | >1s response time | fs2 handles pagination internally; we limit to 20 results |
