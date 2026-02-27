# Code Review: Phase 7: Workgraph Deprecation + Cleanup

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 7: Workgraph Deprecation + Cleanup
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity issues remain in phase scoping, domain documentation currency, and test evidence completeness.

**Key failure areas**:
- **Implementation**: Phase diff artifact includes unrelated Plan 053 review files and T009 completion is not aligned with recorded verification output.
- **Domain compliance**: `_platform/workgraph` and `_platform/events` domain docs are stale after web-side deprecation; domain map/registry consistency also needs cleanup.
- **Testing**: Full TDD RED→GREEN→REFACTOR evidence is not captured for the phase and final gate evidence does not show a clean `just fft`.
- **Doctrine**: Phase isolation is violated by out-of-scope Plan 053 artifacts in the Phase 7 diff bundle.

## B) Summary

The implementation intent (remove deprecated web workgraph surfaces) is largely correct, and anti-reinvention checks found no duplicated new components.  
However, the review bundle is not phase-scoped because it includes Plan 053 artifacts, which makes this phase audit non-deterministic for merge.  
Domain documentation is only partially updated: workflow-ui docs were updated, but workgraph/events/domain-map/registry consistency is incomplete.  
Testing evidence is substantial for functional cleanup, but it does not satisfy strict Full TDD evidence requirements and does not show a passing final `just fft` gate.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED tests captured before implementation changes
- [ ] GREEN pass evidence captured per task/group
- [ ] REFACTOR + final regression evidence captured

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff:9872-9875,26313-26317 | scope/doctrine | Phase 7 computed diff includes unrelated Plan 053 review artifacts. | Regenerate `_computed.diff` from Phase 7-only scope and exclude Plan 053 files. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md:42-45,91-94 | domain-md | Workgraph domain doc still lists removed web UI/API/event consumers after Phase 7. | Update domain.md to CLI-only consumers and append Phase 7 history entry. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/execution.log.md:169-183; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/tasks.md:147 | testing/evidence | T009 is marked complete but evidence shows failing tests and no passing `just fft` transcript. | Re-run and record `just fft` (or formal waiver + blocked status) before marking complete. |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/execution.log.md:1-185; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md:162-166 | testing/process | Full TDD approach is declared, but RED→GREEN→REFACTOR sequencing is not evidenced in the phase log. | Add explicit TDD evidence blocks or document/approve a strategy exception for deletion-heavy work. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md:50-53,154,168 | domain-md | Events domain doc still references workgraph-era adapters/hooks as active examples. | Update boundaries/history to reflect workflow-era adapters and current consumers. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md:27-53 | orphan/manifest | Plan Domain Manifest is not current for many Phase 7 deletions/modifications. | Add Phase 7 file/domain mappings so all touched files are attributable. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:70-83 | map-nodes/map-edges | Domain map summary retains workgraph contracts/deps while graph representation has removed node/edges. | Reconcile node and edge model with current intended status (deprecated CLI-only vs fully retired), with labeled edges. |
| F008 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md:14,23-26 | registry | Registry status uses freeform text instead of the documented status taxonomy. | Normalize status (e.g., `deprecated`) and move CLI-only detail into notes/history text. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Review artifact scope contamination introduces unrelated Plan 053 files into this phase’s computed diff.
- **F003 (HIGH)**: Completion claim for T009 is stronger than evidence recorded in execution log and task dossier.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New docs/tasks artifacts are in expected plan directories. |
| Contract-only imports | ✅ | No cross-domain internal-import violations were identified in code changes reviewed. |
| Dependency direction | ✅ | No infrastructure→business inversion was identified in changed code paths. |
| Domain.md updated | ❌ | `_platform/workgraph/domain.md` and `_platform/events/domain.md` are stale post-removal. |
| Registry current | ❌ | Workgraph row is updated semantically but status taxonomy is inconsistent. |
| No orphan files | ❌ | Phase 7 diff includes unrelated Plan 053 artifacts; manifest coverage is incomplete for Phase 7 deletions. |
| Map nodes current | ❌ | Domain map node model and summary table disagree for workgraph state. |
| Map edges current | ❌ | Workgraph dependencies are still declared in summary but graph edges are removed; edge labeling consistency is incomplete. |
| No circular business deps | ✅ | No new business-domain cycle was introduced in this phase. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| _None introduced (deletion/cleanup phase)_ | None | N/A | ✅ No duplication risk detected |

