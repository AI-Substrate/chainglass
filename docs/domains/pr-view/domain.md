# Domain: PR View

**Slug**: pr-view
**Type**: business
**Created**: 2026-03-09
**Created By**: Plan 071 — PR View & File Notes (Phase 4)
**Status**: active

## Purpose

GitHub-style change review overlay showing all worktree changes with collapsible per-file diffs, two comparison modes (Working vs HEAD, Branch vs main), persistent reviewed-file tracking with content-hash auto-invalidation, and per-file insertion/deletion stats. The data layer provides everything the overlay UI needs to render.

## Boundary

### Owns
- PR View types (PRViewFile, PRViewFileState, ComparisonMode, PRViewData)
- Reviewed state JSONL persistence in `.chainglass/data/pr-view-state.jsonl`
- Content hash computation via `git hash-object` for change detection
- Git branch service (getCurrentBranch, getDefaultBaseBranch, getMergeBase, getChangedFilesBranch)
- Per-file diff stats via `git diff --numstat`
- All-diffs fetcher (single git diff split by file header)
- Diff aggregator assembling PRViewFile[] from all sources
- API routes: `GET/POST/DELETE /api/pr-view`
- Server actions: fetchPRViewData, markFileAsReviewed, unmarkFileAsReviewed, clearAllReviewedState

### Does NOT Own
- SSE/live update integration (Phase 6)
- File tree indicators (Phase 7)

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `PRViewFile` | Type | Overlay, tests | In-memory UI model for a changed file with diff, stats, reviewed state |
| `PRViewFileState` | Type | State persistence | Persisted JSONL model for reviewed-file tracking |
| `ComparisonMode` | Type | Overlay, actions | `'working' \| 'branch'` |
| `PRViewData` | Type | Overlay | Aggregated data: files[], branch, mode, stats |
| `aggregatePRViewData` | Function | Server actions | Main entry: assembles PRViewData from all git sources |
| `markFileReviewed` | Function | Server actions | Persists reviewed state with content hash |
| `computeContentHash` | Function | Server actions, aggregator | git hash-object wrapper |
| `getAllDiffs` | Function | Aggregator | Single git diff split by file header |
| `getCurrentBranch` | Function | Aggregator | git rev-parse --abbrev-ref HEAD |
| `getDefaultBaseBranch` | Function | Aggregator | Auto-detect from origin/HEAD, fallback 'main' |
| `getMergeBase` | Function | Aggregator | git merge-base for Branch mode |
| `getPerFileDiffStats` | Function | Aggregator | git diff --numstat parser |
| `PRViewOverlayProvider` | Component | Layout wrapper | Context provider for overlay state |
| `usePRViewOverlay` | Hook | Components | Access overlay open/close/toggle |
| `switchMode` | Function | Overlay header | Switch between Working and Branch comparison modes |
| `usePRViewData` | Hook | Overlay panel | Fetch + cache PRViewData, mark/unmark, collapsed state, mode switching, SSE refresh |
| `registerPRViewSDK` | Function | SDK registrations | Registers toggle command + keybinding |

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|--------------|
| Aggregate PR data | `aggregatePRViewData(worktree, mode)` | Fetches changed files, diffs, stats, and reviewed state in parallel; assembles PRViewFile[] with hash invalidation |
| Mark file reviewed | `markFileReviewed(worktree, filePath, hash)`, POST /api/pr-view | Persists reviewed status with content hash; auto-resets if file changes |
| Content hash check | `computeContentHash(worktree, filePath)` | Runs `git hash-object` to detect changes since last review |
| Branch comparison | `getMergeBase()` + `getChangedFilesBranch()` + `getAllDiffs(cwd, base)` | Determines merge-base SHA and fetches branch-scope diffs |
| Working comparison | `getWorkingChanges()` + `getAllDiffs(cwd)` | Fetches all uncommitted changes via git status + git diff HEAD |
| Toggle PR View overlay | `usePRViewOverlay().togglePRView()`, sidebar button, Ctrl+Shift+R | Opens/closes overlay with mutual exclusion via overlay:close-all |
| Switch comparison mode | `usePRViewData().switchMode('branch')` | Switches between Working (uncommitted vs HEAD) and Branch (feature vs main), resets collapsed state, invalidates cache, force-refreshes |
| Live file updates | `useFileChanges('*')` inside FileChangeProvider | SSE-driven auto-refresh — file changes trigger re-fetch with content hash invalidation |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| types.ts | PRViewFile, PRViewFileState, ComparisonMode, PRViewData | — |
| content-hash.ts | git hash-object wrapper | Node.js child_process |
| pr-view-state.ts | JSONL read/write for reviewed state | Node.js fs |
| git-branch-service.ts | Branch info + merge-base + branch file listing | Node.js child_process |
| per-file-diff-stats.ts | git diff --numstat parser | Node.js child_process |
| get-all-diffs.ts | Single git diff split by file header | Node.js child_process |
| diff-aggregator.ts | Orchestrates parallel fetch + assembly | All above + getWorkingChanges |
| pr-view-actions.ts | Server actions with requireAuth() | diff-aggregator, content-hash, pr-view-state |
| route.ts | API endpoints (GET/POST/DELETE) | diff-aggregator, content-hash, pr-view-state |
| use-pr-view-overlay.tsx | Overlay provider + hook (Context, isOpeningRef guard) | React |
| use-pr-view-data.ts | Data hook (fetch, cache, optimistic mutations, collapsed state) | pr-view-actions |
| pr-view-overlay-panel.tsx | Fixed overlay panel (z-44, anchor, two-column) | use-pr-view-overlay, use-pr-view-data |
| pr-view-header.tsx | Branch name, stats, progress, expand/collapse | PRViewData |
| pr-view-file-list.tsx | Left column file list with status badges | PRViewFile[] |
| pr-view-diff-section.tsx | Collapsible per-file diff with DiffViewer | DiffViewer, PRViewFile |
| pr-view-diff-area.tsx | Scrollable container with IntersectionObserver scroll sync | pr-view-diff-section |
| pr-view-overlay-wrapper.tsx | Dynamic import wrapper in workspace layout | PRViewOverlayProvider |
| sdk/contribution.ts | SDK command manifest (prView.toggleOverlay) | @chainglass/shared/sdk |
| sdk/register.ts | SDK registration (handler + keybinding) | contribution.ts |

