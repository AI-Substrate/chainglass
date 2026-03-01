# Code Review: Phase 4: Change Notifications & Workflow Integration

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md  
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md  
**Phase**: Phase 4: Change Notifications & Workflow Integration  
**Date**: 2026-03-01  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Full TDD (spec) — observed evidence is Lightweight

## A) Verdict

**REQUEST_CHANGES**

High-severity gaps remain in runtime behavior, domain boundary compliance, and testing-strategy compliance.

**Key failure areas**:
- **Implementation**: Unit-catalog watcher events are not guaranteed to fire because current watcher coverage excludes `.chainglass/units/`.
- **Domain compliance**: `workflow-ui` imports `058-workunit-editor` internals directly, and domain artifacts are not current for Phase 4 changes.
- **Reinvention**: New SSE hook duplicates existing `_platform/events` hook capability instead of extending shared transport hooks.
- **Testing**: Spec requires Full TDD, but Phase 4 landed with no new tests and no RED→GREEN evidence for AC-22..AC-26.
- **Doctrine**: Adapter naming/file conventions are partially violated (`.adapter.ts` rule).

## B) Summary

The phase includes meaningful implementation work and mostly follows existing adapter patterns, but a critical watcher-path assumption leaves the primary notification behavior at risk. Domain boundaries are currently violated by a direct business→business internal import (`workflow-ui` to `058-workunit-editor`), and domain artifacts (manifest/domain-map/domain histories) are out of sync with actual changes. Anti-reinvention checks found one substantive overlap: the new SSE hook bypasses existing shared `useSSE`/`useWorkspaceSSE` patterns. Testing evidence is insufficient for a Full TDD phase: no new tests were added and acceptance evidence for AC-24..AC-26 is partial. The phase should be reworked and re-reviewed after high-severity fixes are applied.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED tests written before implementation tasks
- [ ] GREEN evidence recorded for new behavior
- [ ] REFACTOR stage preserved passing tests

