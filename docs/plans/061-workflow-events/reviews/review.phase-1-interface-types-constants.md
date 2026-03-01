# Code Review: Phase 1: Interface, Types, and Constants

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md  
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-spec.md  
**Phase**: Phase 1: Interface, Types, and Constants  
**Date**: 2026-03-01  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Hybrid

## A) Verdict

**APPROVE**

**Key failure areas** (non-blocking):
- **Implementation**: `ErrorInput.details` is narrower than the underlying schema contract and should be widened.
- **Domain compliance**: `workflow-events` domain concepts are documented, but not in the required Level-1 concepts table format.
- **Testing**: Evidence is mostly narrative; targeted observer behavior evidence is still light for a hybrid strategy.

## B) Summary

Phase 1 implementation is coherent and in scope: interface/types/constants/fake/DI token/barrels/domain docs were delivered as planned. Domain placement and dependency direction are correct, and no cross-domain internal import violations were found in the changed code. Anti-reinvention checks found overlap with positional-graph contracts/constants, but the overlap is intentional for a consumer-facing abstraction layer. Testing evidence is acceptable for phase completion but auditability can be improved with more concrete observer-behavior verification evidence. Overall: approved with medium-priority follow-up notes, no blocking defects.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] TDD evidence for observer behavior (RED/GREEN artifacts) is explicit
- [ ] Core validation tests for critical paths are explicit in phase evidence
- [x] Key verification points are documented in execution log

Universal (all approaches):
- [x] Only in-scope files changed
- [x] Linters/type checks clean (per recorded build/test results)
- [x] Domain compliance checks pass (with non-blocking notes)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/types.ts:64-68 | correctness | `ErrorInput.details` uses `string`, while node:error payload schema accepts `unknown`. | Widen `details` to `unknown` (or `Record<string, unknown>`) to align with schema and existing usage patterns. |
| F002 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md:100-142 | concepts-docs | Concepts section exists but does not include required Level-1 table (`Concept | Entry Point | What It Does`). | Add required concepts table and include newly introduced Phase 1 contracts/entry points. |
| F003 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-1-interface-types-constants/execution.log.md:58-60 | testing | Verification evidence is narrative only; observer behavior evidence is not explicit for hybrid testing intent. | Add test-output snippets/CI refs and explicit observer behavior checks in follow-up phase evidence. |
| F004 | LOW | /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md:85-90 | scope | Domain map shows some future consumers before migration tasks complete. | Annotate these edges as future/deferred until consumer migration lands (Phase 3). |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (MEDIUM)**: In `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/types.ts`, `ErrorInput.details?: string` is narrower than `/Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/features/032-node-event-system/event-payloads.schema.ts` (`details: z.unknown().optional()`). This can reject valid structured error details at compile time.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files are under expected `packages/shared/src/{workflow-events,interfaces,fakes}` locations. |
| Contract-only imports | ✅ | Reviewed new workflow-events files use local/shared contracts only; no cross-domain internal imports detected. |
| Dependency direction | ✅ | No infrastructure → business inversion introduced in phase files. |
| Domain.md updated | ✅ | `/Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md` created and history updated. |
| Registry current | ✅ | `/Users/jordanknight/substrate/059-fix-agents/docs/domains/registry.md` includes `workflow-events`. |
| No orphan files | ✅ | Changed implementation files are represented by plan/domain artifacts; docs task artifacts treated as execution artifacts. |
| Map nodes current | ✅ | `workflow-events` node is present in domain map and health summary. |
| Map edges current | ✅ | Edges are labeled; no unlabeled workflow-events dependencies found. |
| No circular business deps | ✅ | No new business↔business cycle introduced by this phase. |
| Concepts documented | ⚠️ | Concepts are present but not in required Level-1 table format. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| WorkflowEventType constants | `core-event-types.ts` event literals | _platform/positional-graph | Proceed (intentional mirror for typed consumer API) |
| Convenience workflow types | Existing PG/workgraph answer/question-related shapes | _platform/positional-graph, _platform/workgraph | Proceed (consumer-facing abstraction; keep mapping explicit) |
| IWorkflowEvents interface | Overlaps deprecated QnA surface in PG service | _platform/positional-graph | Proceed (intended convenience contract) |
| FakeWorkflowEventsService | Partial fake overlap with FakePositionalGraphService | _platform/positional-graph | Proceed (adds observer + convenience behavior, not duplicate implementation) |

