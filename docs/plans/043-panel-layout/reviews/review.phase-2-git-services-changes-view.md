# Code Review: Phase 2: Git Services + Changes View

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-spec.md
**Phase**: Phase 2: Git Services + Changes View
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity security and verification gaps remain unmitigated.

**Key failure areas**:
- **Implementation**: `fileExists` trusts client-supplied `worktreePath`, enabling unauthorized path-probing.
- **Domain compliance**: `directory-listing.ts` changed outside declared Phase 2 domain manifest scope.
- **Reinvention**: `fileExists` duplicates existing path-security/existence logic instead of extending existing service flow.
- **Testing**: AC-22 (ChangesView context menu parity) lacks explicit verification evidence.

## B) Summary

The phase artifacts show meaningful progress and coherent implementation patterns, but current diff scope and verification are incomplete for approval. A high-severity security issue exists in `fileExists` due to trust in caller-provided `worktreePath` rather than a slug-derived trusted root. Domain documentation is mostly updated, but manifest/map consistency checks fail for one in-scope mismatch and one map edge inconsistency. Testing evidence is substantial for parsing and rendering, but AC-22 and full completion evidence are still insufficient.

## C) Checklist

**Testing Approach: Full TDD**

- [x] RED/GREEN-oriented task sequencing documented
- [x] Core validation tests present
- [ ] Critical paths covered (AC-22 missing explicit evidence)
- [ ] Key verification points documented with concrete command output

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /home/jak/substrate/041-file-browser/apps/web/app/actions/file-actions.ts:131-149 | security | `fileExists` trusts client `worktreePath`; can probe outside authorized workspace. | Derive trusted workspace path from `slug` server-side and ignore/reject caller root. |
| F002 | HIGH | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/execution.log.md:27-43 | testing | AC-22 context menu parity has no explicit evidence in tests/log. | Add explicit AC-22 tests or mark deferred with rationale and target phase. |
| F003 | MEDIUM | /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/directory-listing.ts:49-68 | scope | File changed but not listed in Phase 2 manifest/tasks path set. | Add to manifest/tasks scope or remove from phase diff. |
| F004 | MEDIUM | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md:31-51 | domain | Domain Manifest omits changed `directory-listing.ts` (orphaned change). | Update manifest with classification/rationale for this file. |
| F005 | MEDIUM | /home/jak/substrate/041-file-browser/docs/domains/domain-map.md:21-49 | domain | Health summary claims active panels dependency while graph edge is commented as planned. | Align map edge + health row to same lifecycle state. |
| F006 | MEDIUM | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/execution.log.md:40-43 | testing | Evidence is narrative-only; no concrete command outputs. | Append exact verification commands and pass output excerpts. |
| F007 | MEDIUM | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/execution.log.md:42 | testing | Full-suite verification marked pending while phase is COMPLETE. | Run required quality command(s) and log result before completion. |
| F008 | MEDIUM | /home/jak/substrate/041-file-browser/apps/web/app/actions/file-actions.ts:131-149 | reinvention | `fileExists` partially duplicates `readFileAction` path/existence safety logic. | Extract/reuse shared helper in file-browser services and invoke from server action. |
| F009 | LOW | /home/jak/substrate/041-file-browser/apps/web/app/actions/file-actions.ts:115-128 | reinvention | New wrappers overlap existing wrapper pattern but remain acceptable. | Proceed; keep wrappers minimal and consistent. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH, security)**: `fileExists` should not trust caller-provided root path.
- **F003 (MEDIUM, scope)**: out-of-scope behavioral change landed in this phase diff.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | No new files violate declared domain trees. |
| Contract-only imports | ✅ | No cross-domain internal import violations found in changed code. |
| Dependency direction | ✅ | No infra→business inversion introduced in changed files. |
| Domain.md updated | ✅ | `docs/domains/file-browser/domain.md` updated with Phase 2 entries and composition/history updates. |
| Registry current | ✅ | No new domain created; registry remains valid. |
| No orphan files | ❌ | `apps/web/src/features/041-file-browser/services/directory-listing.ts` changed but omitted from Phase 2 manifest/task scope. |
| Map nodes current | ✅ | Domain nodes/contracts generally present. |
| Map edges current | ❌ | Panel-layout dependency status differs between diagram and health summary. |
| No circular business deps | ✅ | No business-cycle evidence in map. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `fetchWorkingChanges` wrapper | `fetchChangedFiles` wrapper pattern | file-browser | proceed |
| `fetchRecentFiles` wrapper | `fetchChangedFiles` wrapper pattern | file-browser | proceed |
| `fileExists` server action | `readFileAction` path-security/existence flow | file-browser | extend |

