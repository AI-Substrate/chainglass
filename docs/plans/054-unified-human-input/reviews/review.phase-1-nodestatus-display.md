# Code Review: Phase 1: NodeStatusResult + Display Status

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-spec.md
**Phase**: Phase 1: NodeStatusResult + Display Status
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity doctrine violations were found in newly added tests (required Test Doc blocks missing), with additional medium-severity domain documentation and evidence-traceability gaps.

**Key failure areas**:
- **Domain compliance**: Domain manifest/domain docs were not fully updated for the final changed-file set and contract evolution.
- **Testing**: TDD evidence for one required RED→GREEN step and AC traceability are incomplete.
- **Doctrine**: New tests violate required Test Doc standards in project rules.

## B) Summary

Core implementation logic for Format A input resolution, discriminated unions, and display-status behavior appears correct, and no material correctness/security/performance defects were identified. The anti-reinvention check found no blocking duplication; the new display-status helper is acceptable as a local UI projection helper. However, three HIGH doctrine findings in test documentation block approval under current rules, and domain artifacts are stale versus the actual phase delta. Evidence quality is moderate (70% confidence): key behaviors are tested, but explicit TDD and AC mapping proof needs tightening.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present
- [ ] Critical-path verification is fully documented end-to-end
- [ ] TDD RED→GREEN evidence is explicit for all TDD-designated tasks
- [ ] Acceptance criteria are explicitly mapped to concrete evidence

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts:4-27 | doctrine | New tests are missing mandatory 5-field Test Doc blocks (R-TEST-002/R-TEST-003). | Add complete Test Doc block to each new `it(...)`. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/status.test.ts:316-344 | doctrine | New discriminated-union tests are missing mandatory 5-field Test Doc blocks. | Add complete Test Doc block to each added `it(...)`. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts:122-163 | doctrine | New Format A regression test is missing mandatory Test Doc documentation. | Add Test Doc block with Why/Contract/Usage Notes/Quality Contribution/Worked Example. |
| F004 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md:27-40 | domain/orphan | Domain Manifest does not cover all changed non-artifact files in phase diff (e.g., instance-workunit.adapter.ts, interfaces/index.ts, dev/test-graphs/shared/*.ts). | Update Domain Manifest (or reduce scope) so every changed file maps to a domain. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md:136-146 | domain-md | workflow-ui domain history/composition does not reflect Plan 054 Phase 1 additions (`display-status.ts`, awaiting-input behavior). | Add Plan 054 Phase 1 history entry and composition/source updates. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md:139-154 | domain-md | positional-graph domain history/contracts are stale for discriminated `NarrowWorkUnit`/`NodeStatusResult` + guards export changes. | Add Plan 054 Phase 1 history and contract/composition updates. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md:18-31 | testing | Required TDD evidence for T004 is incomplete (no explicit RED failing step captured). | Add explicit RED command/output and subsequent GREEN rerun evidence. |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md:42-47 | testing | AC-to-evidence traceability is mostly implicit and not tagged by AC IDs. | Add AC-tagged evidence references (AC-01/02/15 etc.) in execution log/tasks dossier. |
| F009 | LOW | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts:4-27 | testing | T015 calls for STATUS_MAP validation, but tests only assert `getDisplayStatus()` behavior. | Add one assertion covering awaiting-input STATUS_MAP presentation contract. |
| F010 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | concepts-docs | Domain has contracts but no `## Concepts` table documenting newly exposed contract concepts. | Add `## Concepts` with Concept/Entry Point/What It Does rows. |

## E) Detailed Findings

### E.1) Implementation Quality

No material correctness, security, error-handling, or performance defects were identified in the reviewed implementation diff.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New code files are in expected domain trees (`workflow-ui`, `_platform/positional-graph`, `test`). |
| Contract-only imports | ✅ | No cross-domain internal-import violations detected in reviewed code changes. |
| Dependency direction | ✅ | No infrastructure→business inversion detected. |
| Domain.md updated | ❌ | Domain docs for `workflow-ui` and `_platform/positional-graph` were not updated for Plan 054 Phase 1. |
| Registry current | ✅ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md` already includes touched domains; no new domain required. |
| No orphan files | ❌ | Several changed files are not represented in Plan Domain Manifest. |
| Map nodes current | ✅ | Domain map includes all active domains involved in this phase. |
| Map edges current | ✅ | Map edges are present and labeled; no unlabeled dependency edge was found. |
| No circular business deps | ✅ | No business-domain cycle detected from current map relationships. |
| Concepts documented | ⚠️ | `_platform/positional-graph` lacks a Concepts section despite contract evolution. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `getDisplayStatus(unitType, status, ready)` | Similar status mapping patterns exist (`status-badge.tsx`, orchestration reality formatting), but no drop-in equivalent for this feature-local UI projection | workflow-ui | proceed |
| `display-status.test.ts` matrix | Partial overlap with node-card status behavior tests | workflow-ui | extend (non-blocking) |

### E.4) Testing & Evidence

**Coverage confidence**: 70%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 78 | Node card uses `getDisplayStatus(...)`; display-status tests verify `user-input + pending + ready => awaiting-input`. |
| AC-02 | 82 | display-status tests verify `user-input + pending + not-ready => pending`. |
| AC-15 | 90 | New `display-status.test.ts` provides direct unit coverage of display-status computation. |
| AC-09 | 58 | `collate-inputs.test.ts` now verifies wrapped Format A output can be resolved downstream. |
| AC-07 | 45 | Format A compatibility validated in input resolution, but this phase does not directly prove full submission path. |

### E.5) Doctrine Compliance

Project rules were found and applied (`/Users/jordanknight/substrate/chainglass-048/docs/project-rules/rules.md`).

- R-TEST-002 and R-TEST-003 require a 5-field Test Doc block for tests.
- Three newly added/expanded test areas violate this requirement (F001-F003).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | `user-input + pending + ready` shows Awaiting Input | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/display-status.ts`, `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx`, `/Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts` | 78 |
| AC-02 | `user-input + pending + !ready` remains pending | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts` | 82 |
| AC-15 | Unit tests for display status computation | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts` | 90 |
| AC-09 (phase-adjacent) | Downstream input resolution sees available data | `/Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts`, `/Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/input-resolution.ts` | 58 |
| AC-07 (phase-adjacent) | Output format compatibility for saved data | `/Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/input-resolution.ts`, `/Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts` | 45 |

**Overall coverage confidence**: 70%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
git --no-pager diff --name-status ebeb1ff^..cc151af
git --no-pager diff ebeb1ff^..cc151af > /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/reviews/_computed.diff
# Plus five parallel review subagents (implementation, domain, reinvention, testing, doctrine)
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-spec.md
**Phase**: Phase 1: NodeStatusResult + Display Status
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/reviews/review.phase-1-nodestatus-display.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx | Modified | workflow-ui | Yes (only if adding explicit STATUS_MAP test hook/export) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/display-status.ts | Added | workflow-ui | No |
| /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/graph-test-runner.ts | Modified | dev/test-graphs | Yes (document scope/domain mapping) |
| /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/helpers.ts | Modified | dev/test-graphs | Yes (document scope/domain mapping) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/reviews/_computed.diff | Added | review-artifact | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/reviews/fix-tasks.phase-1-nodestatus-display.md | Added | review-artifact | Replaced in this run |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/reviews/review.phase-1-nodestatus-display.md | Added | review-artifact | Replaced in this run |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md | Added | plan-artifact | Yes (add TDD/AC trace evidence) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/tasks.fltplan.md | Modified | plan-artifact | Optional consistency update |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | Modified | plan-artifact | Yes (Domain Manifest completeness) |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/adapter/instance-workunit.adapter.ts | Modified | _platform/positional-graph | No code fix required |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/interfaces/index.ts | Modified | _platform/positional-graph | No code fix required |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts | Modified | _platform/positional-graph | No code fix required |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/input-resolution.ts | Modified | _platform/positional-graph | No code fix required |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/positional-graph.service.ts | Modified | _platform/positional-graph | No code fix required |
| /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts | Modified | test | Yes (Test Doc block) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/status.test.ts | Modified | test | Yes (Test Doc blocks) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts | Added | test | Yes (Test Doc blocks + STATUS_MAP assertion) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts | Add required Test Doc blocks to each test case; add one STATUS_MAP-facing assertion | Violates R-TEST-002/003; AC-15 evidence incomplete for map contract |
| 2 | /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/status.test.ts | Add required Test Doc blocks to new discriminated status tests | Violates R-TEST-002/003 |
| 3 | /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts | Add required Test Doc block for new Format A regression test | Violates R-TEST-002/003 |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | Update Domain Manifest for full changed-file coverage | Orphan/mapping compliance failure |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Add Plan 054 Phase 1 history + composition/source updates | Domain.md currency failure |
| 6 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | Add Plan 054 Phase 1 history/contracts updates + Concepts section | Domain.md currency + concepts-docs warning |
| 7 | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md | Add explicit RED/GREEN evidence for T004 and AC-tagged mapping | Hybrid testing evidence gap |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | Domain Manifest does not enumerate all changed files |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Plan 054 history + composition/source updates |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | Plan 054 history/contracts updates and Concepts table |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md --phase 'Phase 1: NodeStatusResult + Display Status'