## Source Location

Primary: `apps/web/src/features/071-pr-view/`

| File | Role | Notes |
|------|------|-------|
| `apps/web/src/features/071-pr-view/types.ts` | Domain types | Phase 4 |
| `apps/web/src/features/071-pr-view/index.ts` | Feature barrel | Phase 4 + Phase 5 |
| `apps/web/src/features/071-pr-view/lib/content-hash.ts` | git hash-object wrapper | Phase 4 |
| `apps/web/src/features/071-pr-view/lib/pr-view-state.ts` | JSONL reviewed state | Phase 4 |
| `apps/web/src/features/071-pr-view/lib/git-branch-service.ts` | Branch + merge-base | Phase 4 |
| `apps/web/src/features/071-pr-view/lib/per-file-diff-stats.ts` | --numstat parser | Phase 4 |
| `apps/web/src/features/071-pr-view/lib/get-all-diffs.ts` | Single diff split by file | Phase 4 |
| `apps/web/src/features/071-pr-view/lib/diff-aggregator.ts` | Orchestrates all data | Phase 4 |
| `apps/web/app/actions/pr-view-actions.ts` | Server actions | Phase 4 |
| `apps/web/app/api/pr-view/route.ts` | API route | Phase 4 |
| `apps/web/src/features/071-pr-view/hooks/use-pr-view-overlay.tsx` | Overlay provider + hook | Phase 5 |
| `apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts` | Data hook (fetch, cache, mutations) | Phase 5 |
| `apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx` | Fixed overlay panel | Phase 5 |
| `apps/web/src/features/071-pr-view/components/pr-view-header.tsx` | Header with stats + progress | Phase 5 |
| `apps/web/src/features/071-pr-view/components/pr-view-file-list.tsx` | Left column file list | Phase 5 |
| `apps/web/src/features/071-pr-view/components/pr-view-diff-section.tsx` | Collapsible per-file diff | Phase 5 |
| `apps/web/src/features/071-pr-view/components/pr-view-diff-area.tsx` | Scrollable diff container | Phase 5 |
| `apps/web/src/features/071-pr-view/sdk/contribution.ts` | SDK command manifest | Phase 5 |
| `apps/web/src/features/071-pr-view/sdk/register.ts` | SDK registration | Phase 5 |
| `apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx` | Layout wrapper | Phase 5 |

## Dependencies

### This Domain Depends On
- `file-browser` — `getWorkingChanges()` for Working mode file listing (direct import)
- `_platform/auth` — `requireAuth()` for server actions, `auth()` for API routes
- `_platform/viewer` — `DiffViewer` component for rendering per-file diffs (Phase 5)
- `_platform/panel-layout` — `[data-terminal-overlay-anchor]` for overlay positioning (Phase 5)
- `_platform/sdk` — `IUSDK`, `SDKContribution` for command registration (Phase 5)
- `_platform/events` — `FileChangeProvider`, `useFileChanges` for SSE-driven live updates (Phase 6)
- Node.js `fs` — JSONL persistence

### Domains That Depend On This
- (Phase 6) pr-view live updates — consumes aggregator for SSE refresh
- (Phase 7) file-browser — reviewed-state indicators in file tree

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 071 Phase 4 | Domain created. Types, content hash, reviewed state JSONL, git branch service, per-file diff stats, all-diffs fetcher, diff aggregator, server actions, API route. | 2026-03-09 |
| 071 Phase 5 | Overlay UI. Provider, data hook, panel, header, file list, diff sections, diff area with scroll sync, SDK command, sidebar button, layout wrapper. | 2026-03-10 |
| 071 Phase 6 | Live updates + branch mode. Mode toggle, switchMode, split loading, fetch generation counter, FileChangeProvider SSE subscription, smart refresh, "on default branch" message. Fixed pre-existing Biome errors. | 2026-03-10 |
