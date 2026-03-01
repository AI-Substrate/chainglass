# Code Review: Phase 3: Inputs/Outputs Configuration

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md  
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md  
**Phase**: Phase 3: Inputs/Outputs Configuration  
**Date**: 2026-03-01  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity issues remain in structural save correctness and test/doctrine compliance.

**Key failure areas**:
- **Implementation**: Structural save logic can issue stale and fresh whole-array writes concurrently, risking overwrite of latest user changes.
- **Domain compliance**: Domain history/concepts and plan domain manifest are not current for completed Phase 3 scope.
- **Reinvention**: Reserved param mapping is reimplemented locally instead of reusing the existing domain contract source.
- **Testing**: Interaction-level coverage for AC-10/11/14/15 is missing; current tests focus on helpers only.
- **Doctrine**: New tests violate mandatory Test Doc requirements (R-TEST-002 / R-TEST-003).

## B) Summary

The phase delivers the expected new UI surfaces and wiring for inputs/outputs configuration, and most code structure aligns with established patterns.  
However, a correctness risk exists in the structural save path where dual flush/trigger calls can race with full-array persistence semantics.  
Domain governance artifacts are partially stale (domain history/concepts and domain manifest mapping), reducing traceability for this completed phase.  
Testing evidence is incomplete for core UI interactions and does not satisfy project doctrine requiring Test Doc blocks in each new test.

## C) Checklist

**Testing Approach: Full TDD**

Full TDD checks:
- [ ] RED evidence for new interaction behaviors is recorded
- [ ] GREEN evidence demonstrates all Phase 3 AC interaction paths
- [ ] REFACTOR stage preserves passing coverage for new behavior

Universal checks:
- [x] Only in-scope files changed
- [x] Linters/type checks reported clean in execution evidence
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx:147-173 | correctness | Structural save path calls `flush()` and `trigger()+flush()` without sequencing, allowing stale full-array writes to race and overwrite latest state. | Serialize structural saves per list and drop/cancel stale payloads before issuing immediate save. |
| F002 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/features/058-workunit-editor/input-output-card-list.test.ts:21-143 | doctrine | New tests lack required Test Doc blocks (Why, Contract, Usage Notes, Quality Contribution, Worked Example). | Add complete 5-field Test Doc comment block to each test. |
| F003 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/features/058-workunit-editor/input-output-card-list.test.ts:1-143 | testing | Added tests cover utility helpers only and do not validate add/remove/reorder/reserved/last-output interaction paths. | Add component interaction tests using `DndTestWrapper` for AC-10/11/14/15 flows. |
| F004 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/input-output-card.tsx:167-171 | scope | Delete action executes immediately; phase task 3.4 requires confirmation for delete. | Add explicit confirmation step before deleting a card. |
| F005 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx:48-56 | reinvention | Reserved param mapping is hardcoded locally despite existing shared reserved param source in positional-graph. | Reuse `RESERVED_INPUT_PARAMS` contract source and derive per unit type mapping. |
| F006 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md:52-57 | domain-md | Domain history does not reflect completed Phase 3 work. | Add Phase 3 history entry with scope and date. |
| F007 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md:30-66 | orphan | Domain Manifest does not map all changed Phase 3 files. | Add explicit rows for all changed files in phase manifest mapping. |
| F008 | LOW | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md:44-51 | concepts-docs | Concepts section exists but does not include new Phase 3 concepts/entry points. | Extend Concepts table for input-output list/card and structural save flow. |
| F009 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/input-output-card-list.tsx:254,323 | testing | AC-15 enforcement relies on delete blocking only; behavior is not directly tested. | Add explicit behavior tests for last-output protection and zero-output prevention path. |
| F010 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/execution.log.md:51-57 | testing-evidence | Evidence statements are mostly declarative and not linked to concrete output/artifact paths. | Record command output snippets and artifact paths for MCP/screenshots/results. |
| F011 | LOW | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/tasks.md:120 | traceability | Task path lists `.test.tsx` but implementation file is `.test.ts`. | Update task path to actual filename. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Structural save race risk in full-array persistence path (`workunit-editor.tsx`).
- **F004 (MEDIUM)**: Missing delete confirmation despite phase task requirement.
- **F009 (MEDIUM)**: Output minimum enforcement lacks direct interaction verification.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are placed under `apps/web/src/features/058-workunit-editor/components/` and test path under `test/unit/web/features/058-workunit-editor/`. |
| Contract-only imports | ✅ | No cross-domain internal import violations found in changed source files. |
| Dependency direction | ✅ | Business domain consumes infrastructure contracts (`_platform/hooks`, `_platform/viewer`, positional-graph) in allowed direction. |
| Domain.md updated | ❌ | `docs/domains/058-workunit-editor/domain.md` history not updated for completed Phase 3 scope (F006). |
| Registry current | ✅ | `docs/domains/registry.md` includes `058-workunit-editor`; no new domain registration required. |
| No orphan files | ❌ | Plan domain manifest lacks explicit mapping for several changed files (F007). |
| Map nodes current | ✅ | `docs/domains/domain-map.md` includes `058-workunit-editor` node. |
| Map edges current | ✅ | Existing map edges are labeled and reflect current dependencies. |
| No circular business deps | ✅ | No business-to-business cycle introduced by Phase 3 changes. |
| Concepts documented | ⚠️ | Concepts section exists but is stale for new Phase 3 capabilities (F008). |

