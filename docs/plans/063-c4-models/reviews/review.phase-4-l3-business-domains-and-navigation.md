# Code Review: Phase 4: L3 Business Domains & Navigation Polish

**Plan**: /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/c4-models-plan.md  
**Spec**: /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/c4-models-spec.md  
**Phase**: Phase 4: L3 Business Domains & Navigation Polish  
**Date**: 2026-03-02  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Manual Only

## A) Verdict

**REQUEST_CHANGES**

Three new business L3 component files contain broken cross-reference/navigation links caused by incorrect relative path depth (`../../../domains/...` instead of `../../domains/...`), so AC-06/AC-07 are not actually satisfied.

**Key failure areas**:
- **Implementation**: Broken domain/registry links in all three new business L3 component files.
- **Domain compliance**: `workunit-editor` documents `_platform/viewer (CodeEditor)` as an external contract, but `_platform/viewer/domain.md` does not expose `CodeEditor` in its Contracts table.
- **Testing**: Execution evidence did not include a direct broken-link scan for the newly created business L3 files.
- **Doctrine**: Cross-reference/navigation resolution violates C4 authoring principles requiring working navigation.

## B) Summary

The phase substantially delivers intended scope (3 business L3 diagrams + 13 domain back-links + verification artifacts), but key navigation links in the 3 new business component files are broken. Domain placement and dependency direction checks are otherwise clean for this documentation-only phase. Anti-reinvention review found no new functional implementation duplication (phase is documentation-only), though some concepts map to existing components as expected. Testing evidence quality is decent for manual checks, but missed the path-depth defect, reducing confidence for AC-06/AC-07 completion.

## C) Checklist

**Testing Approach: Manual**

- [x] Manual verification steps documented
- [x] Manual test results recorded with observed outcomes
- [x] Evidence artifacts present
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not evidenced for this phase)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/063-c4-models/docs/c4/components/file-browser.md:3,5,75 | correctness | Cross-reference and nav links point outside `docs/` due wrong relative depth. | Replace `../../../domains/...` with `../../domains/...` in this file. |
| F002 | HIGH | /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workflow-ui.md:3,5,69 | correctness | Cross-reference and nav links point outside `docs/` due wrong relative depth. | Replace `../../../domains/...` with `../../domains/...` in this file. |
| F003 | HIGH | /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workunit-editor.md:3,5,60 | correctness | Cross-reference and nav links point outside `docs/` due wrong relative depth. | Replace `../../../domains/...` with `../../domains/...` in this file. |
| F004 | MEDIUM | /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workunit-editor.md:52 | domain-compliance | External dependency references `_platform/viewer (CodeEditor)` which is not listed as a viewer public contract. | Align dependency prose to documented viewer contracts or update `_platform/viewer/domain.md` contracts. |
| F005 | MEDIUM | /Users/jordanknight/substrate/063-c4-models/docs/domains/workflow-ui/domain.md:112-120 | domain-compliance | Dependencies table omits `_platform/state` though domain map and workflow behavior reference `useGlobalState`. | Add `_platform/state` dependency row with consumed contract details. |
| F006 | LOW | /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/tasks/phase-4-l3-business-domains-and-navigation/execution.log.md:57 | testing | AC-06 marked PASS without explicit per-file link resolution evidence in log. | Add command/output evidence for business L3 link resolution checks. |
| F007 | LOW | /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/dev-tools/domain.md (and 11 other touched domain docs) | concepts-docs | Touched domain docs mostly lack a top-level `## Concepts` section/table (review-only quality gate). | Add minimal Concepts table (`Concept | Entry Point | What It Does`) for touched domains. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001–F003 (HIGH)**: Confirmed by path resolution check: links like `../../../domains/file-browser/domain.md` resolve to `/Users/jordanknight/substrate/063-c4-models/domains/...` (missing `/docs/`), so links are broken.
- Scope remains aligned with phase tasks (documentation-only; no app code changes in phase-scoped diff).

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are under `docs/c4/components/` as planned. |
| Contract-only imports | ✅ | No cross-domain code imports introduced (docs-only change set). |
| Dependency direction | ✅ | No new source dependency direction violations introduced. |
| Domain.md updated | ✅ | 13 domain docs updated with C4 links per phase scope. |
| Registry current | ✅ | No domain additions/removals required; registry remains consistent. |
| No orphan files | ✅ | All phase-scoped files map to the phase task list. |
| Map nodes current | ✅ | No phase changes required to domain-map nodes for these docs edits. |
| Map edges current | ✅ | No phase-introduced unlabeled edges/cycles found in domain-map. |
| No circular business deps | ✅ | No new business-domain cycles introduced. |
| Concepts documented | ⚠️ | Concepts section/table is missing in most touched domain docs (quality gap, non-blocking for this phase’s core deliverable). |

Additional domain findings:
- **F004 (MEDIUM)**: Work Unit Editor external dependency naming drifts from viewer contract table.
- **F005 (MEDIUM)**: Workflow UI dependencies table appears stale vs domain-map (`useGlobalState` from `_platform/state`).

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| UndoRedoManager (documented in file-browser L3) | UndoRedoManager exists in workflow UI implementation | workflow-ui | ⚠️ Existing concept found; documentation-only phase did not introduce code duplication |
| Code Editor (documented in workunit-editor L3) | CodeEditor exists under viewer implementation | _platform/viewer | ✅ Existing reuse pattern; ensure dependency is documented at contract boundary |
| Workflow canvas/toolbox/properties stack | No functional duplicate requiring action | workflow-ui | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 82%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-05 | 92 | 13 L3 component files present (10 infra + 3 business). |
| AC-06 | 35 | Cross-reference blocks exist, but 3 business-domain links are broken (F001–F003). |
| AC-07 | 60 | Navigation sections exist, but domain links in 3 new files are broken. |
| AC-08 | 88 | README link verification evidence present and passes. |
| AC-17 | 90 | 13 domain.md files contain C4 Diagram links; syntax and target naming generally correct. |

