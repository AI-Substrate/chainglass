# Phase 5: Worktree Exemplar — Execution Log

**Started**: 2026-02-27
**Status**: Complete

---

## T001: registerWorktreeState() — Domain Registration ✅

**Created**: `apps/web/src/features/041-file-browser/state/register.ts`

Registers `worktree` as a **multi-instance** domain (DYK-21) with two properties:
- `changed-file-count` (number) — file changes in worktree
- `branch` (string) — current git branch

Instance key is workspace `slug` (DYK-22), already valid `[a-zA-Z0-9_-]+`.

**Discovery**: Registration must be idempotent — React Strict Mode and HMR re-run useState initializers. Added `listDomains().some()` guard to skip if already registered.

---

## T002: WorktreeStatePublisher ✅

**Created**: `apps/web/src/features/041-file-browser/state/worktree-publisher.tsx`

Invisible component accepting `slug` and `worktreeBranch` props:
- Publishes `worktree:{slug}:branch` from prop on mount and prop change (DYK-24)
- **TEMPORARY**: Demo timer increments `worktree:{slug}:changed-file-count` every 2s
  - Will be replaced with real `useFileChanges` subscription once visual verification complete
- Cleans up interval on unmount

---

## T003: WorktreeStateSubtitle ✅

**Created**: `apps/web/src/features/041-file-browser/components/worktree-state-subtitle.tsx`

Consumer component using `useGlobalState<T>` to read:
- `worktree:{slug}:branch` → displays branch name
- `worktree:{slug}:changed-file-count` → displays "{n} unsaved" in amber

Styled matching existing `diffStatsSubtitle` pattern (text-xs, text-muted-foreground, gap-1.5).

---

## T004: GlobalStateConnector ✅

**Created**: `apps/web/src/lib/state/state-connector.tsx`

Wiring component that:
1. Gets IStateService via `useStateSystem()`
2. Registers worktree domain once via `useState` initializer (synchronous, before children render)
3. Renders `<WorktreeStatePublisher>` with slug/branch props

**Discovery**: Originally used `useEffect` for registration, but child publisher's `useEffect` fired in the same commit — causing "domain not registered" error. Switched to `useState` initializer which runs synchronously during render, before any child effects.

**Discovery**: React Strict Mode re-runs `useState` initializers, causing "domain already registered" error. Fixed by making `registerWorktreeState()` idempotent with a `listDomains()` guard.

Exported from barrel `apps/web/src/lib/state/index.ts`.

---

## T005: Wire browser-client.tsx ✅

**Modified**: `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`

Changes:
1. Added imports for `GlobalStateConnector` and `WorktreeStateSubtitle`
2. Mounted `<GlobalStateConnector>` inside `<FileChangeProvider>` (before `<BrowserClientInner>`)
3. Created `composedSubtitle` that renders both `diffStatsSubtitle` and `<WorktreeStateSubtitle>` (DYK-23)
4. Swapped `subtitle={diffStatsSubtitle}` → `subtitle={composedSubtitle}` on `<LeftPanel>`

---

## T006: Publisher Unit Tests ✅

**Created**: `test/unit/web/state/worktree-publisher.test.tsx`

6 tests with FakeGlobalStateSystem + vi.useFakeTimers():
1. Publishes branch from prop on mount
2. Publishes empty branch when prop undefined
3. Publishes initial changed-file-count of 0
4. Increments changed-file-count on timer tick (temporary demo)
5. Uses slug as instance ID for cross-workspace isolation
6. Cleans up timer on unmount

**Evidence**: 144 total state tests pass (138 prior + 6 new).

---

## T007: Manual Verification ✅

Verified via Playwright browser automation on `http://localhost:3000`:
- Page loaded without errors (only console error: missing favicon.ico — unrelated)
- Left panel header shows: **FILES · main · 19 unsaved**
- After 4 seconds: **FILES · main · 28 unsaved** (counter ticking every 2s)
- Branch name "main" displays correctly from `worktreeBranch` prop
- Demo timer proves live publish → subscribe → render loop works end-to-end
- No registration errors after idempotent fix

---

## Test Evidence

```
Test Files  6 passed (6)
     Tests  144 passed (144)
```

Breakdown:
- 25 path-parser tests
- 22 path-matcher tests
- 44 contract tests (22 real + 22 fake)
- 37 GlobalStateSystem unit tests
- 10 hook tests
- 6 publisher tests ← NEW