Domain-specific findings:
- **F006 (MEDIUM)**: Missing Phase 3 history update in domain.md.
- **F007 (MEDIUM)**: Incomplete domain manifest mapping for changed files.
- **F008 (LOW)**: Concepts table not updated with Phase 3 concepts.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Reserved param mapping in editor | `RESERVED_INPUT_PARAMS` in `/Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/reserved-params.ts` | `_platform/positional-graph` | ⚠️ Reuse recommended (F005) |
| Validation helper logic (`validateItems`) | `InputNameSchema` and workunit schemas in positional-graph | `_platform/positional-graph` | ℹ️ Extend/reuse alignment opportunity (non-blocking) |

### E.4) Testing & Evidence

**Coverage confidence**: 66%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-10 | 58% | Add/edit/reorder/remove logic exists in list/editor handlers, but interaction-level component tests are missing. |
| AC-11 | 60% | Outputs use same structural and field flow, but no direct output interaction tests in changed suite. |
| AC-12 | 90% | Name validation logic and helper tests are present and aligned with regex/duplicate constraints. |
| AC-13 | 88% | Conditional `data_type` handling is implemented and helper-tested for data/file cases. |
| AC-14 | 68% | Reserved params rendered and locked in UI, but behavior lacks dedicated component tests. |
| AC-15 | 45% | Min-one-output delete block exists; direct behavior tests and stronger validation evidence are missing. |

### E.5) Doctrine Compliance

- **F002 (HIGH)**: Violates `R-TEST-002` and `R-TEST-003` in `/Users/jordanknight/substrate/058-workunit-editor/docs/project-rules/rules.md` due missing Test Doc blocks.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-10 | Add/edit/reorder/remove inputs | Structural + field handlers in list/editor code; no component interaction tests | 58% |
| AC-11 | Add/edit/reorder/remove outputs | Outputs wired similarly to inputs; no interaction-level output tests | 60% |
| AC-12 | Name regex validation feedback | `validateItems` logic and helper tests for required/regex/duplicate | 90% |
| AC-13 | `data_type` conditional by type | Conditional UI + helper validation/tests for data vs file | 88% |
| AC-14 | Reserved params read-only | Locked reserved cards rendered and excluded from editable list; no dedicated behavior tests | 68% |
| AC-15 | At least one output enforced | Delete block guard present (`requireMinOne`), but weak direct verification coverage | 45% |

**Overall coverage confidence**: 66%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --porcelain
git --no-pager log --oneline -12
git --no-pager diff --name-status cbc8484..HEAD > /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/_manifest.txt
git --no-pager diff cbc8484..HEAD > /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/_computed.diff
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md  
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md  
**Phase**: Phase 3: Inputs/Outputs Configuration  
**Tasks dossier**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/tasks.md  
**Execution log**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/execution.log.md  
**Review file**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/review.phase-3-inputs-outputs-configuration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/agent-editor.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/input-output-card-list.tsx | Added | 058-workunit-editor | Yes (F009) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/input-output-card.tsx | Added | 058-workunit-editor | Yes (F004) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor-layout.tsx | Modified | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx | Modified | 058-workunit-editor | Yes (F001, F005) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/execution.log.md | Added | plan-artifact | Yes (F010) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/tasks.fltplan.md | Modified | plan-artifact | No |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-3-inputs-outputs-configuration/tasks.md | Modified | plan-artifact | Yes (F011) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md | Modified | plan-artifact | Yes (F007) |
| /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/features/058-workunit-editor/input-output-card-list.test.ts | Added | test | Yes (F002, F003) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx | Serialize/guard structural save flow to prevent stale full-array write override. | Current dual flush/trigger pattern can race and lose latest change (F001). |
| 2 | /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/features/058-workunit-editor/input-output-card-list.test.ts | Add required Test Doc blocks for every test and add interaction-level component coverage for AC-10/11/14/15. | Violates doctrine and leaves key phase behaviors under-verified (F002, F003). |
| 3 | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/input-output-card.tsx | Add delete confirmation UX path. | Phase task requirement not met (F004). |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md | Phase 3 history entry and updated concepts for input/output configuration flow (F006, F008). |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md | Domain Manifest entries for all changed phase files (F007). |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md --phase 'Phase 3: Inputs/Outputs Configuration'
