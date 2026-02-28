# Code Review: Feature 2 — File Tree Quick Filter (Re-Review)

**Plan**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md`
**Spec**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/spec.md`
**Phase**: Simple Mode (all 8 tasks)
**Date**: 2026-02-26
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD
**Review Round**: 2 (re-review after initial REQUEST_CHANGES)

## A) Verdict

**REQUEST_CHANGES**

2 HIGH findings remain from the initial review (missing test files for the two most complex modules). 3 new MEDIUM findings discovered: ineffective race condition fix, unhandled promise rejection, and unimplemented acceptance criterion.

**Key failure areas**:
- **Testing**: useFileFilter hook (307 lines) and CommandPaletteDropdown search mode (~130 lines new JSX) still have zero test coverage despite Full TDD mandate and domain manifest listing both test files.
- **Implementation**: FT-006 race condition fix is ineffective (same-closure comparison always evaluates equal); async glob filtering has no `.catch()` handler, risking unhandled promise rejections.
- **Scope**: AC-17 (context menu) is specified but not implemented and not classified as deferred.

**Previous findings resolved** (verified clean):
- F001 (circular dependency): Types moved to panel-layout/types.ts, zero file-browser imports in panel-layout
- F002 (SSE cache reactivity): cacheVersion counter added, triggers useMemo/useEffect recompute
- F003 (unbounded Promise.all): Batched in chunks of 200
- F009 (glob guard): isGlobPattern check before filterFiles in useMemo
- F010 (async useEffect): Early return for non-glob queries
- F011 (unused vi import): Clean

## B) Summary

The fix pass addressed 7 of 11 fix tasks from the initial review. The three critical infrastructure fixes (circular dependency, SSE reactivity, batched stat) are correctly implemented and verified. Domain compliance is now fully clean — all 9 checks pass. However, both testing HIGH findings (FT-004, FT-005) remain entirely unaddressed: neither test file has been created. The FT-006 race condition "fix" is present but ineffective due to a same-closure comparison bug. A new unhandled promise rejection risk was discovered in the async glob path. AC-17 (context menu) was never assigned to a task and remains unimplemented.

## C) Checklist

**Testing Approach: Full TDD**

- [x] Core service tests written (file-list: 6 tests, file-filter: 16 tests)
- [ ] Hook tests written (useFileFilter: 0 tests — FT-004 still missing)
- [ ] Component extension tests written (CommandPaletteDropdown search: 0 — FT-005 still missing)
- [ ] ExplorerPanel keyboard delegation tests added
- [x] No mocks — fakes only
- [x] Only in-scope files changed
- [x] Lint/type checks clean (per execution log)
- [x] Domain compliance checks pass (all 9 clean)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | (missing file) | testing | useFileFilter hook has zero test coverage | Create use-file-filter.test.ts with 8+ tests |
| F002 | HIGH | (missing file) | testing | CommandPaletteDropdown search mode tests never created | Create/extend command-palette-dropdown.test.tsx with 10+ tests |
| F003 | MEDIUM | use-file-filter.ts:152 | correctness | FT-006 race condition fix ineffective — same-closure comparison | Use a separate latestIncludeHiddenRef synced on every render |
| F004 | MEDIUM | use-file-filter.ts:258-265 | error-handling | Async glob useEffect has no .catch() — unhandled rejection risk | Add .catch() to set error state |
| F005 | MEDIUM | (plan scope) | scope | AC-17 context menu not implemented, not classified as deferred | Implement or explicitly defer in plan |
| F006 | LOW | command-palette-dropdown.tsx:197 | correctness | navItemCount typed number\|undefined due to optional chaining | Assert array type or remove ?. |
| F007 | LOW | (pre-existing) | doctrine | Interface I-prefix convention not followed — consistent with existing apps/web pattern | Advisory — not a regression |
| F008 | LOW | (pre-existing) | doctrine | Test Doc blocks not present — consistent with existing test patterns | Advisory — not a regression |

## E) Detailed Findings

### E.1) Implementation Quality

**F003** (MEDIUM — correctness): `use-file-filter.ts:152` — The FT-006 race condition fix is ineffective. `populateCache` is a `useCallback` that closes over the `includeHidden` value from its creation render. At line 124, `fetchIncludeHiddenRef.current` is assigned that same closed-over `includeHidden`. In the `finally` block (line 152), `fetchIncludeHiddenRef.current !== includeHidden` compares two references to the same closure-captured value — they are always equal. The guard never fires. Additionally, the `setTimeout(() => populateCache(), 0)` in line 154 would call the stale closure even if the comparison worked.

