# Code Review: Phase 3: Build the Full-Page Create Flow

**Plan**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
**Spec**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
**Phase**: Phase 3: Build the Full-Page Create Flow
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 3 ships the core route/action/form wiring, but it does not include the planned targeted form-state tests or concrete verification evidence for the new UI state machine, so the highest-risk user-visible behaviors remain unproven.

**Key failure areas**:
- **Testing**: The planned `new-worktree-form` state tests were not added, and the execution log explicitly defers them.
- **Domain compliance**: The workspace domain docs were not updated for the new Phase 3 route/form surface or the client-safe naming exports.
- **Doctrine**: The missing tests conflict with the project’s TDD and fake-first testing rules for new behavior.

## B) Summary

The implementation itself is directionally sound: it keeps create-worktree orchestration in `IWorkspaceService`, derives redirects in the web layer, and uses the expected `useActionState` + hard-navigation pattern. Static review did not surface a correctness, security, or reinvention problem in the changed source files. The review does, however, find a material validation gap: the phase-specific form-state test file was never added, and the execution log contains no targeted evidence for preview rendering, blocking-error preservation, bootstrap-warning recovery, or success-path navigation. Domain documentation also lags the implementation, leaving the workspace domain’s public/live-preview surface under-documented for this phase.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Core validation tests present
- [ ] Critical paths covered
- [ ] Key verification points documented
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/069-new-worktree/test/unit/web/components/new-worktree-form.test.tsx | testing | Planned Phase 3 form-state tests are missing, so the new four-state UI flow is unverified. | Add the targeted form-state test file and cover `idle`, `blocking_error`, `created`, and `created_with_bootstrap_error`. |
| F002 | HIGH | /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-3-build-the-full-page-create-flow/execution.log.md | testing | Execution evidence does not prove the phase-critical preview, blocking-error, bootstrap-warning, or navigation behaviors. | Record phase-specific automated or manual verification evidence for the new create-flow states and navigation outcomes. |
| F003 | MEDIUM | /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md | domain-md/concepts-docs | Workspace domain docs were not updated for the new Phase 3 route/form surface or the new client-safe naming helper exports. | Update workspace domain History, Source Location/Composition, and Concepts/Contracts to reflect the Phase 3 surface. |

## E) Detailed Findings

### E.1) Implementation Quality

