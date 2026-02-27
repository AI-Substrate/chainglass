# Code Review: Phase 6: Real-Time SSE Updates

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 6: Real-Time SSE Updates
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

Multiple HIGH findings remain unmitigated in mutation-lock correctness, SSE event handling, and testing/doctrine compliance.

**Key failure areas**:
- **Implementation**: Self-event suppression can get stuck or be bypassed, and the SSE hook can drop structural updates.
- **Domain compliance**: Domain docs and map metadata were not kept current with Phase 6 event-contract changes.
- **Reinvention**: New workflow SSE pieces overlap legacy workgraph equivalents without consolidation notes.
- **Testing**: Required hook test and Full TDD red/green evidence are missing.
- **Doctrine**: New unit tests violate project mock policy (`vi.fn`) and timer reliability guidance.

## B) Summary

Phase 6 introduces the core workflow SSE pipeline (watcher adapter, domain adapter, editor subscription hook) and correctly differentiates structure vs status changes at a high level. However, there are correctness gaps in mutation lock lifecycle and message processing that can lead to dropped structural updates or stuck suppression, directly impacting AC-25/AC-26 behavior. Domain boundary placement and dependency direction are mostly sound, but domain artifacts are stale for the new workflow event channel and adapters. Testing and evidence quality do not meet spec-mandated Full TDD: the expected `use-workflow-sse` test is absent, execution evidence is minimal, and the added watcher test violates doctrine test rules.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] Red tests documented before implementation
- [ ] Green evidence recorded per task
- [ ] Refactor notes captured for completed tasks
- [ ] Critical SSE paths covered by tests (filtering, suppression, debounce, latency)

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:199-209,216-220,273-287 | error-handling | `startMutation()` is not paired with `endMutation()` in `finally`; thrown mutations can leave suppression enabled indefinitely. | Wrap all guarded mutations in `try/finally` and always release the mutation lock. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:255-262,280,325-379 | correctness | Self-event suppression is only applied to part of write paths (undo/redo, setLineLabel, Q&A answer, and node config/input saves are not guarded). | Route every disk-writing flow through a shared mutation-lock wrapper. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts:47-66 | correctness | Hook processes only the latest SSE message then clears the queue; structural events can be dropped when batched with status updates. | Process all queued relevant messages (or preserve structure-priority state) before clearing. |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/use-workflow-sse.test.ts (missing), /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/tasks.md:99 | scope | T007 expected hook/integration coverage is missing from the phase diff. | Add the missing hook test covering graphSlug filtering, structure/status behavior, debounce, and self-event suppression. |
| F005 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/execution.log.md:1-7 | testing | Spec requires Full TDD, but execution evidence lacks red/green/refactor traces and command outputs. | Add task-level TDD evidence with concrete commands/results for T001–T007. |
| F006 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/workflow/workflow-watcher-adapter.test.ts:1,23,39,54,69,84,98,110 | doctrine | Tests use `vi.fn()`, violating `R-TEST-007` (fakes-only, no mocks/spies). | Replace mock functions with explicit fake callback collectors/counters. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/workflow/workflow-watcher-adapter.test.ts:29,44,59,77,92,104,117 | doctrine | Tests use real sleeps and omit required Test Doc blocks (`R-TEST-005`, `R-TEST-002`). | Use fake timers and add required 5-field Test Doc comments per test. |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/fix-tasks.phase-4-react-integration.md:1-127; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/review.phase-4-react-integration.md:1-195 | scope | Phase 6 commit contains unrelated Plan 053 review artifacts. | Split/remove unrelated plan artifacts from this phase change set. |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md:66-123; /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md:84-90 | domain-md | Domain docs are stale for Phase 6 (events contracts/source/history and workflow-ui history do not reflect new SSE behavior). | Update both domain files for new channel/adapters and workflow external-update behavior. |
| F010 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:16,79 | map-nodes | Domain map node metadata/summary for `_platform/events` is not updated for workflow SSE additions. | Refresh node label/health summary text to include current workflow SSE contract surface. |
| F011 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md:27-53 | orphan | Changed files are not fully represented in the plan Domain Manifest, weakening traceability. | Add all touched phase files to Domain Manifest or document explicit artifact exemptions. |
| F012 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts:82-87 | correctness | `endMutation()` uses uncancelled delayed unlock; overlapping mutations can unlock early. | Track/cancel unlock timer or use an in-flight mutation counter. |
| F013 | LOW | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts:1-90; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/022-workgraph-ui/use-workgraph-sse.ts:79-124 | reinvention | Workflow SSE hook duplicates legacy workgraph SSE processing patterns with divergent queue semantics. | Align shared SSE filtering/debounce semantics or extract shared helper before Phase 7 cleanup. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Mutation lock release is not guaranteed on thrown mutations.
- **F002 (HIGH)**: Several write paths bypass self-event suppression.
- **F003 (HIGH)**: Latest-only message handling can drop structural events.
- **F012 (MEDIUM)**: Delayed unlock timer can race with overlapping mutations.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files are in expected domain trees (`workflow-ui`, `_platform/events`, tests). |
| Contract-only imports | ✅ | No cross-domain internal-import violations detected in reviewed code changes. |
| Dependency direction | ✅ | No infrastructure→business inversion detected. |
| Domain.md updated | ❌ | `_platform/events` and `workflow-ui` domain docs are not current for Phase 6 (F009). |
| Registry current | ✅ | No new domain introduced; registry entry updates not required. |
| No orphan files | ❌ | Domain Manifest does not fully enumerate touched files for this phase (F011). |
| Map nodes current | ❌ | `_platform/events` map metadata lags workflow SSE additions (F010). |
| Map edges current | ✅ | Diagram edges remain labeled; no unlabeled dependency edges found. |
| No circular business deps | ✅ | No business-domain cycle introduced. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `WorkflowWatcherAdapter` | `/Users/jordanknight/substrate/chainglass-048/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts` | _platform/workgraph (legacy) | ⚠️ Similar pattern; acceptable migration overlap if consolidated in Phase 7 |
| `WorkflowDomainEventAdapter` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/027-central-notify-events/workgraph-domain-event-adapter.ts` | _platform/events | ✅ Proceed (parallel adapter for new workflow channel) |
| `useWorkflowSSE` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/022-workgraph-ui/use-workgraph-sse.ts` | workflow-ui / legacy workgraph UI | ⚠️ Similar behavior with diverged queue logic; align semantics (F013) |