Universal (all approaches):
- [x] Only in-scope files changed
- [x] Linters/type checks clean (claimed in execution log)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts:226-241; /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts:30 | correctness | `.chainglass/units` changes are not reliably watched (data watcher is `.chainglass/data`; source watcher ignores `.chainglass`). | Add explicit watcher coverage for `.chainglass/units` (or remove ignore path intentionally) and verify with integration test. |
| F002 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx:10,45 | domain | `workflow-ui` imports `058-workunit-editor` internal component directly, violating contract-only business-domain boundaries. | Move banner into `workflow-ui` or expose a formal public contract entrypoint and import only through that contract. |
| F003 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md:60-65 | domain | Phase 4 Domain Manifest is stale: wrong watcher path and missing changed files. | Reconcile manifest with actual Phase 4 file manifest and correct domain mapping. |
| F004 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md:189-193; /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-4-change-notifications-workflow-integration/execution.log.md:50 | testing | Full TDD is mandated by spec, but no Phase 4 tests were added and no RED→GREEN evidence is present. | Add Phase 4 tests and capture explicit command/test outputs tied to AC-22..AC-26. |
| F005 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/027-central-notify-events/unit-catalog-domain-event-adapter.ts:20-22 | correctness | SSE payload includes only `unitSlug`, without workspace/worktree scoping metadata. | Include workspace/worktree context and filter on client before showing banner. |
| F006 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:357-361 | scope | "Edit Template" URL construction drops current `worktree` context. | Build URL with `workspaceHref` and propagate `worktree` through round-trip params. |
| F007 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts:35-43 | pattern | Hook opens raw `EventSource` instead of reusing existing shared SSE hooks. | Reuse `useSSE`/`useWorkspaceSSE` or centralize this in `_platform/events`. |
| F008 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/_platform/events/domain.md; /Users/jordanknight/substrate/058-workunit-editor/docs/domains/workflow-ui/domain.md; /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md | domain | Domain history/composition docs are not current for Plan 058 Phase 4. | Add Phase 4 history/composition/contracts updates in all touched domains. |
| F009 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/domain-map.md | domain | Domain map node/edge model does not reflect implemented coupling. | Prefer removing cross-domain coupling; otherwise add labeled edge and update health summary. |
| F010 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/027-central-notify-events/unit-catalog-domain-event-adapter.ts:1 | doctrine | Adapter file does not use required `.adapter.ts` suffix (R-CODE-003). | Rename to `unit-catalog-domain-event.adapter.ts` and update imports. |
| F011 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-4-change-notifications-workflow-integration/execution.log.md:50-54 | testing | AC-24..AC-26 evidence is mostly narrative; scenario-level verification output is missing. | Add reproducible evidence per AC (test output or explicit manual result transcript). |
| F012 | LOW | /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/workunit-catalog-watcher.adapter.ts:12-20 | doctrine | `UnitCatalogChangedEvent` interface lacks `I` prefix under R-CODE-002. | Rename to `IUnitCatalogChangedEvent` (or document exception in rules). |
| F013 | LOW | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-updated-banner.tsx | scope | Banner copy differs from spec’s exact acceptance-criteria wording. | Align copy with spec text or update AC wording in spec/tasks artifacts. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Critical event-source gap — unit-catalog adapter filters `units/...`, but central watcher currently covers `.chainglass/data` and source watcher excludes `.chainglass`, so `units` events can be missed.
- **F005 (MEDIUM)**: Domain event payload omits workspace/worktree context, increasing risk of cross-workspace false positives.
- **F006 (MEDIUM)**: Round-trip context currently carries `graph` but not `worktree`, weakening AC-23 behavior in multi-worktree contexts.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are placed in plausible feature/domain trees. |
| Contract-only imports | ❌ | `workflow-ui` imports `058-workunit-editor` internal component directly (`workflows/[graphSlug]/page.tsx`). |
| Dependency direction | ❌ | Direct business→business coupling introduced without formal contract. |
| Domain.md updated | ❌ | `_platform/events`, `workflow-ui`, and `058-workunit-editor` docs are stale for Phase 4. |
| Registry current | ✅ | No new domain required; registry already includes touched domains. |
| No orphan files | ❌ | Phase 4 manifest is out-of-sync with actual changed files and path locations. |
| Map nodes current | ❌ | Domain map summary does not reflect actual dependency model as implemented. |
| Map edges current | ❌ | No labeled edge representing current workflow-page coupling. |
| No circular business deps | ✅ | No business-domain cycle detected. |
| Concepts documented | ⚠️ | Events domain lacks a Concepts section update for new unit-catalog channel flow. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `use-workunit-catalog-changes` SSE hook | `useSSE`, `useWorkspaceSSE` | `_platform/events` | ⚠️ Extend existing |
| `WorkUnitCatalogWatcherAdapter` | `WorkflowWatcherAdapter` pattern | `_platform/events` | ✅ Proceed |
| `UnitCatalogDomainEventAdapter` | `WorkflowDomainEventAdapter`, `FileChangeDomainEventAdapter` pattern | `_platform/events` | ✅ Proceed |
| `WorkUnitUpdatedBanner` | None | N/A | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 61%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-22 | 82 | Node properties panel/action wiring exists for "Edit Template" navigation. |
| AC-23 | 80 | Editor page reads return params and renders "Back to Workflow" link. |
| AC-24 | 62 | Event pipeline and banner exist, but no direct evidence of external file-change trigger path in test output. |
| AC-25 | 60 | Dismiss/reappear logic exists in hook state, but no dedicated verification artifact. |
| AC-26 | 48 | `router.refresh()` is wired, but no proof that all required surfaces refresh correctly. |

### E.5) Doctrine Compliance

- **F010 (MEDIUM)**: Adapter file naming violates `R-CODE-003` (`.adapter.ts` suffix).
- **F012 (LOW)**: Interface naming convention violation against `R-CODE-002` (`I`-prefix).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-22 | "Edit Template" on workflow node properties panel | `node-properties-panel.tsx` + `workflow-editor.tsx` action wiring | 82 |
| AC-23 | Return context preserved back to workflow | Work-unit page consumes `searchParams`; editor renders back link | 80 |
| AC-24 | Banner appears on unit file change | New watcher adapter + domain adapter + SSE hook + banner component | 62 |
| AC-25 | Banner dismissible and reappears on next change | Hook tracks `lastChanged` vs `dismissedAt`; banner dismiss action present | 60 |
| AC-26 | Refresh picks up all unit changes | Banner action calls `router.refresh()` | 48 |

