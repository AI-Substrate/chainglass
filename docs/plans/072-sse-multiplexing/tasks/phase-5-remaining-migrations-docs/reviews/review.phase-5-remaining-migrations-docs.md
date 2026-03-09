# Code Review: Phase 5: Remaining Migrations + Documentation

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 5: Remaining Migrations + Documentation
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 5 cannot be approved because it introduces two in-scope TypeScript regressions, bundles work that the dossier explicitly marked out of scope, publishes SSE documentation that is ahead of the codebase, and lacks durable execution evidence for AC-28.

**Key failure areas**:
- **Implementation**: The migrated `useWorkflowSSE` and `useWorkunitCatalogChanges` hooks no longer satisfy the `useChannelEvents` generic contract, and `useWorkflowSSE` still subscribes while disabled.
- **Domain compliance**: The phase diff is not phase-bounded, and the `workflow-ui`, `058-workunit-editor`, `_platform/events`, and domain-map artifacts were not updated for the migration.
- **Testing**: `execution.log.md` is missing, and there is no recorded 3-tab / no-lockup evidence for AC-28.
- **Doctrine**: `CLAUDE.md` and `docs/how/sse-integration.md` describe mux rollout as complete even though direct browser `EventSource` consumers still exist.

## B) Summary

The mechanical migrations in the two target hooks are straightforward, and the anti-reinvention pass found no duplicated capability: this phase correctly reuses the existing multiplexed SSE contracts. However, the in-scope hook changes currently fail a focused `apps/web` typecheck because both payload generics omit the required `channel` field from `MultiplexedSSEMessage`. The review also found significant scope drift: the phase diff deletes the legacy `useSSE` / kanban path and includes unrelated generated and prior-phase artifacts even though the dossier explicitly deferred that cleanup. Evidence quality is incomplete as well — `pnpm test` and `just build` both passed during review, but there is no `execution.log.md`, no durable AC-28 browser evidence, and the published SSE docs overstate how much of the browser surface has actually migrated.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present (`pnpm test` passed during review; `just build` also succeeded)
- [ ] Critical runtime/manual validation recorded for AC-28
- [ ] Key verification points documented in `execution.log.md`
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (`just lint` fails repo-wide; focused `apps/web` typecheck fails in two Phase 5 hook files)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts:15-18,37-40 | correctness | `WorkflowSSEMessage` no longer satisfies `useChannelEvents` because it omits the required `channel` field, producing TS2344 in focused app typecheck. | Extend the payload type from `MultiplexedSSEMessage` (or relax the hook contract consistently) and rerun `pnpm exec tsc -p apps/web/tsconfig.json --noEmit`. |
| F002 | HIGH | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts:16-19,37-39 | correctness | `UnitCatalogSSEMessage` also omits `channel`, causing a second TS2344 regression in the migrated Phase 5 hook. | Align the payload type with `MultiplexedSSEMessage` before passing it to `useChannelEvents`. |
| F003 | HIGH | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/tasks.md:24-28,128-135 | scope | The phase dossier still marks T001-T005 open and explicitly defers `useSSE` / kanban cleanup, but the diff deletes `/Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/useSSE.ts`, `/Users/jordanknight/substrate/067-question-popper/apps/web/src/components/kanban/kanban-content.tsx`, and their tests anyway. | Restore that legacy cleanup to the deferred state, or move it into a separately approved plan/phase and synchronize the dossier before approval. |
| F004 | HIGH | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/reviews/_computed.diff | scope | The saved phase diff is not phase-bounded: it includes unrelated root docs, generated `*.d.ts.map` artifacts, `apps/web/next-env.d.ts`, and prior-phase review artifacts alongside the intended Phase 5 files. | Trim the phase changes to the intended file set, then regenerate `_computed.diff` so the review artifact matches the actual phase scope. |
| F005 | HIGH | /Users/jordanknight/substrate/067-question-popper/docs/how/sse-integration.md:3-4,152-159 | doctrine | The SSE guide says browser clients use `/api/events/mux` exclusively, but direct browser `EventSource` consumers remain in `useAgentManager`, `useAgentInstance`, `useServerSession`, and `useWorkspaceSSE`; `CLAUDE.md:262-275` repeats the same overstatement. | Reword both documents to describe multiplexing as the default for migrated workspace channel consumers, and call out the remaining direct-EventSource exceptions until those follow-up migrations land. |
| F006 | HIGH | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/execution.log.md | testing | `execution.log.md` is missing, and there is no durable artifact for the required AC-28 three-tab/no-lockup validation. | Create the execution log with exact commands, outcomes, and manual/browser evidence; include AC-28 observations before rerunning review. |
| F007 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts:37-49 | performance | `useWorkflowSSE` always subscribes to `'workflows'` and only drops messages after receipt, so `enabled=false` still registers a callback and rerenders on incoming events. | Gate the subscription itself when disabled, or extend `useChannelEvents` with an enabled/auto-connect option. |
| F008 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/workflow-ui/domain.md:84-85,116-117,138-149 | domain-compliance | `workflow-ui/domain.md` still says the domain consumes `_platform/events` via `useSSE` and has no Phase 5 history entry for the workflow SSE migration. | Update the dependency/composition wording to `useChannelEvents('workflows')` and add a Plan 072 Phase 5 history row. |
| F009 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/058-workunit-editor/domain.md:35-43,57-64 | domain-compliance | `058-workunit-editor/domain.md` still has no `_platform/events` dependency, no catalog-change hook concept/composition entry, and no Phase 5 history row. | Document the `unit-catalog` multiplexed dependency and record the migration in history. |
| F010 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md:71-82,97-100,131-135,161-164,188,210-212 | domain-compliance | `_platform/events/domain.md` still describes `MultiplexedSSEMessage` as always having `type`, still references `useWorkflowSSE` as a `useSSE` consumer, and does not record a Phase 5 history update. | Refresh the contracts/concepts/history sections to match the current wire format and migrated consumers. |
| F011 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:17,67-69,106-108,150,158-160 | domain-compliance | The domain map still shows `workflow-ui -> events` as `useSSE` and omits the new `058-workunit-editor -> events` dependency, so the node labels and health summary are stale. | Update the `workflow-ui` edge to `useChannelEvents`, add the `058-workunit-editor` SSE edge, and refresh the health-summary rows. |

