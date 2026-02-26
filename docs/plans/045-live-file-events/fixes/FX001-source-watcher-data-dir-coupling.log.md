# Execution Log: Fix FX001 — Source Watchers Gated on .chainglass/data/ Existence

**Fix**: [FX001-source-watcher-data-dir-coupling.md](./FX001-source-watcher-data-dir-coupling.md)
**Started**: 2026-02-26
**Completed**: 2026-02-26

---

## Task Log

| Date | Task | Status | Notes |
|------|------|--------|-------|
| 2026-02-26 | FX001-1 | Done | Rewrote `createSourceWatchers()` to query `registry.list()` + `worktreeResolver.detectWorktrees()` directly instead of iterating `watcherMetadata`. Source watchers now created for ALL registered worktrees regardless of `.chainglass/data/` existence. |
| 2026-02-26 | FX001-2 | Done | Updated `performRescan()` to track two separate maps: `currentDataWorktrees` (gated on data dir) for data watchers and `currentAllWorktrees` (ungated) for source watchers. Source watcher cleanup uses the full worktree set. |
| 2026-02-26 | FX001-3 | Done | Updated test "skip worktrees without .chainglass/data/" → renamed to clarify data watchers are skipped but source watchers are created. Count changed from 3 to 4 (1 data + 2 source + 1 registry). Added assertions verifying both source watchers exist. |
| 2026-02-26 | FX001-4 | Done | Added 2 new tests: (a) workspace with no data dir → 0 data + 1 source + 1 registry = 2 watchers; (b) events from source watchers on no-data-dir workspaces dispatch correctly to adapters with correct worktreePath and workspaceSlug. |
| 2026-02-26 | FX001-5 | Done | Added test: start with initialized workspace, add second workspace without data dir, rescan → source watcher created for new workspace. Verifies the rescan path handles the same scenario. |

## Evidence

- **35/35 tests passing** (32 original + 3 new) in `central-watcher.service.test.ts`
- **24/24 passing** in related integration + contract tests (045, 023, file-change-watcher contracts)
- No regressions in any existing test
