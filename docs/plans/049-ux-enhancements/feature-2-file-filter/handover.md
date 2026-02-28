# Handover: Plan 049 Feature 2 — File Tree Quick Filter (Code Review Fixes)

**Date**: 2026-02-26
**Branch**: `048-wf-web`
**Repository**: `/home/jak/substrate/048-wf-web`
**Last Commit**: `25d14cb` (implementation pushed to origin)
**Uncommitted Changes**: Review fix work-in-progress (10 files modified locally)

---

## 1. What We Built

Plan 049 Feature 2: **File search integrated into the ExplorerPanel** (the top bar of the browser page). When a user types in the ExplorerPanel without `>` or `#` prefix, the CommandPaletteDropdown shows live file search results. This replaces the "Search coming soon" stub.

### Architecture

```
BrowserClient
  └─ useFileFilter hook (cache + debounce + SSE deltas)
       ├─ fetchFileList server action → getFileList service (git ls-files + fs.stat)
       └─ file-filter utilities (substring/glob match, sort, hideDotPaths)
  └─ ExplorerPanel (extended with file search props)
       └─ CommandPaletteDropdown (search mode renders live file results)
```

### Files Created
- `apps/web/src/features/041-file-browser/services/file-list.ts` — getFileList (git ls-files + fs.stat)
- `apps/web/src/features/041-file-browser/services/file-filter.ts` — filterFiles, sort, hideDotPaths, isGlobPattern
- `apps/web/src/features/041-file-browser/hooks/use-file-filter.ts` — Map cache, SSE deltas, debounce, sort
- `test/unit/web/features/041-file-browser/file-list.test.ts` — 6 tests
- `test/unit/web/features/041-file-browser/file-filter.test.ts` — 16 tests

### Files Modified
- `apps/web/app/actions/file-actions.ts` — added fetchFileList server action
- `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` — wired useFileFilter
- `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` — file search props + keyboard delegation
- `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` — live file results in search mode
- `apps/web/src/features/_platform/panel-layout/types.ts` — FileSearchEntry, FileSearchSortMode, FileChangeInfo types
- `apps/web/src/features/_platform/panel-layout/index.ts` — barrel exports for new types
- `apps/web/package.json` / `pnpm-lock.yaml` — micromatch dependency added
- Domain docs updated: `docs/domains/file-browser/domain.md`, `docs/domains/_platform/panel-layout/domain.md`

---

## 2. Current State — Code Review Fix Pass

The implementation was committed (`25d14cb`) and pushed. A code review (`/plan-7-v2-code-review`) returned **REQUEST_CHANGES** with 5 HIGH findings. We are partway through fixing them.

### Review Documents
- **Review**: `docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/review.md`
- **Fix tasks**: `docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/fix-tasks.md`
- **Diff**: `docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/_computed.diff`

---

## 3. Fix Status — What's Done vs. What Remains

### ✅ DONE (code changes applied, uncommitted)

| Fix | Finding | What Was Done |
|-----|---------|---------------|
| **FT-001** | SSE cache reactivity (F002) | Added `cacheVersion` state counter. Incremented after SSE delta mutations AND after cache population. Added to useMemo + async useEffect deps. |
| **FT-002** | Unbounded Promise.all (F003) | Batched `fs.stat()` calls in chunks of 200 in `file-list.ts`. |
| **FT-003** | Circular dependency (F001) | **PARTIALLY DONE** — types moved to `panel-layout/types.ts` (`FileSearchEntry`, `FileSearchSortMode`, `FileChangeInfo`), exported from barrel, imports updated in explorer-panel.tsx and command-palette-dropdown.tsx. **No file-browser imports remain in panel-layout.** BUT still marked pending in SQL because not yet verified with full test run. |
| **FT-006** | includeHidden race condition | Added `fetchIncludeHiddenRef` to track value during fetch. Re-fetches on mismatch in finally block. |
| **FT-009** | Guard useMemo for glob | Added `if (isGlobPattern(debouncedQuery)) return null;` before filterFiles in useMemo. |
| **FT-010** | Optimize async useEffect | Added early return for non-glob queries in async useEffect. |
| **FT-011** | Remove unused vi import | Already clean — `vi` wasn't in the import (was already `import { describe, expect, it } from 'vitest'`). |

### ❌ REMAINING (not yet started)

| Fix | Finding | What Needs To Be Done |
|-----|---------|----------------------|
| **FT-004** | useFileFilter hook — zero tests (F004) | Create `test/unit/web/features/041-file-browser/use-file-filter.test.ts`. Needs 8+ tests covering: lazy cache populate on first query, delta accumulation (add/change/unlink), >50 threshold triggers full re-fetch, 300ms debounce, sort mode cycling, sessionStorage persistence, includeHidden toggle triggers re-fetch, error state. **This is the hardest remaining task** — the hook uses `useFileChanges` from live-file-events which needs a `FileChangeProvider` wrapper or mock in test. |
| **FT-005** | CommandPaletteDropdown search — zero tests (F005) | Create or extend `test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx`. Needs 10+ tests: search mode renders file results, status badges, sort toggle, hidden toggle, match count, loading/error/empty states, click calls onFileSelect, keyboard Enter/arrows. **This is straightforward** — the dropdown is a presentational component, just pass props and verify rendering. |

### Not Addressed (deferred per review)

