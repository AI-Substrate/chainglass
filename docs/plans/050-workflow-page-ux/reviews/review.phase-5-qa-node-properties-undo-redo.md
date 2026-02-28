# Code Review: Phase 5: Q&A + Node Properties Modal + Undo/Redo

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 5: Q&A + Node Properties Modal + Undo/Redo
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity correctness and verification gaps remain (undo/redo snapshot integrity and missing TDD-grade evidence/tests for Phase 5 acceptance criteria).

**Key failure areas**:
- **Implementation**: Undo/redo currently uses placeholder snapshots and can desynchronize stack state when restore fails.
- **Domain compliance**: Domain docs are stale for this phase and domain-map summary table is partially out of sync.
- **Reinvention**: Q&A answer-rendering capability overlaps an existing question-input component lineage.
- **Testing**: Full TDD evidence and Phase 5 test diffs are missing for required AC coverage.

## B) Summary

The phase includes meaningful progress on server actions and editor wiring, but undo/redo correctness is not yet production-safe in current form. Domain boundary imports and dependency direction look compliant, and no cross-domain contract violations were detected in code paths reviewed. However, domain documentation currency is behind Phase 5 behavior and needs synchronization. Testing evidence does not satisfy the spec’s Full TDD strategy, and AC coverage confidence is low-to-moderate overall due missing test artifacts.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] Red tests documented before implementation
- [ ] Green evidence recorded per task
- [ ] Refactor notes captured for completed tasks

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:76-82,198-199 | correctness | Undo/redo invoked with `{ definition, nodeConfigs: {} }` and no pre-mutation snapshot capture wiring, so restores cannot faithfully represent node config state. | Capture full `WorkflowSnapshot` before each mutation and pass real current snapshot into undo/redo. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:86-95 | error-handling | Restore errors are ignored in `onRestore`; failed restore can consume undo/redo transitions and desync UI/disk/history state. | Propagate restore failures and only finalize stack transitions on successful restore. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-5-qa-node-properties-undo-redo/execution.log.md:1-41 | scope | Spec requires Full TDD, but execution evidence only covers T000 and lacks red/green traces for T001–T010. | Add task-level TDD evidence (red, green, refactor) for all completed Phase 5 tasks. |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-5-qa-node-properties-undo-redo.txt:1-15 | scope | No Phase 5 test file changes are present in the reviewed diff despite AC-35 requirements. | Add/attach test changes and results for Q&A modal, node edit modal, undo/redo manager, and mutation snapshot paths. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:247-255 | correctness | Q&A submit path drops `freeform` notes when calling `answerQuestion` (only `structured` forwarded). | Persist freeform content in the answer payload or documented mapped field. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/positional-graph.service.ts:2720-2726 | error-handling | `restoreSnapshot` writes files sequentially without rollback semantics, risking partial restore state on mid-write failure. | Add atomic write/swap or rollback strategy for snapshot restore. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:169-177 | scope | AC-23 specifies Ctrl+Z/Ctrl+Shift+Z, but editor key handling currently only covers Backspace deletion. | Implement keyboard undo/redo with focus guards or explicitly de-scope/update AC and plan status. |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md:61-90 | domain-md | Domain document is stale for Phase 5 (source/action list and history do not reflect current phase-deliverables). | Update Source Location and History sections for Phase 4/5 artifacts and actions. |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:239-260 | pattern | Q&A answer renderer overlaps existing `question-input` concept lineage, increasing maintenance divergence risk. | Reuse or align with existing question-input implementation where feasible. |
| F010 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:77 | map-edges | Domain health summary omits `workflow-ui` from `_platform/workspace-url` consumer list despite diagram edge presence. | Synchronize health summary table with mermaid dependency edges. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Undo/redo state integrity is incomplete (`nodeConfigs` placeholder, no snapshot capture wiring before mutation operations).
- **F002 (HIGH)**: Restore failure path does not block undo/redo stack transition progression.
- **F005 (MEDIUM)**: Freeform answer input is not forwarded in workflow-editor submit path.
- **F006 (MEDIUM)**: Restore snapshot lacks atomicity/rollback behavior.
- **F007 (MEDIUM)**: Keyboard shortcut requirement mismatch for AC-23.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | Changed files remain under expected domain trees (`workflow-ui`, `_platform/positional-graph`, plan docs). |
| Contract-only imports | ✅ | No cross-domain internal import violations detected in reviewed changes. |
| Dependency direction | ✅ | No infrastructure→business dependency inversion detected. |
| Domain.md updated | ❌ | `workflow-ui/domain.md` not current through Phase 5 (F008). |
| Registry current | ✅ | No new domain introduced; registry update not required by current diff. |
| No orphan files | ✅ | All changed files map to domains listed in plan/domain manifest context. |
| Map nodes current | ✅ | Domain nodes appear current in diagram. |
| Map edges current | ❌ | Health summary table is out of sync with diagram edge for workspace-url consumers (F010). |
| No circular business deps | ✅ | No business-domain cycle introduced by reviewed changes. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Q&A answer-rendering path (`QAModal`/editor wiring) | `apps/web/src/components/phases/question-input.tsx` | legacy workflow UI lineage | ⚠️ Potential overlap (F009) |

