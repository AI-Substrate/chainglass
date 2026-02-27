# Code Review: Phase 4: React Integration

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
**Phase**: Phase 4: React Integration
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD (declared in spec; observed evidence is Hybrid)

## A) Verdict

**REQUEST_CHANGES**

High-severity AC drift remains unresolved: AC-31 is still required by spec/plan, but Phase 4 implementation and phase docs mark it as dropped.

**Key failure areas**:
- **Implementation**: Provider bootstrap behavior conflicts with the authoritative AC set (AC-31).
- **Domain compliance**: Cross-domain consumption bypasses contract barrels in two places.
- **Reinvention**: No major duplication, but one new test helper overlaps existing contract helper.
- **Testing**: Full-TDD RED→GREEN evidence is not captured; AC-30 singleton behavior is only partially evidenced.
- **Doctrine**: Two new tests miss required Test Doc blocks.

## B) Summary

Phase 4 delivered the expected React integration artifacts (hooks, provider, barrel, provider mount, and hook tests), and no material correctness/security/performance defects were found in the runtime hook logic itself. Domain map and registry are current for `_platform/state`, but contract-boundary imports and domain doc currency need correction. The primary blocker is AC-31 inconsistency across implementation vs spec/plan artifacts, which makes completion status non-deterministic. Testing evidence is substantial for AC-27/28/29/32, but TDD process evidence and AC-30 singleton proof need tightening.

## C) Checklist

**Testing Approach: Full TDD (declared)**

- [ ] RED→GREEN evidence captured per task with concrete command output
- [x] Core validation tests present for hook behavior (AC-27/28/29/32)
- [ ] Provider singleton behavior (AC-30) explicitly validated with re-render proof

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not evidenced in phase artifacts)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-provider.tsx:9,34-37; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md:166; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md:220,230 | scope/error-handling | AC-31 is implemented as dropped/fail-fast in code and phase docs, but still required in authoritative spec/plan acceptance criteria. | Reconcile AC source of truth: either implement AC-31 fallback + tests, or remove AC-31 from authoritative spec/plan artifacts. |
| F002 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/components/providers.tsx:19 | domain/contract-imports | Cross-domain consumer imports provider from internal file (`../lib/state/state-provider`) instead of public barrel. | Import from `../lib/state` contract barrel. |
| F003 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:18 | domain/contract-imports | Test imports fake via deep package source path (`../../../../packages/shared/src/fakes/fake-state-system`). | Import `FakeGlobalStateSystem` from `@chainglass/shared/fakes`. |
| F004 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md:84 | domain/domain-md | Domain doc still contains stale note that Phase 4 hooks/provider are not yet created. | Remove stale note and keep Source Location/Contracts fully current. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/execution.log.md:9-54 | testing/process | Full-TDD is declared, but execution log records summary outcomes without auditable RED→GREEN command evidence. | Add concrete failing-first and passing command output (or CI evidence) per task. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:50-64 | testing/coverage | AC-30 “creates system once per mount/re-render” is not directly asserted in tests. | Add provider-level singleton initialization test with re-render assertions. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:131-136,186-189 | doctrine | Two tests omit required 5-field Test Doc blocks (R-TEST-002). | Add complete Test Doc comments for both tests. |
| F008 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md:49-83 | scope/traceability | Changed plan/task artifacts are not explicitly represented in Domain Manifest or an exemption rule. | Add explicit docs/plans artifact exemption or map these files for deterministic orphan checks. |
| F009 | LOW | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:20-30; /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts:18 | reinvention | New `registerTestDomain` helper duplicates existing contract helper concept. | Reuse/extract shared helper to reduce drift across test suites. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Phase behavior and authoritative acceptance criteria diverge on bootstrap fallback semantics (AC-31).
- Runtime hook/provider logic otherwise follows expected patterns (`useSyncExternalStore`, stable callbacks, provider context guard).
- No material security or unbounded performance concerns were identified in changed runtime code.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files are under expected `_platform/state` paths (`apps/web/src/lib/state/*`, `test/unit/web/state/*`). |
| Contract-only imports | ❌ | **F002, F003**: internal-file and deep-source imports bypass public contract surfaces. |
| Dependency direction | ✅ | No infrastructure → business reversal introduced by phase files. |
| Domain.md updated | ❌ | **F004**: stale Source Location note conflicts with Phase 4 reality. |
| Registry current | ✅ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md` includes `_platform/state`. |
| No orphan files | ❌ | **F008**: docs/plans artifacts in phase diff are not explicitly mapped/exempted. |
| Map nodes current | ✅ | Domain map includes `_platform/state` node and current contract list. |
| Map edges current | ✅ | State-related edges are present and labeled with contracts (no unlabeled edges found). |
| No circular business deps | ✅ | No business→business cycle introduced by this phase. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| GlobalStateProvider + useStateSystem | SDKProvider context/provider pattern | `_platform/sdk` | ✅ Proceed (pattern reuse, not duplication) |
| useGlobalState | useSDKSetting subscription pattern | `_platform/sdk` | ✅ Proceed (intentional composition) |
| useGlobalStateList | useSDKSetting + existing hook subscription idioms | `_platform/sdk` | ✅ Proceed |
| state barrel exports | Existing feature barrel pattern | file-browser | ✅ Proceed |
| registerTestDomain helper (hook tests) | `registerTestDomain()` in state contract tests | `_platform/state` | ⚠️ Extend/reuse recommended (F009) |

### E.4) Testing & Evidence

**Coverage confidence**: 71%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-27 | 90% | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/use-global-state.ts` + tests at `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:96-129` |
| AC-28 | 93% | Dedicated default-value test at `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:82-94` |
| AC-29 | 89% | Pattern-list hook implementation + tests at `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:154-189` |
| AC-30 | 61% | Provider uses `useState(() => new GlobalStateSystem())`, but no explicit re-render singleton assertion in tests (`F006`). |
| AC-31 | 5% | Spec/plan still require graceful no-op fallback; implementation/phase artifacts record AC drop (`F001`). |
| AC-32 | 96% | Outside-provider throw is directly asserted at `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:37-48` |