### E.4) Testing & Evidence

**Coverage confidence**: 86%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-31 | 92 | `_computed.diff` removes workspace-scoped workgraph pages/components and execution log records zero workgraph page hits. |
| AC-32 | 74 | API route deletions are present in diff, but explicit AC-32 verification output is limited in execution evidence. |
| AC-33 | 90 | Legacy `/workflow` and `/workflows/*` surfaces are removed in diff and reflected in execution summary. |
| AC-34 | 88 | Workgraph watcher/domain event adapters are removed and export wiring references are updated. |

### E.5) Doctrine Compliance

- **F001 (HIGH)**: Phase-based delivery/isolation expectation is not met because the phase diff artifact includes Plan 053 files.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-31 | Remove workgraph UI pages | Deletions in `_computed.diff` for workgraph page routes + execution log grep checks | 92 |
| AC-32 | Remove legacy workgraph API routes | Deletions in `_computed.diff` for `/api/workspaces/[slug]/workgraphs/*` | 74 |
| AC-33 | Remove legacy workflow/workflows pages | Deletions in `_computed.diff` for `/workflow` and `/workflows/*` | 90 |
| AC-34 | Remove workgraph event adapters | Adapter deletions + notifier/wiring updates in `_computed.diff` and execution log T004 | 88 |

**Overall coverage confidence**: 86%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -15
git --no-pager show --name-status --pretty=format:'COMMIT %H%nSUBJECT %s%n' a42e27f
git --no-pager show --pretty=format: a42e27f > /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff
rg -n '053-global-state-system/reviews/_manifest.txt|053-global-state-system/reviews/_computed.diff' /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff
rg -n 'workgraph|WorkGraph|consumer|consum' /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md
rg -n 'workgraph|WorkGraph|WorkflowWatcherAdapter|WorkGraphWatcherAdapter' /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md
rg -n 'workgraph|_platform/workgraph|Status|deprecated|removed|IFileSystem|IPathResolver' /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
rg -n '_platform/workgraph|Status|deprecated|removed' /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 7: Workgraph Deprecation + Cleanup
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-7-workgraph-deprecation-cleanup.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff | Modified | review artifact | Re-scope to Phase 7 only (remove Plan 053 entries). |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/tasks.md | Modified | workflow-ui docs | Align T009 completion/status with actual validation evidence. |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/execution.log.md | Added | workflow-ui docs | Add complete TDD + final gate evidence (`just fft` or approved waiver). |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md | Existing | _platform/workgraph | Update consumers/history to reflect web removal and CLI-only status. |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md | Existing | _platform/events | Remove stale workgraph-era examples and update history/current usage. |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Modified | cross-domain docs | Reconcile node/edge model with summary contracts and labels. |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md | Modified | cross-domain docs | Normalize status taxonomy for workgraph row. |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Modified | workflow-ui docs | Refresh Domain Manifest coverage for Phase 7 touchpoints. |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff | Regenerate the computed diff with Phase 7-only scope and exclude Plan 053 artifacts. | Current diff bundle violates phase isolation and introduces out-of-scope review content. |
| 2 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/execution.log.md | Add/refresh evidence for final gate (`just fft` pass or explicit approved waiver) and explicit AC-32 verification. | T009 completion currently overstates verification completeness. |
| 3 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md | Remove web/API/event consumers and append Phase 7 deprecation history entry. | Domain contract and consumers are stale after web deprecation. |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md | Update boundaries/examples/history to current workflow-era adapters. | Domain doc still references removed workgraph-era integrations. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md | Post-Phase 7 consumer list + history update (CLI-only positioning). |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md | Removal of stale workgraph examples and current adapter ownership details. |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Node/edge consistency with summary table and labeled dependency edges. |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md | Canonical status taxonomy usage for workgraph row. |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Domain Manifest entries covering Phase 7 touched files. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md --phase "Phase 7: Workgraph Deprecation + Cleanup"