### E.4) Testing & Evidence

**Coverage confidence**: 74%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-16 | 90 | Execution log + task completion state indicates two-section ChangesView implementation. |
| AC-17 | 91 | Badge mapping/colors documented and tested per log/task notes. |
| AC-18 | 89 | Path split rendering (muted dir + bold filename) documented in task/log evidence. |
| AC-19 | 84 | Dedup behavior documented in tests/log for working vs recent. |
| AC-20 | 92 | "Working tree clean" explicitly covered in tests/log. |
| AC-21 | 90 | Click selection and indicator behavior covered in tests/log. |
| AC-22 | 35 | No explicit context-menu parity test evidence found. |
| AC-6 | 58 | `fileExists` implemented, but no explicit test evidence provided. |

### E.5) Doctrine Compliance

No additional doctrine/rules violations were reported by the doctrine validator beyond findings already captured (security/scope/evidence gaps).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-16 | Working + Recent sections | Execution log section "T006-T007: ChangesView" | 90 |
| AC-17 | Status badges/colors | Tasks T006/T007 done criteria + execution log | 91 |
| AC-18 | Muted dir + bold filename | Tasks T006/T007 done criteria + execution log | 89 |
| AC-19 | Recent deduped vs working | Tasks T006 + execution log dedup note | 84 |
| AC-20 | Clean tree empty-state text | Tasks T006 + execution log | 92 |
| AC-21 | Click select + indicator | Tasks T006 + execution log | 90 |
| AC-22 | Context menu parity | Not evidenced in listed tests/log | 35 |
| AC-6 | fileExists validation before navigate | Implementation in file-actions diff; no dedicated test evidence | 58 |

**Overall coverage confidence**: 74%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
mkdir -p docs/plans/043-panel-layout/reviews
git --no-pager diff > docs/plans/043-panel-layout/reviews/_computed.diff
git --no-pager diff --staged >> docs/plans/043-panel-layout/reviews/_computed.diff
git --no-pager diff --name-status
git --no-pager diff --staged --name-status
git --no-pager diff -- apps/web/app/actions/file-actions.ts apps/web/src/features/041-file-browser/services/directory-listing.ts docs/domains/file-browser/domain.md docs/plans/043-panel-layout/panel-layout-plan.md docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/tasks.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-spec.md
**Phase**: Phase 2: Git Services + Changes View
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/reviews/review.phase-2-git-services-changes-view.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/apps/web/app/actions/file-actions.ts | modified | file-browser | Yes |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/directory-listing.ts | modified | file-browser | Yes |
| /home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md | modified | file-browser docs | Yes |
| /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md | modified | plan docs | Yes |
| /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/tasks.md | modified | phase docs | Yes |
| /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/execution.log.md | referenced | phase docs | Yes |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | referenced | domain docs | Yes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/041-file-browser/apps/web/app/actions/file-actions.ts | Derive trusted workspace root from `slug`; do not trust caller `worktreePath` | Prevent unauthorized existence-probing outside workspace |
| 2 | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/execution.log.md | Add explicit AC-22 test evidence + concrete command outputs + full-suite result | Close high testing evidence gap and phase completion inconsistency |
| 3 | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md | Add `directory-listing.ts` to manifest/scope or remove out-of-scope change | Resolve orphan/scope mismatch |
| 4 | /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Align panel-layout edge lifecycle between graph and health summary | Keep map currency and avoid contradictory architecture state |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md | Domain manifest coverage for changed `directory-listing.ts` |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Consistent active/planned status for file-browser → panel-layout dependency |

### Next Step

/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md --phase 'Phase 2: Git Services + Changes View'
