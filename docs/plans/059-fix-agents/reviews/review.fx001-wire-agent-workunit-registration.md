# Code Review: FX001: Wire Agent Lifecycle into WorkUnitStateService

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
**Phase**: FX001: Wire Agent Lifecycle into WorkUnitStateService
**Date**: 2026-03-03
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Unmitigated HIGH findings remain in error handling and verification coverage for the core FX001 wiring path.

**Key failure areas**:
- **Implementation**: Bridge integration errors are swallowed in multiple paths, so status-sync failures can recur silently.
- **Domain compliance**: Domain artifacts are not fully current for this fix scope (history + manifest traceability drift).
- **Testing**: No direct route-level assertions prove POST/DELETE now register/unregister in WorkUnitStateService.
- **Doctrine**: A service now depends on a concrete bridge type instead of an interface contract.

## B) Summary

FX001 correctly adds the intended integration points (POST register, DELETE unregister, notifier status update, DI lazy bridge resolver), and anti-reinvention checks found no duplicate capability. However, each new bridge call path is wrapped in broad catch blocks without logging or propagation, which can hide failures and recreate the original “empty work-unit-state” symptom. Targeted test runs pass (72 tests total), but they do not directly validate route-to-bridge behavior, so acceptance confidence remains partial for the most important lifecycle transitions. Domain registry/map remain broadly aligned, but agents domain history and plan manifest traceability are not fully synchronized to this fix dossier.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid checks:
- [ ] Lightweight checks cover all critical FX001 route/notifier bridge paths
- [ ] Manual verification records observed outcomes for create/run/stop/delete lifecycle effects
- [ ] AC-to-evidence mapping is explicit and reproducible

Universal (all approaches):
- [x] Only in-scope files changed (per scoped manifest)
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts:152-159; /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/[id]/route.ts:141-148; /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts:82-89; /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts:389-396 | error-handling | New bridge wiring swallows all errors silently across POST/DELETE/notifier/DI lazy resolver. | Replace empty catches with structured logging and explicit failure handling where consistency is required. |
| F002 | HIGH | /Users/jordanknight/substrate/059-fix-agents/test/integration/agent-api.integration.test.ts:1-374; /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.log.md:1-25 | testing | No direct automated assertions validate POST/DELETE bridge registration lifecycle in real route flow. | Add targeted integration tests asserting register/unregister/status mapping effects in WorkUnitStateService. |
| F003 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts:27,63 | doctrine | AgentNotifierService now depends on concrete `AgentWorkUnitBridge` type, conflicting with interface-first dependency guidance. | Introduce/use an interface contract for bridge operations and type against that contract in service constructors. |
| F004 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.md:20,37,49 | correctness | Fix dossier “Proposed Fix” still says `broadcastIntent()` updates status, but task implementation explicitly excludes it. | Align Proposed Fix text with actual decision: `broadcastStatus()` only. |
| F005 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md:171,247-261; /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md:25-70 | domain-compliance | Domain history/manifest traceability does not fully reflect FX001 touched files and integration update. | Update agents domain history/composition and sync manifest mapping (or document explicit exclusions for fix artifacts). |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH, error-handling)**: Silent catches in the newly added bridge paths make failures invisible and hard to diagnose. Because the user-reported bug is specifically missing WorkUnitState registration, this creates direct regression risk.
- **F004 (MEDIUM, correctness/documentation)**: The fix dossier has an internal contradiction (`broadcastIntent` vs “status only” decision), reducing implementation clarity for follow-up agents.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | Source changes remain under expected `agents` domain paths. |
| Contract-only imports | ✅ | No cross-domain internal import violations were introduced in the scoped FX001 diff. |
| Dependency direction | ✅ | No new business→infrastructure or business→business direction violations introduced by FX001 scope. |
| Domain.md updated | ❌ | `docs/domains/agents/domain.md` history/composition not updated to reflect FX001 registration wiring change. |
| Registry current | ✅ | `docs/domains/registry.md` includes `agents` and `work-unit-state`. |
| No orphan files | ❌ | Plan Domain Manifest does not fully trace the scoped FX001 changed set (notifier + fix artifacts). |
| Map nodes current | ✅ | Domain map includes all touched domains/nodes. |
| Map edges current | ✅ | Existing map edges already represent agents→work-unit-state dependency. |
| No circular business deps | ✅ | No new business cycle identified from scoped changes. |
| Concepts documented | ✅ | `agents` and `work-unit-state` domain docs include Concepts tables. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| POST/DELETE route bridge hooks | None | None | ✅ proceed |
| Notifier status→work-unit mapping integration | None | None | ✅ proceed |
| DI lazy bridge resolver | None | None | ✅ proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 64%