| Fix | Why Deferred |
|-----|-------------|
| **FT-007** | `fetchFileList` takes raw worktreePath — pre-existing pattern shared by 4 other server actions. Not a regression. Fix as separate follow-up. |
| **FT-008** | ExplorerPanel keyboard delegation tests — MEDIUM priority, can be added in FT-005 alongside dropdown tests. |

---

## 4. Key Technical Context for the Next Agent

### Testing Patterns in This Codebase
- **No mocks, fakes only** (per project convention QT-08)
- Tests use `@testing-library/react` + `userEvent` for components
- Vitest with `vi.fn()` for spy/stub (not mock)
- Run tests: `pnpm vitest run test/unit/web/features/...`
- Full suite: `pnpm test` (4548 tests, ~2 min)
- Quality gate: `just fft` (lint + format + typecheck + test)

### The useFileFilter Hook Testing Challenge (FT-004)
The hook calls `useFileChanges('*', ...)` which requires a `FileChangeProvider` in the render tree. Options:
1. **Wrap in FileChangeProvider** in test — but it connects to SSE which won't work in test
2. **Mock the module** — but project says no mocks
3. **Test the pure logic separately** — the hook mostly orchestrates: debounce, cache Map, sort cycling. Consider testing the exported pure functions (already done in file-filter.test.ts) and writing minimal hook tests that verify the React state lifecycle with a fake fetchFileList

The hook's `useFileChanges` import path: `@/features/045-live-file-events` → `useFileChanges` → `useFileChangeHub()`. In tests, the hub won't exist without a provider. You may need to use `vi.mock` for just this one module (the hook itself isn't a mock — it's mocking the SSE transport which is infrastructure).

### The CommandPaletteDropdown Testing (FT-005)
Much simpler — it's a presentational component. There's no existing test file for it. Create one that renders with various prop combinations:
```tsx
// Pass SDK fake (needed by dropdown)
const fakeSdk = { commands: { list: () => [], isAvailable: () => true } };
const fakeMru = { getOrder: () => [] };

render(<CommandPaletteDropdown
  sdk={fakeSdk} filter="" mru={fakeMru}
  mode="search" onExecute={vi.fn()} onClose={vi.fn()}
  inputValue="app"
  fileSearchResults={[{ path: 'src/app.tsx', mtime: 1000, modified: false, lastChanged: null }]}
  workingChanges={[{ path: 'src/app.tsx', status: 'modified' }]}
/>);
```

### Parallel Work Warning
Plans 048 and 050 are being worked on simultaneously by other agents. When committing:
- Only stage files in our change set (see Section 1 above)
- Don't stage files from `packages/positional-graph/`, `docs/plans/050-*`, `scripts/`, `.chainglass/`
- Use `XDG_CONFIG_HOME=~/.config git push` for auth

### Build Error (Not Us)
The dev server currently fails with `Module not found: Can't resolve './adapter/index.js'` in `packages/positional-graph/src/index.ts`. This is from Plan 048/050 parallel work, not our changes. Our tests all pass independently.

---

## 5. Plan Documents

| Document | Path |
|----------|------|
| Spec | `docs/plans/049-ux-enhancements/feature-2-file-filter/spec.md` |
| Plan | `docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md` |
| Tasks | `docs/plans/049-ux-enhancements/feature-2-file-filter/tasks/tasks.md` |
| Flight Plan | `docs/plans/049-ux-enhancements/feature-2-file-filter/tasks/tasks.fltplan.md` |
| Execution Log | `docs/plans/049-ux-enhancements/feature-2-file-filter/tasks/execution.log.md` |
| Review | `docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/review.md` |
| Fix Tasks | `docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/fix-tasks.md` |
| Workshop 001 | `docs/plans/049-ux-enhancements/feature-2-file-filter/001-file-scanner-cache-events.md` |
| Workshop 003 | `docs/plans/049-ux-enhancements/feature-2-file-filter/003-ux-pivot-explorer-bar.md` |

---

## 6. Exact Next Steps (in order)

1. **Verify FT-003 is clean**: Run `grep -rn "041-file-browser" apps/web/src/features/_platform/panel-layout/` — should return only comments
2. **Create FT-005 (dropdown tests)** — easier, do first: `test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx`
3. **Create FT-004 (hook tests)** — harder: `test/unit/web/features/041-file-browser/use-file-filter.test.ts`
4. **Run `just fft`** — or at minimum `pnpm test` if lint has pre-existing failures from plan 048/050
5. **Commit**: `git add` only our files, commit with message like `fix(049): address code review findings — cache reactivity, batched stat, domain types, tests`
6. **Push**: `XDG_CONFIG_HOME=~/.config git push`
7. **Re-run review**: `/plan-7-v2-code-review --plan "docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md"`

---

## 7. Files With Uncommitted Changes

```
apps/web/src/features/041-file-browser/hooks/use-file-filter.ts      (FT-001, FT-006, FT-009, FT-010)
apps/web/src/features/041-file-browser/services/file-list.ts         (FT-002)
apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx  (FT-003)
apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx           (FT-003)
apps/web/src/features/_platform/panel-layout/index.ts                (FT-003)
apps/web/src/features/_platform/panel-layout/types.ts                (FT-003)
docs/plans/049-ux-enhancements/feature-2-file-filter/plan.md         (status update)
test/unit/web/features/041-file-browser/file-list.test.ts            (FT-011 — was already clean)
```

Files NOT YET CREATED (remaining work):
```
test/unit/web/features/041-file-browser/use-file-filter.test.ts      (FT-004 — TODO)
test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx  (FT-005 — TODO)
```
