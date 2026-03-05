# Code Review: Phase 2: Implementation and Contract Tests

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-spec.md
**Phase**: Phase 2: Implementation and Contract Tests
**Date**: 2026-03-01
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity findings remain in domain dependency direction and contract parity evidence.

**Key failure areas**:
- **Domain compliance**: `_platform/positional-graph` composes `workflow-events` internals directly, violating the declared infrastructure→business direction rule.
- **Testing**: Contract parity for real vs fake implementations is incomplete; behavioral coverage currently runs only for fake.
- **Doctrine**: Contract tests violate import/Test Doc rules from project-rules.

## B) Summary

Phase 2 delivers the planned core artifacts (service, observer registry, DI wiring, and contract tests) and the diff is scoped to the phase dossier plus implementation files. The primary blockers are architectural boundary drift (container-level composition crossing domain direction) and insufficient contract parity confidence for the real implementation path. Domain documentation is partially out of sync with implemented dependencies (`ICentralEventNotifier` still shown as active in map/domain docs despite Phase 2 deferral). Anti-reinvention checks show extension of existing patterns rather than hard duplication. Testing evidence is present but not yet strong enough for full acceptance confidence across AC-02/03/05/09.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present
- [ ] Critical paths covered for both real + fake implementations
- [ ] Key verification points documented with strong evidence
- [x] Only in-scope files changed
- [x] Build/test evidence recorded in execution log
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/container.ts:24-29,99-111 | dependency-direction | `_platform/positional-graph` composes `workflow-events` implementation internals directly (infrastructure → business). | Move WorkflowEvents composition to a business-owned composition root or reclassify ownership/contracts explicitly. |
| F002 | HIGH | /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.test.ts:20-44; /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts:98-250 | testing | Behavioral contract coverage runs only for fake; real implementation only gets light conformance checks. | Add behavioral parity tests for real implementation using deterministic graph fixture/setup. |
| F003 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts:60-67 | testing | Unsubscribe test does not emit post-unsubscribe events, so handler removal is not truly proven. | Trigger an event after `unsub()` and assert invocation count remains unchanged. |
| F004 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.test.ts:10-13 | doctrine | Contract runner imports cross-package internals with relative paths, violating import organization rule. | Import through package aliases/public exports. |
| F005 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts:107-250 | doctrine | New tests omit required 5-field Test Doc comments. | Add required Test Doc blocks per project rules/constitution. |
| F006 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md:64-68; /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md:85-90 | domain-docs | Domain docs/map currently model `_platform/events` notifier dependency as active, but Phase 2 implementation defers notifier integration. | Mark dependency/edge as Phase 3 (future) or remove until implemented. |
| F007 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md:25-52 | domain-manifest | Domain Manifest does not enumerate all changed files (`observer-registry.ts`, `packages/positional-graph/src/index.ts`). | Update manifest to map all changed files to domains/classification. |
| F008 | LOW | /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts:80-94 | correctness | `askQuestion` records `asked_at` and observer `askedAt` via separate timestamps, allowing subtle divergence. | Generate one timestamp and reuse for state + observer payload. |
| F009 | LOW | /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts:145-167 | testing | AC-03 handshake is documented but not directly asserted in contract tests. | Add explicit assertion that `answerQuestion` causes restart-side effect in real behavioral coverage. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F008 (LOW)**: `askQuestion` uses separate timestamps for state and observer event payloads, creating avoidable drift in correlated records.
- No additional HIGH implementation defects were confirmed from the phase diff during spot-check.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are placed under expected trees for workflow-events and test/contracts. |
| Contract-only imports | ❌ | `container.ts` imports workflow-events implementation internals directly. |
| Dependency direction | ❌ | Infrastructure (`_platform/positional-graph`) now composes business-domain internals (`workflow-events`). |
| Domain.md updated | ❌ | History updated, but Dependencies section still lists active notifier integration not present in Phase 2 code. |
| Registry current | ✅ | `workflow-events` remains registered; no new domain introduced in this phase. |
| No orphan files | ❌ | Domain Manifest misses changed files (`observer-registry.ts`, package `index.ts`). |
| Map nodes current | ❌ | Health summary consumer/provider data is not fully aligned with current relationships. |
| Map edges current | ❌ | `wfEvents --> events` edge modeled as current without matching implementation in this phase. |
| No circular business deps | ✅ | No business→business cycle detected from current map. |
| Concepts documented | ✅ | `docs/domains/workflow-events/domain.md` includes `## Concepts` table with required columns. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| WorkflowEventsService | PositionalGraphService Q&A + raiseNodeEvent patterns | _platform/positional-graph | Extension pattern; acceptable if contract parity is tightened |
| WorkflowEventObserverRegistry | FakeWorkflowEvents observer map + FileChangeHub dispatch pattern | workflow-events + _platform/events | Extension pattern; acceptable |
| workflow-events barrel export | Existing barrel conventions | cross-domain | No duplication concern |
| Contract test factory/runner | Existing `test/contracts` factory-runner pattern | test/contracts | No duplication concern |

