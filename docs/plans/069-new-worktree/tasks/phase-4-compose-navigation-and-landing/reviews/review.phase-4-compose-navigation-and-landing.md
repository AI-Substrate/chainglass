# Code Review: Phase 4: Compose Navigation and Landing

**Plan**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
**Spec**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
**Phase**: Phase 4: Compose Navigation and Landing
**Date**: 2026-03-09
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 4 does not yet satisfy the authoritative collapsed-sidebar entrypoint requirement, the final quality gates are not green (`just lint` and `just build` fail), and the phase has no execution log/manual evidence for the browser handoff or recovery flows.

**Key failure areas**:
- **Implementation**: The create-worktree affordance exists only in the expanded sidebar, while the plan/spec require it to remain reachable when the sidebar is collapsed.
- **Domain compliance**: Workspace domain docs were only partially updated; the history row landed, but the source inventory and domain map remain stale.
- **Testing**: `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/execution.log.md` is missing, `just lint` fails, and `just build` fails in the feature code.
- **Doctrine**: The phase dossier's final-verification checklist omits constitution-mandated `just typecheck` and `just build` gates.

## B) Summary

This phase cleanly adds the expanded-sidebar plus button and substantial user-facing documentation, and the feature still routes successful creation to the canonical `/browser?worktree=...` landing surface. However, the authoritative Phase 4 plan requires the action to remain reachable while the sidebar is collapsed, and the shipped implementation plus phase artifacts instead narrow behavior to expanded-only. Domain artifacts were touched but not fully synchronized: `docs/domains/workspace/domain.md` gained a history row, while the workspace source inventory/composition notes and `docs/domains/domain-map.md` still lag behind the actual composition surface. Verification evidence is also insufficient for sign-off because `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/execution.log.md` is missing, `just lint` is red on a Plan 069 test file, `just typecheck` and `just test` pass, and `just build` fails on a broken import in `apps/web/src/components/workspaces/new-worktree-form.tsx`.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Automated validation exists for the underlying create-worktree domain/web flow (`just test` passed)
- [ ] Manual navigation verification is documented for expanded + collapsed entrypoints, browser landing, blocking errors, and bootstrap-warning recovery
- [ ] Quality-gate evidence is captured in `execution.log.md`

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/dashboard-sidebar.tsx:164-180` | scope | The phase still lacks the collapsed-sidebar create-worktree entrypoint required by the authoritative plan/spec; the dossier/docs were narrowed instead of the implementation being completed. | Add a collapsed-state affordance (likely in the workspace header action cluster and/or `WorkspaceNav`) and realign the phase artifacts/docs to the final behavior. |
| F002 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx:18-21` | build | `just build` fails because `new-worktree-form.tsx` imports `workspace-actions` through a broken relative path. | Fix the import path, rerun `just build`, and record the green result in `execution.log.md`. |
| F003 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md:72-75` | testing | The phase has no execution log or concrete manual/browser evidence for the browser handoff, blocking-error flow, bootstrap-warning recovery, or final quality-gate outputs. | Add `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/execution.log.md` with exact command outputs plus observed manual verification for the success, blocking, and bootstrap-warning paths. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md:143-194` | domain | Workspace domain history was updated, but the Phase 4 sidebar composition surface is not reflected in the composition/source inventory. | Add `dashboard-sidebar.tsx` as a workspace navigation composition surface and keep the source inventory current. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md:33,144-153` | domain | The workspace node label and health-summary row remain stale relative to the workspace contracts already documented and consumed on the map. | Update the workspace node/summary so the map reflects the current public contract set. |
| F006 | MEDIUM | `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md:71-75` | doctrine | T005/Stage 5 stop at lint/tests/commit and omit constitution-mandated `just typecheck` and `just build`, which under-specifies final verification. | Update `tasks.md` and `tasks.fltplan.md` so final verification explicitly requires `just lint`, `just typecheck`, `just test`, and `just build`. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `apps/web/src/components/dashboard-sidebar.tsx:164-180` guards the only new-worktree affordance behind `!isCollapsed`, while `apps/web/src/components/workspaces/workspace-nav.tsx:128-144` still renders only the folder icon in collapsed mode. This conflicts with `docs/plans/069-new-worktree/new-worktree-plan.md:205-225` and `docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md:83-85`, both of which require collapsed-state reachability.
- **F002 (HIGH)** — `just build` fails with `Module not found: Can't resolve '../../../../app/actions/workspace-actions'` from `apps/web/src/components/workspaces/new-worktree-form.tsx:18-21`. Even though this file was introduced in Phase 3, Phase 4.4/T005 is the final verification gate for the feature, so the phase cannot be signed off while the feature build is red.
- No security, input-validation, or performance regressions were evident in the changed Phase 4 diff.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files live under the phase task/workshop trees or existing workspace doc/component locations; no misplaced source files were introduced. |
| Contract-only imports | ✅ | `dashboard-sidebar.tsx` only consumes public helpers/components (`workspaceHref`, auth hook, UI primitives); no cross-domain internal import was introduced by the diff. |
| Dependency direction | ✅ | The Phase 4 changes keep business→infrastructure consumption (`workspace-url`, auth) and introduce no infrastructure→business reversal. |
| Domain.md updated | ❌ | `docs/domains/workspace/domain.md` gained a history row, but `:145-158,160-193` still omit `dashboard-sidebar.tsx` as a Phase 4 workspace navigation composition surface/source. |
| Registry current | ✅ | `docs/domains/registry.md` already contains the `workspace` domain; no registration change was required. |
| No orphan files | ✅ | The changed source/doc files map to the workspace domain or to phase-planning artifacts. |
| Map nodes current | ❌ | `docs/domains/domain-map.md:33,144-153` still advertises a narrower workspace contract set than the current domain doc and live consumer edges. |
| Map edges current | ✅ | No new domain dependency edges were introduced, and the existing workspace edges remain labeled. |
| No circular business deps | ✅ | The Phase 4 diff adds no new business→business dependency cycle. |
| Concepts documented | ✅ | The workspace domain has a Concepts table and Phase 4 does not add new public contracts that would require new rows. |

