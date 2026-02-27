# Code Review: Phase 2: TDD — Path Engine & Contract Tests

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
**Phase**: Phase 2: TDD — Path Engine & Contract Tests
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity findings remain in contract test correctness, TDD evidence completeness, and doctrine compliance.

**Key failure areas**:
- **Implementation**: Contract case C05 does not prove all matching subscribers are invoked.
- **Domain compliance**: `_platform/state` domain history/composition is not updated for Phase 2 test artifacts.
- **Testing**: RED→GREEN evidence is incomplete for a Full TDD claim.
- **Doctrine**: Required 5-field Test Doc comments are missing from all new phase test files.

## B) Summary

The phase introduces the expected three files and the unit tests for parser/matcher execute green locally (47 passing tests across the two suites). Anti-reinvention review found no genuine duplication; the contract factory follows established test-factory patterns. Domain topology/registry checks are broadly healthy, but `docs/domains/_platform/state/domain.md` has not been updated with a Phase 2 history/composition entry. The largest quality gaps are process/doctrine: missing mandatory Test Doc blocks, missing explicit RED evidence, and one contract correctness hole (C05) that could allow an implementation defect to pass.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED evidence captured and recorded for each target (parser, matcher, contract suite)
- [x] GREEN evidence captured for parser/matcher (`47/47` tests)
- [ ] Contract suite execution evidence captured for parity-critical cases

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (targeted `tsc` command is not clean in this environment)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-parser.test.ts; /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-matcher.test.ts; /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts | doctrine | Required 5-field Test Doc comments are missing from new tests (`R-TEST-002`). | Add Test Doc block (Why, Contract, Usage Notes, Quality Contribution, Worked Example) in each `it(...)`. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts:113-126 | correctness | C05 does not assert the throwing subscriber was invoked; a broken fan-out implementation could still pass. | Add explicit `throwerCalled` assertion and/or an additional multi-subscriber fan-out assertion. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/execution.log.md | testing | Full TDD is claimed, but RED evidence is not captured. | Add failing-first command output before GREEN runs for each target. |
| F004 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-parser.test.ts:12; /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-matcher.test.ts:12; /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts:13-14 | doctrine | Cross-package imports use relative paths instead of public alias (`R-CODE-004`). | Import via `@chainglass/shared` / `@chainglass/shared/state` public exports. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md:139-144 | domain-md | Domain docs are not current for Phase 2 changes. | Add `053-P2` history row and include new test artifacts in composition/source listing. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts:219-221 | error-handling | C11 only asserts that publish throws, not that error messaging is descriptive (AC-08 intent). | Assert throw message includes unregistered domain/path context. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/execution.log.md | testing | Contract cases are defined but runtime execution evidence is absent in this phase log. | Add executable evidence (or explicit deferred-proof note tied to Phase 3 runner). |
| F008 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/execution.log.md | testing | Logged `tsc --noEmit test/contracts/state-system.contract.ts` evidence is not reproducible cleanly in current environment. | Record scoped/reproducible command context, or replace with stronger runnable evidence. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F002 (HIGH)**: `/Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts:113-126` — C05 validates that a second subscriber receives a value but does not prove the throwing subscriber actually ran.
- **F006 (MEDIUM)**: `/Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts:219-221` — C11 verifies throw presence but not descriptive throw quality.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New phase files are test assets under `test/` and mapped to `_platform/state` in the plan Domain Manifest. |
| Contract-only imports | ✅ | No cross-domain internal import violations identified. |
| Dependency direction | ✅ | No infrastructure→business direction violations introduced by phase files. |
| Domain.md updated | ❌ | **F005**: missing Phase 2 history/composition updates in `/Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md`. |
| Registry current | ✅ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md` includes `_platform/state`. |
| No orphan files | ✅ | All changed files are represented in phase task paths/domain manifest. |
| Map nodes current | ✅ | `/Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md` includes `_platform/state` node. |
| Map edges current | ✅ | State dependencies/consumers are represented with labeled edges. |
| No circular business deps | ✅ | No business→business cycle introduced by this phase. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Parser test suite (`parsePath`) | Similar testing style in `/Users/jordanknight/substrate/chainglass-048/test/unit/web/features/045-live-file-events/file-change-hub.test.ts` (pattern only) | `_platform/state` | ✅ Proceed (pattern reuse, not duplication) |
| Matcher test suite (`createStateMatcher`) | No duplicate matcher-test asset found for state paths | `_platform/state` | ✅ Proceed |
| Contract test factory (`globalStateContractTests`) | Existing contract-factory convention in `/Users/jordanknight/substrate/chainglass-048/test/contracts/file-change-hub.contract.ts` | `_platform/state` | ✅ Proceed (convention reuse) |

### E.4) Testing & Evidence

**Coverage confidence**: 56%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-34 | 28% | Factory exists at `/Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts`, but this phase contains no real+fake runner execution evidence. |
| AC-35 | 74% | Parser and matcher tests run green locally: `47/47` (`npx vitest run test/unit/web/state/path-parser.test.ts test/unit/web/state/path-matcher.test.ts`). |

### E.5) Doctrine Compliance

- **F001 (HIGH)**: Missing required Test Doc blocks (`R-TEST-002`) in all three new phase files.
- **F004 (MEDIUM)**: Relative cross-package imports violate `R-CODE-004` alias rule.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-34 | Contract tests run against both real and fake implementations | Contract test factory present at `/Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts`; execution log explicitly defers runner to Phase 3. | 28% |
| AC-35 | Path parser and matcher have unit tests | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-parser.test.ts` and `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-matcher.test.ts`; local run shows 47 passing tests. | 74% |