| AC | Confidence | Evidence |
|----|------------|----------|
| FX001-AC1: Agent creation writes entry | 62 | `POST /api/agents` now calls `bridge.registerAgent(...)`; no direct route-level assertion of persisted entry. |
| FX001-AC2: Running agent updates `working` | 70 | `broadcastStatus()` now maps and calls `bridge.updateAgentStatus(...)`; bridge unit tests validate status update behavior. |
| FX001-AC3: Agent completion updates `idle` | 63 | Mapping `stopped -> idle` implemented; no end-to-end route/notifier assertion for complete lifecycle. |
| FX001-AC4: Agent deletion removes entry | 62 | `DELETE /api/agents/[id]` now calls `bridge.unregisterAgent(...)`; no direct route-level assertion of removal. |
| FX001-AC5: Sidebar badges show activity | 40 | Indirectly enabled by wiring, but no direct verification artifact in FX001 dossier/log. |
| FX001-AC6: Existing tests pass | 85 | Review run: notifier contract+integration+agent-api integration (60 tests) and bridge unit tests (12 tests) passed. |

### E.5) Doctrine Compliance

- **F003 (MEDIUM, R-ARCH-001)**: `AgentNotifierService` imports/types against concrete `AgentWorkUnitBridge`; rules/architecture docs require service-layer dependencies to flow through interfaces/contracts.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| FX001-AC1 | Creating an agent via UI writes an entry to `work-unit-state.json` | Route wiring exists in `/api/agents` POST (`bridge.registerAgent`), but direct route assertion/evidence is missing. | 62 |
| FX001-AC2 | Running an agent updates status to `working` | Notifier now calls bridge on `broadcastStatus`; bridge update path is covered by bridge unit tests. | 70 |
| FX001-AC3 | Agent completing run updates status to `idle` | Status map in notifier sets `stopped -> idle`; no explicit lifecycle test validates final persisted state. | 63 |
| FX001-AC4 | Deleting an agent removes entry | Route wiring exists in `/api/agents/[id]` DELETE (`bridge.unregisterAgent`), but no direct route assertion/evidence. | 62 |
| FX001-AC5 | Sidebar badges show activity for other worktrees | Dependency path is wired indirectly; no explicit FX001 artifact verifies UI-level effect. | 40 |
| FX001-AC6 | Existing tests still pass | Review execution ran targeted suites: 72/72 tests passed. | 85 |

**Overall coverage confidence**: 64%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -20
git --no-pager diff c80cc6c -- apps/web/app/api/agents/route.ts apps/web/app/api/agents/[id]/route.ts apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts apps/web/src/lib/di-container.ts docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.md docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.log.md docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.fltplan.md > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_computed.diff
git --no-pager diff --name-status c80cc6c -- apps/web/app/api/agents/route.ts apps/web/app/api/agents/[id]/route.ts apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts apps/web/src/lib/di-container.ts docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.md docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.log.md docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.fltplan.md > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_manifest.tsv
pnpm vitest --run test/contracts/agent-notifier.contract.test.ts test/integration/agent-notifier.integration.test.ts test/integration/agent-api.integration.test.ts
pnpm vitest --run test/unit/web/work-unit-state/agent-work-unit-bridge.test.ts
# Parallel subagents launched: implementation quality, domain compliance, anti-reinvention, testing evidence, doctrine validation
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
**Phase**: FX001: Wire Agent Lifecycle into WorkUnitStateService
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.md
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.log.md
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/review.fx001-wire-agent-workunit-registration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts | Modified | agents | Yes (F001, F002) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/[id]/route.ts | Modified | agents | Yes (F001, F002) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts | Modified | agents | Yes (F001, F003) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts | Modified | agents (composition) | Yes (F001) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.md | Added | docs/plans | Yes (F004) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.log.md | Added | docs/plans | Yes (F002 evidence detail) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.fltplan.md | Added | docs/plans | No (informational) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts; /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/[id]/route.ts; /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts; /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts | Remove silent catch behavior; add explicit logging/handling for bridge failures | Silent failure can mask recurrence of the original bug (empty work-unit-state). |
| 2 | /Users/jordanknight/substrate/059-fix-agents/test/integration/agent-api.integration.test.ts (or equivalent route-level suite) | Add direct assertions for POST register + DELETE unregister + notifier status mapping | Critical FX001 lifecycle behavior is not directly verified. |
| 3 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts (plus shared contracts) | Replace concrete bridge typing with interface contract typing | Align with dependency direction/interface-first doctrine. |
| 4 | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.md | Correct Proposed Fix text to match implemented decision (status-only update in `broadcastStatus`) | Current fix dossier contains contradictory guidance. |
| 5 | /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md; /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Update history/manifest traceability for FX001 touched files | Domain compliance/reporting artifacts are stale for this fix scope. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md | FX001 history note and composition detail for notifier/route bridge wiring |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Domain Manifest coverage (or explicit exclusion note) for FX001 scoped changed files |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md --phase 'FX001: Wire Agent Lifecycle into WorkUnitStateService'