No material implementation-quality findings from static review. The action/page/form split stays aligned with the planned web-adapter pattern, and no correctness, security, or performance defect was confirmed from the diff.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files live under the workspace web surface declared in the plan manifest. |
| Contract-only imports | ✅ | Cross-domain imports stay on public surfaces (`@chainglass/shared`, `@chainglass/workflow`, `workspaceHref`). |
| Dependency direction | ✅ | The workspace business domain consumes infrastructure contracts without reversing the dependency direction. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` stops at Plan 069 Phase 2 and does not mention the Phase 3 route/form additions. |
| Registry current | ✅ | No new domain was introduced, so `/Users/jordanknight/substrate/069-new-worktree/docs/domains/registry.md` remains current. |
| No orphan files | ✅ | All changed files map back to the workspace domain manifest. |
| Map nodes current | ✅ | No new domain nodes were added in this phase. |
| Map edges current | ✅ | The existing workspace → `_platform/workspace-url` and workspace → auth edges still describe the runtime dependency shape. |
| No circular business deps | ✅ | No new business-domain cycle was introduced. |
| Concepts documented | ❌ | The workspace domain docs do not reflect the newly exported client-safe naming helpers used for live preview. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| NewWorktreePage route component | Existing workspace page/server-component patterns | workspace | Proceed |
| NewWorktreeForm client state machine | Existing `WorkspaceAddForm` / `useActionState` pattern reuse | workspace | Proceed |
| Client-safe naming helper exports | Existing Phase 2 naming utilities reused directly | workspace | Proceed |

No genuine cross-domain duplication was identified.

### E.4) Testing & Evidence

**Coverage confidence**: 44%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC2 | 72% | `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx` adds the dedicated page route, but no route-level test or manual proof was logged. |
| AC3 | 61% | `page.tsx` calls `previewCreateWorktree()` during render and the form renders preview data, while `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/workspace-service.test.ts` proves preview generation; no form render test confirms the browser UI. |
| AC6 | 67% | The action delegates to `IWorkspaceService.createWorktree()`, and `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/workspace-service.test.ts` covers blocked and successful domain outcomes, but there is no page-level success-path evidence. |
| AC7 | 46% | `createNewWorktree()` builds a browser URL with `workspaceHref(...)`, and `/Users/jordanknight/substrate/069-new-worktree/test/unit/web/lib/workspace-url.test.ts` proves the URL shape; automatic navigation via `window.location.assign()` is not verified. |
| AC8 | 71% | Service tests cover dirty/diverged main blocking, and the action maps blocked results into `blocking_error`, but the form’s error presentation is untested. |
| AC9 | 39% | The action preserves `requestedName` and carries `refreshedPreview`, but the planned component test for refreshed conflict UX is missing. |
| AC12 | 34% | The diff adds `created_with_bootstrap_error`, warning copy, and log-tail rendering, but no test or manual evidence proves the failed-bootstrap UX. |
| AC13 | 79% | The phase adds only the “Open Worktree Anyway” recovery path and no retry action, matching scope. |
| AC14 | 54% | The route and authenticated server action keep the flow inside the app, but no live/manual evidence shows a user completing the path end-to-end. |

### E.5) Doctrine Compliance

| Rule | Status | Details |
|------|--------|---------|
| R-TEST-001 / Constitution Principle 3 (TDD) | ❌ | The phase adds substantial new UI state behavior without the planned targeted tests. |
| R-TEST-007 (fake-first / no mocks) | ❌ | The current component shape hard-wires `useActionState(createNewWorktree, initialState)`, making the missing fake-friendly state tests harder to add later without refactoring. |
| Naming / directory conventions | ✅ | Added files use kebab-case and sit in conventional workspace locations. |
| Layer boundaries | ✅ | The web layer still delegates lifecycle logic to `IWorkspaceService`. |

### E.6) Harness Live Validation

N/A — no harness configured for this feature.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC2 | Dedicated full-page creation flow exists | New route at `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx` | 72% |
| AC3 | Page shows workspace context and preview before create | `page.tsx` loads workspace info + preview; form renders preview card | 61% |
| AC6 | Successful create uses canonical-main-backed domain flow | Action delegates to `IWorkspaceService.createWorktree()`; service tests cover create path | 67% |
| AC7 | Success lands in workspace-scoped browser context | `workspaceHref()` + `window.location.assign()` wiring exists; only URL helper is tested | 46% |
| AC8 | Unsafe main blocks creation with explanation | Domain service tests cover dirty/diverged blocking; UI presentation unverified | 71% |
| AC9 | Name/path conflicts preserve input and refresh preview | Action maps `refreshedPreview` + preserved fields; no component verification | 39% |
| AC12 | Failed bootstrap shows warning and allows opening anyway | `created_with_bootstrap_error` state and button exist; no targeted evidence | 34% |
| AC13 | No in-product retry after bootstrap failure | No retry control added; explicit open-anyway path present | 79% |
| AC14 | Flow remains inside authenticated app experience | Authenticated server action + route exist; no end-to-end evidence logged | 54% |

**Overall coverage confidence**: 44%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -12
git --no-pager log --oneline --follow -5 -- apps/web/app/actions/workspace-actions.ts
git --no-pager log --oneline --follow -5 -- 'apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx'
git --no-pager log --oneline --follow -5 -- apps/web/src/components/workspaces/new-worktree-form.tsx
git --no-pager log --oneline --follow -5 -- packages/workflow/src/index.ts
git --no-pager diff --name-status HEAD^ HEAD -- apps/web/app/actions/workspace-actions.ts 'apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx' apps/web/src/components/workspaces/new-worktree-form.tsx packages/workflow/src/index.ts
git --no-pager diff --unified=3 HEAD^ HEAD -- apps/web/app/actions/workspace-actions.ts 'apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx' apps/web/src/components/workspaces/new-worktree-form.tsx packages/workflow/src/index.ts
rg '^## (Domain Manifest|Key Findings|Phases)|^\*\*Mode\*\*' /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
rg '^## (Testing Strategy|Acceptance Criteria)|^\*\*Approach\*\*|^[0-9]+\.' /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
**Spec**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
**Phase**: Phase 3: Build the Full-Page Create Flow
**Tasks dossier**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-3-build-the-full-page-create-flow/tasks.md
**Execution log**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-3-build-the-full-page-create-flow/execution.log.md
**Review file**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-3-build-the-full-page-create-flow/reviews/review.phase-3-build-the-full-page-create-flow.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/069-new-worktree/apps/web/app/actions/workspace-actions.ts | modified | workspace | Add evidence-backed validation coverage via component/manual tests/logs |
| /Users/jordanknight/substrate/069-new-worktree/apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx | created | workspace | Validate route/preview behavior and record evidence |
| /Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx | created | workspace | Add targeted state tests and make the UI state machine testable with repo-approved patterns |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/index.ts | modified | workspace | No direct change required beyond keeping docs aligned with the exported naming helpers |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md | unchanged | workspace | Update docs for Phase 3 route/form surface and naming-helper exports |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/069-new-worktree/test/unit/web/components/new-worktree-form.test.tsx | Add the missing targeted form-state tests for `idle`, `blocking_error`, `created`, and `created_with_bootstrap_error`. | Phase 3’s core UI state machine is currently unverified. |
| 2 | /Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx | Introduce a fake-friendly test seam if needed so the component can be rendered state-by-state without violating the project’s no-mock rules. | Current wiring makes the required tests difficult under repo doctrine. |
| 3 | /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-3-build-the-full-page-create-flow/execution.log.md | Add concrete verification evidence for preview, blocking-error, bootstrap-warning, and success navigation outcomes. | The current execution log does not prove the highest-risk Phase 3 behaviors. |
| 4 | /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md | Update History, Source Location/Composition, and Concepts/Contracts for the Phase 3 route/form and client-safe naming exports. | Domain documentation is out of sync with the implemented surface. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md | Plan 069 Phase 3 history row; route/form source inventory; documentation for the client-safe naming helper export surface |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md --phase 'Phase 3: Build the Full-Page Create Flow'