### E.4) Testing & Evidence

**Coverage confidence**: 43%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-25 | 52% | `workflow-editor.tsx` invalidates undo + toasts on structure changes, but structural events can be dropped and no direct hook test exists (F003, F004). |
| AC-26 | 46% | End-to-end pipeline exists in code, but no measured <=2s latency verification and missing hook/integration evidence (F004, F005). |
| AC-27 | 78% | `workflow-watcher.adapter.ts` implements required filtering and event typing; unit test exists but doctrine issues reduce confidence (F006, F007). |

### E.5) Doctrine Compliance

- **F006 (HIGH)**: `R-TEST-007` violation (`vi.fn()`/mock call assertions).
- **F007 (MEDIUM)**: `R-TEST-005` and `R-TEST-002` violations (real sleeps, missing Test Doc blocks).
- Project-rules files were present and applied: `/Users/jordanknight/substrate/chainglass-048/docs/project-rules/rules.md`, `/Users/jordanknight/substrate/chainglass-048/docs/project-rules/idioms.md`, `/Users/jordanknight/substrate/chainglass-048/docs/project-rules/architecture.md`, `/Users/jordanknight/substrate/chainglass-048/docs/project-rules/constitution.md`.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-25 | External structural changes invalidate undo stack and show toast | `useWorkflowSSE` + editor `onStructureChange` wiring exists; event-dropping and mutation-lock gaps remain | 52% |
| AC-26 | External changes appear via SSE within 2s | Watcher→domain adapter→SSE→hook→refresh pipeline implemented; latency evidence and hook test are missing | 46% |
| AC-27 | Workflow watcher detects graph/state/node changes and broadcasts | `WorkflowWatcherAdapter`, `WorkflowDomainEventAdapter`, channel registration, and watcher tests present | 78% |