Additional domain notes:
- `docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md:47-48,71-85` narrows the behavior to expanded-only despite the authoritative Phase 4 plan remaining broader. That mismatch is captured as **F001** rather than as a separate domain finding.

### E.3) Anti-Reinvention

No genuine duplication was introduced in this phase. The changes are limited to a sidebar affordance, documentation, and planning artifacts; no new service/adapter/repository/handler overlaps an existing domain capability.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Sidebar create-worktree affordance + supporting docs | None | — | No reinvention finding |

### E.4) Testing & Evidence

**Coverage confidence**: 36%

Observed verification status:
- `just lint` failed because Biome wants sorted imports in `/Users/jordanknight/substrate/069-new-worktree/test/unit/web/components/new-worktree-form.test.tsx:15-16`.
- `just typecheck` passed (`TYPECHECK_EXIT=0`).
- `just test` passed (`TEST_EXIT=0`).
- `just build` failed (`BUILD_EXIT=1`) because `new-worktree-form.tsx:18-21` imports `workspace-actions` through a non-existent relative path.
- `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/execution.log.md` does not exist, so there is no recorded manual/browser evidence for T002/T005.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 8 | `apps/web/src/components/dashboard-sidebar.tsx:164-180` adds the plus button only when `!isCollapsed`; `apps/web/src/components/workspaces/workspace-nav.tsx:128-144` still renders only a `/workspaces` folder icon in collapsed mode. `tasks.md:71-75,83-85` and the docs also describe expanded-only behavior, which conflicts with the authoritative plan. |
| AC2 | 56 | `apps/web/app/actions/workspace-actions.ts:680-682` builds the `/browser?worktree=...` redirect, `apps/web/src/components/workspaces/new-worktree-form.tsx:71-76` hard-navigates via `window.location.assign`, and `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx:48-62` resolves `?worktree=`. No execution log or browser evidence proves the sidebar remount/result in practice. |
| AC3 | 93 | `docs/how/workspaces/3-web-ui.md:25-147` now documents the create flow and bootstrap-hook contract, and `README.md:254-260` adds a discoverability pointer. |

### E.5) Doctrine Compliance

- **F006 (MEDIUM)** — `tasks.md:71-75` and `tasks.fltplan.md:45-49,55-59` omit constitution-required `just typecheck` and `just build` from the phase's final-verification checklist.
- The project rules also prefer centralized route construction through `_platform/workspace-url`; the new sidebar link currently hardcodes `/workspaces/${workspaceSlug}/new-worktree` even though `dashboard-sidebar.tsx` already imports `workspaceHref`. This is a low-priority cleanup item to fold into the collapsed-entrypoint fix rather than a separate blocking finding.

### E.6) Harness Live Validation

N/A — no harness configured (`docs/project-rules/harness.md` does not exist).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | The Worktrees plus action is available in both expanded and collapsed sidebar states while inside a workspace. | Expanded-state button exists in `dashboard-sidebar.tsx:164-180`; collapsed-state fallback is still missing in `workspace-nav.tsx:128-144`, and the phase docs were narrowed to expanded-only. | 8 |
| AC2 | Successful creation hard-navigates to `/workspaces/[slug]/browser?worktree=<new-path>` and the sidebar remounts with the new worktree visible. | Redirect target is built in `workspace-actions.ts:680-682`, consumed in `new-worktree-form.tsx:71-76`, and read by `browser/page.tsx:48-62`; no manual/browser evidence proves the remount result. | 56 |
| AC3 | The shipped docs explain both the in-product flow and the repo-owned bootstrap hook. | `docs/how/workspaces/3-web-ui.md:25-147` plus `README.md:254-260`. | 93 |

