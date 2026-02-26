# Fix FX001: Source Watchers Gated on .chainglass/data/ Existence

**Created**: 2026-02-26
**Status**: Complete
**Plan**: [045-live-file-events](../live-file-events-plan.md)
**Source**: User report — file watching not working in newly added workspaces without `.chainglass/data/`
**Domain(s)**: _platform/events (modify)

---

## Problem

`createSourceWatchers()` iterates `this.watcherMetadata`, which is only populated by `createWatcherForWorktree()` when `.chainglass/data/` exists. Workspaces added via `cg workspace add` that haven't been initialized (no `.chainglass/data/`) never get source watchers — so the file browser shows no live file change events for those workspaces.

This was flagged as finding F008 in the Phase 1 code review ("createSourceWatchers() depends on watcherMetadata (by design)") but is now confirmed as a real bug.

## Proposed Fix

Two-part fix:

1. **Decouple source watcher creation from data watcher metadata.** Give `createSourceWatchers()` its own worktree discovery that queries the workspace registry directly and doesn't gate on `.chainglass/data/`. Introduce a separate `sourceWatcherMetadata` map so source watcher lifecycle is independent.

2. **Auto-create `.chainglass/data/` on workspace add.** When `WorkspaceService.add()` registers a workspace, ensure each worktree gets a `.chainglass/data/` directory created. This prevents the gap where a workspace is browseable but has no data scaffolding.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| _platform/events | modify | `CentralWatcherService.createSourceWatchers()` gets own worktree discovery; `performRescan()` tracks source watchers independently of data watchers |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX001-1 | Decouple `createSourceWatchers()` from `watcherMetadata` | _platform/events | `/Users/jordanknight/substrate/chainglass-048/packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | `createSourceWatchers()` queries `this.registry.list()` + `this.worktreeResolver.detectWorktrees()` directly, without gating on `.chainglass/data/` existence. Uses its own `sourceWatcherMetadata` or iterates all known worktrees. | Root cause fix. Currently iterates `this.watcherMetadata` (line 271) which only has entries where data dir exists. |
| [x] | FX001-2 | Update `performRescan()` source watcher lifecycle | _platform/events | `/Users/jordanknight/substrate/chainglass-048/packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | `performRescan()` discovers ALL worktrees for source watchers (no `.chainglass/data/` gate), closes source watchers for removed worktrees independently of data watchers, creates source watchers for new worktrees. | Lines 336-357 currently gate on `fs.exists(dataPath)` for ALL worktree tracking. Source watchers need a separate discovery pass. |
| [x] | FX001-3 | Update existing test: "skip worktrees without .chainglass/data/" | _platform/events | `/Users/jordanknight/substrate/chainglass-048/test/unit/workflow/central-watcher.service.test.ts` | Test at line 301 updated: data watchers still skip worktrees without data dir, but source watchers ARE created for all worktrees. Expected watcher count changes from 3 to 4 (1 data + 2 source + 1 registry). | Test currently asserts `getWatcherCount() === 3` — must change to 4. |
| [x] | FX001-4 | Add test: source watchers created for workspaces without `.chainglass/data/` | _platform/events | `/Users/jordanknight/substrate/chainglass-048/test/unit/workflow/central-watcher.service.test.ts` | New test: workspace with NO `.chainglass/data/` → 0 data watchers, 1 source watcher, 1 registry watcher = 2. Source watcher dispatches events to adapters. | Directly tests the bug scenario. |
| [x] | FX001-5 | Add test: `performRescan()` adds source watchers for new workspaces without data dir | _platform/events | `/Users/jordanknight/substrate/chainglass-048/test/unit/workflow/central-watcher.service.test.ts` | New test: start with 1 workspace (has data dir), rescan discovers 2nd workspace (no data dir) → source watcher created for 2nd workspace. | Tests the rescan path for the same bug. |

## Workshops Consumed

- [02-worktree-wide-watcher-strategy.md](../workshops/02-worktree-wide-watcher-strategy.md) — Original design for source watchers

## Acceptance

- [x] AC-1: Workspace without `.chainglass/data/` gets a source watcher and emits file change SSE events
- [x] AC-2: Data watchers still require `.chainglass/data/` (no regression)
- [x] AC-3: `performRescan()` discovers and creates source watchers for newly added workspaces regardless of data dir
- [x] AC-4: All existing central-watcher tests pass (no regressions)
- [ ] AC-5: File browser shows live file changes for a workspace that has never been initialized with Chainglass

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