**Overall coverage confidence**: **61%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -20
git --no-pager diff --no-color 2041134..HEAD > /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/_computed.diff
git --no-pager diff --name-status 2041134..HEAD
```

Plus 5 parallel review subagent analyses:
1) Implementation quality
2) Domain compliance
3) Anti-reinvention
4) Testing/evidence
5) Doctrine/rules

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md  
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md  
**Phase**: Phase 4: Change Notifications & Workflow Integration  
**Tasks dossier**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-4-change-notifications-workflow-integration/tasks.md  
**Execution log**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-4-change-notifications-workflow-integration/execution.log.md  
**Review file**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/review.phase-4-change-notifications-workflow-integration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx | Modified | 058-workunit-editor | Keep; verify worktree context propagation |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx | Modified | workflow-ui | Remove/replace cross-domain internal import |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/027-central-notify-events/start-central-notifications.ts | Modified | _platform/events | Keep; update import if file rename applied |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/027-central-notify-events/unit-catalog-domain-event-adapter.ts | Added | _platform/events | Add workspace/worktree payload; rename file to `.adapter.ts` |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx | Modified | workflow-ui | Keep; verify final action wiring post-fixes |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Modified | workflow-ui | Preserve and forward `worktree` in URL |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx | Modified | 058-workunit-editor | Keep; confirm return context completeness |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-updated-banner.tsx | Added | 058-workunit-editor | Move to workflow-ui or expose formal public contract |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts | Added | 058-workunit-editor | Consider refactor to shared SSE hook usage |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-4-change-notifications-workflow-integration/execution.log.md | Added | docs | Add concrete AC evidence + test outputs |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-4-change-notifications-workflow-integration/tasks.fltplan.md | Modified | docs | Keep aligned if behavior/design changes |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-4-change-notifications-workflow-integration/tasks.md | Modified | docs | Keep aligned with implementation path (state vs SSE decision) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md | Modified | docs | Fix Domain Manifest rows for Phase 4 |
| /Users/jordanknight/substrate/058-workunit-editor/packages/shared/src/features/027-central-notify-events/workspace-domain.ts | Modified | _platform/events | Keep; verify docs/contracts map includes UnitCatalog |
| /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/index.ts | Modified | _platform/events | Keep export alignment after naming fixes |
| /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/workunit-catalog-watcher.adapter.ts | Added | _platform/events | Ensure watcher coverage + naming convention updates |
| /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/index.ts | Modified | _platform/events | Keep export alignment after adapter updates |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts (and/or source-watcher.constants.ts) | Ensure `.chainglass/units` changes are actually observed by central watcher pipeline | AC-24/25/26 can fail silently without event source coverage |
| 2 | /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx | Remove direct import of internal `058-workunit-editor` component or formalize a contract export | Violates contract-only business-domain dependency rules |
| 3 | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md | Reconcile Phase 4 Domain Manifest with actual touched files and paths | Current manifest is stale and creates orphan mapping failures |
| 4 | /Users/jordanknight/substrate/058-workunit-editor/test/... (new/updated tests) + execution log | Add and run Full TDD tests for AC-22..AC-26 with concrete evidence | Spec/testing strategy gate not met |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/_platform/events/domain.md | Phase 4 history/composition/contracts update for unit-catalog flow and concepts entry |
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/workflow-ui/domain.md | Phase 4 history/composition update for template-edit integration and banner ownership |
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md | Phase 4 history/composition update for return-navigation and notification pieces |
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/domain-map.md | Node/edge/health summary alignment with actual dependency model (or remove cross-domain dependency) |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md --phase "Phase 4: Change Notifications & Workflow Integration"