## E) Detailed Findings

### E.1) Implementation Quality

The code changes are small, but two of them are compile-time regressions in the exact hooks this phase was supposed to migrate. A focused app typecheck (`pnpm exec tsc -p apps/web/tsconfig.json --noEmit`) reports TS2344 in both `use-workflow-sse.ts` and `use-workunit-catalog-changes.ts` because the payload generics no longer satisfy `MultiplexedSSEMessage`. Separately, `useWorkflowSSE` does not preserve the old `enabled=false` subscription behavior: it still subscribes and then clears messages after they arrive, which wastes renders and event work. No security issues or reinvention bugs were found in the migrated logic itself.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | The in-scope edited files remain under their expected domain or cross-domain paths. |
| Contract-only imports | ✅ | The phase uses the `_platform/events` public barrel (`@/lib/sse`) rather than importing another domain's internals. |
| Dependency direction | ✅ | All new dependencies remain business → infrastructure, which is allowed. |
| Domain.md updated | ❌ | `workflow-ui/domain.md`, `058-workunit-editor/domain.md`, and `_platform/events/domain.md` are stale for the Phase 5 migration. |
| Registry current | ✅ | No new domains were introduced, so `docs/domains/registry.md` does not need changes. |
| No orphan files | ❌ | The phase diff includes out-of-scope deletions (`useSSE`, kanban) and unrelated generated/prior-phase artifacts that are not represented by the Phase 5 dossier. |
| Map nodes current | ❌ | `docs/domains/domain-map.md` still advertises legacy `useSSE` / missing unit-catalog surfaces. |
| Map edges current | ❌ | The `workflow-ui -> events` edge is stale and the `058-workunit-editor -> events` edge is missing. |
| No circular business deps | ✅ | No new business-to-business cycle was introduced. |
| Concepts documented | ⚠️ | Existing concept sections remain, but they were not updated for the Phase 5 hook migration and optional `type` contract change. |

