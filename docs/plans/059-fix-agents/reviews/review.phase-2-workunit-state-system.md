# Code Review: Phase 2: WorkUnit State System

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
**Phase**: Phase 2: WorkUnit State System
**Date**: 2026-03-02
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase output is substantial, but blocking issues remain in runtime bridge wiring, spec/task alignment, and doctrine compliance.

**Key failure areas**:
- **Implementation**: AgentWorkUnitBridge exists but is not wired into production lifecycle, so AC-15 behavior is not guaranteed at runtime.
- **Domain compliance**: Domain manifest and agents domain history/dependency docs are out of date relative to touched files and new dependencies.
- **Testing**: Spec-to-implementation drift and missing real-implementation persistence/hydration assertions reduce confidence.
- **Doctrine**: New service introduces direct external I/O imports in the service layer; new tests miss required Test Doc format.

## B) Summary

The phase introduces a coherent WorkUnit State design (interface, fake, real service, route descriptor, bridge, and tests), and anti-reinvention checks found no genuine duplication requiring rollback. However, runtime integration is incomplete: `AgentWorkUnitBridge` is implemented and tested, but production wiring is absent in the DI/lifecycle path. Documentation and governance artifacts drifted from the actual implementation, especially domain manifest coverage and agents domain currency. Testing evidence is good for conformance volume, but confidence is reduced by spec drift and missing targeted assertions for real persistence/route behavior.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present (contract + bridge suites)
- [ ] Acceptance criteria fully aligned with current implemented contract
- [ ] Real persistence + SSE-route mapping explicitly verified in tests/evidence

Universal (all approaches):
- [x] Only in-scope files changed (phase commit range)
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts:526-548 | scope | AgentWorkUnitBridge is not instantiated/wired in production lifecycle despite Phase 2 requirements. | Register/inject bridge and call register/update/unregister from agent lifecycle paths. |
| F002 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md:114-123; /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/interfaces/work-unit-state.interface.ts:44-93 | scope | Spec AC-09/AC-13 still require Q&A-era methods/APIs while implementation is status-only by design. | Reconcile spec/tasks/execution artifacts to one canonical contract (or implement missing APIs). |
| F003 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/work-unit-state/work-unit-state.service.ts:17-18 | pattern | Service layer directly imports `node:fs` and `node:path`, violating documented dependency-direction rules. | Move persistence to adapter/abstraction or formally update doctrine with explicit exception. |
| F004 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts:536-544 | correctness | `IWorkspaceContextResolver` is resolved but unused; persistence path is hardcoded to `process.cwd()`. | Resolve effective worktree path from context resolver before constructing service. |
| F005 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md:27-62 | domain | Phase touched files are not fully represented in `## Domain Manifest` (orphan drift). | Add missing files or documented exclusions so manifest checks are deterministic. |
| F006 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md:234-255 | domain | Agents domain still marks bridge/work-unit-state dependency as future and lacks Phase 2 history update. | Update dependencies/composition/history to reflect delivered Phase 2 behavior. |
| F007 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.test.ts:24-34 | testing | Real implementation tests run conformance only; persistence + hydration expiry behavior is not directly asserted for real service. | Add real-service tests seeded from temp JSON, asserting hydrate+tidyUp+persistence outcomes. |
| F008 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.ts:110-118 | testing | `lastActivityAt` check is weak (truthy only), allowing false-green updates. | Use deterministic timestamp progression and assert actual timestamp change. |
| F009 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.ts:35-279; /Users/jordanknight/substrate/059-fix-agents/test/unit/web/work-unit-state/agent-work-unit-bridge.test.ts:25-168 | doctrine | New tests omit required 5-field Test Doc format from project rules/constitution. | Add Test Doc blocks (Why/Contract/Usage Notes/Quality Contribution/Worked Example). |
| F010 | LOW | /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md:89-90,127 | domain | Map labels/health summary are stale (`Phase 3` tags and missing workflow-events dependency in agents row). | Refresh edge labels and health summary to current-state topology. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `AgentWorkUnitBridge` is created and tested but not wired into production service flow (no DI registration/use at runtime).
- **F004 (MEDIUM)**: Worktree persistence path resolution currently ignores resolved workspace context and can point to wrong CWD.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files are located under expected domain trees. |
| Contract-only imports | ✅ | No cross-domain internal import breach observed in phase diff. |
| Dependency direction | ✅ | No infra→business inversion found in changed imports. |
| Domain.md updated | ❌ | `agents/domain.md` remains partially future-tense for delivered bridge behavior (F006). |
| Registry current | ✅ | `docs/domains/registry.md` contains both `agents` and `work-unit-state`. |
| No orphan files | ❌ | Manifest drift vs touched files in phase diff (F005). |
| Map nodes current | ❌ | Health summary misses current `workflow-events` dependency for `agents` (F010). |
| Map edges current | ❌ | Mermaid edge labels still show outdated `(Phase 3)` markers for delivered links (F010). |
| No circular business deps | ✅ | No new business-domain cycle identified. |
| Concepts documented | ✅ | `work-unit-state/domain.md` includes required Concepts table and entries. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| AgentWorkUnitBridge | None | agents | ✅ proceed |
| workUnitStateRoute | Generic ServerEventRouteDescriptor pattern exists | _platform/state | ℹ️ extend pattern |
| WorkUnitStateService | agent-notifier broadcast patterns (related, not equivalent) | agents | ✅ proceed |
| IWorkUnitStateService + types | IWorkUnitService exists (different responsibility) | _platform/positional-graph | ✅ proceed |
| FakeWorkUnitStateService | FakeStateSystem (related fake style) | _platform/state | ℹ️ extend pattern |