### E.4) Testing & Evidence

**Coverage confidence**: **54%**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-05 | 62 | `workflow-events.contract.test.ts` runs conformance on fake+real, behavioral on fake-only (33 tests total logged). |
| AC-08 | 72 | Behavioral suite validates observer firing paths on fake implementation. |
| AC-09 | 35 | Unsubscribe test exists but does not emit post-unsubscribe events. |
| AC-03 | 28 | 3-event handshake described in execution log; not directly asserted in changed contract tests. |
| AC-02 | 33 | Delegation/wrapping intent documented in tasks/execution log; test assertions do not deeply validate real delegation semantics. |

### E.5) Doctrine Compliance

- **F004 (MEDIUM)**: Cross-package relative imports in contract runner violate `R-CODE-004` import organization rule.
- **F005 (MEDIUM)**: Missing required 5-field Test Doc blocks in new tests (`R-TEST-002` / Constitution §3.2).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-02 | WorkflowEventsService delegates to positional-graph service primitives | Service implementation + execution log narrative; no deep behavioral parity test on real path | 33 |
| AC-03 | `answerQuestion` performs handshake behavior in one call | Execution log claims `question:answer` + `node:restart`; tests do not directly assert restart effect | 28 |
| AC-05 | Contract tests for both real and fake | Conformance both, behavioral fake-only | 62 |
| AC-08 | Observer hooks fire for question/progress flows | Behavioral fake tests cover event observer paths | 72 |
| AC-09 | Observer unsubscribe removes handler | Unsubscribe returns function; removal effect not fully asserted | 35 |

**Overall coverage confidence**: **54%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -15
git --no-pager diff eb20988..HEAD > /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/reviews/_computed.diff
git --no-pager diff --name-status eb20988..HEAD
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-spec.md
**Phase**: Phase 2: Implementation and Contract Tests
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-2-implementation-contract-tests/tasks.md
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-2-implementation-contract-tests/execution.log.md
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/reviews/review.phase-2-implementation-contract-tests.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts | Reviewed | workflow-events | Yes (LOW consistency improvement) |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/observer-registry.ts | Reviewed | workflow-events | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/index.ts | Reviewed | workflow-events | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/container.ts | Reviewed | _platform/positional-graph | Yes (HIGH) |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/index.ts | Reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts | Reviewed | workflow-events | Yes (HIGH/MEDIUM) |
| /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.test.ts | Reviewed | workflow-events | Yes (HIGH/MEDIUM) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md | Reviewed | workflow-events | Yes (MEDIUM) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Reviewed | cross-domain | Yes (MEDIUM) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md | Reviewed | cross-domain | Yes (MEDIUM) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-2-implementation-contract-tests/tasks.md | Reviewed | workflow-events | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-2-implementation-contract-tests/execution.log.md | Reviewed | workflow-events | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/container.ts | Remove/relocate workflow-events internal composition from infrastructure container boundary | Violates declared dependency direction and contract-only boundary rule (F001) |
| 2 | /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts; /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.test.ts | Add real behavioral parity tests and strengthen unsubscribe/handshake assertions | AC-05/AC-09 confidence is insufficient (F002/F003/F009) |
| 3 | /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts; /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.test.ts | Align imports/Test Docs with project rules | Doctrine violations (F004/F005) |
| 4 | /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md; /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md; /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md | Sync domain docs/map/manifest with actual Phase 2 implementation | Domain compliance drift and orphan mappings (F006/F007) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md | Dependencies section still models active `_platform/events` notifier usage not present in code |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Edge/status summary for workflow-events dependencies not aligned to implemented code |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md | Domain Manifest missing mappings for all changed Phase 2 files |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md --phase "Phase 2: Implementation and Contract Tests"
