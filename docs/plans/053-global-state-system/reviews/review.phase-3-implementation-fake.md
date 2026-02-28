# Code Review: Phase 3: Implementation + Fake

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
**Phase**: Phase 3: Implementation + Fake
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity findings remain in AC-26 correctness and doctrine compliance.

**Key failure areas**:
- **Implementation**: `list()` cache invalidation is global, so unrelated updates break AC-26 stable-reference semantics for non-matching patterns.
- **Domain compliance**: One changed file is not explicitly represented in the phase manifest/task mapping.
- **Testing**: Full-TDD evidence is incomplete, and AC-33 inspection methods are not directly asserted.
- **Doctrine**: Required Test Doc blocks are missing from the new unit test file.

## B) Summary

Phase 3 delivers the expected implementation/test artifacts, and execution evidence reports 122 passing state tests (31 unit + 44 contract + prior phase suites). Anti-reinvention checks found no duplicate component creation; the implementation composes established store/subscription patterns appropriately. Domain registry and domain map are current for `_platform/state`, but artifact traceability is incomplete for one touched file in this phase. The highest-impact gap is AC-26 correctness: both real and fake systems invalidate `list()` cache on any change, including non-matching changes, which violates the stated stable-list contract.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED evidence captured with command output for each task
- [x] GREEN evidence captured (`31` unit + `44` contract reported)
- [ ] AC-33 inspection methods explicitly verified by automated assertions

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not evidenced in phase execution log)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/global-state-system.ts:69-70,92-96,106,131-133 | correctness | `list()` cache is invalidated globally (`storeVersion` + `listCache.clear()`), so non-matching updates still change snapshot reference, violating AC-26. | Switch to pattern-scoped invalidation/versioning so only matching pattern snapshots invalidate. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:54-423 | doctrine | Tests lack required 5-field Test Doc blocks (`R-TEST-002`). | Add Test Doc comments (Why, Contract, Usage Notes, Quality Contribution, Worked Example) to each `it(...)`. |
| F003 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-state-system.ts:68-70,92-95,105,130-132 | correctness | Fake mirrors the same global cache invalidation behavior, so real/fake parity preserves the AC-26 defect. | Apply the same pattern-scoped invalidation fix in the fake implementation. |
| F004 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/index.ts | domain | Changed file is not explicitly represented in Phase 3 domain/task artifact mapping. | Update plan Domain Manifest and Phase 3 task path list to include `packages/shared/src/fakes/index.ts`. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.test.ts:12; /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:15 | doctrine | Cross-package relative imports violate `R-CODE-004` alias guidance. | Use configured aliases (for example `@chainglass/web/...`) instead of deep relative imports. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/execution.log.md:15-16,34-41 | testing | Full TDD is claimed, but RED/GREEN evidence is narrative-only (no command output snippets). | Add concrete failing-first and passing command outputs (or CI IDs) per task. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-state-system.ts:184-208 | testing | AC-33 inspection methods exist but are not directly validated by dedicated tests. | Add unit tests for `getPublished()`, `getSubscribers()`, `wasPublishedWith()`, and `reset()`. |
| F008 | LOW | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:144-152 | testing | Synchronous-notification behavior is implied but not explicitly pinned by a same-tick assertion. | Add an assertion proving subscriber side effects are visible immediately after `publish()` without awaiting microtasks. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: AC-26 requires stable list references when no matching values change. Global invalidation causes unrelated writes to invalidate all patterns.
- **F003 (MEDIUM)**: Fake implementation duplicates the same behavior, so parity tests do not catch the contract breach.
- No material security issues or obvious unbounded-performance issues were identified in changed runtime code.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files are under expected `_platform/state` trees (`apps/web/src/lib/state`, `packages/shared/src/fakes`, `test/.../state`). |
| Contract-only imports | ✅ | No cross-domain internal import violations detected in changed `_platform/state` files. |
| Dependency direction | ✅ | No infrastructure → business dependency reversal introduced. |
| Domain.md updated | ✅ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md` includes Phase 3 history/source entries. |
| Registry current | ✅ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md` includes `_platform/state`. |
| No orphan files | ❌ | **F004**: `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/index.ts` is changed but not explicitly mapped in phase artifact tables. |
| Map nodes current | ✅ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md` includes `_platform/state` node/contracts. |
| Map edges current | ✅ | Domain map edges for state dependencies are present and labeled with contracts. |
| No circular business deps | ✅ | No business-to-business cycle is introduced by phase changes. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| GlobalStateSystem service | None | `_platform/state` | ✅ Proceed |
| FakeGlobalStateSystem fake | None | `_platform/state` | ✅ Proceed |
| State system contract test runner | None | `_platform/state` | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 84%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-26 | 92% | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:367-385` validates stable ref + invalidation-on-change, but misses non-matching-change case. |
| AC-33 | 58% | Inspection methods exist in `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-state-system.ts:184-208`; no dedicated assertions found in changed tests. |
| AC-34 | 85% | `/Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.test.ts:15-16` runs factory against real/fake; execution log reports 44 passing contract tests. |
| AC-35 | 90% | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts` covers core store operations broadly. |
| AC-36 | 96% | Subscriber diagnostics assertions at `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:394-409`. |
| AC-37 | 96% | Entry diagnostics assertions at `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:411-423`. |

### E.5) Doctrine Compliance

- **F002 (HIGH)**: Missing Test Doc blocks in new unit tests (`R-TEST-002`).
- **F005 (MEDIUM)**: Relative cross-package imports conflict with `R-CODE-004` alias rule.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | publish stores + notifies | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:79-83,144-152` | 87% |
| AC-02 | get returns value or undefined | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:85-88` | 97% |
| AC-03 | get returns stable references | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:97-104` | 96% |
| AC-04 | remove notifies removed flag | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:283-295` | 94% |
| AC-05 | removeInstance removes all entries | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:308-321` | 93% |
| AC-06 | registerDomain registers descriptor | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:54-59` | 95% |
| AC-07 | duplicate registerDomain throws | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:61-64` | 95% |
| AC-08 | publish to unregistered domain throws | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:106-108` | 93% |
| AC-09 | listDomains returns descriptors | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:66-71` | 93% |
| AC-10 | listInstances returns IDs | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:329-338` | 91% |
| AC-13 | singleton + instance ID throws | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:116-119` | 95% |
| AC-14 | multi-instance without instance ID throws | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:127-130` | 95% |
| AC-21 | subscribe returns unsubscribe fn | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:144-169,200-210` | 95% |
| AC-22 | subscriber error isolation | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:241-257` | 94% |
| AC-23 | StateChange shape | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:171-186,188-198` | 94% |
| AC-24 | store-first ordering | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:265-275` | 92% |
| AC-25 | list returns matching entries | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:351-365` | 93% |
| AC-26 | list stable array reference | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:367-385` + implementation review of `/Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/global-state-system.ts` | 92% |
| AC-33 | FakeGlobalStateSystem inspection methods | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-state-system.ts:184-208` (implemented), no direct assertions in changed tests | 58% |
| AC-34 | contract tests pass for real + fake | `/Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.test.ts:15-16`; execution log reports 44 pass | 85% |
| AC-35 | unit tests for core operations | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts` | 90% |
| AC-36 | subscriberCount diagnostics | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:394-409` | 96% |
| AC-37 | entryCount diagnostics | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts:411-423` | 96% |

**Overall coverage confidence**: **84%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -12
git --no-pager diff 9cda203..e3acc2a > docs/plans/053-global-state-system/reviews/_computed.diff
git --no-pager diff --name-status 9cda203..e3acc2a
git --no-pager diff --stat 9cda203..e3acc2a

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
**Phase**: Phase 3: Implementation + Fake
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/review.phase-3-implementation-fake.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/global-state-system.ts | Created | `_platform/state` | Yes (F001) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | Modified | `_platform/state` | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md | Modified | plan artifact | Yes (F004) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/execution.log.md | Created | plan artifact | Yes (F006) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/tasks.fltplan.md | Created | plan artifact | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/tasks.md | Created | plan artifact | Yes (F004 if task paths are updated there) |
| /Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-state-system.ts | Created | `_platform/state` | Yes (F003, F007) |
| /Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/index.ts | Modified | `_platform/state` | Yes (F004) |
| /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.test.ts | Created | `_platform/state` | Yes (F005) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts | Created | `_platform/state` | Yes (F002, F005, F008) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/global-state-system.ts | Make `list()` cache invalidation pattern-scoped | Restore AC-26 correctness for non-matching updates |
| 2 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts | Add required 5-field Test Doc blocks | Satisfy doctrine rule `R-TEST-002` |
| 3 | /Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-state-system.ts | Mirror pattern-scoped invalidation and add inspection-method assertions | Keep real/fake parity and strengthen AC-33 confidence |
| 4 | /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.test.ts; /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/global-state-system.test.ts | Replace deep relative imports with aliases | Satisfy `R-CODE-004` and improve maintainability |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/execution.log.md | Add RED/GREEN command output evidence | Align with Full TDD evidence requirements |
| 6 | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/tasks.md | Add explicit mapping for `packages/shared/src/fakes/index.ts` | Remove domain-manifest orphan ambiguity |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md | Domain Manifest row for `/packages/shared/src/fakes/index.ts` |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-3-implementation-fake/tasks.md | Task path list alignment for `/packages/shared/src/fakes/index.ts` |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md --phase 'Phase 3: Implementation + Fake'
