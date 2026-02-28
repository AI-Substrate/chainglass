# Code Review: 049 UX Enhancements — Feature 1: File Change Statistics

**Plan**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/ux-enhancements-plan.md`
**Spec**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/ux-enhancements-spec.md`
**Phase**: Simple Mode (all 9 tasks in single phase)
**Date**: 2026-02-26
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**APPROVE WITH NOTES**

Two MEDIUM findings relate to TDD evidence quality (process documentation), not code defects. Code quality, domain compliance, anti-reinvention, and doctrine checks all pass cleanly.

**Key failure areas**:
- **Testing**: TDD red-green evidence is narrative-only; single commit prevents git verification of test-first ordering. AC-7/AC-8 edge cases lack explicit parser tests.

## B) Summary

Implementation quality is strong — the new `getDiffStats()` service follows the established `changed-files.ts` pattern exactly (execFileAsync → parse → union result), error handling covers the no-commits fallback, and all imports respect domain boundaries. Domain compliance is perfect: file placement, contract-only imports, dependency direction, and domain.md history are all correct. The anti-reinvention check confirms `diff-stats.ts` serves a genuinely distinct purpose (aggregate line counts) not covered by existing `changed-files.ts` (file names) or `working-changes.ts` (per-file status). Testing evidence is the weakest area — while 22 tests pass and coverage is solid for the core parser, TDD compliance can only be assessed via narrative (not commit history), and a few acceptance criteria edge cases (binary files, renamed files, no-commits fallback) lack explicit test coverage.

## C) Checklist

**Testing Approach: Full TDD**

- [x] Core parser tests written before implementation (per execution log narrative)
- [x] Component subtitle tests written before prop implementation (per execution log narrative)
- [ ] RED phase evidence includes actual test runner output (narrative-only, not verifiable)
- [x] All 22 tests pass (8 diff-stats + 8 panel-header + 6 left-panel)
- [x] Full suite: 4523 tests passed, 0 failures
- [x] No mocks — fakes only (QT-08 compliant)
- [x] Only in-scope files changed (9 source + 4 doc files)
- [x] Lint clean (biome check passes)
- [x] Domain compliance checks pass (all 9 checks ✅)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | (process) | testing | Single commit ships tests + implementation together; git history cannot verify TDD red-green ordering | For future: commit RED tests separately before GREEN implementation |
| F002 | MEDIUM | `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/execution.log.md` | testing | Execution log claims RED-GREEN but lacks concrete test runner output (FAIL/PASS lines) | Paste actual vitest output snippets in execution log |
| F003 | LOW | `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/services/diff-stats.ts:51-52` | error-handling | Error detection relies on English string 'ambiguous argument' — non-English locale git would skip fallback | Consider exit code or `git rev-parse --verify HEAD` pre-check |
| F004 | LOW | `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/services/diff-stats.ts:54-61` | correctness | No-commits fallback (`git diff --shortstat`) only captures unstaged changes; staged files in zero-commit repos undercount | Document as known limitation or add `--cached` merge |
| F005 | LOW | `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/diff-stats.test.ts` | testing | AC-7 (binary files → 0 insertions/deletions) has no explicit parser test for binary-only shortstat output | Add test: `' 1 file changed'` (no insertion/deletion clause) |
| F006 | LOW | `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/diff-stats.test.ts` | testing | AC-8 edge cases (renamed files, no-commits fallback) lack explicit tests | Add rename shortstat test + no-commits integration test |
| F007 | LOW | `/home/jak/substrate/048-wf-web/apps/web/app/actions/file-actions.ts` | pattern | `fetchDiffStats` lacks explicit return type annotation | Add `: Promise<DiffStatsResult>` (matches R-CODE-001, though existing wrappers also omit) |
| F008 | LOW | `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/execution.log.md` | testing | PanelHeader TDD: 1 of 2 new tests passed in RED phase (existing behavior confirmation, not a true failure) | Document: "Test X passed in RED (regression guard for existing behavior)" |

## E) Detailed Findings

### E.1) Implementation Quality

**2 LOW findings. No correctness, security, or performance issues.**

**F003** (LOW — error-handling): `diff-stats.ts:51-52` — The fallback from `git diff HEAD --shortstat` to `git diff --shortstat` is triggered by matching the string `'ambiguous argument'` in the error message. On servers with non-English locale, git may emit a translated message, causing the fallback to be skipped (returning `not-git` instead). **Mitigation**: Server locales are typically English; this is a low-risk edge case. Better approach: pre-check with `git rev-parse --verify HEAD` (exit-code based, locale-independent).

**F004** (LOW — correctness): `diff-stats.ts:54-61` — When HEAD doesn't exist (new repo, no commits), the fallback uses `git diff --shortstat` which only captures unstaged changes. Staged files in a zero-commit repo won't be counted. This is an inherent git limitation for the `--shortstat` approach. **Mitigation**: Edge case is extremely rare (new repos with staged-but-not-committed files viewing in browser). Could merge `git diff --cached --shortstat` results if needed.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All 9 source files under declared domain source trees |
| Contract-only imports | ✅ | `use-panel-state.ts` → `diff-stats` (same domain). Panel-layout has zero file-browser imports |
| Dependency direction | ✅ | file-browser (business) → panel-layout (infra). No reverse |
| Domain.md updated | ✅ | Both domain.md files have Plan 049 Feature 1 history entries |
| Registry current | ✅ | No new domains created; both pre-exist in registry |
| No orphan files | ✅ | All changed files appear in manifest |
| Map nodes current | ✅ | `subtitle` is an optional prop addition, not a new contract — no node label update needed |
| Map edges current | ✅ | No new cross-domain dependencies introduced |
| No circular business deps | ✅ | Single business domain (`file-browser`), no cycles possible |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `getDiffStats` / `parseShortstatOutput` | None | file-browser | ✅ Proceed |

**Analysis**: Existing git services (`changed-files.ts` → file names, `working-changes.ts` → per-file status) serve distinct purposes. `diff-stats.ts` answers "how many total lines were added/removed?" — aggregate numeric summary with no overlap in data shape or git plumbing command. No `--shortstat`, `--numstat`, or `--stat` usage exists elsewhere in the codebase.

### E.4) Testing & Evidence

**Coverage confidence**: 68%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-1 | 75% | 7 parser tests verify file count extraction. PanelHeader/LeftPanel subtitle tests verify rendering. Gap: no test for composed `· N changed` format in BrowserClient (excluded per spec) |
| AC-2 | 65% | Parser tests verify insertions/deletions parsing (normal, ins-only, del-only). Gap: green-500/red-500 coloring untested (visual, manual only) |
| AC-3 | 70% | Parser returns zeros for empty/whitespace output. PanelHeader hides subtitle when omitted. Gap: no test for BrowserClient hiding subtitle when stats are all zeros |
| AC-4 | 35% | No direct test. Execution log confirms diffStats added to Promise.all in handleRefreshChanges (T008). Relies on existing plan 045 integration coverage. Exclusion documented |
| AC-5 | 85% | Integration test calls getDiffStats with non-existent path, verifies `{ok:false, error:'not-git'}`. Strong evidence |
| AC-6 | 25% | No test evidence. text-xs/muted/green-500/red-500 styling is in BrowserClient JSX. Excluded per spec — manual browser verification only |
| AC-7 | 45% | No explicit test for binary files. --shortstat handles implicitly (git pre-aggregates). Parser handles missing clauses via optional regex groups defaulting to 0 |
| AC-8 | 55% | Partial: empty output ✅, whitespace ✅, large numbers ✅, non-git ✅. Missing: binary-only shortstat, rename shortstat, no-commits fallback |

### E.5) Doctrine Compliance

**1 LOW finding (informational). No violations.**

**F007** (LOW — pattern): `file-actions.ts` — `fetchDiffStats` is an exported server action without explicit return type annotation. Rule R-CODE-001 requires explicit return types for public APIs. However, all other `fetch*` wrappers in the same file also omit return types — this is a pre-existing pattern, not a regression. Fixing it would be scope creep.

**Note**: `DiffStats` interface correctly uses unprefixed naming (data shape, not service contract). The codebase consistently uses unprefixed names for DTOs (`FileEntry`, `ChangedFile`, `LogEntry`), reserving `I-` prefix for injectable service interfaces.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-1 | Changed file count in header | 7 parser tests + subtitle render tests | 75% |
| AC-2 | Insertions (green) + deletions (red) | Parser tests for ins/del/combined. Styling excluded (manual) | 65% |
| AC-3 | No stats when no changes | Parser zeros + subtitle omission test | 70% |
| AC-4 | Auto-update within ~1s | Promise.all wiring (code review). Excluded from testing (plan 045 coverage) | 35% |
| AC-5 | Non-git workspaces — no stats | Integration test with non-git path | 85% |
| AC-6 | Compact text-xs, green-500/red-500 | Code inspection only. Visual, excluded from testing | 25% |
| AC-7 | Binary files → 0 ins/del | Implicit via --shortstat + optional regex. No explicit test | 45% |
| AC-8 | Edge cases: empty, binary, rename, no-commits | Partially covered (4/7 cases). Gaps: binary-only, rename, no-commits fallback | 55% |

**Overall coverage confidence**: 68%

## G) Commands Executed

```bash
git --no-pager log --oneline -15
git diff --stat
git diff --staged --stat
git --no-pager diff b5f7d8a^..b5f7d8a --stat
git --no-pager diff b5f7d8a^..b5f7d8a
# Subagents read source files, domain docs, project rules
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/ux-enhancements-plan.md`
**Spec**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/ux-enhancements-spec.md`
**Phase**: Simple Mode (all tasks)
**Tasks dossier**: inline in plan (§ Implementation → Tasks)
**Execution log**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/execution.log.md`
**Review file**: `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/reviews/review.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/services/diff-stats.ts` | Created | file-browser | None (2 LOW notes) |
| `/home/jak/substrate/048-wf-web/apps/web/app/actions/file-actions.ts` | Modified | file-browser | None (1 LOW note) |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/hooks/use-panel-state.ts` | Modified | file-browser | None |
| `/home/jak/substrate/048-wf-web/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Modified | file-browser | None |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/components/panel-header.tsx` | Modified | _platform/panel-layout | None |
| `/home/jak/substrate/048-wf-web/apps/web/src/features/_platform/panel-layout/components/left-panel.tsx` | Modified | _platform/panel-layout | None |
| `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/diff-stats.test.ts` | Created | file-browser | Optional: add edge case tests (F005, F006) |
| `/home/jak/substrate/048-wf-web/test/unit/web/features/_platform/panel-layout/panel-header.test.tsx` | Modified | _platform/panel-layout | None |
| `/home/jak/substrate/048-wf-web/test/unit/web/features/_platform/panel-layout/left-panel.test.tsx` | Modified | _platform/panel-layout | None |
| `/home/jak/substrate/048-wf-web/docs/domains/_platform/panel-layout/domain.md` | Modified | _platform/panel-layout | None |
| `/home/jak/substrate/048-wf-web/docs/domains/file-browser/domain.md` | Modified | file-browser | None |
| `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/execution.log.md` | Created | — | Optional: add test runner output (F002) |
| `/home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/ux-enhancements-plan.md` | Modified | — | None |

### Required Fixes (if REQUEST_CHANGES)

N/A — verdict is APPROVE WITH NOTES.

### Optional Improvements

| # | File (absolute path) | What To Improve | Why |
|---|---------------------|-----------------|-----|
| 1 | `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/diff-stats.test.ts` | Add binary-only shortstat test: `' 1 file changed'` | Explicit AC-7 coverage |
| 2 | `/home/jak/substrate/048-wf-web/test/unit/web/features/041-file-browser/diff-stats.test.ts` | Add renamed-file shortstat test | Explicit AC-8 coverage |
| 3 | `/home/jak/substrate/048-wf-web/apps/web/src/features/041-file-browser/services/diff-stats.ts` | Replace string match `'ambiguous argument'` with `git rev-parse --verify HEAD` pre-check | Locale-independent error detection |

### Domain Artifacts to Update (if any)

None — all domain docs are current.

### Next Step

Implementation complete and approved — ready to move on to the next UX enhancement feature in the spec, or commit the review artifact:
```bash
git add docs/plans/049-ux-enhancements/reviews/ && git commit -m "Add Plan 049 Feature 1 code review (APPROVE WITH NOTES)"
```