**Overall coverage confidence**: **56%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -20
git --no-pager log --oneline -- test/unit/web/state/path-parser.test.ts
git --no-pager log --oneline -- test/unit/web/state/path-matcher.test.ts
git --no-pager log --oneline -- test/contracts/state-system.contract.ts
git --no-pager status --short -- test/unit/web/state/path-parser.test.ts test/unit/web/state/path-matcher.test.ts test/contracts/state-system.contract.ts

# Computed phase diff artifact
# (/Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_computed.diff)
git --no-pager diff --no-index -- /dev/null test/unit/web/state/path-parser.test.ts
git --no-pager diff --no-index -- /dev/null test/unit/web/state/path-matcher.test.ts
git --no-pager diff --no-index -- /dev/null test/contracts/state-system.contract.ts

# Validation checks
npx vitest run test/unit/web/state/path-parser.test.ts test/unit/web/state/path-matcher.test.ts
npx tsc --noEmit test/contracts/state-system.contract.ts

# Subagent reviews (Task tool)
# - Implementation quality reviewer
# - Domain compliance validator
# - Anti-reinvention checker
# - Testing/evidence validator
# - Doctrine/rules validator
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
**Phase**: Phase 2: TDD — Path Engine & Contract Tests
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/review.phase-2-tdd-path-engine-contract-tests.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-parser.test.ts | Created | `_platform/state` | Yes (F001, F004) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-matcher.test.ts | Created | `_platform/state` | Yes (F001, F004) |
| /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts | Created | `_platform/state` | Yes (F001, F002, F004, F006) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/execution.log.md | Modified | planning artifact | Yes (F003, F007, F008) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | Modified | `_platform/state` | Yes (F005) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-parser.test.ts; /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-matcher.test.ts; /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts | Add required 5-field Test Doc comments to tests | Enforce `R-TEST-002`; restore doctrine compliance |
| 2 | /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts | Make C05 assert thrower invocation and fan-out behavior | Prevent false pass on broken subscriber dispatch |
| 3 | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-2-tdd-path-engine-contract-tests/execution.log.md | Add explicit RED→GREEN evidence and contract execution clarity | Full TDD evidence is incomplete |
| 4 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-parser.test.ts; /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/path-matcher.test.ts; /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts | Replace relative cross-package imports with public alias imports | Enforce `R-CODE-004` |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | Add Phase 2 history/composition updates | Keep domain docs current |
| 6 | /Users/jordanknight/substrate/chainglass-048/test/contracts/state-system.contract.ts | Assert descriptive error content for unregistered domain throw in C11 | Improve contract quality against AC-08 intent |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | `053-P2` history row and Phase 2 test artifacts in source/composition sections |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md --phase 'Phase 2: TDD — Path Engine & Contract Tests'
