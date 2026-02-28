# Fix Tasks: Feature 2 — File Tree Quick Filter (Round 2)

Apply in order. Re-run review after fixes.

## High Fixes

### FT-001: Create useFileFilter hook tests (F001)
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/use-file-filter.test.ts` (CREATE)
- **Issue**: useFileFilter hook (307 lines) — the most complex new module — has zero test coverage. It manages cache lifecycle, SSE delta threshold, debounce, 3-state sort, sessionStorage persistence, and async glob handling.
- **Fix**: Create hook tests covering at minimum:
  1. Lazy cache populate on first non-empty query (fetchFileList called once)
  2. Delta accumulation (add/change/unlink mutations on cache)
  3. >50 delta threshold triggers full re-fetch instead of deltas
  4. 300ms debounce (vi.useFakeTimers — query change doesn't filter immediately)
  5. Sort mode cycling (recent → alpha-asc → alpha-desc → recent)
  6. sessionStorage persistence across sort cycles
  7. includeHidden toggle triggers cache invalidation + re-fetch
  8. Error state when fetchFileList returns `{ ok: false }`
- **Testing approach**:
  - Use `vi.mock('@/features/045-live-file-events')` to stub `useFileChanges` — this is infrastructure transport mocking (SSE provider), not business logic mocking, consistent with fakes-only policy
  - Use `renderHook` from `@testing-library/react`
  - Provide a fake `fetchFileList` that returns controlled data
  - Use `vi.useFakeTimers()` for debounce testing

### FT-002: Create CommandPaletteDropdown search mode tests (F002)
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/048-wf-web/test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx` (CREATE)
- **Issue**: CommandPaletteDropdown search mode extension (~130 lines new JSX) has zero test coverage. The domain manifest listed this test file.
- **Fix**: Create tests covering:
  1. Search mode with inputValue renders file results list
  2. Status badge 'M' renders for modified file (workingChanges match)
  3. Status badge 'A' renders for added file
  4. Sort toggle button renders correct icon per sortMode (Clock/ArrowDownAZ/ArrowUpZA)
  5. Hidden toggle renders correct icon per includeHidden (Eye/EyeOff)
  6. Match count label shows correct number
  7. Loading state renders AsciiSpinner + "Scanning files..."
  8. Error state renders error message
  9. Empty results shows "No matching files"
  10. Click on file result calls onFileSelect with path
  11. ArrowDown/ArrowUp updates selectedIndex (aria-selected)
  12. Enter on selected file calls onFileSelect
- **Testing approach**:
  - The dropdown is presentational — render with props, verify output
  - Need a fake SDK: `{ commands: { list: () => [], isAvailable: () => true } }`
  - Need a fake MRU: `{ getOrder: () => [] }`
  - Pass `mode="search"`, `inputValue="app"`, `fileSearchResults=[...]`, `workingChanges=[...]`

## Medium Fixes

### FT-003: Fix FT-006 race condition properly (F003)
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/hooks/use-file-filter.ts`
- **Issue**: The FT-006 fix is ineffective. `fetchIncludeHiddenRef.current` is set to the closure-captured `includeHidden` at line 124, then compared to the same `includeHidden` at line 152. Both values come from the same closure, so `fetchIncludeHiddenRef.current !== includeHidden` is always `false` — the guard never fires.
- **Fix**: Add a `latestIncludeHiddenRef` that is synced on every render:
  ```diff
  + const latestIncludeHiddenRef = useRef(includeHidden);
  + latestIncludeHiddenRef.current = includeHidden;  // sync on every render

    // In populateCache finally block:
  - if (fetchIncludeHiddenRef.current !== includeHidden) {
  + if (fetchIncludeHiddenRef.current !== latestIncludeHiddenRef.current) {
      cachePopulatedRef.current = false;
  -   setTimeout(() => populateCache(), 0);
  +   // Don't call stale populateCache — let the includeHidden useEffect
  +   // handle re-fetch on next render cycle
    }
  ```
  Alternatively, remove the finally-block guard entirely and rely on the `useEffect([includeHidden])` at lines 167-173 to handle the re-fetch. The useEffect already sets `cachePopulatedRef = false` and calls `populateCache()`, which will succeed once `fetchInProgressRef` is cleared.

### FT-004: Add .catch() to async glob Promise (F004)
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/hooks/use-file-filter.ts`
- **Issue**: Async glob useEffect (line 258) calls `filterFiles()` returning a Promise, with `.then()` but no `.catch()`. If micromatch import fails, the rejection is unhandled.
- **Fix**:
  ```diff
    promise.then((result) => {
      if (cancelled) return;
      let sorted: CachedFileEntry[];
      if (sortMode === 'recent') sorted = sortByRecent(result);
      else sorted = sortAlpha(result, sortMode === 'alpha-asc' ? 'asc' : 'desc');
      setAsyncResults(sorted);
  - });
  + }).catch(() => {
  +   if (!cancelled) setAsyncResults(null);
  + });
  ```

### FT-005: Resolve AC-17 context menu scope (F005)
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md`
- **Issue**: AC-17 (context menu: Copy Full Path, Relative Path, Content, Download) is listed in the spec and plan acceptance criteria but has no implementation task and was never built.
- **Fix**: Either:
  1. **Defer**: Add a note to the plan marking AC-17 as deferred to a follow-up plan, and update the AC checkbox with `[deferred]`
  2. **Implement**: Add a T009 task to the plan for context menu implementation

## Re-Review Checklist

- [ ] FT-001: useFileFilter hook tests created (8+ tests passing)
- [ ] FT-002: CommandPaletteDropdown search tests created (10+ tests passing)
- [ ] FT-003: Race condition fix uses latestIncludeHiddenRef or removed
- [ ] FT-004: Async glob has .catch() handler
- [ ] FT-005: AC-17 explicitly deferred or implemented
- [ ] All tests pass (`just fft` or `pnpm test`)
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH
