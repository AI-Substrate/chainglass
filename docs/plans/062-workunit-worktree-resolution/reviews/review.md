# Code Review: Implementation

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-spec.md
**Phase**: Simple Mode
**Date**: 2026-03-01
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity review failures remain unmitigated (domain manifest drift, missing verification evidence artifacts, and resolver concept reinvention).

**Key failure areas**:
- **Implementation**: Action-level resolver behavior (unknown slug path) is not verified by tests even though task scope called for exported-action coverage.
- **Domain compliance**: Plan Domain Manifest is stale and omits several changed domain files.
- **Reinvention**: New `resolveWorktreeContext` utility duplicates existing workspace-context capability.
- **Testing**: No execution log or screenshot artifacts back claims for `just fft`, Next.js MCP checks, and Playwright verification.
- **Doctrine**: New test file does not use the required 5-field Test Doc format.

## B) Summary

The code changes are directionally correct for worktree threading and missing-parameter redirect behavior, and no critical correctness or security defects were found in the modified runtime paths. However, evidence quality is below review bar: required execution-log and screenshot artifacts are absent, so multiple acceptance-criteria claims are unverified. Domain governance is also out of sync because the plan manifest does not list all changed files. A new resolver utility appears to duplicate existing workspace-context capability, increasing maintenance risk unless consolidated. Verdict is REQUEST_CHANGES until the high-severity findings are resolved and evidence is attached.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid (TDD + Lightweight):
- [x] Core validation tests present
- [ ] Action-level critical paths covered
- [ ] Verification evidence artifacts documented

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (with concrete output)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md:22-35 | domain-compliance | Domain Manifest omits changed files (`agent-editor.tsx`, `code-unit-editor.tsx`, `user-input-editor.tsx`, `resolve-worktree-context.ts`) | Update Domain Manifest to include all touched files (or revert unintended changes) |
| F002 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/execution.log.md:missing | testing-evidence | Required execution log is missing; `just fft`, MCP, and Playwright claims are not backed by command output | Create execution.log with timestamped commands, exit codes, and key stdout/stderr excerpts |
| F003 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/evidence/:missing | testing-evidence | AC-12 claims screenshots, but no screenshot artifacts were found | Add screenshots for list/editor/missing-worktree flows and link them from execution.log |
| F004 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/lib/resolve-worktree-context.ts:1-30 | reinvention | New resolver duplicates existing workspace-context capability (`resolveContextFromParams`) and diverges from task guidance | Reuse/extend the existing shared resolver contract; avoid introducing parallel resolver logic |
| F005 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/actions/workunit-actions-worktree.test.ts:1-7 | doctrine | Test Doc format does not include required 5 fields (`Why`, `Contract`, `Usage Notes`, `Quality Contribution`, `Worked Example`) | Rewrite comments to required Test Doc format per project rules |
| F006 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/actions/workunit-actions-worktree.test.ts:52-85 | scope/testing | Tests validate only helper function, not exported action-level resolver behavior (including unknown slug path) | Add DI-based action tests (`listUnits`/`loadUnit`) for unknown slug, missing worktree, invalid worktree, valid worktree |
| F007 | LOW | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/tasks.fltplan.md:141-146 | consistency | `T002` is `[~]` in flightplan while plan/tasks mark it complete | Sync status markers across progress artifacts |

## E) Detailed Findings

### E.1) Implementation Quality

- No HIGH correctness/security/performance defects found in reviewed code paths.
- **F006 (MEDIUM)**: test coverage does not exercise exported action flows required by the task dossier.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New/changed runtime files remain under `058-workunit-editor` domain tree |
| Contract-only imports | ✅ | No cross-domain internal import violations detected |
| Dependency direction | ✅ | No infrastructure → business inversion found |
| Domain.md updated | ✅ | `docs/domains/058-workunit-editor/domain.md` history updated for Plan 062 |
| Registry current | ✅ | No new domain introduced; registry remains consistent |
| No orphan files | ❌ | **F001**: Domain Manifest missing four changed files |
| Map nodes current | ✅ | Domain map includes `058-workunit-editor` node |
| Map edges current | ✅ | Existing labeled edges remain present |
| No circular business deps | ✅ | No business-domain cycle introduced |
| Concepts documented | ✅ | Domain has a `## Concepts` section |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `resolveWorktreeContext` utility | `resolveContextFromParams()` in `/Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/services/workspace.service.ts` | `@chainglass/workflow` | ❌ Duplicate capability (**F004**) |
| Manual `?worktree=` URL assembly in unit links | `workspaceHref()` in `/Users/jordanknight/substrate/058-workunit-editor/apps/web/src/lib/workspace-url.ts` | `_platform/workspace-url` | ⚠️ Reuse opportunity |

### E.4) Testing & Evidence

