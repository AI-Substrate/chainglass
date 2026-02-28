# Code Review: Phase 3: Drag-and-Drop + Persistence

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 3: Drag-and-Drop + Persistence
**Date**: 2026-02-26
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD (spec), observed evidence quality: Manual/incomplete

## A) Verdict

**REQUEST_CHANGES**

Blocking issues remain: the captured change set is not Phase 3-complete, evidence for required ACs is missing, and domain/doctrine violations are present.

**Key failure areas**:
- **Implementation**: Phase 3 deliverables are not implemented in the captured snapshot (tasks remain unchecked; required files/tests absent from diff).
- **Domain compliance**: The snapshot includes orphan/out-of-phase files and contract-boundary import violations.
- **Reinvention**: Non-blocking overlap was detected with deprecated workgraph-era patterns.
- **Testing**: No RED→GREEN evidence or AC verification output is recorded for the Phase 3 scope.
- **Doctrine**: Touched tests and interface naming diverge from documented project rules.

## B) Summary

The review was executed against the captured manifest snapshot at `/Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt` per user direction while parallel work was occurring. The snapshot does not show a completed Phase 3 implementation: expected workflow-ui drag/drop, persistence, and naming-modal file changes are largely absent, while unrelated Plan 049/051 and runtime-data changes dominate the diff. Domain checks found cross-domain internal imports and orphan files outside the Plan 050 Domain Manifest. Anti-reinvention analysis found only non-blocking overlap with deprecated workgraph patterns. Testing evidence quality is low: execution log is empty of completed work and no AC-level verification outputs are present for AC-07/08/09/21/22/22b.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED tests recorded before implementation
- [ ] GREEN test results recorded after implementation
- [ ] Refactor step evidence recorded where applicable

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/tasks.md:162-170; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt:1-33 | scope | Phase 3 tasks T001-T009 remain unchecked, and expected Phase 3 implementation/test files are absent from the captured diff. | Implement T001-T009 files and keep the change set scoped to Phase 3 paths. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/execution.log.md:9-11; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md:162-166 | testing | Execution evidence is missing: no completed task entries, command output, or RED→GREEN trail despite Full TDD strategy. | Log RED/GREEN/refactor evidence and concrete verification output per task/AC in execution.log.md. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md:27-53; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt:1-33 | domain | The captured manifest includes many files outside the Plan 050 Domain Manifest, creating orphan/out-of-phase changes for this review. | Split unrelated changes into separate plan/branch or update domain mappings before phase review. |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts:14-19; /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/flowspace-search-action.ts:18-23 | domain | Cross-domain imports use internal path '@/features/_platform/panel-layout/types' instead of public contract/barrel exports. | Import FlowSpace types from '@/features/_platform/panel-layout' (public surface) to satisfy contract-only boundaries. |
| F005 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts:71-123 | doctrine | Multiple test cases lack required per-test 5-field Test Doc blocks (R-TEST-002). | Add Test Doc blocks to each it(...) or formally update doctrine requirements. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md:84-90 | domain | workflow-ui domain history is current through Phase 2 only, while this Phase 3 snapshot includes workflow-ui changes. | Add a Phase 3 history/composition update or remove workflow-ui changes from this review snapshot. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt:25-33 | scope | Snapshot mixes Plan 049/051 and review-artifact additions with the Phase 3 review scope, reducing auditability. | Re-run review from an isolated Phase 3 diff (or separate manifests per plan). |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/types.ts:69 | doctrine | Interface `FlowSpaceSearchResult` violates interface naming rule requiring `I` prefix. | Rename to `IFlowSpaceSearchResult` (or convert to type alias if policy allows) and update uses. |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts:36 | doctrine | Interface `UseFlowspaceSearchReturn` violates interface naming rule requiring `I` prefix. | Rename to `IUseFlowspaceSearchReturn` (or convert to type alias if policy allows) and update uses. |
| F010 | LOW | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:136-141 | pattern | DragOverlay feedback is rendered for toolbox drags only, causing inconsistent drag UX versus canvas-node drags. | Either render overlay for canvas-node drags or document this as intentional behavior. |

## E) Detailed Findings

### E.1) Implementation Quality
- **F001 (HIGH)** Phase 3 tasks T001-T009 remain unchecked, and expected Phase 3 implementation/test files are absent from the captured diff.
  - File: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/tasks.md:162-170; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt:1-33
  - Recommendation: Implement T001-T009 files and keep the change set scoped to Phase 3 paths.
- **F010 (LOW)** DragOverlay feedback is rendered for toolbox drags only, causing inconsistent drag UX versus canvas-node drags.
  - File: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:136-141
  - Recommendation: Either render overlay for canvas-node drags or document this as intentional behavior.

