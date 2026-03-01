# Code Review: Phase 2: WorkUnit State System

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md  
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md  
**Phase**: Phase 2: WorkUnit State System  
**Date**: 2026-03-01  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Blocking issues were found in the new SSE→state bridge behavior (event processing can silently stall under default message pruning) and testing evidence is insufficient for this new infrastructure path.

**Key failure areas**:
- **Implementation**: `ServerEventRoute` can stop processing new events after message buffer truncation.
- **Domain compliance**: phase/domain artifacts are out of sync with actual touched files and dependencies.
- **Testing**: no focused automated tests for new server-event routing behavior.
- **Doctrine**: exported public APIs are missing explicit return types in two files.

## B) Summary

The subtask introduces useful infrastructure for server-origin state publishing and is directionally aligned with the architecture. However, the current cursor strategy in `ServerEventRoute` depends on array indices while `useSSE` prunes to a capped buffer by default, creating a correctness gap that can stall routing in long-lived sessions. Domain and planning artifacts have drifted from actual implementation scope in this subtask, which weakens traceability and governance checks. Evidence quality is also weak: claims are present, but focused test coverage and concrete output artifacts are missing for the new behavior.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Contract-heavy behavior validated with explicit RED→GREEN evidence
- [ ] Lightweight infrastructure checks include focused regression tests
- [ ] Command outputs/evidence are attached for each completed subtask

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable) with concrete evidence snippets
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx:32-37,64 | correctness | Index-based cursor can stall event processing when `useSSE` prunes message history at 1000. | Use non-pruning stream (`maxMessages: 0`) or a monotonic cursor resilient to buffer trimming. |
| F002 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/subtask-001-execution.log.md:24-65 | testing | No targeted automated tests were added for `ServerEventRoute` routing semantics. | Add focused tests for event mapping, remove-instance path, source propagation, and burst processing behavior. |
| F003 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx:39-61 | error-handling | One bad mapped event can abort processing for remaining queued events. | Add per-event error isolation (`try/catch`) and continue processing remaining events. |
| F004 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/state-connector.tsx:67-74 | pattern | Route-domain registration is not idempotent and can throw on remount/HMR when routes are added. | Mirror `registerWorktreeState` idempotency before `registerDomain`. |
| F005 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md:25-62 | domain | Subtask files are outside the phase Domain Manifest inventory (orphan tracking drift). | Update Domain Manifest (or add subtask addendum) with touched files and domain classification. |
| F006 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md:44-55 | domain | `_platform/events` is marked consume but modified in this subtask (`WorkspaceDomain` change). | Update relationship to `modify` for this phase/subtask or document explicit exception. |
| F007 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.fltplan.md:27-33 | domain | Phase dependency docs omit `_platform/events` despite direct subtask changes. | Add `_platform/events` to dependencies in tasks/flight plan. |
| F008 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx:30 | doctrine | Exported public API lacks explicit return type (`R-CODE-001`). | Add explicit return type for `ServerEventRoute`. |
| F009 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/state-connector.tsx:60 | doctrine | Exported public API lacks explicit return type (`R-CODE-001`). | Add explicit return type for `GlobalStateConnector`. |
| F010 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/subtask-001-execution.log.md:24-65 | evidence | Verification evidence is narrative-only, without command output excerpts. | Record concise output snippets (or CI refs) per verification step. |
| F011 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/subtask-001-execution.log.md:24-65 | testing | Hybrid strategy used, but no red→green trace for new logic. | Add at least one failing-then-passing focused test for new route logic. |
| F012 | LOW | /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/events/domain.md:66 | domain | `WorkspaceDomain` contract text is stale (missing `WorkUnitState` in contract section). | Update contract description to include `WorkUnitState`. |
| F013 | LOW | /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md:22-23,94-110 | domain | `_platform/state` map labels/health summary do not reflect new route contracts clearly. | Update map node/summary entries for ServerEventRoute contracts. |
| F014 | LOW | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-router.ts:50-53 | domain | Descriptor `channel` typed as plain `string` instead of domain contract type. | Type `channel` as `WorkspaceDomainType` to enforce channel contract. |
| F015 | LOW | /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/events/domain.md:57-74 | domain | New WorkUnitState channel lacks explicit concept-level usage guidance. | Add concise concept note for channel purpose and consumers. |
| F016 | LOW | /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/features/027-central-notify-events/workspace-domain.ts:21 | doctrine | JSDoc line exceeds 100-character width (`R-CODE-005`). | Wrap line to <=100 chars. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `ServerEventRoute` uses `lastProcessedIndexRef` tied to `messages.length`. Since `useSSE` defaults to `maxMessages = 1000`, message arrays are truncated, which can cause `startIndex >= messages.length` forever and stall routing.
- **F003 (MEDIUM)**: `route.mapEvent()` and `state.publish()` are not isolated per event/update; one throw can skip the rest of queued events.
- **F004 (MEDIUM)**: Route domain registration loop lacks idempotency guard even though `registerDomain()` throws on duplicates.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New state router files are under `_platform/state` paths; event enum change under `_platform/events`. |
| Contract-only imports | ❌ | `ServerEventRouteDescriptor.channel` is plain string instead of contract-typed channel (`WorkspaceDomainType`) (F014). |
| Dependency direction | ❌ | Plan relation drift: `_platform/events` changed while marked as consume-only in target domains (F006). |
| Domain.md updated | ❌ | `_platform/events` contract/concepts text is stale for `WorkUnitState` channel usage (F012, F015). |
| Registry current | ✅ | No new domains introduced; registry remains consistent. |
| No orphan files | ❌ | Subtask touched files not represented in phase Domain Manifest (F005). |
| Map nodes current | ❌ | `_platform/state` node/health summary contract labels not fully current (F013). |
| Map edges current | ❌ | Phase dependency docs omit `_platform/events` linkage (F007). |
| No circular business deps | ✅ | No new business-domain cycle observed in map. |
| Concepts documented | ⚠️ | Concepts partially covered; WorkUnitState channel semantics need explicit contract guidance in events domain doc (F015). |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| ServerEventRouteDescriptor | `StateDomainDescriptor` (related shape, same domain) | _platform/state | LOW — **extend** existing patterns; no harmful duplication |
| ServerEventRoute component | `FileChangeProvider` (similar SSE→state wiring idea) | _platform/events | LOW — **proceed**; abstraction is more generic and reusable |

