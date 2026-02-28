# Code Review: Phase 4: Context Indicators + Select-to-Reveal

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md  
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md  
**Phase**: Phase 4: Context Indicators + Select-to-Reveal  
**Date**: 2026-02-26  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

Phase 4 has unresolved HIGH findings: AC-17 behavior is not implemented, AC-15 behavior/evidence is incomplete, and execution evidence does not meet the Full TDD standard.

**Key failure areas**:
- **Implementation**: Manual line transition gate is still non-interactive; selection traces are not implemented per AC-15 semantics.
- **Domain compliance**: `workflow-ui` domain docs and domain-map summary metadata are stale for this phase.
- **Testing**: Execution log lacks RED→GREEN evidence; key Phase 4 behaviors are under-tested.
- **Doctrine**: Touched/new tests do not follow required Test Doc format from project rules.

## B) Summary

The phase introduces meaningful UI additions (context badges, gate chip, properties panel, related-node utility), and no cross-domain import violations were found. However, two core acceptance outcomes remain incomplete: manual transition interaction (AC-17) and AC-15 selection-trace behavior/evidence depth. Domain documentation currency checks also failed for `workflow-ui` history/composition and one domain-map summary row. Anti-reinvention checks found no genuine duplication; new components appear unique within this codebase. Testing evidence quality is low for a Full TDD phase because `execution.log.md` does not document RED→GREEN→REFACTOR progression or command outputs.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED evidence captured before implementation changes
- [ ] GREEN evidence captured for each completed task
- [ ] REFACTOR step and regression checks documented
- [ ] Phase ACs mapped to concrete test/evidence artifacts

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/line-transition-gate.tsx:14-29 | scope | AC-17 requires manual transition gate action when preceding line is complete; component only renders styled text. | Add explicit click pathway (`button` + callback prop) and wire to transition mutation/server action with tests. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-line.tsx:154-160 | scope | AC-15 expects select-to-reveal dependency traces (upstream/downstream semantics), but implementation shows only always-on adjacent indicators. | Implement selection-scoped trace rendering using `computeRelatedNodes` relation data/status semantics. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-4-context-indicators/execution.log.md:9-12 | testing | Full TDD evidence is missing (`execution.log.md` contains only placeholder text). | Record task-by-task RED→GREEN→REFACTOR evidence and command outputs tied to ACs. |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx:105-167 | scope/testing | AC-15/AC-35 coverage is incomplete: panel lacks explicit outputs section and no phase tests validate panel/related-node dimming paths. | Add outputs section plus dedicated tests for properties panel and `computeRelatedNodes`-driven dimming behavior. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md:84-91 | domain-md | Domain history/composition is stale (no Phase 4 entry/components). | Update `History` and `Composition` for Phase 4 components/utilities. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-4-context-indicators/tasks.md:6,76-87 | testing | Task dossier remains “Ready for implementation” with unchecked tasks despite phase marked complete in plan progress. | Synchronize task status and add evidence links/notes per completed task. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/context-badge.test.ts:34-69 | doctrine | Required 5-field Test Doc comments are missing in touched/new tests (also gate-chip and workflow-node-card touched tests). | Add Test Doc blocks (Why/Contract/Usage Notes/Quality Contribution/Worked Example) to affected tests. |
| F008 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:68-79 | map-edges | Domain Health Summary omits `workflow-ui` as `_platform/workspace-url` consumer despite mermaid edge presence. | Update summary row to match declared dependency edges. |
| F009 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md:50 | orphan | Domain Manifest test glob (`*.test.tsx`) does not cover new `context-badge.test.ts`. | Widen pattern to `*.test.ts*` or list this file explicitly. |
| F010 | LOW | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/gate-chip.tsx:63-86 | scope | Task note calls for one expanded gate-chip accordion at a time; state is local per card. | Lift expansion state to parent and control by selected node ID. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Manual transition gate remains display-only; no trigger path exists.
- **F002 (HIGH)**: AC-15 trace behavior is only partially implemented (adjacent indicator only).
- **F004 (HIGH)**: Properties panel and relationship behavior are not fully aligned with AC text and are under-tested.
- **F010 (LOW)**: Gate chip expansion control does not enforce single-open-card behavior.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are under `apps/web/src/features/050-workflow-page/*` and test/docs paths expected for `workflow-ui` work. |
| Contract-only imports | ✅ | No cross-domain internal import violations detected in changed files. |
| Dependency direction | ✅ | No infra→business reversal introduced; workflow-ui remains a consumer domain. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md` lacks Phase 4 history/composition updates. |
| Registry current | ✅ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md` remains accurate (no new domain introduced). |
| No orphan files | ❌ | Domain Manifest test glob in plan misses `context-badge.test.ts`, leaving mapping incomplete. |
| Map nodes current | ✅ | `workflow-ui` node exists and relationships are represented in mermaid map. |
| Map edges current | ❌ | Domain Health Summary row for `_platform/workspace-url` is out of sync with map edge (`workflow-ui --> workspace-url`). |
| No circular business deps | ✅ | No business-domain cycle introduced by this phase. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/context-badge.ts | None | workflow-ui | ✅ proceed |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/related-nodes.ts | None | workflow-ui | ✅ proceed |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/gate-chip.tsx | None | workflow-ui | ✅ proceed |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/context-flow-indicator.tsx | None | workflow-ui | ✅ proceed |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx | None | workflow-ui | ✅ proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 41%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-12 | 74% | `gate-chip.tsx` + `/Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/gate-chip.test.tsx` cover first-blocking gate and 5-gate expansion. |
| AC-13 | 68% | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/context-badge.ts` + `/Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/context-badge.test.ts` validate badge rules. |
| AC-14 | 42% | Lock icon render path exists in `workflow-node-card.tsx`; no dedicated lock-behavior test added. |
| AC-15 | 24% | Dimming utility/panel added, but no dedicated tests for `computeRelatedNodes`/panel behavior and trace semantics are incomplete. |
| AC-17 | 8% | `line-transition-gate.tsx` remains non-interactive; no transition interaction test evidence present. |
| AC-35 | 32% | Partial tests added, but missing tests for properties panel + related-node dimming + transition interaction. |

### E.5) Doctrine Compliance

- **F007 (MEDIUM)**: Touched/new tests do not include required Test Doc comments per project rules (`rules.md` R-TEST-002/003).
- Project-rules docs are present and applicable; this is not N/A.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-12 | Gate chips on blocked nodes (5 gate types) | `gate-chip.tsx` + `gate-chip.test.tsx` verify chip rendering and gate list expansion | 74% |
| AC-13 | Context badges (green/blue/purple/gray) | `context-badge.ts` + `context-badge.test.ts` cover core color rules | 68% |
| AC-14 | noContext lock icon | Lock UI present in `workflow-node-card.tsx`; no targeted lock assertions | 42% |
| AC-15 | Select-to-reveal + properties panel | `related-nodes.ts`, dimming hook-up, and panel added, but trace behavior/test evidence incomplete | 24% |
| AC-17 | Line transition gates (auto/manual actionable) | Visual gate exists; no actionable manual transition path/test evidence | 8% |
| AC-35 | Unit tests for phase behavior | Partial phase tests added; key behaviors remain untested | 32% |

**Overall coverage confidence**: 41%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager diff --name-only
git --no-pager show --name-status --pretty='' 489ac58
git --no-pager diff --stat 747d716..489ac58
git --no-pager diff 747d716..489ac58 > /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff
git --no-pager diff --name-status 747d716..489ac58 > /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-4-context-indicators.txt
# plus 5 parallel subagent reviews (implementation/domain/reinvention/testing/doctrine)
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md  
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md  
**Phase**: Phase 4: Context Indicators + Select-to-Reveal  
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-4-context-indicators/tasks.md  
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-4-context-indicators/execution.log.md  
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-4-context-indicators.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/context-flow-indicator.tsx | Added | workflow-ui | Review-only (no blocker) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/gate-chip.tsx | Added | workflow-ui | LOW follow-up (single-expand behavior) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx | Added | workflow-ui | HIGH (outputs + coverage gaps) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx | Modified | workflow-ui | Wire AC-17 behavior path |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Modified | workflow-ui | Wire AC-17 behavior path |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-line.tsx | Modified | workflow-ui | HIGH (AC-15 trace semantics) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx | Modified | workflow-ui | Add/align targeted lock+gate behavior coverage |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/context-badge.ts | Added | workflow-ui | Covered; keep |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/related-nodes.ts | Added | workflow-ui | Add missing tests |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-4-context-indicators/execution.log.md | Added | workflow-ui docs | HIGH (missing evidence log) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Modified | workflow-ui docs | LOW (manifest glob update) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/context-badge.test.ts | Added | workflow-ui tests | MEDIUM (Test Doc rules) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/gate-chip.test.tsx | Added | workflow-ui tests | MEDIUM (Test Doc rules) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-node-card.test.tsx | Modified | workflow-ui tests | MEDIUM (Test Doc rules) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/line-transition-gate.tsx | Implement actionable manual gate callback path and tests | AC-17 currently not implemented |
| 2 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-line.tsx | Implement selection-scoped dependency traces (upstream/downstream semantics) | AC-15 behavior gap |
| 3 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx | Add explicit outputs section and verify panel data sections with tests | AC-15/AC-35 incomplete |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-4-context-indicators/execution.log.md | Add RED→GREEN evidence with command outputs mapped to ACs | Full TDD evidence missing |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Update History + Composition for Phase 4 | Domain compliance failure |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Phase 4 history/composition entries |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Domain Health Summary `_platform/workspace-url` consumers list out of sync |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Domain Manifest test glob excludes `.test.ts` |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md --phase "Phase 4: Context Indicators + Select-to-Reveal"
