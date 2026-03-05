# Code Review: Phase 4: Cross-Worktree & Left Menu

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
**Phase**: Phase 4: Cross-Worktree & Left Menu
**Date**: 2026-03-02
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Unmitigated HIGH findings remain in correctness, domain boundaries, and acceptance-criteria verification evidence.

**Key failure areas**:
- **Implementation**: Cross-worktree badge aggregation includes non-agent work units, so activity dots can be false-positive for AC-29.
- **Domain compliance**: `_platform/panel-layout` files import `agents` internals and introduce infra → business dependency direction violations.
- **Reinvention**: New endpoint re-implements work-unit-state disk-read patterns instead of extending shared capability.
- **Testing**: AC-29/AC-30/AC-31 lack direct automated assertions and evidence remains mostly declarative.
- **Doctrine**: Unit/integration tests emit network URL parse + `act(...)` warnings, reducing deterministic signal quality.

## B) Summary

Phase 4 delivers the core surfaces (API route, hook, badge component, navigation wiring), but correctness and boundary issues prevent approval. The highest-risk defect is that badge status is derived from all work units, not just agent-owned entries, which can misrepresent sidebar activity. Domain governance is currently out of compliance: panel-layout code depends on agents internals and domain artifacts are not fully synchronized to the implemented coupling. Testing evidence confirms two modified test files pass, but does not directly verify AC-29/30/31 behavior and still logs reliability warnings. Additional remediation and artifact alignment are required before this phase can be accepted.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid checks:
- [ ] Lightweight checks cover all critical paths for AC-29/AC-30/AC-31
- [ ] Manual verification steps include observed outcomes per AC
- [ ] AC-to-evidence mapping is explicit and reproducible

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/worktree-activity/route.ts:56-63 | correctness | Badge booleans are computed from all work units, not agent-only entries, causing AC-29 false positives. | Filter to `creator.type === 'agent'` before computing `hasQuestions/hasErrors/hasWorking`. |
| F002 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/activity-dot.tsx:15 | domain-compliance | `_platform/panel-layout` component imports `agents` internal hook type via relative path. | Replace with contract/public export and remove internal cross-domain import. |
| F003 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/workspace-nav.tsx:20,69-72 | domain-compliance | Infrastructure (`_platform/panel-layout`) depends on business (`agents`) hook logic. | Invert dependency: keep business hook usage in business domain and pass presentation props into panel-layout. |
| F004 | HIGH | /Users/jordanknight/substrate/059-fix-agents/test/unit/web/components/dashboard-sidebar.test.tsx:40-50; /Users/jordanknight/substrate/059-fix-agents/test/integration/web/dashboard-navigation.test.tsx:48-55 | testing | No direct assertions for AC-29/AC-30/AC-31; changed tests only validate shell/nav behaviors. | Add targeted tests for badge rendering states, current-worktree exclusion, and badge-click navigation destination. |
| F005 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/worktree-activity/route.ts:44-50,84-100 | performance | Endpoint uses sync fs I/O + repeated workspace info enumeration on polling path. | Move to async fs reads and memoize/short-cache validated worktree paths. |
| F006 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/activity-dot.tsx:1-75 | domain-compliance | File is classified under `_platform/panel-layout` but not under documented panel-layout source tree. | Re-home file into domain source tree or update domain ownership/source location explicitly. |
| F007 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md:72-129; /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md:162-260; /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md:71-128 | domain-compliance | Domain docs/map are partially updated; new coupling and endpoint composition details are incomplete/stale. | Update composition/source/dependency sections and domain-map edges/health summary to match implementation. |
| F008 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md:60-69 | scope | Domain Manifest still lists stale/missing Phase 4 paths (e.g., `dashboard-sidebar.tsx`, old hook name). | Sync manifest rows to actual staged files (`workspace-nav.tsx`, `use-worktree-activity.ts`, related tests). |
| F009 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/workspace-nav.tsx:84-100; /Users/jordanknight/substrate/059-fix-agents/test/unit/web/components/dashboard-sidebar.test.tsx:40-50 | doctrine | Test runs pass but emit URL parse + `act(...)` warnings from unmocked fetch path. | Make tests deterministic: fake/mocked fetch data and await async updates cleanly. |
| F010 | LOW | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/worktree-activity/route.ts:44-53 | reinvention | New route duplicates disk-hydration capability already present in WorkUnitStateService implementation patterns. | Extend/reuse shared work-unit-state file-read utility to avoid drift. |
| F011 | LOW | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-4-cross-worktree-left-menu/tasks.fltplan.md:6,102-107 | doctrine | `Status: Landed` while AC-29/AC-30/AC-31 remain unchecked. | Align acceptance checklist status with claimed phase completion. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH, correctness)**: `/api/worktree-activity` computes badge booleans from all entries (`waiting_input`, `error`, `working`), but AC-29 is specifically about **agents**. Non-agent entries can incorrectly light badges.
- **F005 (MEDIUM, performance)**: Polling endpoint uses `existsSync`/`readFileSync` and re-fetches workspace metadata (`list` + `getInfo`) per request; this is avoidable server load.
- **F008 (MEDIUM, scope)**: Phase artifact mapping in plan manifest diverges from actual files touched this phase.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | `activity-dot.tsx` classification vs documented `_platform/panel-layout` source tree is inconsistent. |
| Contract-only imports | ❌ | `activity-dot.tsx` imports `WorktreeActivity` from `../../hooks/use-worktree-activity` (agents internal path). |
| Dependency direction | ❌ | `workspace-nav.tsx` in panel-layout consumes `useWorktreeActivity` from agents (infra → business). |
| Domain.md updated | ❌ | `agents/domain.md` and `work-unit-state/domain.md` history updated, but composition/source/dependency details remain incomplete for this phase. |
| Registry current | ✅ | `docs/domains/registry.md` includes relevant domains and remains current. |
| No orphan files | ❌ | Manifest missing/incorrect mappings for staged files (workspace-nav + tests; stale row names). |
| Map nodes current | ✅ | Nodes for involved domains already exist. |
| Map edges current | ❌ | New/actual coupling for this phase not fully reflected in domain map relationships/health summary. |
| No circular business deps | ✅ | No new business↔business cycle detected from staged changes. |
| Concepts documented | ✅ | `agents` and `work-unit-state` include § Concepts tables. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Cross-worktree activity summary API (`/api/worktree-activity`) | `WorkUnitStateService` persistence reader patterns (`loadFromDisk` / `work-unit-state.json`) | work-unit-state | ⚠️ Extend existing capability |
| Worktree activity badge UI (`ActivityDot`) | Existing status visual mappings in `agent-chip.tsx` / `agent-status-indicator.tsx` | agents | ℹ️ Optional shared mapping |
| Cross-worktree polling hook (`use-worktree-activity`) | None | None | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 27%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-29 | 31 | Tasks/execution log claim badge rendering in both nav modes, but changed tests do not assert badge visibility/state mapping. |
| AC-30 | 24 | Implementation passes `excludeWorktree`, but no direct automated assertion verifies current-worktree suppression vs other-worktree display. |
| AC-31 | 18 | Badge link is implemented, but no direct test asserts click destination to `/workspaces/[slug]/agents?worktree=...`. |