### E.2) Domain Compliance
- **F003 (HIGH)** The captured manifest includes many files outside the Plan 050 Domain Manifest, creating orphan/out-of-phase changes for this review.
  - File: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md:27-53; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt:1-33
  - Fix: Split unrelated changes into separate plan/branch or update domain mappings before phase review.
- **F004 (HIGH)** Cross-domain imports use internal path '@/features/_platform/panel-layout/types' instead of public contract/barrel exports.
  - File: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts:14-19; /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/flowspace-search-action.ts:18-23
  - Fix: Import FlowSpace types from '@/features/_platform/panel-layout' (public surface) to satisfy contract-only boundaries.
- **F006 (MEDIUM)** workflow-ui domain history is current through Phase 2 only, while this Phase 3 snapshot includes workflow-ui changes.
  - File: /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md:84-90
  - Fix: Add a Phase 3 history/composition update or remove workflow-ui changes from this review snapshot.
- **F007 (MEDIUM)** Snapshot mixes Plan 049/051 and review-artifact additions with the Phase 3 review scope, reducing auditability.
  - File: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt:25-33
  - Fix: Re-run review from an isolated Phase 3 diff (or separate manifests per plan).

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | New files in snapshot include out-of-phase additions (Plan 051/file-browser) not under declared Phase 3 workflow-ui placement. |
| Contract-only imports | ❌ | Internal import path `@/features/_platform/panel-layout/types` is used across domains instead of public contract/barrel export. |
| Dependency direction | ✅ | No infra→business inversion was identified in reviewed files. |
| Domain.md updated | ❌ | `workflow-ui/domain.md` history is not updated for Phase 3 snapshot context. |
| Registry current | ✅ | `workflow-ui` remains present and active in `docs/domains/registry.md`. |
| No orphan files | ❌ | Manifest includes numerous files not mapped by Plan 050 Domain Manifest. |
| Map nodes current | ✅ | Domain nodes are present; no missing domain nodes detected for this snapshot. |
| Map edges current | ✅ | Domain-map edges remain labeled; no unlabeled edge detected in current map. |
| No circular business deps | ✅ | No business-domain cycle introduced by reviewed changes. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| useWorkflowMutations hook (workflow mutation orchestration + status refresh) | useWorkGraphAPI in legacy workgraph UI | _platform/workgraph (deprecated) | Proceed (overlap is with deprecated domain) |
| DropZone component (in-place insertion targets) | createDropHandler in legacy workgraph UI | _platform/workgraph (deprecated) | Proceed (new positional-graph context) |
| NamingModal component (kebab-case naming UX) | None | None | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: **9%**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-07 | 8% | tasks.md T003 planned; no completed execution evidence in execution.log; no phase-scoped changed tests in manifest. |
| AC-08 | 7% | tasks.md T004/T006 planned; no verification output and no phase-scoped drag/restriction tests in snapshot. |
| AC-09 | 6% | tasks.md T005 planned; no deletion test evidence or completion log entries. |
| AC-21 | 10% | tasks.md T008 planned; no implementation/test evidence recorded in phase execution log. |
| AC-22 | 10% | tasks.md T008 planned; no implementation/test evidence recorded in phase execution log. |
| AC-22b | 9% | tasks.md T008 planned; no phase-scoped modal validation tests evidenced. |

### E.5) Doctrine Compliance
- **F005 (HIGH)** Multiple test cases lack required per-test 5-field Test Doc blocks (R-TEST-002).
  - File: /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts:71-123
  - Fix: Add Test Doc blocks to each it(...) or formally update doctrine requirements.
- **F008 (MEDIUM)** Interface `FlowSpaceSearchResult` violates interface naming rule requiring `I` prefix.
  - File: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/types.ts:69
  - Fix: Rename to `IFlowSpaceSearchResult` (or convert to type alias if policy allows) and update uses.
- **F009 (MEDIUM)** Interface `UseFlowspaceSearchReturn` violates interface naming rule requiring `I` prefix.
  - File: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts:36
  - Fix: Rename to `IUseFlowspaceSearchReturn` (or convert to type alias if policy allows) and update uses.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-07 | Drag toolbox work unit onto line with in-place drop zones | tasks.md T003 planned; no completed execution evidence in execution.log; no phase-scoped changed tests in manifest. | 8% |
| AC-08 | Reorder/move nodes with running-line restriction | tasks.md T004/T006 planned; no verification output and no phase-scoped drag/restriction tests in snapshot. | 7% |
| AC-09 | Delete node via context menu/Backspace with persistence | tasks.md T005 planned; no deletion test evidence or completion log entries. | 6% |
| AC-21 | New-from-template naming flow | tasks.md T008 planned; no implementation/test evidence recorded in phase execution log. | 10% |
| AC-22 | Save-as-template naming flow | tasks.md T008 planned; no implementation/test evidence recorded in phase execution log. | 10% |
| AC-22b | New blank + new from template buttons with kebab-case validation | tasks.md T008 planned; no phase-scoped modal validation tests evidenced. | 9% |

