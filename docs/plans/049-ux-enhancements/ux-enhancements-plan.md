# UX Enhancements Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-26
**Spec**: [ux-enhancements-spec.md](./ux-enhancements-spec.md)
**Status**: COMPLETE

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
| 03 | High | `git diff HEAD --shortstat` gives pre-formatted summary (`1 file changed, 1 insertion(+), 1 deletion(-)`) — single regex parse, no per-file handling, no binary/rename edge cases (DYK-05). Keep `getChangedFiles()` separate for tree highlighting — clean single-responsibility. | Use `--shortstat` instead of `--numstat`. Simpler parser, no refactoring. |
| 04 | High | `PanelHeader` has no slot for metadata — only `title: string`. LeftPanel hardcodes `title="Files"`. | Add additive `subtitle?: ReactNode` prop to both. Subtitle renders inline after title in muted style. |
| 05 | High | `git diff HEAD` captures staged+unstaged changes (DYK-01). Plain `git diff` misses staged files. `git diff HEAD` fails on repos with no commits (exit 128) — fallback to `git diff --shortstat` (DYK-03). | Use `HEAD` flag with try/catch fallback. |
| 06 | Medium | Race condition concern from overlapping refresh requests. | Non-issue: existing 500ms debounce on `useFileChanges('*')` + React state batching (last-write-wins) already handles this — same as the 3 existing services. |

## Implementation

