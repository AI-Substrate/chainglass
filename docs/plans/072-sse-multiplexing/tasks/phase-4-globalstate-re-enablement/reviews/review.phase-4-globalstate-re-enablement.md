# Code Review: Phase 4: GlobalState Re-enablement

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 4: GlobalState Re-enablement
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 4's code changes are mechanically sound, but the review cannot approve the phase because AC-26 and AC-28 are marked complete without concrete runtime/manual verification evidence, and the state-domain documentation set was only partially updated for the transport change.

**Key failure areas**:
- **Implementation**: `state-connector.tsx` still contains a stale internal note that says each server-event route creates its own SSE connection.
- **Domain compliance**: `_platform/state/domain.md` and `docs/domains/domain-map.md` still describe the legacy `useSSE` transport, and the plan's Domain Manifest missed one touched domain doc.
- **Testing**: The execution log records `pnpm test`, but it does not record the work-unit-state bridge validation or the promised 3-tab smoke results for AC-26 and AC-28.

## B) Summary

The Phase 4 diff is small and low-risk: it re-enables `GlobalStateConnector`, swaps `ServerEventRoute` onto `useChannelEvents`, and updates adjacent documentation. No reinvention concerns were found, and the changed runtime logic did not reveal correctness, security, or performance defects in static review. The review blocks on evidence quality instead: the phase claims end-to-end state flow and multi-tab lockup prevention, but the execution log only captures test-suite output, not the observed runtime checks needed to substantiate AC-26 and AC-28. Domain artifacts also lag the code — `_platform/state/domain.md`, `docs/domains/domain-map.md`, and the plan's Domain Manifest do not yet fully reflect the multiplexed SSE architecture that Phase 4 now depends on.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present (`pnpm test` recorded in the execution log; targeted `server-event-route` rerun passed 11/11 during review)
- [ ] Critical runtime paths covered with concrete evidence (AC-26, AC-28)
- [ ] Key verification points documented with observed outcomes
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not evidenced in phase artifacts)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-4-globalstate-re-enablement/execution.log.md:54-59 | testing | AC-26 and AC-28 are marked complete without recorded runtime/manual evidence. | Record concrete work-unit-state bridge verification and 3-tab smoke-test results (or equivalent integration coverage) before approval. |
| F002 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md:79-80,132-135 | domain-compliance | `_platform/state/domain.md` still describes `ServerEventRoute` as depending on `useSSE` after the Phase 4 mux migration. | Update the Composition and Dependencies sections to reference `useChannelEvents` / multiplexed SSE contracts. |
| F003 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:17,22,150,157 | domain-compliance | The domain map still advertises legacy `useSSE` surfaces and omits current multiplexed/state composition details. | Refresh the node labels, dependency edge, and health-summary row to match the current mux architecture. |
| F004 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md:27-53 | domain-compliance | The Phase 4 review changed `_platform/state/domain.md`, but the plan's Domain Manifest does not list that touched file. | Add the state domain doc to the Domain Manifest for traceable phase ownership. |
| F005 | LOW | /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/state/state-connector.tsx:32-35 | pattern | The `SERVER_EVENT_ROUTES` comment still says each route creates its own SSE connection. | Rewrite the comment to describe one invisible bridge component per route sharing the single multiplexed EventSource. |

## E) Detailed Findings

### E.1) Implementation Quality

No correctness, security, or performance regressions were found in the Phase 4 code diff. The only implementation-quality issue is F005: a stale internal comment in `state-connector.tsx` now contradicts the Plan 072 architecture and could mislead future work on additional server-event routes.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | No new files were added; modified source files remain under their declared domain or cross-domain composition locations. |
| Contract-only imports | ✅ | The Phase 4 diff uses the `_platform/events` public barrel (`@/lib/sse`) for the new transport swap. |
| Dependency direction | ✅ | No new dependency-direction violation was introduced by this diff. |
| Domain.md updated | ❌ | `_platform/state/domain.md` added the 072-P4 history row but still documents `ServerEventRoute` as a `useSSE` consumer. |
| Registry current | ✅ | No domain registry changes were required for Phase 4. |
| No orphan files | ❌ | `_platform/state/domain.md` was modified but is absent from the plan's Domain Manifest. |
| Map nodes current | ❌ | `docs/domains/domain-map.md` still lists legacy `_platform/events` / `_platform/state` surfaces. |
| Map edges current | ❌ | The `_platform/state` dependency still points at `useSSE` instead of `useChannelEvents` / multiplexed SSE. |
| No circular business deps | ✅ | No new business-domain cycle was introduced by the Phase 4 diff. |
| Concepts documented | ✅ | `_platform/events` and `_platform/state` both retain Concepts tables, and no new public contract was added without concept documentation. |

**Note**: The review did observe older composition coupling inside `state-connector.tsx`, but it predates the Phase 4 diff and is therefore not counted as a phase-specific finding here.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `ServerEventRoute` transport swap | `useChannelEvents` / `MultiplexedSSEProvider` (existing contracts) | `_platform/events` | proceed |
| `GlobalStateConnector` re-enablement | Existing component reused | `_platform/state` | proceed |

No duplicate capability was introduced in this phase; the work is a reuse-and-rewire exercise over existing Plan 072 infrastructure.

### E.4) Testing & Evidence