**Overall coverage confidence**: 43%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -20
git --no-pager show --name-status --pretty=oneline f17156c
git --no-pager show --name-status --pretty=oneline ff376b7
git --no-pager show --name-status --pretty=oneline 7a8e5b2
git --no-pager log --oneline -- apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | head -5
git --no-pager log --oneline -- apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts | head -5
git --no-pager log --oneline -- apps/web/src/features/027-central-notify-events/workflow-domain-event-adapter.ts | head -5
git --no-pager log --oneline -- packages/workflow/src/features/023-central-watcher-notifications/workflow-watcher.adapter.ts | head -5
git --no-pager diff --no-color f17156c^..f17156c > /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff
git --no-pager diff --name-status f17156c^..f17156c > /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-6-real-time-sse-updates.txt
rg -n "workflows|WorkflowWatcherAdapter|WorkflowDomainEventAdapter|_platform/events|workflow-ui" /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 6: Real-Time SSE Updates
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-6-real-time-sse-updates.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/027-central-notify-events/start-central-notifications.ts | Modified | _platform/events | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/027-central-notify-events/workflow-domain-event-adapter.ts | Created | _platform/events | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Modified | workflow-ui | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts | Created | workflow-ui | Yes |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/execution.log.md | Created | plan artifact | Yes |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/tasks.fltplan.md | Modified | plan artifact | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Modified | plan artifact | Yes |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/fix-tasks.phase-4-react-integration.md | Created | unrelated plan artifact | Yes |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/review.phase-4-react-integration.md | Created | unrelated plan artifact | Yes |
| /Users/jordanknight/substrate/chainglass-048/packages/shared/src/features/027-central-notify-events/workspace-domain.ts | Modified | _platform/events | No |
| /Users/jordanknight/substrate/chainglass-048/packages/workflow/src/features/023-central-watcher-notifications/index.ts | Modified | _platform/events | No |
| /Users/jordanknight/substrate/chainglass-048/packages/workflow/src/features/023-central-watcher-notifications/workflow-watcher.adapter.ts | Created | _platform/events | Yes |
| /Users/jordanknight/substrate/chainglass-048/packages/workflow/src/index.ts | Modified | _platform/events | No |
| /Users/jordanknight/substrate/chainglass-048/test/unit/workflow/workflow-watcher-adapter.test.ts | Created | test (_platform/events) | Yes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Guarantee mutation lock release and apply suppression to all write paths | Prevent stuck suppression and false external-change handling (F001, F002) |
| 2 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts | Process message batches safely and harden overlapping mutation unlock behavior | Prevent dropped structure events and unlock races (F003, F012) |
| 3 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/use-workflow-sse.test.ts | Add missing hook coverage for Phase 6 SSE behavior | Required by T007 and AC-26/AC-25 verification (F004) |
| 4 | /Users/jordanknight/substrate/chainglass-048/test/unit/workflow/workflow-watcher-adapter.test.ts | Replace mocks/sleeps with doctrine-compliant fakes/fake-timer tests and add Test Docs | Satisfy project testing doctrine (F006, F007) |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/execution.log.md | Add Full TDD red/green/refactor evidence and concrete test output | Spec requires auditable TDD evidence (F005) |
| 6 | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/fix-tasks.phase-4-react-integration.md | Remove from Phase 6 change set | Keep phase scope clean and auditable (F008) |
| 7 | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/review.phase-4-react-integration.md | Remove from Phase 6 change set | Keep phase scope clean and auditable (F008) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md | Add workflow channel/adapters in Contracts, Source Location, and History |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Add Phase 4/5/6 history and external-change SSE behavior notes |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Refresh `_platform/events` node/summary metadata for workflow SSE |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md --phase "Phase 6: Real-Time SSE Updates"
