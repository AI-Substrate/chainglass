# Phase 4: Cross-Worktree & Left Menu — Execution Log

**Started**: 2026-03-02
**Status**: Complete

---

## Task Log

### T001: Cross-Worktree Activity API Endpoint

**Status**: Complete
**Files created**: `apps/web/app/api/worktree-activity/route.ts`

**What was built**:
- GET endpoint accepting `?paths=p1,p2` query params
- Validates paths against WorkspaceService registry (DYK-P4-05)
- Reads `work-unit-state.json` directly from each worktree path
- Returns `{ activities: WorktreeActivitySummary[] }` with hasQuestions, hasErrors, hasWorking, agentCount
- Missing/corrupt files return zeroes, invalid paths silently dropped
- Does NOT modify IWorkUnitStateService interface (DYK-P4-01)

**Evidence**: File compiles with no new errors (all errors are pre-existing module resolution issues)

### T002: useWorktreeActivity Polling Hook

**Status**: Complete
**Files created**: `apps/web/src/hooks/use-worktree-activity.ts`

**What was built**:
- React Query hook with `refetchInterval: 30_000` (30s polling)
- Accepts `worktreePaths` array + optional `excludeWorktree` (null = show all per DYK-P4-04)
- Client passes known paths to API (DYK-P4-03)
- Returns `{ activities: WorktreeActivity[], isLoading }`
- Disabled when no paths provided (`enabled: worktreePaths.length > 0`)

### T003: ActivityDot Component + WorkspaceNav Integration

**Status**: Complete
**Files created**: `apps/web/src/components/workspaces/activity-dot.tsx`
**Files modified**: `apps/web/src/components/workspaces/workspace-nav.tsx`

**What was built**:
- `ActivityDot` component: small colored dot with priority (questions amber pulse > errors red > working blue)
- Hidden when no activity for that worktree
- Click navigates to `/workspaces/[slug]/agents?worktree=[path]` (T004 integrated)
- `WorkspaceNav` updated:
  - Added `useWorktreeActivity` hook with all worktree paths from loaded workspace data
  - `activityMap` indexed by path for O(1) lookup
  - ActivityDot rendered in BOTH modes: inside-workspace (line ~223) and outside-workspace (line ~326)
  - `excludeWorktree` = currentWorktree (null on workspace root = show all per DYK-P4-04)

### T004: Badge Click Navigation

**Status**: Complete (integrated into ActivityDot component)

**What was built**:
- ActivityDot wraps a `<Link>` to `/workspaces/[slug]/agents?worktree=[path]`
- `e.stopPropagation()` prevents triggering parent click handlers
- Works in both nav modes: inside-workspace uses `workspaceSlug` from URL, outside-workspace uses `workspace.slug` from iteration

**Evidence**: All 4 files pass `biome check` with no issues

### T005: E2E Verification

**Status**: Complete
**Files modified**: `test/unit/web/components/dashboard-sidebar.test.tsx`, `test/integration/web/dashboard-navigation.test.tsx`

**What was verified**:
- All 4 new/modified source files pass `biome check`
- Dashboard sidebar tests (4) and dashboard navigation integration tests (3) fixed: added `QueryClientProvider` wrapper to test renders (required because `WorkspaceNav` now uses `useWorktreeActivity` which calls `useQuery`)
- All 7 previously-broken tests now pass
- Pre-existing central-watcher failures (4) unchanged

**Evidence**: `npx vitest run` — 7/7 tests pass for both test files