The main compliance issue is documentation currency rather than dependency misuse. The source imports are fine, but the phase did not keep the domain docs, domain map, or dossier aligned with the delivered diff.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `useWorkflowSSE` transport swap | `useChannelEvents` | `_platform/events` | proceed |
| `useWorkunitCatalogChanges` transport swap | `useChannelEvents` | `_platform/events` | proceed |
| SSE integration guide refresh | Existing SSE docs surface | cross-domain | proceed |

No genuine duplication was introduced. The phase correctly reuses the multiplexed SSE hooks that earlier Plan 072 phases already established.

### E.4) Testing & Evidence

**Coverage confidence**: 72%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-28 | 8% | The plan keeps AC-28 in Phase 5, but there is no `execution.log.md`, screenshot, DevTools capture, or other durable browser artifact showing 3 concurrent tabs on mux SSE without lockup. |
| AC-31 | 95% | `pnpm test` passed during review (`371` files: `361` passed, `10` skipped; `5232` tests: `5152` passed, `80` skipped). `just build` also succeeded (`7` tasks successful). |
| Goal-1 | 96% | `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts` now calls `useChannelEvents('workflows')`, though it currently fails the hook's type bound. |
| Goal-2 | 96% | `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts` now calls `useChannelEvents('unit-catalog')`, though it also fails the hook's type bound. |
| Goal-3 | 98% | `/Users/jordanknight/substrate/067-question-popper/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` now includes `workflows` and `unit-catalog` in `WORKSPACE_SSE_CHANNELS`. |
| Goal-4 | 94% | `/Users/jordanknight/substrate/067-question-popper/CLAUDE.md` was updated with multiplexed SSE guidance, but the text currently overstates rollout completeness. |
| Goal-5 | 78% | `/Users/jordanknight/substrate/067-question-popper/docs/how/sse-integration.md` was updated and published, but its mux-exclusive browser claim is ahead of the codebase. |

### E.5) Doctrine Compliance

The review found three doctrine-level issues that matter. First, the published docs (`CLAUDE.md` and `docs/how/sse-integration.md`) now describe browser SSE multiplexing as fully complete even though direct `EventSource` consumers remain; this violates the expectation that documentation match shipped behavior. Second, the phase dossier still marks core tasks incomplete while the diff already includes the corresponding code and documentation edits, so the plan artifacts are not synchronized with the work. Third, the required execution evidence is missing entirely because `execution.log.md` was never created.

### E.6) Harness Live Validation

N/A — no harness configured (`docs/project-rules/harness.md` is absent).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-28 | 3+ tabs open simultaneously without lockup | No phase execution log or browser artifact records the required multi-tab mux verification. | 8% |
| AC-31 | All existing tests pass | `pnpm test` passed during review; `just build` also succeeded. | 95% |
| Goal-1 | `useWorkflowSSE` migrated to `useChannelEvents('workflows')` | Code swap is present in `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts`, but the generic type currently fails typecheck. | 96% |
| Goal-2 | `useWorkunitCatalogChanges` migrated to `useChannelEvents('unit-catalog')` | Code swap is present in `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts`, but the generic type currently fails typecheck. | 96% |
| Goal-3 | `WORKSPACE_SSE_CHANNELS` expanded | `/Users/jordanknight/substrate/067-question-popper/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` now lists all five channels. | 98% |
| Goal-4 | `CLAUDE.md` reflects new contracts | The new quick-reference section exists, but its language is broader than the actual rollout. | 94% |
| Goal-5 | Migration guide published | `/Users/jordanknight/substrate/067-question-popper/docs/how/sse-integration.md` exists and documents the mux approach, but the guide overstates completion. | 78% |

**Overall coverage confidence**: 72%

## G) Commands Executed