### E.4) Testing & Evidence

**Coverage confidence**: 66%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-09 | 45 | Interface exists, but spec AC text still expects deprecated Q&A methods. |
| AC-10 | 65 | Real service persists + emits and route descriptor exists; explicit end-to-end persistence/route assertions are limited. |
| AC-11 | 72 | tidyUp >24h behavior verified in behavioral tests and service lifecycle calls. |
| AC-12 | 78 | working/waiting_input retention covered in behavioral tests. |
| AC-13 | 35 | Fake exists, but inspection API names differ from spec AC text. |
| AC-14 | 80 | Contract suite runs fake + real conformance; high pass count evidence provided. |
| AC-15 | 88 | Bridge tests validate register/update/unregister + observer status transitions; runtime wiring gap remains (F001). |

### E.5) Doctrine Compliance

- **F003 (HIGH)**: `R-ARCH-001` / architecture dependency-direction conflict in `WorkUnitStateService` external I/O imports.
- **F009 (MEDIUM)**: `R-TEST-002` / constitution §3.2 Test Doc requirement unmet in newly added test suites.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-09 | IWorkUnitStateService includes required methods | Interface exists but differs from spec’s older Q&A contract language | 45 |
| AC-10 | Real service persists JSON + publishes state paths | Service + route descriptor implemented; explicit e2e proof is partial | 65 |
| AC-11 | tidyUp removes stale non-working/non-waiting | Behavioral tests verify stale idle/completed/error removal | 72 |
| AC-12 | working/waiting_input never expire | Behavioral tests verify retention for protected statuses | 78 |
| AC-13 | Fake service with inspection methods | Fake exists with `getRegistered/getRegisteredCount/reset` (drift vs spec text) | 35 |
| AC-14 | Contract parity between fake and real | Shared conformance factory runs for both implementations | 80 |
| AC-15 | Bridge auto-registers and publishes status | Bridge unit tests pass; production lifecycle wiring missing | 88 |

**Overall coverage confidence**: 66%

## G) Commands Executed

```bash
cd /Users/jordanknight/substrate/059-fix-agents

git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10

git rev-parse cf507d5^
git --no-pager diff 2ded85b122c428dff76a97ec0ba65c6f49ab779f..cf507d5 > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_computed.diff
git --no-pager diff --name-status 2ded85b122c428dff76a97ec0ba65c6f49ab779f..cf507d5 > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_manifest.tsv

# 5 parallel subagents:
# - implementation quality reviewer
# - domain compliance validator
# - anti-reinvention checker
# - testing/evidence validator
# - doctrine/rules validator
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
**Phase**: Phase 2: WorkUnit State System
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.md
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/execution.log.md
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/review.phase-2-workunit-state-system.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/059-fix-agents/agent-work-unit-bridge.ts | created | agents | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts | modified | agents (cross-domain) | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/state-connector.tsx | modified | _platform/state | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/work-unit-state-route.ts | created | _platform/state / work-unit-state | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/work-unit-state/index.ts | created | work-unit-state | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/work-unit-state/work-unit-state.service.ts | created | work-unit-state | Yes |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | modified | cross-domain | Yes |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md | modified | work-unit-state | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/how/work-unit-state-integration.md | created | work-unit-state | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/execution.log.md | created | plan-artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.fltplan.md | modified | plan-artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.md | modified | plan-artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/di-tokens.ts | modified | work-unit-state contract | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/fakes/fake-work-unit-state.ts | created | work-unit-state contract | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/fakes/index.ts | modified | work-unit-state contract | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/index.ts | modified | work-unit-state contract | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/interfaces/index.ts | modified | work-unit-state contract | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/interfaces/work-unit-state.interface.ts | created | work-unit-state contract | Yes |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/work-unit-state/index.ts | created | work-unit-state contract | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/work-unit-state/types.ts | created | work-unit-state contract | No |
| /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.test.ts | created | test/contracts | Yes |
| /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.ts | created | test/contracts | Yes |
| /Users/jordanknight/substrate/059-fix-agents/test/unit/web/work-unit-state/agent-work-unit-bridge.test.ts | created | test/unit | Yes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts (and lifecycle entry points) | Wire AgentWorkUnitBridge into production lifecycle | Bridge behavior is not guaranteed in runtime (F001) |
| 2 | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md + phase task artifacts | Reconcile AC/spec text with status-only implementation (or implement missing APIs) | Current ACs and implementation conflict (F002) |
| 3 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/work-unit-state/work-unit-state.service.ts | Move direct filesystem concerns behind adapter/abstraction (or document exception) | Violates architecture dependency rule (F003) |
| 4 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts | Use workspace context resolver to derive persistence path | Prevent wrong-path persistence via `process.cwd()` (F004) |
| 5 | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md + /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md + /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Refresh manifest/history/map to reflect actual changed topology | Domain governance drift (F005/F006/F010) |
| 6 | /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.test.ts + /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.ts + /Users/jordanknight/substrate/059-fix-agents/test/unit/web/work-unit-state/agent-work-unit-bridge.test.ts | Strengthen evidence tests + add required Test Doc blocks | Improve AC confidence and doctrine compliance (F007/F008/F009) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Domain Manifest rows for all touched files in this phase commit |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md | Phase 2 history update + remove stale “Future” dependency wording |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Current edge labels and Health Summary dependency fields for agents/workflow-events |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md | AC-09/AC-13 contract text alignment with delivered status-only model |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md --phase 'Phase 2: WorkUnit State System'