### E.4) Testing & Evidence

**Coverage confidence**: 74%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 95 | `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/interfaces/workflow-events.interface.ts` defines all 9 required methods; re-exported via shared barrels. |
| AC-04 | 88 | `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/fakes/fake-workflow-events.ts` provides fake + inspection methods. |
| AC-06 | 97 | `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/constants.ts` defines all 7 event constants. |
| AC-07 | 93 | `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/types.ts` includes required input/output types. |
| AC-08 | 62 | Observer event types + fake observer notifications exist, but phase evidence lacks explicit runtime observer verification artifacts. |
| AC-09 | 58 | Unsubscribe logic exists in fake, but no explicit test evidence captured in this phase dossier/log. |
| AC-14 | 98 | `/Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md` created with required core sections. |
| AC-15 | 98 | Registry and domain map updated with workflow-events entry and edges. |
| AC-16 | 68 | Execution log reports passing `pnpm --filter @chainglass/shared build` and `pnpm test`, but no transcript/CI link embedded. |

### E.5) Doctrine Compliance

Project rules files exist and were checked. No phase-blocking doctrine violations were identified in changed files; naming/test doctrine gaps are treated as non-blocking follow-up given existing repository baseline and phased delivery plan.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | IWorkflowEvents interface with 9 methods | `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/interfaces/workflow-events.interface.ts` + exports in `interfaces/index.ts` and `src/index.ts` | 95 |
| AC-04 | FakeWorkflowEventsService with inspection methods | `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/fakes/fake-workflow-events.ts` | 88 |
| AC-06 | Typed constants for 7 core event types | `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/constants.ts` | 97 |
| AC-07 | Convenience input/output types exist | `/Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/types.ts` | 93 |
| AC-08 | Observer hooks/events fire | Observer types + fake notify paths in `fake-workflow-events.ts`; explicit runtime evidence pending | 62 |
| AC-09 | Observer unsubscribe works | Unsubscribe closure in `fake-workflow-events.ts` (`addObserver`) | 58 |
| AC-14 | Domain doc exists with boundary/contracts/composition | `/Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md` | 98 |
| AC-15 | Domain registered and mapped | `/Users/jordanknight/substrate/059-fix-agents/docs/domains/registry.md`, `/Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md` | 98 |
| AC-16 | Tests pass without regressions | Execution evidence in `/Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-1-interface-types-constants/execution.log.md` | 68 |

**Overall coverage confidence**: 82%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -12
git --no-pager diff --no-color ee53819..HEAD > /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/reviews/_computed.diff
git --no-pager diff --name-status ee53819..HEAD
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md  
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-spec.md  
**Phase**: Phase 1: Interface, Types, and Constants  
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-1-interface-types-constants/tasks.md  
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-1-interface-types-constants/execution.log.md  
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/reviews/review.phase-1-interface-types-constants.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | reviewed | cross-domain docs | Optional follow-up |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/registry.md | reviewed | cross-domain docs | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md | reviewed | workflow-events | Optional follow-up |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-1-interface-types-constants/execution.log.md | reviewed | plan artifact | Optional follow-up |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-1-interface-types-constants/tasks.fltplan.md | reviewed | plan artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-1-interface-types-constants/tasks.md | reviewed | plan artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/package.json | reviewed | workflow-events/cross-domain | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/di-tokens.ts | reviewed | workflow-events/cross-domain | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/fakes/fake-workflow-events.ts | reviewed | workflow-events | Optional follow-up |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/fakes/index.ts | reviewed | workflow-events/cross-domain | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/index.ts | reviewed | workflow-events/cross-domain | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/interfaces/index.ts | reviewed | workflow-events/cross-domain | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/interfaces/workflow-events.interface.ts | reviewed | workflow-events | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/constants.ts | reviewed | workflow-events | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/index.ts | reviewed | workflow-events | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/types.ts | reviewed | workflow-events | Optional follow-up |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| N/A | N/A | N/A | Review verdict is APPROVE. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md | Add Level-1 Concepts table (`Concept | Entry Point | What It Does`) including new Phase 1 contracts. |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Mark future consumer edges as future/deferred until migration phases land. |

### Next Step

/plan-5-v2-phase-tasks-and-brief --phase "Phase 2: Implementation and Contract Tests" --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md
