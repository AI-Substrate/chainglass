# UX Enhancements Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-26
**Spec**: [ux-enhancements-spec.md](./ux-enhancements-spec.md)
**Status**: DRAFT

## Summary

The FILES header in the browser page's LeftPanel currently shows a static "FILES" label. This plan adds live-updating file change statistics — count of changed files plus total inserted/deleted lines — to the header. A new `getDiffStats()` service parses `git diff --numstat` output, the `PanelHeader` gains an optional `subtitle` prop, and the existing live file event wiring (`useFileChanges('*')` → `handleRefreshChanges()`) triggers stats refresh automatically.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `file-browser` | existing | **modify** | New diff stats service, extend `usePanelState` to fetch/expose stats, wire in BrowserClient |
| `_platform/panel-layout` | existing | **modify** | Extend `PanelHeader` with optional `subtitle` prop, extend `LeftPanel` to pass it through |
| `_platform/events` | existing | **consume** | Existing `useFileChanges('*')` → `handleRefreshChanges()` triggers stats refresh (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/041-file-browser/services/diff-stats.ts` | file-browser | internal | New service — parses `git diff --numstat` |
| `test/unit/web/features/041-file-browser/diff-stats.test.ts` | file-browser | internal | TDD tests for numstat parser |
| `apps/web/app/actions/file-actions.ts` | file-browser | internal | Add `fetchDiffStats` server action wrapper |
| `apps/web/src/features/041-file-browser/hooks/use-panel-state.ts` | file-browser | internal | Add diffStats state + fetch to `handleRefreshChanges` |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Pass `fetchDiffStats` to `usePanelState`, compute subtitle JSX |
| `apps/web/src/features/_platform/panel-layout/components/panel-header.tsx` | _platform/panel-layout | contract | Add optional `subtitle?: ReactNode` prop |
| `apps/web/src/features/_platform/panel-layout/components/left-panel.tsx` | _platform/panel-layout | contract | Add optional `subtitle?: ReactNode` prop, pass to PanelHeader |
| `test/unit/web/features/_platform/panel-layout/panel-header.test.tsx` | _platform/panel-layout | internal | Update tests for subtitle rendering |
| `test/unit/web/features/_platform/panel-layout/left-panel.test.tsx` | _platform/panel-layout | internal | Update tests for subtitle passthrough |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Git service pattern proven: `changed-files.ts` uses `execFileAsync` → parse → return `{ok, files}` union. Server action wraps with lazy import. Hook composes in `Promise.all`. | Follow identical pattern for `getDiffStats`. |
| 02 | Critical | `fetchDiffStats` slots directly into `file-actions.ts` (lines ~129) as 4th server action wrapper, and into `handleRefreshChanges` `Promise.all` (line 84) as 4th entry. | Zero new infrastructure — additive changes only. |
| 03 | High | Binary files in `git diff --numstat` output show `-\t-\tpath` instead of numbers. Renamed files use `{old => new}/file.ts` brace syntax. | Parser must handle both: treat `-` as 0 for line counts, extract new path from rename syntax. TDD covers these edge cases. |
| 04 | High | `PanelHeader` has no slot for metadata — only `title: string`. LeftPanel hardcodes `title="Files"`. | Add additive `subtitle?: ReactNode` prop to both. Subtitle renders inline after title in muted style. |
| 05 | Medium | Race condition concern from overlapping refresh requests. | Non-issue: existing 500ms debounce on `useFileChanges('*')` + React state batching (last-write-wins) already handles this — same as the 3 existing services. |
| 06 | Medium | `git diff --numstat` only counts tracked files — gitignored files (node_modules, dist) are excluded automatically. | No filtering needed — git handles this inherently. |

## Implementation

**Objective**: Show live-updating file change statistics (count + insertions + deletions) in the LeftPanel's FILES header.
**Testing Approach**: Full TDD — red-green-refactor for parser service and component contracts. Fakes only, no mocks.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Create `getDiffStats()` service with `git diff HEAD --numstat` parser | file-browser | `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/services/diff-stats.ts` | TDD: tests pass for normal output, binary (`-`), renames (`{old=>new}`), empty output, not-git error, no-commits fallback | Follow `changed-files.ts` pattern. Use `git diff HEAD --numstat` to capture staged+unstaged (DYK-01). Return `DiffStatsResult = {ok:true, stats:{files:number, insertions:number, deletions:number}} \| {ok:false, error:'not-git'}`. Fallback to `git diff --numstat` if HEAD doesn't exist (new repo). |
| [ ] | T002 | Write TDD tests for `getDiffStats()` | file-browser | `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/diff-stats.test.ts` | RED phase: 6+ failing tests covering all edge cases | Write tests FIRST per constitution Principle 3. Cases: normal, binary, rename, empty, mixed, not-git |
| [ ] | T003 | Add `fetchDiffStats` server action wrapper | file-browser | `/home/jak/substrate/048-wf-web/apps/web/app/actions/file-actions.ts` | Wrapper exports `fetchDiffStats(worktreePath)` following lazy-import pattern | Add at ~line 129, after `fetchRecentFiles` |
| [ ] | T004 | Extend `PanelHeader` with `subtitle` prop | _platform/panel-layout | `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/components/panel-header.tsx` | `subtitle?: ReactNode` prop renders after title span in muted text. Existing tests still pass, new tests for subtitle added. | Additive optional prop — no breaking change |
| [ ] | T005 | Update PanelHeader tests for subtitle | _platform/panel-layout | `/home/jak/substrate/048-wf-web/test/unit/web/features/_platform/panel-layout/panel-header.test.tsx` | Tests verify: subtitle renders when provided, hidden when omitted | TDD — write failing tests first |
| [ ] | T006 | Extend `LeftPanel` with `subtitle` prop passthrough | _platform/panel-layout | `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/components/left-panel.tsx` | `subtitle?: ReactNode` in `LeftPanelProps`, passed to `PanelHeader subtitle` | Additive optional prop |
| [ ] | T007 | Update LeftPanel tests for subtitle passthrough | _platform/panel-layout | `/home/jak/substrate/048-wf-web/test/unit/web/features/_platform/panel-layout/left-panel.test.tsx` | Tests verify subtitle is forwarded to PanelHeader | TDD — write failing tests first |
| [ ] | T008 | Extend `usePanelState` to fetch and expose diff stats | file-browser | `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/hooks/use-panel-state.ts` | `diffStats` in return object. Fetched on mount (like changedFiles). Refreshed in `handleRefreshChanges` Promise.all. | Add `fetchDiffStats` to options interface, add to Promise.all at line 84, add state + setter |
| [ ] | T009 | Wire `fetchDiffStats` and stats subtitle in BrowserClient | file-browser | `/home/jak/substrate/048-wf-web/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Pass `fetchDiffStats` to `usePanelState`. Compute subtitle JSX from `panelState.diffStats`. Pass subtitle to `LeftPanel`. Stats visible in header, live-update on file changes. | Subtitle format: `· N changed  +X −Y` with green-500/red-500 colors. Hidden when no changes. |

### Acceptance Criteria

- [ ] AC-1: Git workspace browser page shows changed file count in FILES header (e.g., `FILES · 3 changed`)
- [ ] AC-2: Header shows total insertions (green) and deletions (red) alongside count (e.g., `+42 −18`)
- [ ] AC-3: No stats shown when no files are changed — header shows only "FILES"
- [ ] AC-4: Stats auto-update within ~1 second when files change (via live file events)
- [ ] AC-5: Non-git workspaces show no stats
- [ ] AC-6: Compact display using `text-xs`, muted/green-500/red-500 coloring per badge schema
- [ ] AC-7: Binary files counted as changed but contribute 0 to insertion/deletion totals
- [ ] AC-8: Edge cases handled: empty output, binary files, renamed files, repos with no commits

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `git diff --numstat` slow on large repos | Low | Low | 500ms debounce prevents rapid-fire; async state update keeps UI responsive |
| Binary file `-` in numstat breaks parser | Medium | Medium | Explicit parser handling + TDD edge case tests |
| Renamed file `{old=>new}` syntax unexpected | Low | Low | Explicit parser handling + TDD test case |
| PanelHeader subtitle prop breaks existing consumers | Very Low | Low | Prop is optional — additive change, no callers affected |

---

✅ Plan created:
- Location: `docs/plans/049-ux-enhancements/ux-enhancements-plan.md`
- Phases: 1 (Simple mode)
- Tasks: 9
- Domains: 2 modified + 1 consumed
- Next step: `/plan-6-v2-implement-phase --plan "docs/plans/049-ux-enhancements/ux-enhancements-plan.md"`