**Fix**: Add a `latestIncludeHiddenRef` that is synced on every render (in the component body, not inside useCallback). Compare `fetchIncludeHiddenRef.current !== latestIncludeHiddenRef.current` in the finally block. Or: trigger re-fetch by resetting `cachePopulatedRef` and incrementing a state token that the `includeHidden` useEffect depends on.

**F004** (MEDIUM — error-handling): `use-file-filter.ts:258-265` — The async glob `useEffect` calls `filterFiles()` which returns a Promise for glob patterns. The `.then()` handler is chained but there is no `.catch()`. If `import('micromatch')` rejects, the rejection is unhandled — no error state is set, the user sees perpetual loading/no-results with no feedback.

**Fix**: Add `.catch()` after `.then()`:
```typescript
promise.then((result) => {
  if (cancelled) return;
  // ... existing sort + setAsyncResults
}).catch(() => {
  if (!cancelled) setAsyncResults(null);
});
```

**F006** (LOW — correctness): `command-palette-dropdown.tsx:197` — `navItemCount` evaluates `showFileResults ? fileSearchResults?.length : 0`. The `?.length` widens the type to `number | undefined`, though `showFileResults` already asserts `Array.isArray(fileSearchResults)`. If `undefined`, the `navItemCount > 0` guard silently suppresses keyboard nav.

### E.2) Domain Compliance