Additional evidence note:
- `npx vitest run test/unit/web/components/dashboard-sidebar.test.tsx test/integration/web/dashboard-navigation.test.tsx` passes (7/7) but emits `Failed to parse URL from /api/workspaces?include=worktrees` and React `act(...)` warnings.

### E.5) Doctrine Compliance

- **R-TEST-005 (MEDIUM)**: Unit/integration tests are not fully deterministic due to unhandled network fetch behavior in jsdom context.
- **Constitution §4.3 DoD alignment (LOW)**: Flight plan status/checklist mismatch (`Landed` while ACs remain unchecked).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-29 | Left menu worktree entries show activity badges (questions/errors/working) sourced from cross-worktree state | Implementation exists in `activity-dot.tsx` + `workspace-nav.tsx`; no direct assertion in changed tests; execution log is declarative. | 31 |
| AC-30 | Badges only appear for OTHER worktrees | `use-worktree-activity.ts` has `excludeWorktree` filtering; no direct test for exclusion behavior in either nav mode. | 24 |
| AC-31 | Clicking badge navigates to that worktree's agent page | `ActivityDot` link target is present; no direct click-navigation assertion in changed tests. | 18 |

**Overall coverage confidence**: 27%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager diff > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_unstaged.diff.tmp
git --no-pager diff --staged > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_staged.diff.tmp
git --no-pager diff --name-status
git --no-pager diff --staged --name-status
npx vitest run test/unit/web/components/dashboard-sidebar.test.tsx test/integration/web/dashboard-navigation.test.tsx
# Parallel subagents launched: implementation quality, domain compliance, anti-reinvention, testing evidence, doctrine validation
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
**Phase**: Phase 4: Cross-Worktree & Left Menu
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-4-cross-worktree-left-menu/tasks.md
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-4-cross-worktree-left-menu/execution.log.md
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/review.phase-4-cross-worktree-left-menu.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/worktree-activity/route.ts | Added | work-unit-state | Yes (F001, F005, F010) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/activity-dot.tsx | Added | _platform/panel-layout (declared) | Yes (F002, F006) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/workspace-nav.tsx | Modified | _platform/panel-layout (declared) | Yes (F003, F009) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/use-worktree-activity.ts | Added | agents | Optional (verify contract boundary after F003) |
| /Users/jordanknight/substrate/059-fix-agents/test/unit/web/components/dashboard-sidebar.test.tsx | Modified | test | Yes (F004, F009) |
| /Users/jordanknight/substrate/059-fix-agents/test/integration/web/dashboard-navigation.test.tsx | Modified | test | Yes (F004, F009) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md | Modified | docs/domains | Yes (F007) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md | Modified | docs/domains | Yes (F007) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Existing (reviewed) | docs/domains | Yes (F007) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Modified | docs/plans | Yes (F008) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-4-cross-worktree-left-menu/tasks.fltplan.md | Modified | docs/plans | Yes (F011) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-4-cross-worktree-left-menu/tasks.md | Modified | docs/plans | Verify AC status sync |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/worktree-activity/route.ts | Compute badge booleans from agent-only entries; keep `agentCount` aligned | AC-29 correctness currently fails with non-agent entries |
| 2 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/activity-dot.tsx; /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/workspace-nav.tsx | Remove infra→business coupling and internal cross-domain imports | Violates domain contract/import and dependency-direction rules |
| 3 | /Users/jordanknight/substrate/059-fix-agents/test/unit/web/components/dashboard-sidebar.test.tsx; /Users/jordanknight/substrate/059-fix-agents/test/integration/web/dashboard-navigation.test.tsx | Add direct AC-29/30/31 assertions and deterministic fetch handling | Coverage confidence is low and reliability warnings persist |
| 4 | /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md; /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md; /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md; /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Sync domain docs/map/manifest to implemented Phase 4 boundaries | Domain governance artifacts are stale/incomplete |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md | Composition/source details for `use-worktree-activity` and sidebar coupling decisions |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md | Composition/source/dependency detail for `/api/worktree-activity` endpoint |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Updated edge/contract labeling to reflect actual Phase 4 dependencies (or refactor to remove coupling) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Domain Manifest row corrections for Phase 4 file set |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md --phase 'Phase 4: Cross-Worktree & Left Menu'