**Objective**: Show live-updating file change statistics (count + insertions + deletions) in the LeftPanel's FILES header.
**Testing Approach**: Full TDD — red-green-refactor for parser service and component contracts. Fakes only, no mocks.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Create `getDiffStats()` service with `git diff HEAD --shortstat` parser | file-browser | `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/services/diff-stats.ts` | TDD: tests pass for normal output, zero changes, not-git error, no-commits fallback | Follow `changed-files.ts` pattern. Use `git diff HEAD --shortstat` for summary totals (DYK-05). Single regex parse: `/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/`. Return `DiffStatsResult = {ok:true, stats:{files:number, insertions:number, deletions:number}} \| {ok:false, error:'not-git'}`. Fallback to `git diff --shortstat` if HEAD doesn't exist (new repo, DYK-03). Keep `getChangedFiles()` separate — clean single-responsibility per service. · [log](execution.log.md#t002--t001-getdiffstats-service-tdd) [^1] |
| [x] | T002 | Write TDD tests for `getDiffStats()` | file-browser | `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/diff-stats.test.ts` | RED phase: 5+ failing tests covering all edge cases | Write tests FIRST per constitution Principle 3. Cases: normal shortstat output, insertions-only, deletions-only, empty (no changes), not-git error, no-commits fallback · [log](execution.log.md#t002--t001-getdiffstats-service-tdd) [^2] |
| [x] | T003 | Add `fetchDiffStats` server action wrapper | file-browser | `/home/jak/substrate/048-wf-web/apps/web/app/actions/file-actions.ts` | Wrapper exports `fetchDiffStats(worktreePath)` following lazy-import pattern | Add at ~line 129, after `fetchRecentFiles` · [log](execution.log.md#t003-fetchdiffstats-server-action) [^3] |
| [x] | T004 | Extend `PanelHeader` with `subtitle` prop | _platform/panel-layout | `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/components/panel-header.tsx` | `subtitle?: ReactNode` prop renders after title span in muted text. Existing tests still pass, new tests for subtitle added. | Additive optional prop — no breaking change · [log](execution.log.md#t004--t005-panelheader-subtitle-prop-tdd) [^4] |
| [x] | T005 | Update PanelHeader tests for subtitle | _platform/panel-layout | `/home/jak/substrate/048-wf-web/test/unit/web/features/_platform/panel-layout/panel-header.test.tsx` | Tests verify: subtitle renders when provided, hidden when omitted | TDD — write failing tests first · [log](execution.log.md#t004--t005-panelheader-subtitle-prop-tdd) [^4] |
| [x] | T006 | Extend `LeftPanel` with `subtitle` prop passthrough | _platform/panel-layout | `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/components/left-panel.tsx` | `subtitle?: ReactNode` in `LeftPanelProps`, passed to `PanelHeader subtitle` | Additive optional prop · [log](execution.log.md#t006--t007-leftpanel-subtitle-passthrough-tdd) [^5] |
| [x] | T007 | Update LeftPanel tests for subtitle passthrough | _platform/panel-layout | `/home/jak/substrate/048-wf-web/test/unit/web/features/_platform/panel-layout/left-panel.test.tsx` | Tests verify subtitle is forwarded to PanelHeader | TDD — write failing tests first · [log](execution.log.md#t006--t007-leftpanel-subtitle-passthrough-tdd) [^5] |
| [x] | T008 | Extend `usePanelState` to fetch and expose diff stats | file-browser | `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/hooks/use-panel-state.ts` | `diffStats` in return object. Fetched on mount (like changedFiles). Refreshed in `handleRefreshChanges` Promise.all. | Add `fetchDiffStats` to options interface, add to Promise.all at line 84, add state + setter · [log](execution.log.md#t008-usepanelstate-extension) [^6] |
| [x] | T009 | Wire `fetchDiffStats` and stats subtitle in BrowserClient | file-browser | `/home/jak/substrate/048-wf-web/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Pass `fetchDiffStats` to `usePanelState`. Compute subtitle JSX from `panelState.diffStats`. Pass subtitle to `LeftPanel`. Stats visible in header, live-update on file changes. | Subtitle format: `· N changed  +X −Y` with green-500/red-500 colors. Hidden when no changes. · [log](execution.log.md#t009-browserclient-wiring) [^7] |

### Acceptance Criteria

- [x] AC-1: Git workspace browser page shows changed file count in FILES header (e.g., `FILES · 3 changed`)
- [x] AC-2: Header shows total insertions (green) and deletions (red) alongside count (e.g., `+42 −18`)
- [x] AC-3: No stats shown when no files are changed — header shows only "FILES"
- [x] AC-4: Stats auto-update within ~1 second when files change (via live file events)
- [x] AC-5: Non-git workspaces show no stats
- [x] AC-6: Compact display using `text-xs`, muted/green-500/red-500 coloring per badge schema
- [x] AC-7: Binary files counted as changed but contribute 0 to insertion/deletion totals
- [x] AC-8: Edge cases handled: empty output, binary files, renamed files, repos with no commits

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `git diff HEAD --shortstat` slow on large repos | Low | Low | 500ms debounce prevents rapid-fire; async state update keeps UI responsive |
| `git diff HEAD` fails on repos with no commits | Low | Medium | Try/catch fallback to `git diff --shortstat` (DYK-03) |
| PanelHeader subtitle prop breaks existing consumers | Very Low | Low | Prop is optional — additive change, no callers affected |

---

## Progress Summary

- **Feature 1**: File Change Statistics — **COMPLETE** (9/9 tasks, 8/8 ACs)
- **Overall**: 100% of Feature 1. Plan remains open for future UX enhancement features.
- **Commit**: `b5f7d8a` — feat(049): add live file change statistics to FILES header
- **Tests**: 4523 passed, 0 failures (326 test files)

---

## Change Footnotes Ledger

[^1]: T001 — getDiffStats service
  - `function:apps/web/src/features/041-file-browser/services/diff-stats.ts:parseShortstatOutput`
  - `function:apps/web/src/features/041-file-browser/services/diff-stats.ts:getDiffStats`
  - `file:apps/web/src/features/041-file-browser/services/diff-stats.ts`

[^2]: T002 — getDiffStats TDD tests
  - `file:test/unit/web/features/041-file-browser/diff-stats.test.ts`

[^3]: T003 — fetchDiffStats server action wrapper
  - `function:apps/web/app/actions/file-actions.ts:fetchDiffStats`

[^4]: T004+T005 — PanelHeader subtitle prop + tests
  - `file:apps/web/src/features/_platform/panel-layout/components/panel-header.tsx`
  - `file:test/unit/web/features/_platform/panel-layout/panel-header.test.tsx`

[^5]: T006+T007 — LeftPanel subtitle passthrough + tests
  - `file:apps/web/src/features/_platform/panel-layout/components/left-panel.tsx`
  - `file:test/unit/web/features/_platform/panel-layout/left-panel.test.tsx`

[^6]: T008 — usePanelState extension
  - `file:apps/web/src/features/041-file-browser/hooks/use-panel-state.ts`

[^7]: T009 — BrowserClient wiring
  - `file:apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`

---

✅ Plan created:
- Location: `docs/plans/049-ux-enhancements/ux-enhancements-plan.md`
- Phases: 1 (Simple mode)
- Tasks: 9
- Domains: 2 modified + 1 consumed
- Next step: Add more UX enhancement features or close plan