### E.4) Testing & Evidence

**Coverage confidence**: 34%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-10 | 35 | Partial infrastructure support exists (`ServerEventRoute`, descriptor, source metadata), but no work-unit-state route wiring/e2e proof yet. |
| AC-14 | 10 | No phase contract tests added in this subtask; parity for work-unit-state real/fake not demonstrated here. |

### E.5) Doctrine Compliance

Project rules files exist (`docs/project-rules/*.md`) and were evaluated.

- **F008 (MEDIUM)**: `R-CODE-001` explicit return type missing on exported `ServerEventRoute`.
- **F009 (MEDIUM)**: `R-CODE-001` explicit return type missing on exported `GlobalStateConnector`.
- **F016 (LOW)**: `R-CODE-005` line width violation in `WorkspaceDomain` JSDoc.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-09 | IWorkUnitStateService interface exists in shared | No interface/type files for work-unit-state added in this diff | 0 |
| AC-10 | WorkUnitState persists + publishes `work-unit:{id}:*` | Generic SSE→state bridge added; domain-specific descriptor not yet added | 35 |
| AC-11 | `tidyUp()` removes stale entries | No work-unit-state service implementation changes in diff | 0 |
| AC-12 | Working/questioned entries never expire | No work-unit-state service implementation changes in diff | 0 |
| AC-13 | FakeWorkUnitStateService exists with inspection methods | No fake-work-unit-state artifact in diff | 0 |
| AC-14 | Contract tests pass for real + fake parity | No work-unit-state contract tests in diff | 10 |
| AC-15 | AgentWorkUnitBridge auto-registers agents | No bridge file/changes in diff | 0 |
| AC-16 | Question events map to `askQuestion()` + has-question state | Not implemented in reviewed changes | 0 |
| AC-17 | `answerQuestion()` routes callback + clears question state | Not implemented in reviewed changes | 0 |

**Overall coverage confidence**: 34%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
git --no-pager diff --name-status main..HEAD -- <phase file candidates>
git --no-pager show --name-status --pretty='format:%H %s' -1 HEAD
git --no-pager diff --name-status c225d1f..HEAD > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_manifest.tsv
git --no-pager diff c225d1f..HEAD > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_computed.diff
# 5 parallel subagents:
# - implementation quality
# - domain compliance
# - anti-reinvention
# - testing/evidence
# - doctrine/rules
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md  
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md  
**Phase**: Phase 2: WorkUnit State System  
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.md  
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/subtask-001-execution.log.md  
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/review.phase-2-workunit-state-system.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/global-state-system.ts | modified | _platform/state | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/index.ts | modified | _platform/state | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx | created | _platform/state | Yes (F001, F003, F008) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-router.ts | created | _platform/state | Yes (F014) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/state-connector.tsx | modified | _platform/state | Yes (F004, F009) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/events/domain.md | modified | _platform/events | Yes (F012, F015) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/state/domain.md | modified | _platform/state | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/001-subtask-server-event-router.md | created | plan-artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/subtask-001-execution.log.md | created | plan-artifact | Yes (F002, F010, F011) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.fltplan.md | created | plan-artifact | Yes (F007) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.md | created | plan-artifact | Yes (dependency note alignment) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/workshops/005-server-event-router.md | created | plan-artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/fakes/fake-state-system.ts | modified | _platform/state | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/features/027-central-notify-events/workspace-domain.ts | modified | _platform/events | Yes (F016) |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/interfaces/state.interface.ts | modified | _platform/state | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/state/index.ts | modified | _platform/state | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/state/types.ts | modified | _platform/state | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx | Fix cursor/message retention strategy to prevent stalled routing after message pruning | Current logic can stop processing new events in long-running sessions (F001) |
| 2 | /Users/jordanknight/substrate/059-fix-agents/test/unit/web/state/server-event-route.test.tsx (new) | Add focused tests for route mapping, remove-instance, burst processing, and source propagation | New infra path currently lacks targeted automated verification (F002) |
| 3 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx | Add per-event error isolation | Prevent one malformed event from blocking subsequent updates (F003) |
| 4 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/state-connector.tsx | Add idempotency guard for route domain registration | Avoid duplicate-domain throw under HMR/StrictMode when routes are enabled (F004) |
| 5 | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md and /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.fltplan.md | Reconcile manifest/dependency drift for `_platform/events` and touched files | Preserve domain governance traceability (F005-F007) |
| 6 | /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/events/domain.md and /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Update contracts/concepts and map summary for new channel/router contracts | Domain docs are stale against implementation (F012-F015) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Domain Manifest entries for subtask-touched files; `_platform/events` relationship drift |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.fltplan.md | `_platform/events` dependency linkage for ST003/ST004 |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/events/domain.md | WorkspaceDomain contract and concepts coverage for `WorkUnitState` channel |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | `_platform/state` contract labels/summary reflecting ServerEventRoute additions |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md --phase 'Phase 2: WorkUnit State System'