**Coverage confidence**: 55%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-24 | 88% | `_computed.diff` shows `<GlobalStateConnector slug={slug} worktreeBranch={worktreeBranch} />` added in `browser-client.tsx`; execution log T003 records the same JSX addition. |
| AC-25 | 68% | `_computed.diff` replaces `useSSE` with `useChannelEvents<ServerEvent>(route.channel, { maxMessages: 0 })` in `server-event-route.tsx`; review reran `pnpm vitest run test/unit/web/state/server-event-route.test.ts` and it passed 11/11, but that test only exercises downstream message-processing logic. |
| AC-26 | 25% | The code path is now wired, but the execution log does not capture a real `work-unit-state` event observed flowing through `ServerEventRoute` into `GlobalStateSystem`. |
| AC-28 | 10% | T005 is labeled as a manual smoke test, but the only recorded evidence is `pnpm test`; no 3-tab workflow, connection count, or responsiveness observation is logged. |
| AC-31 | 95% | Execution log T005 records `pnpm test` as `5173 passed, 80 skipped, 0 failures`; review also reran `pnpm vitest run test/unit/web/state/server-event-route.test.ts` and observed 11/11 passing. |

### E.5) Doctrine Compliance

One low-severity doctrine issue was identified and consolidated into F002: the current `_platform/state/domain.md` no longer matches the multiplexed-SSE architecture described by the plan, which falls short of the project's documentation currency expectations.

### E.6) Harness Live Validation

N/A — no harness configured (`docs/project-rules/harness.md` is absent).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-24 | GlobalStateConnector re-enabled in browser-client.tsx | Diff adds `GlobalStateConnector` JSX in `/Users/jordanknight/substrate/067-question-popper/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`; execution log T003 confirms the insertion. | 88% |
| AC-25 | ServerEventRoute consumes from multiplexed provider instead of per-route useSSE | Diff swaps `useSSE` for `useChannelEvents` in `/Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/state/server-event-route.tsx`; targeted `server-event-route` test rerun passed. | 68% |
| AC-26 | Work-unit-state events flow through SSE → GlobalStateSystem after re-enablement | Architecture and unit logic imply the path is wired, but no observed runtime event or integration test evidence is recorded in phase artifacts. | 25% |
| AC-28 | 3+ tabs open simultaneously without REST request stalling or page lockup | Phase artifact claims a manual smoke test but records only `pnpm test`; no multi-tab evidence is preserved. | 10% |
| AC-31 | All existing tests continue passing | Execution log records `pnpm test` success; review reran `pnpm vitest run test/unit/web/state/server-event-route.test.ts` successfully. | 95% |

**Overall coverage confidence**: 55%

## G) Commands Executed

```bash
git --no-pager status --short -- 'apps/web/src/lib/state/server-event-route.tsx' 'apps/web/src/lib/state/state-connector.tsx' 'apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx' 'test/unit/web/state/server-event-route.test.ts'
git --no-pager diff --stat -- 'apps/web/src/lib/state/server-event-route.tsx' 'apps/web/src/lib/state/state-connector.tsx' 'apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx' 'test/unit/web/state/server-event-route.test.ts'
git --no-pager diff --staged --stat -- 'apps/web/src/lib/state/server-event-route.tsx' 'apps/web/src/lib/state/state-connector.tsx' 'apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx' 'test/unit/web/state/server-event-route.test.ts'
git --no-pager log --oneline -12 -- 'apps/web/src/lib/state/server-event-route.tsx' 'apps/web/src/lib/state/state-connector.tsx' 'apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx' 'test/unit/web/state/server-event-route.test.ts'
git --no-pager diff ad9708ecf6d3a3e4a741f6005f44456a8b4ebb0f..7f1b5e32 > /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-4-globalstate-re-enablement/reviews/_computed.diff
pnpm vitest run test/unit/web/state/server-event-route.test.ts
# Parallel review subagents launched via Task tool: implementation, domain compliance, anti-reinvention, testing evidence, doctrine.
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 4: GlobalState Re-enablement
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-4-globalstate-re-enablement/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-4-globalstate-re-enablement/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-4-globalstate-re-enablement/reviews/review.phase-4-globalstate-re-enablement.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | modified | cross-domain | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/state/server-event-route.tsx | modified | `_platform/state` | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/state/state-connector.tsx | modified | `_platform/state` | Update stale multiplexing comment |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | modified | `_platform/events` | None required for approval |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md | modified | `_platform/state` | Update multiplexed-SSE references |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | reviewed (stale, unchanged in phase) | cross-domain | Update mux/state node and edge labels |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-4-globalstate-re-enablement/execution.log.md | reviewed | cross-domain | Add missing AC-26 / AC-28 evidence |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md | reviewed | cross-domain | Add `_platform/state/domain.md` to Domain Manifest |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-4-globalstate-re-enablement/execution.log.md | Add concrete verification evidence for AC-26 and AC-28 (or equivalent integration evidence). | The current log does not prove the muxed work-unit-state bridge or multi-tab lockup prevention. |
| 2 | /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md | Replace stale `useSSE` references with multiplexed SSE contracts. | The domain doc currently contradicts the implementation/history row. |
| 3 | /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Update mux/state node labels and `_platform/state` → `_platform/events` dependency text. | The architecture map still reflects pre-Phase-4 transport details. |
| 4 | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md | Add `_platform/state/domain.md` to the Domain Manifest. | The manifest is missing a touched file. |
| 5 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/state/state-connector.tsx | Fix the stale `SERVER_EVENT_ROUTES` comment. | The comment still claims one SSE connection per route. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md | Composition/Dependencies still mention `useSSE` instead of multiplexed SSE contracts. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | `_platform/events` / `_platform/state` node labels and dependency summary still reflect legacy `useSSE`. |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md | Domain Manifest omits `_platform/state/domain.md`. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md --phase 'Phase 4: GlobalState Re-enablement'