**Overall coverage confidence**: 36%

## G) Commands Executed

```bash
git -C /Users/jordanknight/substrate/069-new-worktree --no-pager diff --stat
git -C /Users/jordanknight/substrate/069-new-worktree --no-pager diff --staged --stat
git -C /Users/jordanknight/substrate/069-new-worktree --no-pager log --oneline -12
git -C /Users/jordanknight/substrate/069-new-worktree --no-pager diff 5d88a112..HEAD > /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/reviews/_computed.diff
git -C /Users/jordanknight/substrate/069-new-worktree --no-pager diff --name-status 5d88a112..HEAD
git -C /Users/jordanknight/substrate/069-new-worktree --no-pager diff --stat 5d88a112..HEAD
git -C /Users/jordanknight/substrate/069-new-worktree --no-pager diff 5d88a112..HEAD -- README.md apps/web/src/components/dashboard-sidebar.tsx docs/domains/workspace/domain.md docs/how/workspaces/3-web-ui.md docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.fltplan.md docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md docs/plans/069-new-worktree/workshops/005-worktree-integration-testing-patterns.md
cd /Users/jordanknight/substrate/069-new-worktree && just lint
cd /Users/jordanknight/substrate/069-new-worktree && just typecheck
cd /Users/jordanknight/substrate/069-new-worktree && just test
cd /Users/jordanknight/substrate/069-new-worktree && just build
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
**Spec**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
**Phase**: Phase 4: Compose Navigation and Landing
**Tasks dossier**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md
**Execution log**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/execution.log.md _(missing)_
**Review file**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/reviews/review.phase-4-compose-navigation-and-landing.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/substrate/069-new-worktree/README.md` | Modified | workspace | Keep the discoverability link; update only if collapsed-state behavior wording changes. |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/dashboard-sidebar.tsx` | Modified | workspace | Add a collapsed-state create-worktree affordance and keep route construction aligned with workspace URL helpers. |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/workspace-nav.tsx` | Reviewed (unchanged) | workspace | Add the collapsed-state fallback surface expected by the Phase 4 plan, or explicitly reconcile that scope. |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx` | Reviewed (unchanged) | workspace | Fix the broken `workspace-actions` import so `just build` passes. |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/actions/workspace-actions.ts` | Reviewed (unchanged) | workspace | Keep the existing `/browser?worktree=...` redirect; no functional change required. |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` | Reviewed (unchanged) | file-browser | No code change required; keep as canonical landing surface. |
| `/Users/jordanknight/substrate/069-new-worktree/docs/how/workspaces/3-web-ui.md` | Modified | workspace | Align the entrypoint description with the final collapsed/expanded behavior after the fix. |
| `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` | Modified | workspace | Expand source/composition coverage beyond the history row. |
| `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md` | Reviewed (unchanged) | workspace | Refresh the workspace node label and health-summary row. |
| `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md` | Added | plan-artifact | Synchronize D2/T001/T005 wording with the final implementation and required gates. |
| `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.fltplan.md` | Added | plan-artifact | Synchronize Stage 1/Stage 5 wording with the final implementation and required gates. |
| `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/workshops/005-worktree-integration-testing-patterns.md` | Added | plan-artifact | No immediate code fix required; keep only if the phase/task artifacts continue to reference it. |
| `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/execution.log.md` | Missing | plan-artifact | Add command output and manual/browser evidence before re-review. |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/dashboard-sidebar.tsx` + `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/workspace-nav.tsx` + `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md` + `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.fltplan.md` + `/Users/jordanknight/substrate/069-new-worktree/docs/how/workspaces/3-web-ui.md` | Restore the collapsed-sidebar create-worktree reachability promised by the authoritative plan/spec, then align the phase artifacts/docs to that behavior. | Phase 4 currently fails AC1/F001. |
| 2 | `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx` | Fix the broken relative import to `workspace-actions` and rerun `just build`. | The feature does not currently build (F002). |
| 3 | `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/execution.log.md` | Add exact outputs for `just lint`, `just typecheck`, `just test`, and `just build`, plus manual/browser evidence for success, blocking, and bootstrap-warning flows. | The phase has no reproducible verification evidence (F003). |
| 4 | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` + `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md` | Bring workspace domain docs/map fully current with the Phase 4 composition surface and public contracts. | Domain sync remains incomplete (F004/F005). |
| 5 | `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md` + `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.fltplan.md` | Update the documented final-verification checklist to require all constitution-mandated merge gates. | The phase dossier under-specifies verification (F006). |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` | Add `dashboard-sidebar.tsx` to the source inventory/composition notes for workspace navigation. |
| `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md` | Refresh the workspace node label and health-summary row to match the current contract surface. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md --phase 'Phase 4: Compose Navigation and Landing'