```bash
git --no-pager status --short && printf '\n---UNSTAGED---\n' && git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat && printf '\n---RECENT---\n' && git --no-pager log --oneline -10
mkdir -p 'docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/reviews' && git --no-pager diff 14b31032..HEAD > 'docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/reviews/_computed.diff'
git --no-pager diff --name-status 14b31032..HEAD
git --no-pager diff --stat 14b31032..HEAD
pnpm test
just typecheck
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
just lint
just build
# Parallel review subagents launched via Task tool: implementation, domain compliance, anti-reinvention, testing evidence, doctrine.
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 5: Remaining Migrations + Documentation
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/reviews/review.phase-5-remaining-migrations-docs.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts | modified | `workflow-ui` | Fix `MultiplexedSSEMessage` typing and avoid subscribing when disabled |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts | modified | `058-workunit-editor` | Fix `MultiplexedSSEMessage` typing |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | modified | cross-domain | None after scope cleanup |
| /Users/jordanknight/substrate/067-question-popper/CLAUDE.md | modified | cross-domain | Narrow mux guidance to match actual rollout |
| /Users/jordanknight/substrate/067-question-popper/docs/how/sse-integration.md | modified | cross-domain | Narrow mux guidance to match actual rollout |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/useSSE.ts | deleted | `_platform/events` | Restore in this phase or move cleanup to a separate approved plan |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/components/kanban/kanban-content.tsx | deleted | cross-domain | Restore in this phase or move cleanup to a separate approved plan |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/components/kanban/index.ts | modified | cross-domain | Restore `KanbanContent` export if legacy path is restored |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/workflow-ui/domain.md | reviewed (stale, unchanged in phase) | `workflow-ui` | Update dependency/history for multiplexed workflow SSE |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/058-workunit-editor/domain.md | reviewed (stale, unchanged in phase) | `058-workunit-editor` | Add `_platform/events` dependency and history |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | reviewed (stale, unchanged in phase) | `_platform/events` | Update optional `type` contract and migrated-consumer docs |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | reviewed (stale, unchanged in phase) | cross-domain | Refresh workflow/workunit edges and health summary |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/tasks.md | reviewed (stale) | cross-domain | Synchronize task status and scope with delivered diff |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/execution.log.md | missing | cross-domain | Create execution evidence file |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/reviews/_computed.diff | generated | cross-domain | Regenerate after trimming unrelated changes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts | Align the payload type with `MultiplexedSSEMessage` and prevent subscription when disabled. | The hook currently fails focused app typecheck and still subscribes when `enabled=false`. |
| 2 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts | Align the payload type with `MultiplexedSSEMessage`. | The hook currently fails focused app typecheck. |
| 3 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/useSSE.ts | Restore the legacy hook here or move its deletion into a separate approved plan. | Phase 5 explicitly deferred removing `useSSE`. |
| 4 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/components/kanban/kanban-content.tsx | Restore the legacy dynamic-channel kanban path here or move its removal into a separate approved plan. | Phase 5 explicitly deferred kanban migration. |
| 5 | /Users/jordanknight/substrate/067-question-popper/docs/how/sse-integration.md | Reword mux guidance to match the actual rollout boundary. | The current doc says browser SSE is mux-exclusive, which is not yet true. |
| 6 | /Users/jordanknight/substrate/067-question-popper/CLAUDE.md | Reword mux guidance to match the actual rollout boundary. | The quick reference repeats the same overstatement as the SSE guide. |
| 7 | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/execution.log.md | Create the missing execution log with test/build/manual validation evidence, including AC-28. | The phase has no durable evidence trail today. |
| 8 | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/reviews/_computed.diff | Regenerate the diff after trimming unrelated files from the phase. | The current artifact is not phase-bounded. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/domains/workflow-ui/domain.md | Still documents `_platform/events` via `useSSE`; missing Phase 5 history entry. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/058-workunit-editor/domain.md | Missing `_platform/events` dependency, catalog-change hook concept/composition entry, and Phase 5 history row. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | Still documents the multiplexed message `type` field as always required and leaves migrated consumers/history stale. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Missing the updated `workflow-ui` SSE edge and the new `058-workunit-editor -> _platform/events` dependency/health summary. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md --phase 'Phase 5: Remaining Migrations + Documentation'
