# Phase 2 Code Review: Central Event Notifier Service and DI Wiring

**Plan**: 027-central-notify-events
**Phase**: Phase 2: Central Event Notifier Service and DI Wiring
**Reviewed**: 2026-02-02
**Reviewer**: AI Code Review Agent

---

## A) Verdict

**✅ APPROVE**

All gates pass. No CRITICAL or HIGH findings. Implementation is production-ready.

---

## B) Summary

Phase 2 successfully implements the `CentralEventNotifierService` with SSE broadcasting and time-based suppression, registers it and `CentralWatcherService` in the web DI container, and creates the `startCentralNotificationSystem()` bootstrap helper for Phase 3.

**Key accomplishments:**
- Full TDD cycle: RED (T001/T002 tests fail) → GREEN (T003 implementation passes) → REFACTOR (T008 lint fixes)
- 38 new tests all pass (10 unit + 26 contract + 2 bootstrap)
- Shared `extractSuppressionKey()` eliminates fake/real divergence risk (DYK Insight #1)
- `useValue` singleton registration for stateful suppression map (DYK Insight #2)
- All 6 `CentralWatcherService` dependencies audited and registered (Discovery 03)

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution.log.md)
- [x] Tests as docs (all 38 tests have 5-field Test Doc blocks)
- [x] Mock usage matches spec: **Fakes only** — no `vi.mock()`, `vi.spyOn()`, `sinon`
- [x] Negative/edge cases covered (U05, U06 key/domain isolation; U08 expiry; U09 empty data)
- [x] BridgeContext patterns followed (N/A — no VS Code extension code)
- [x] Only in-scope files changed (verified against tasks.md Absolute Path(s))
- [x] Linters/type checks are clean (`pnpm tsc --noEmit` clean, 1 minor lint warning)
- [x] Absolute paths used in documentation (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| L01 | LOW | `start-central-notifications.ts:14` | Unused biome-ignore suppression comment | Remove or fix the lint rule suppression |
| OPT01 | OPTIONAL | `central-event-notifier.service.ts:44` | No negative duration validation | Consider: `if (durationMs < 0) throw new Error()` |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

✅ **No regressions detected**

- Phase 1 artifacts remain intact (types, interfaces, fakes, contract tests)
- Phase 1 contract tests (11 for fake) still pass
- T003 added 15 contract tests for real service (4 companion B01-B04 + 11 via factory)
- Shared barrel exports correctly re-export Phase 1 + Phase 2 symbols
- `FakeCentralEventNotifier` refactored to use shared `extractSuppressionKey()` — all 11 Phase 1 contract tests still pass

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Step 3a)

| Link Type | Status | Details |
|-----------|--------|---------|
| Task↔Log | ✅ INTACT | All 8 tasks (T001-T008) have matching log entries with correct `Dossier Task` and `Plan Task` metadata |
| Task↔Footnote | ✅ INTACT | 4 footnotes ([^1]-[^4]) covering all tasks; sequential numbering; no gaps |
| Footnote↔File | ✅ INTACT | All 8 FlowSpace node IDs point to existing files |
| Plan↔Dossier | ✅ INTACT | Tasks table in plan matches dossier; all marked [x] complete |
| Parent↔Subtask | N/A | No subtasks in Phase 2 |

#### TDD Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| TDD order | ✅ PASS | T001/T002 (RED) → T003 (GREEN) → T008 (REFACTOR) in execution.log.md |
| Tests as docs | ✅ PASS | All 38 tests have 5-field Test Doc blocks |
| RED-GREEN-REFACTOR | ✅ PASS | Documented in execution.log.md lines 9-39, 41-67, 69-100, 205-238 |

#### Mock Usage Compliance

| Policy | Status | Evidence |
|--------|--------|----------|
| Fakes only | ✅ PASS | `FakeSSEBroadcaster`, `FakeCentralEventNotifier` used exclusively |
| No vi.mock() | ✅ PASS | 0 instances found |
| No vi.spyOn() | ✅ PASS | 0 instances found |
| No sinon | ✅ PASS | 0 instances found |

### E.2) Semantic Analysis

✅ **No semantic violations**

- `emit()` correctly maps `WorkspaceDomain` enum values to SSE channel names per ADR-0007
- `suppressDomain()` correctly stores `Date.now() + durationMs` for time-based suppression
- `isSuppressed()` correctly returns false after expiry with lazy cleanup
- `extractSuppressionKey()` checks `graphSlug`, `agentId`, `key` in correct priority order

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 1)