**Coverage confidence**: 57%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 75 | List page threads `worktreePath` to `listUnits` |
| AC-02 | 78 | Editor page threads `worktreePath` to all three load calls |
| AC-03 | 76 | Save/update paths pass `worktreePath` through editors/panels |
| AC-04 | 74 | Create modal passes `worktreePath` to `createUnit` and redirect |
| AC-05 | 45 | Delete/rename action signatures updated; UI/runtime evidence limited |
| AC-06 | 82 | Unit list/sidebar links preserve `?worktree=` |
| AC-07 | 84 | Both pages redirect when `worktree` query is missing |
| AC-08 | 62 | Return-link/data-threading appears present; round-trip not evidenced |
| AC-09 | 20 | Claimed pass only; no command output artifact (**F002**) |
| AC-10 | 70 | Helper-level tests added for resolver behavior |
| AC-11 | 15 | Claimed MCP check; no diagnostics artifact (**F002**) |
| AC-12 | 10 | Screenshots claimed but absent (**F003**) |

### E.5) Doctrine Compliance

- Project rules files exist and were checked.
- **F005 (MEDIUM)**: new test file Test Doc format is non-compliant with required 5-field rule.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | List page with `?worktree=` lists units from specified worktree | `work-units/page.tsx` passes `worktreePath` to `listUnits` | 75 |
| AC-02 | Editor page with `?worktree=` loads content from specified worktree | `[unitSlug]/page.tsx` threads `worktreePath` to `loadUnit`, `loadUnitContent`, `listUnits` | 78 |
| AC-03 | Editing saves to specified worktree | `workunit-editor.tsx` + child editors + metadata panel pass `worktreePath` | 76 |
| AC-04 | Creating scaffolds in specified worktree | `unit-creation-modal.tsx` passes `worktreePath` to `createUnit` | 74 |
| AC-05 | Deleting/renaming operate on specified worktree | Action signatures include `worktreePath`; no explicit evidence artifact | 45 |
| AC-06 | Links preserve `?worktree=` between units | `unit-list.tsx` and `unit-catalog-sidebar.tsx` append query | 82 |
| AC-07 | Missing `?worktree=` redirects (no silent fallback) | Both pages call `redirect(/workspaces/${slug})` | 84 |
| AC-08 | Edit Template round-trip preserves context | Return link + threaded data path present; no runtime artifact | 62 |
| AC-09 | `just fft` passes | Claimed in docs only; execution log missing | 20 |
| AC-10 | Unit tests verify worktree validation | `workunit-actions-worktree.test.ts` helper tests present | 70 |
| AC-11 | Next.js MCP shows zero errors | Claimed only; MCP evidence missing | 15 |
| AC-12 | Playwright screenshots confirm behavior | Screenshot artifacts missing | 10 |

**Overall coverage confidence**: 57%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -20
git --no-pager log --oneline -- docs/plans/062-workunit-worktree-resolution
git --no-pager log --oneline -20 -- apps/web/app/actions/workunit-actions.ts
git --no-pager log --oneline -20 -- test/unit/web/actions/workunit-actions-worktree.test.ts
git --no-pager diff --name-status 3795ea9..HEAD
git --no-pager diff 3795ea9..HEAD > /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/reviews/_computed.diff
# Subagent tasks executed in parallel:
# - Implementation quality review
# - Domain compliance review
# - Anti-reinvention review
# - Testing evidence review
# - Doctrine/rules review
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-spec.md
**Phase**: Simple Mode
**Tasks dossier**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/tasks.md
**Execution log**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/execution.log.md (missing)
**Review file**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/reviews/review.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/page.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/actions/workunit-actions.ts | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/agent-editor.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/metadata-panel.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/unit-catalog-sidebar.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/unit-creation-modal.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/unit-list.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/user-input-editor.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/lib/resolve-worktree-context.ts | Added | 058-workunit-editor | Yes (F004) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/tasks.fltplan.md | Modified | plan-artifact | Yes (F007) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/tasks.md | Modified | plan-artifact | No |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md | Modified | plan-artifact | Yes (F001) |
| /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/actions/workunit-actions-worktree.test.ts | Added | 058-workunit-editor | Yes (F005, F006) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/execution.log.md | Missing | evidence-artifact | Yes (F002) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/evidence/ | Missing | evidence-artifact | Yes (F003) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md | Add all touched files to Domain Manifest | Eliminates orphan-file domain compliance violation (F001) |
| 2 | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/execution.log.md | Add concrete command outputs for fft/MCP/Playwright and test progression | Acceptance evidence currently unverified (F002) |
| 3 | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/evidence/* | Add and reference screenshots for AC-12 scenarios | Claimed Playwright evidence missing (F003) |
| 4 | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/lib/resolve-worktree-context.ts | Consolidate with existing resolver capability (reuse/extend shared method) | Avoid concept duplication and divergence (F004) |
| 5 | /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/actions/workunit-actions-worktree.test.ts | Convert to required 5-field Test Doc format and add action-level tests | Comply with doctrine and task testing scope (F005/F006) |
| 6 | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/tasks.fltplan.md | Sync T002 status marker with completed state | Remove progress artifact inconsistency (F007) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md | Domain Manifest entries for all changed domain files |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md --phase 'Implementation'