### E.5) Doctrine Compliance

- **F001–F003 (HIGH)** violate C4 authoring expectations for working cross-reference and navigation links.
- Project rules docs exist (`docs/project-rules/{rules,idioms,architecture,constitution}.md`); no additional high-severity rule conflicts found beyond the broken-link defects above.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-05 | 13 L3 component files exist | Phase-scoped diff + file existence checks | 92 |
| AC-06 | Every L3 file links back to domain.md | Link targets in 3 new business files are broken (F001–F003) | 35 |
| AC-07 | Navigation footer completeness and correctness | Footer exists; 3 Domain links broken due relative path depth | 60 |
| AC-08 | README quick links resolve | Execution log + independent link-resolution check report zero broken README links | 88 |
| AC-17 | Every active domain.md has C4 Diagram link | 13 domain docs contain C4 Diagram line and expected targets | 90 |

**Overall coverage confidence**: **73%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -20
git --no-pager log --format='%H %h %ci %s' -20 -- docs/c4/components/file-browser.md docs/c4/components/workflow-ui.md docs/c4/components/workunit-editor.md
git --no-pager diff e451a9f..HEAD -- <phase-4 file list> > /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/reviews/_computed.diff
git --no-pager diff --name-status e451a9f..HEAD -- <phase-4 file list>
python (markdown link resolution check for 3 business component files)
python (README.md link count + broken link check)
rg -n "\\.\\./\\.\\./\\.\\./domains" docs/c4/components/{file-browser,workflow-ui,workunit-editor}.md
rg -n "_platform/state|Dependencies|What It Consumes" docs/domains/workflow-ui/domain.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/c4-models-plan.md  
**Spec**: /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/c4-models-spec.md  
**Phase**: Phase 4: L3 Business Domains & Navigation Polish  
**Tasks dossier**: /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/tasks/phase-4-l3-business-domains-and-navigation/tasks.md  
**Execution log**: /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/tasks/phase-4-l3-business-domains-and-navigation/execution.log.md  
**Review file**: /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/reviews/review.phase-4-l3-business-domains-and-navigation.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/063-c4-models/docs/c4/components/file-browser.md | Added | docs/c4 | Yes (fix relative links) |
| /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workflow-ui.md | Added | docs/c4 | Yes (fix relative links) |
| /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workunit-editor.md | Added | docs/c4 | Yes (fix relative links + dependency wording) |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/workflow-ui/domain.md | Modified | workflow-ui | Yes (add `_platform/state` dependency row) |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/viewer/domain.md | Modified | _platform/viewer | Yes (optional: reconcile contract naming vs workunit-editor dependency text) |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/file-ops/domain.md | Modified | _platform/file-ops | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/workspace-url/domain.md | Modified | _platform/workspace-url | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/events/domain.md | Modified | _platform/events | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/panel-layout/domain.md | Modified | _platform/panel-layout | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/sdk/domain.md | Modified | _platform/sdk | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/settings/domain.md | Modified | _platform/settings | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/positional-graph/domain.md | Modified | _platform/positional-graph | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/state/domain.md | Modified | _platform/state | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/dev-tools/domain.md | Modified | _platform/dev-tools | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/file-browser/domain.md | Modified | file-browser | No |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/058-workunit-editor/domain.md | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/tasks/phase-4-l3-business-domains-and-navigation/execution.log.md | Added | plan-artifact | Yes (improve AC evidence detail) |
| /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/tasks/phase-4-l3-business-domains-and-navigation/tasks.md | Added | plan-artifact | No |
| /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/tasks/phase-4-l3-business-domains-and-navigation/tasks.fltplan.md | Added | plan-artifact | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/063-c4-models/docs/c4/components/file-browser.md | Replace `../../../domains/...` with `../../domains/...` in cross-reference + navigation links | Broken links; AC-06/AC-07 failure |
| 2 | /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workflow-ui.md | Replace `../../../domains/...` with `../../domains/...` in cross-reference + navigation links | Broken links; AC-06/AC-07 failure |
| 3 | /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workunit-editor.md | Replace `../../../domains/...` with `../../domains/...` in cross-reference + navigation links | Broken links; AC-06/AC-07 failure |
| 4 | /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workunit-editor.md and /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/viewer/domain.md | Reconcile `CodeEditor` dependency naming with published viewer contracts | Domain contract consistency |
| 5 | /Users/jordanknight/substrate/063-c4-models/docs/domains/workflow-ui/domain.md | Add `_platform/state` dependency (`useGlobalState`) | Domain dependency doc drift |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/063-c4-models/docs/c4/components/file-browser.md | Correct relative cross-reference/footer domain links |
| /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workflow-ui.md | Correct relative cross-reference/footer domain links |
| /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workunit-editor.md | Correct relative cross-reference/footer domain links; optionally align external dependency wording to public contracts |
| /Users/jordanknight/substrate/063-c4-models/docs/domains/workflow-ui/domain.md | Add missing `_platform/state` dependency entry |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/c4-models-plan.md --phase "Phase 4: L3 Business Domains & Navigation Polish"