### E.4) Testing & Evidence

**Coverage confidence**: 34%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-16 | 48% | Edit-properties wiring and update actions present in code, but no direct validation evidence attached. |
| AC-18 | 58% | `answerQuestion` + restart handshake and badge/modal wiring present. |
| AC-19 | 22% | Always-on freeform UI exists, but submit path persistence evidence is incomplete. |
| AC-23 | 24% | Undo/redo wiring exists, but shortcut parity and robust snapshot evidence are missing. |
| AC-24 | 82% | Toolbar undo/redo buttons and depth display present. |
| AC-35 | 6% | No changed Phase 5 test files in reviewed diff and insufficient execution-log test evidence. |

### E.5) Doctrine Compliance

No doctrine-rule violations were flagged by the rules validator in `docs/project-rules/{rules,idioms,architecture,constitution}.md` checks for the reviewed diff.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-16 | Node properties edit modal persists config | Node edit wiring and update actions in editor/actions diff | 48% |
| AC-18 | Q&A modal supports answer flow | `answerQuestion` action + restart handshake + badge wiring | 58% |
| AC-19 | Always-on freeform with structured input | UI freeform field exists, but payload persistence path incomplete | 22% |
| AC-23 | Snapshot undo/redo (including shortcuts) | Undo/redo toolbar hooks present; shortcut and snapshot completeness gaps remain | 24% |
| AC-24 | Toolbar undo/redo with depth | Temp bar buttons with depth badges present | 82% |
| AC-35 | Unit tests for modal/edit/undo | No test diffs or robust phase evidence in current review set | 6% |

**Overall coverage confidence**: 34%

## G) Commands Executed

```bash
cd /Users/jordanknight/substrate/chainglass-048 && git --no-pager diff --stat && git --no-pager diff --staged --stat && git --no-pager log --oneline -10
cd /Users/jordanknight/substrate/chainglass-048 && PLAN_DIR="/Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux" && mkdir -p "$PLAN_DIR/reviews" && { echo "# git diff"; git --no-pager diff; echo; echo "# git diff --staged"; git --no-pager diff --staged; } > "$PLAN_DIR/reviews/_computed.diff"
cd /Users/jordanknight/substrate/chainglass-048 && PLAN_DIR="/Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux" && { echo "# git diff (excluding review artifacts)"; git --no-pager diff -- . ':(exclude)docs/plans/050-workflow-page-ux/reviews/*'; echo; echo "# git diff --staged (excluding review artifacts)"; git --no-pager diff --staged -- . ':(exclude)docs/plans/050-workflow-page-ux/reviews/*'; } > "$PLAN_DIR/reviews/_computed.diff"
rg -n "undoRedo\.(snapshot|invalidate|undo|redo)|useUndoRedo|restoreSnapshotAction|answerQuestionAction" /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 5: Q&A + Node Properties Modal + Undo/Redo
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-5-qa-node-properties-undo-redo/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-5-qa-node-properties-undo-redo/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-5-qa-node-properties-undo-redo.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts | Modified | workflow-ui | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx | Modified | workflow-ui | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx | Modified | workflow-ui | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Modified | workflow-ui | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-line.tsx | Modified | workflow-ui | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx | Modified | workflow-ui | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx | Modified | workflow-ui | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/types.ts | Modified | workflow-ui | Yes |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Modified | workflow-ui (plan artifact) | Yes |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/fake-positional-graph-service.ts | Modified | _platform/positional-graph | No |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts | Modified | _platform/positional-graph | No |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/positional-graph.service.ts | Modified | _platform/positional-graph | Yes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Wire real snapshot capture + pass full current snapshot to undo/redo + propagate restore failures | Prevent invalid/partial undo state and stack desynchronization |
| 2 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-5-qa-node-properties-undo-redo/execution.log.md | Add full TDD evidence for T001–T010 with commands/results | Spec requires Full TDD and current evidence is insufficient |
| 3 | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/positional-graph.service.ts | Harden restoreSnapshot with atomicity/rollback protections | Avoid partial writes on restore failure |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Update Phase 4/5 history and source/action inventory | Domain artifact is stale versus implemented behavior |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Sync health summary edge/consumer table with diagram | Keep domain map deterministic and current |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Phase 4/5 history and expanded action/component inventory |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | `_platform/workspace-url` consumer list missing `workflow-ui` in summary table |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md --phase "Phase 5: Q&A + Node Properties Modal + Undo/Redo"