**Overall coverage confidence**: **9%**

## G) Commands Executed

```bash
git --no-pager diff --stat && echo '---STAGED---' && git --no-pager diff --staged --stat && echo '---STATUS---' && git --no-pager status --short
PLAN_DIR="/Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux" && REVIEWS="$PLAN_DIR/reviews" && mkdir -p "$REVIEWS" && { git --no-pager diff; git --no-pager diff --staged; git ls-files --others --exclude-standard | while IFS= read -r f; do git --no-pager diff --no-index -- /dev/null "$f" || true; done; } > "$REVIEWS/_computed.diff" && git --no-pager status --porcelain | awk '{status=substr($0,1,2); path=substr($0,4); if (status ~ /\?\?/) action="A"; else if (status ~ /D/) action="D"; else if (status ~ /M/) action="M"; else if (status ~ /A/) action="A"; else action=status; print action "\t" path; }' > "$REVIEWS/_manifest.phase-3-drag-drop-persistence.txt"
rg -n "050-workflow-page|workflow-dnd|naming-modal|use-workflow-mutations" docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 3: Drag-and-Drop + Persistence
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-3-drag-drop-persistence.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/.chainglass/instances/demo-template/demo-from-template/graph.yaml | Deleted | workspace-data | Exclude from phase diff |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/instances/demo-template/demo-from-template/instance.yaml | Deleted | workspace-data | Exclude from phase diff |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/instances/demo-template/demo-from-template/nodes/demo-agent-a77/node.yaml | Deleted | workspace-data | Exclude from phase diff |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/instances/demo-template/demo-from-template/state.json | Deleted | workspace-data | Exclude from phase diff |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/instances/demo-template/demo-from-template/units/demo-agent/unit.yaml | Deleted | workspace-data | Exclude from phase diff |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/templates/workflows/demo-template/graph.yaml | Deleted | workspace-data | Exclude from phase diff |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/templates/workflows/demo-template/nodes/demo-agent-a77/node.yaml | Deleted | workspace-data | Exclude from phase diff |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/templates/workflows/demo-template/units/demo-agent/unit.yaml | Deleted | workspace-data | Exclude from phase diff |
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Modified | file-browser | Review scope |
| /Users/jordanknight/substrate/chainglass-048/apps/web/next-env.d.ts | Modified | cross-domain | Review scope |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Modified | workflow-ui | Complete Phase 3 scope |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx | Modified | _platform/panel-layout | Review scope |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx | Modified | _platform/panel-layout | Review scope |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/index.ts | Modified | _platform/panel-layout | Review scope |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/stub-handlers.ts | Modified | _platform/panel-layout | Review scope |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/types.ts | Modified | _platform/panel-layout | Review scope |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/panel-layout/domain.md | Modified | domain-docs | Update only if phase-scoped |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Modified | domain-docs | Update only if phase-scoped |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/file-browser/domain.md | Modified | domain-docs | Update only if phase-scoped |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/_computed.diff | Modified | plan-049-artifact | Split from this phase review |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/fix-tasks.md | Modified | plan-049-artifact | Split from this phase review |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/review.md | Modified | plan-049-artifact | Split from this phase review |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff | Modified | review-artifact | None |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/panel-layout/stub-handlers.test.ts | Modified | _platform/panel-layout | Review scope |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts | Added | file-browser | Split from this phase review |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/flowspace-search-action.ts | Added | file-browser | Split from this phase review |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/_manifest.txt | Added | plan-049-artifact | Split from this phase review |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-2-canvas-core-layout.txt | Added | review-artifact | None |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt | Added | review-artifact | None |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/fix-tasks.phase-2-canvas-core-layout.md | Added | review-artifact | None |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-2-canvas-core-layout.md | Added | review-artifact | None |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search | Added | plan-051-artifact | Split from this phase review |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts | Added | file-browser | Review scope |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/tasks.md | Implement Phase 3 tasks T001-T009 in scoped workflow-ui files | Required deliverables are not present in captured diff (F001) |
| 2 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/execution.log.md | Add RED→GREEN test evidence and AC verification output | Full TDD evidence is missing (F002) |
| 3 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md + /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt | Remove/split orphan out-of-phase changes or update mappings | Domain traceability fails with current mixed snapshot (F003/F007) |
| 4 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts + /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/flowspace-search-action.ts | Replace internal panel-layout imports with public contract/barrel imports | Contract-only import rule violated (F004) |
| 5 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts | Add required per-test Test Doc blocks | Doctrine rule R-TEST-002 violated (F005) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Domain Manifest does not cover full reviewed file set in this snapshot |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Phase 3 history/composition currency |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Reconfirm map currency after scope split and contract import fixes |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md --phase 'Phase 3: Drag-and-Drop + Persistence'