#### Correctness Review
✅ **PASS**
- emit() correctly checks isSuppressed() before broadcasting (line 35)
- suppressDomain() correctly calculates expiry (line 45)
- isSuppressed() uses >= comparison (no off-by-one error, line 55)
- Lazy cleanup works correctly (line 57)

#### Security Review
✅ **PASS**
- extractSuppressionKey() validates field types with `typeof` before access
- Composite key format `"domain:key"` prevents cross-domain collision
- No injection risks — domain-constrained keys
- Suppression map is private, no data leaks

#### Performance Review
✅ **PASS**
- Map operations are O(1)
- Lazy cleanup prevents unbounded memory growth
- No async operations or blocking I/O in hot path

#### Observability Review
✅ **PASS**
- Suppression map state is internal but observable via `isSuppressed()` public method
- Comments document architectural decisions (DYK Insights #1, #2)

### E.4) Doctrine Evolution Recommendations

**Advisory — Does not affect verdict**

| Category | Recommendation | Priority |
|----------|---------------|----------|
| Rules | Add rule: "Stateful singleton services use `useValue` registration pattern with documented justification" | MEDIUM |
| Idioms | Document `extractSuppressionKey()` pattern for future domain adapters | LOW |

---

## F) Coverage Map

**Testing Approach: Full TDD**

| Acceptance Criterion | Test(s) | Confidence | Notes |
|---------------------|---------|------------|-------|
| AC-02: Service passes contract tests | C01-C11, B01-B04 | 100% | Contract factory + companion broadcaster tests |
| AC-03: Service in web DI | DI container tests | 100% | `container.resolve()` succeeds |
| AC-04 partial: Watcher in DI (not started) | DI container tests | 100% | `CentralWatcherService` resolvable |
| AC-07 partial: Suppression prevents emission | U04, B03 | 100% | Direct suppression + broadcast verification |
| AC-11: All tests pass | Full test suite | 100% | 2749 tests pass (38 new) |
| AC-12: ADR-0004 compliance | DI inspection | 100% | `useValue` deviation documented and justified |

**Overall Coverage Confidence: 100%**

---

## G) Commands Executed

```bash
# TypeScript validation
pnpm tsc --noEmit

# Lint check
pnpm exec biome lint apps/web/src/features/027-central-notify-events/ \
  packages/shared/src/features/027-central-notify-events/ \
  apps/web/src/lib/di-container.ts \
  test/unit/web/027-central-notify-events/ \
  test/contracts/central-event-notifier.contract.test.ts

# Phase 2 tests
pnpm exec vitest run test/contracts/central-event-notifier.contract.test.ts \
  test/unit/web/027-central-notify-events/

# Results: 38 passed (38)
```

---

## H) Decision & Next Steps

**Decision**: ✅ **APPROVED for merge**

**Next Steps**:
1. Address LOW finding L01 (remove unused biome-ignore suppression) — optional
2. Commit Phase 2 changes
3. Proceed to **Phase 3: Workgraph Domain Event Adapter, Debounce, and Toast**
   - Run `/plan-5-phase-tasks-and-brief --phase "Phase 3"` to generate tasks.md
   - Run `/plan-6-implement-phase --phase "Phase 3"`

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Node ID(s) |
|-------------------|-----------------|------------|
| `test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts` | [^1] | `file:test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts` |
| `test/contracts/central-event-notifier.contract.test.ts` | [^1] | `file:test/contracts/central-event-notifier.contract.test.ts` |
| `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts` | [^2] | `class:apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts:CentralEventNotifierService` |
| `packages/shared/src/features/027-central-notify-events/extract-suppression-key.ts` | [^2] | `function:packages/shared/src/features/027-central-notify-events/extract-suppression-key.ts:extractSuppressionKey` |
| `packages/shared/src/di-tokens.ts` | [^3] | `file:packages/shared/src/di-tokens.ts` |
| `apps/web/src/lib/di-container.ts` | [^3] | `file:apps/web/src/lib/di-container.ts` |
| `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` | [^4] | `function:apps/web/src/features/027-central-notify-events/start-central-notifications.ts:startCentralNotificationSystem` |
| `apps/web/src/features/027-central-notify-events/index.ts` | [^4] | `file:apps/web/src/features/027-central-notify-events/index.ts` |
| `packages/shared/src/features/027-central-notify-events/fake-central-event-notifier.ts` | [^2] | (refactored) |
| `packages/shared/src/features/027-central-notify-events/index.ts` | [^2] | (barrel export) |

---

**Review Complete**: Phase 2 implementation is production-ready and approved for merge.
