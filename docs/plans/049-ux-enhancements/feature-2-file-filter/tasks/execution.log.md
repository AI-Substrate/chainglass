# Execution Log — Feature 2: File Tree Quick Filter

**Plan**: [plan.md](../plan.md) (v2.0.0)
**Started**: 2026-02-26

---

## Task Log

### T001: Install micromatch
- **Status**: Done
- **Evidence**: `pnpm add micromatch @types/micromatch` succeeded in apps/web

### T002: getFileList service + TDD tests
- **Status**: Done
- **Files**: `services/file-list.ts` (new), `test/.../file-list.test.ts` (new)
- **Evidence**: 6 tests pass — git ls-files + fs.stat, exclude-standard toggle, non-git error, deleted-file skip, sorted output
- **Discovery**: `--cached --others` can produce duplicates for modified tracked files — added `new Set()` dedup

### T003: fetchFileList server action
- **Status**: Done
- **Files**: `app/actions/file-actions.ts` (modified)
- **Evidence**: Lazy-import wrapper added following established pattern

### T004: file-filter utilities + TDD tests
- **Status**: Done
- **Files**: `services/file-filter.ts` (new), `test/.../file-filter.test.ts` (new)
- **Evidence**: 16 tests pass — isGlobPattern, substring filter, glob filter, sortByRecent, sortAlpha, hideDotPaths
- **Discovery**: Glob patterns with `/` need `basename: false` in micromatch; simple patterns use `basename: true`

### T005: useFileFilter hook
- **Status**: Done
- **Files**: `hooks/use-file-filter.ts` (new)
- **Evidence**: Compiles clean. Cache lifecycle, SSE delta (>50 threshold), 300ms debounce, 3-state sort (sessionStorage), includeHidden toggle, async glob handling

### T006: Extend ExplorerPanel
- **Status**: Done
- **Files**: `explorer-panel.tsx` (modified)
- **Evidence**: 11 existing tests pass (non-regression). Added file search props, keyboard delegation for search mode, onSearchQueryChange callback
- **Discovery**: `searchHasResults` computed flag cleanly gates keyboard delegation without touching palette mode

### T007: Extend CommandPaletteDropdown
- **Status**: Done
- **Files**: `command-palette-dropdown.tsx` (modified)
- **Evidence**: Compiles clean, existing tests pass. Search mode: live file results with badges, sort/hidden toggles, match count, loading/error/empty states. STATUS_BADGE mapping duplicated from ChangesView (cross-domain import avoided).

### T008: Wire in BrowserClient
- **Status**: Done
- **Files**: `browser-client.tsx` (modified)
- **Evidence**: 4548 tests pass (full suite). useFileFilter hook wired, props passed to ExplorerPanel, fetchFileList imported from server actions.

## Discoveries & Learnings

| # | Category | Finding | Impact |
|---|----------|---------|--------|
| D1 | Git | `--cached --others` produces duplicates for modified tracked files | Low — Set dedup solves it |
| D2 | Micromatch | Glob with path separators needs `basename: false` | Medium — simple fix in filterByGlob |
| D3 | Architecture | STATUS_BADGE duplicated in dropdown rather than cross-domain import | Low — keeps domain boundaries clean |
| D4 | React | Async glob results need separate state + useEffect to avoid returning Promise from useMemo | Medium — solved with dual result path |