All 9 checks pass. The F001 fix from the initial review is correctly implemented.

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All new files under declared domain source trees |
| Contract-only imports | ✅ | Panel-layout imports from ../types, not from file-browser |
| Dependency direction | ✅ | Zero file-browser imports in panel-layout (Grep verified) |
| Domain.md updated | ✅ | Both domain.md files have Plan 049 Feature 2 history entries |
| Registry current | ✅ | No new domains |
| No orphan files | ✅ | All changed files mapped in manifest |
| Map nodes current | ✅ | Node labels adequate (types are internal, not first-class contracts) |
| Map edges current | ✅ | No new cross-domain edges needed; panels→file-browser edge absent (correct) |
| No circular business deps | ✅ | No business→business cycles |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| getFileList (file-list.ts) | directory-listing.ts (different shape — per-dir tree vs flat+mtime) | file-browser | Proceed |
| file-filter.ts utilities | None | — | Proceed |
| useFileFilter hook | None (consumes useFileChanges, doesn't duplicate) | — | Proceed |
| FileSearchEntry types | CachedFileEntry (intentional layer boundary copy) | cross-domain | Proceed |
| STATUS_BADGE constant | ChangesView STATUS_BADGE (intentional copy, Discovery D3) | cross-domain | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 34%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-1 | 20% | Implemented (ExplorerPanel + dropdown), no test |
| AC-2 | 20% | Implemented (Quick Access hints), no test |
| AC-3 | 75% | Existing behavior, 11 non-regression tests pass |
| AC-4 | 40% | Existing Escape behavior, no search-specific test |
| AC-5 | 10% | Badges implemented, zero dropdown tests |
| AC-6 | 10% | Dir/filename rendering implemented, zero tests |
| AC-7 | 10% | Selection highlight implemented, zero tests |
| AC-8 | 10% | Click/Enter navigation implemented, zero tests |
| AC-9 | 10% | Arrow key nav implemented, zero tests |
| AC-10 | 10% | Dropdown header (count + toggles) implemented, zero tests |
| AC-11 | 80% | 10 tests in file-filter.test.ts (isGlobPattern + filterFiles) |
| AC-12 | 10% | Sort functions tested; cycling/persistence not (hook untested) |
| AC-13 | 10% | file-list.test.ts validates mtime; Map cache lifecycle untested |
| AC-14 | 10% | SSE pipeline excluded; delta threshold untested |
| AC-15 | 10% | hideDotPaths well tested; toggle behavior in hook untested |
| AC-16 | 30% | readDirRecursive implemented; test for /tmp has latent ambiguity |
| AC-17 | 0% | Not implemented |
| AC-18 | 10% | 300ms debounce implemented; zero hook tests |

### E.5) Doctrine Compliance

**F007** (LOW — advisory): Interface naming convention R-CODE-002 (`I` prefix) not followed on new interfaces (CachedFileEntry, FilterableFile, FileSearchEntry, etc.). However, this is consistent with the existing `apps/web` codebase pattern — pre-existing interfaces like `BarContext`, `ExplorerPanelHandle`, `ParamGatheringInfo` also lack the prefix. Only `packages/shared` interfaces follow the convention. Not a regression.

**F008** (LOW — advisory): Test Doc blocks (R-TEST-002) not present in test files. Consistent with existing test files in the codebase (no existing tests follow this format). Not a regression.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-1 | Search mode activation | Implemented, no test | 20% |
| AC-2 | Empty → Quick Access | Implemented, no test | 20% |
| AC-3 | > and # unaffected | Non-regression suite passes | 75% |
| AC-4 | Escape exits | Existing behavior | 40% |
| AC-5 | Status badges | Implemented, no test | 10% |
| AC-6 | Path display styling | Implemented, no test | 10% |
| AC-7 | Selection highlight | Implemented, no test | 10% |
| AC-8 | Click/Enter navigation | Implemented, no test | 10% |
| AC-9 | Arrow key nav | Implemented, no test | 10% |
| AC-10 | Dropdown header | Implemented, no test | 10% |
| AC-11 | Substring/glob matching | 10 tests pass | 80% |
| AC-12 | 3-state sort | Sort functions tested, cycling not | 10% |
| AC-13 | Map cache with mtime | mtime tested, cache lifecycle not | 10% |
| AC-14 | SSE deltas | Excluded + untested | 10% |
| AC-15 | Hidden toggle | hideDotPaths tested, toggle flow not | 10% |
| AC-16 | Non-git fallback | Partially tested | 30% |
| AC-17 | Context menu | Not implemented | 0% |
| AC-18 | 300ms debounce | Implemented, no test | 10% |

**Overall coverage confidence**: 34%

## G) Commands Executed

```bash
git diff --stat && git diff --staged --stat
git log --oneline -15
git show --stat 25d14cb
git show --stat 49d4986
git diff 49d4986 -- apps/ packages/ test/ pnpm-lock.yaml > reviews/_computed.diff
grep -rn "041-file-browser" apps/web/src/features/_platform/panel-layout/  # → 0 matches
# 5 parallel review subagents read all source files, domain docs, registry, map, project rules
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md`
**Spec**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/spec.md`
**Phase**: Simple Mode (all tasks)
**Tasks dossier**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/tasks/tasks.md`
**Execution log**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/tasks/execution.log.md`
**Review file**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/review.md`
**Fix tasks**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/fix-tasks.md`
**Previous review (round 1)**: Same file path (overwritten by this re-review)
**Handover**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/handover.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/services/file-list.ts` | Created | file-browser | None (F003 fix verified) |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/services/file-filter.ts` | Created | file-browser | None |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/hooks/use-file-filter.ts` | Created | file-browser | F003: Fix race condition; F004: Add .catch() |
| `/home/jak/substrate/048-wf-web/apps/web/app/actions/file-actions.ts` | Modified | file-browser | None (F007 deferred — pre-existing) |
| `/home/jak/substrate/048-wf-web/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Modified | file-browser | None |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | Modified | _platform/panel-layout | None (F001 fix verified) |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | Modified | _platform/panel-layout | None (F001 fix verified) |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/types.ts` | Modified | _platform/panel-layout | None (new types correctly placed) |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/index.ts` | Modified | _platform/panel-layout | None (barrel exports updated) |
| `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/file-list.test.ts` | Created | file-browser | None |
| `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/file-filter.test.ts` | Created | file-browser | None |
| `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/use-file-filter.test.ts` | MISSING | file-browser | F001: CREATE — 8+ tests |
| `/home/jak/substrate/048-wf-web/test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx` | MISSING | _platform/panel-layout | F002: CREATE — 10+ tests |

### Required Fixes (REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `test/unit/web/features/041-file-browser/use-file-filter.test.ts` (CREATE) | Create hook tests: lazy populate, delta add/change/unlink, >50 threshold, debounce, sort cycling, sessionStorage, includeHidden toggle, error state | F001: Zero test coverage on 307-line hook (Full TDD mandate) |
| 2 | `test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx` (CREATE) | Create search mode tests: file results, badges, sort toggle, hidden toggle, count, loading/error/empty, click, keyboard Enter/arrows | F002: Zero test coverage on ~130 lines new search JSX |
| 3 | `apps/web/src/features/041-file-browser/hooks/use-file-filter.ts` | Fix FT-006 race condition: add `latestIncludeHiddenRef` synced on every render, compare against it in finally block | F003: Same-closure comparison always equal |
| 4 | `apps/web/src/features/041-file-browser/hooks/use-file-filter.ts` | Add `.catch()` to async glob Promise chain (line 259) | F004: Unhandled rejection risk |
| 5 | `docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md` | Explicitly defer AC-17 (context menu) or add a task for it | F005: Spec'd but not implemented |

### Domain Artifacts to Update (if any)

None — all domain docs are current.

### Next Step

Apply fixes from fix-tasks file:
```
/plan-6-v2-implement-phase --plan "/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md"
```
Priority order: FT-002 (dropdown tests — easier), FT-001 (hook tests — harder), FT-003 (race fix), FT-004 (.catch()), FT-005 (defer AC-17).
Then re-run:
```
/plan-7-v2-code-review --plan "/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md"
```