### E.5) Doctrine Compliance

- **F007 (MEDIUM)**: Missing Test Doc blocks violate `R-TEST-002` in `/Users/jordanknight/substrate/chainglass-048/docs/project-rules/rules.md`.
- No additional architecture-boundary violations beyond the contract-import issues captured in **F002/F003**.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-27 | `useGlobalState` returns value and re-renders on change | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:96-129` | 90% |
| AC-28 | `useGlobalState` default when unpublished | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:82-94` | 93% |
| AC-29 | `useGlobalStateList` returns matches and re-renders | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:154-189` | 89% |
| AC-30 | Provider creates system once | Implementation intent at `/Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-provider.tsx:35`; no explicit singleton test (`F006`) | 61% |
| AC-31 | Graceful bootstrap fallback | Spec requires fallback at `/Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md:166`; implementation drops it (`F001`) | 5% |
| AC-32 | `useStateSystem` throws outside provider | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx:37-48` | 96% |

**Overall coverage confidence**: **71%**

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -20
git --no-pager log --oneline -5 -- apps/web/src/lib/state/use-global-state.ts
git --no-pager log --oneline -5 -- apps/web/src/lib/state/use-global-state-list.ts
git --no-pager log --oneline -5 -- apps/web/src/lib/state/state-provider.tsx
git --no-pager log --oneline -5 -- apps/web/src/lib/state/index.ts
git --no-pager log --oneline -5 -- apps/web/src/components/providers.tsx
git --no-pager log --oneline -5 -- test/unit/web/state/use-global-state.test.tsx
git --no-pager diff e8aaaa6..556b9e4 > /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_computed.diff
git --no-pager diff --name-status e8aaaa6..556b9e4

# Subagent reviews (Task tool, parallel x5):
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

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
**Phase**: Phase 4: React Integration
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/review.phase-4-react-integration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/components/providers.tsx | Modified | `_platform/state` (cross-domain mount) | Yes (F002) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/index.ts | Created | `_platform/state` | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-provider.tsx | Created | `_platform/state` | Yes (F001) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/use-global-state-list.ts | Created | `_platform/state` | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/use-global-state.ts | Created | `_platform/state` | No |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | Modified | `_platform/state` | Yes (F004) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md | Modified | plan artifact | Yes (F001, F008) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/execution.log.md | Created | plan artifact | Yes (F005) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.fltplan.md | Modified | plan artifact | Yes (F001) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.md | Modified | plan artifact | Yes (F001) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx | Created | `_platform/state` | Yes (F003, F006, F007, F009) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-provider.tsx; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.md; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.fltplan.md | Reconcile AC-31 requirement vs implementation behavior | Resolve blocking acceptance-criteria drift (F001) |
| 2 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/components/providers.tsx | Import provider via state contract barrel | Enforce contract-only import boundary (F002) |
| 3 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx | Replace deep fake import with `@chainglass/shared/fakes` | Enforce package boundary contract (F003) |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | Remove stale Phase 4 “not yet created” note | Keep domain docs current and unambiguous (F004) |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/execution.log.md | Add concrete RED/GREEN evidence output | Align with Full TDD evidence expectations (F005) |
| 6 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx | Add AC-30 singleton initialization assertion | Raise AC-30 confidence and close evidence gap (F006) |
| 7 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx | Add Test Doc blocks to two tests | Satisfy doctrine rule R-TEST-002 (F007) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md | AC-31 alignment with implemented behavior (or implement AC-31 in code/tests) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md | Phase 4 AC list/progress alignment with AC-31 decision; optional docs/plans artifact-mapping policy |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.md | Remove internal contradiction where no-op fallback is simultaneously goal and dropped |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.fltplan.md | Align acceptance checklist with final AC decision for provider bootstrap behavior |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | Remove stale source-location note and keep source narrative internally consistent |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md --phase 'Phase 4: React Integration'
