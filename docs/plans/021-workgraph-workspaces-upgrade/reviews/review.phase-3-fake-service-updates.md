# Phase 3: Fake Service Updates — Code Review

**Phase**: Phase 3: Fake Service Updates
**Reviewer**: Automated Code Review (plan-7-code-review)
**Date**: 2026-01-28
**Commit Range**: 48c45dc..099fe0a

---

## A) Verdict

### **REQUEST_CHANGES**

**Blocking Issues**: 2 HIGH severity findings require action before merge.

---

## B) Summary

Phase 3 successfully implements workspace isolation in all 3 fake services using composite keys (`${ctx.worktreePath}|${slug}`). The implementation is functionally correct with 11 new isolation tests passing and 34 contract tests passing. However, there are process and documentation gaps:

1. **Testing Doctrine Violation**: Plan specifies "Full TDD" but execution used "Lightweight" approach (no RED-GREEN-REFACTOR evidence)
2. **Footnotes Not Populated**: Plan's Change Footnotes Ledger contains placeholders instead of actual FlowSpace node IDs
3. **Minor Code Quality Issues**: getKey() helpers lack input validation (MEDIUM severity)

**Key Achievements**:
- All 13 tasks (T3.1-T3.13) implemented correctly
- Composite key isolation works as designed
- Context recording in call captures works across all services
- reset() methods comprehensive in all 3 fakes
- Mock usage policy fully compliant (Fakes Only, no mocking libraries)

---

## C) Checklist

**Testing Approach: Full TDD** (per plan) / **Lightweight** (actual execution)

### Full TDD Checklist
- [ ] Tests precede code (RED-GREEN-REFACTOR evidence) — **FAILED: No evidence in execution log**
- [x] Tests as docs (assertions show behavior) — **PASSED: 11 tests with clear assertions**
- [x] Mock usage matches spec: Fakes Only — **PASSED: No mocking libraries used**
- [x] Negative/edge cases covered — **PASSED: Reset tests verify clean state**

### Universal Checklist
- [ ] BridgeContext patterns followed — **N/A: No VS Code extension code**
- [x] Only in-scope files changed — **PASSED: 5 code files + 3 plan docs**
- [ ] Linters/type checks are clean — **NOTE: 129 pre-existing unit test failures (Phase 2 debt)**
- [x] Absolute paths used (no hidden context) — **PASSED: Composite keys use explicit paths**

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| DOC-001 | HIGH | Plan §10 | Footnotes ledger contains placeholders | Run plan-6a to populate with FlowSpace node IDs |
| TDD-001 | HIGH | execution.log.md | Testing approach mismatch (TDD→Lightweight) | Document justification or update plan testing section |
| CORR-001 | MEDIUM | fake-worknode-service.ts:676 | setPresetClearResult missing options param | Add options to method signature and key |
| CORR-002 | MEDIUM | All fakes:getKey() | No validation on ctx.worktreePath | Add null/undefined guard |
| CORR-003 | MEDIUM | All fakes:getKey() | No handling of empty string parts | Filter falsy parts before join |
| CORR-004 | MEDIUM | fake-worknode-service.ts:754 | Date.now() collision risk in ask() | Use crypto.randomUUID() |
| LINK-001 | MEDIUM | tasks.md / execution.log.md | No bidirectional cross-references | Add task→log and log→task links |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: ✅ No Regressions Detected

| Prior Phase | Tests Rerun | Status |
|-------------|-------------|--------|
| Phase 1: Interface Updates | N/A (interface-only) | ✅ |
| Phase 2: Service Layer Migration | Contract tests | ✅ 34/34 pass |

**Note**: 129 unit test failures are pre-existing from Phase 2 (tests pass `undefined` for `ctx.worktreePath`). These are out of scope for Phase 3.

---

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Violations

**Link Type: Task↔Footnote** — ❌ BROKEN
- Plan footnotes [^1]-[^5] are placeholders: `[To be added during implementation via plan-6a]`
- Tasks.md has zero footnote references
- No FlowSpace node IDs recorded

**Link Type: Task↔Log** — ⚠️ PARTIAL
- Execution log groups tasks (T3.1-T3.3, T3.4-T3.6, etc.)
- No explicit cross-reference anchors
- Log entries reference task IDs in headers but no backlinks

**Link Type: Plan↔Dossier** — ✅ Synchronized
- Tasks in dossier match plan Phase 3 description
- Status checkboxes consistent

#### Testing Doctrine Violation

**Finding**: TDD-001 (HIGH)
- **Plan says**: "Selected Approach: Full TDD" (line 294)
- **Execution says**: "Testing Approach: Lightweight (contract tests verify behavior)" (execution.log.md line 6)
- **Evidence**: No RED-GREEN-REFACTOR cycles documented. Tests written after implementation (T3.11b follows T3.1-T3.9).
- **Impact**: Process violation, not quality failure. Code works correctly.
- **Fix**: Either:
  1. Add retrospective justification to execution log explaining deviation, OR
  2. Update plan Testing Philosophy to "Lightweight" for fake service phases

#### Mock Usage Compliance

**Status**: ✅ FULLY COMPLIANT

- Zero instances of vi.mock(), vi.spyOn(), jest.mock(), or sinon
- All 11 tests use Fake classes: FakeWorkGraphService, FakeWorkNodeService, FakeWorkUnitService
- Three-part API used: State Setup (setPreset*), State Inspection (get*Calls), Reset (reset())

---

### E.2) Semantic Analysis

**Status**: ✅ No semantic defects found

- Domain logic (composite keys for workspace isolation) correctly implements the spec
- Business rules (ctx-first parameter, workspace isolation) honored
- Algorithm accuracy (key format `${worktreePath}|${parts.join(':')}`) consistent

---

### E.3) Quality & Safety Analysis

**Safety Score: 70/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 4, LOW: 2)

#### Correctness Findings

**CORR-001** (MEDIUM) — `fake-worknode-service.ts:676-683`
- **Issue**: `setPresetClearResult()` doesn't include `options` in the key, but `clear()` behavior depends on `options.force`
- **Impact**: Can't test different force flag scenarios with preset results
- **Fix**: Add `options?: ClearOptions` to method signature and key

**CORR-002** (MEDIUM) — All fakes: `getKey()` methods
- **Issue**: No null/undefined check on `ctx.worktreePath`
- **Impact**: Malformed keys if context is incomplete
- **Fix**: `if (!ctx?.worktreePath) throw new Error('Invalid WorkspaceContext')`

**CORR-003** (MEDIUM) — All fakes: `getKey()` methods
- **Issue**: Empty string parts create malformed keys (`"/path|graph::unit"`)
- **Impact**: Key collisions possible with empty parts
- **Fix**: `parts.filter(Boolean).join(':')`

**CORR-004** (MEDIUM) — `fake-worknode-service.ts:754`
- **Issue**: `Date.now()` for questionId could collide in rapid sequential calls
- **Impact**: Low probability but possible ID collisions in tests
- **Fix**: Use `crypto.randomUUID()` or incrementing counter

#### Security Findings

✅ No security issues found. Fakes don't handle external input or sensitive data.

#### Performance Findings

✅ No performance issues. Fakes use simple Map lookups.

#### Observability Findings

✅ N/A for fake implementations.

---

### E.4) Doctrine Evolution Recommendations

**Status**: Advisory (does not affect verdict)

#### New Rules Candidates

**RULE-REC-001** (MEDIUM)
- **Rule Statement**: Fake service getKey() helpers MUST validate ctx.worktreePath is non-null
- **Evidence**: 3 implementations lack validation
- **Enforcement**: Code review checklist

**RULE-REC-002** (LOW)
- **Rule Statement**: Execution logs MUST reference the Testing Approach from the plan
- **Evidence**: TDD-001 mismatch
- **Enforcement**: plan-6-implement-phase template

#### Positive Alignment

- ✅ Composite key pattern (`${worktreePath}|${slug}`) used consistently across all 3 services
- ✅ Fake API follows three-part pattern: State Setup, State Inspection, Reset
- ✅ All methods record ctx in call captures for test assertions

---

## F) Coverage Map

**Testing Approach**: Lightweight (de facto, despite plan saying TDD)

| Acceptance Criterion | Test File:Test | Confidence |
|---------------------|----------------|------------|
| T3.1: getKey() in FakeWorkGraphService | Indirect via isolation tests | 90% |
| T3.2: Composite keys (6 Maps) | Test: "same slug in different workspaces are independent" | 95% |
| T3.3: ctx in 6 call types | Test: "getCalls() records ctx for inspection" | 95% |
| T3.4: getKey() in FakeWorkNodeService | Indirect via isolation tests | 85% |
| T3.5: Composite keys (13 Maps) | Test: "same graph:node in different workspaces are independent" | 90% |
| T3.6: ctx in 14 call types + getAnswer | Test: "getAnswer() has full fake support" | 95% |
| T3.7: getKey() in FakeWorkUnitService | Indirect via isolation tests | 85% |
| T3.8: presetListResults as Map | Test: "list() isolates by workspace" | 95% |
| T3.9: ctx in 4 call types | Test: "getCalls() records ctx for inspection" | 95% |
| T3.10: reset() clears all state | Tests: "reset() clears all state" (3 tests) | 100% |
| T3.11a: workspace-context.ts helper | Import at line 16 | 100% |
| T3.11b: Isolation tests | 11 tests in fake-workspace-isolation.test.ts | 100% |

**Overall Coverage**: 12/12 criteria covered (100%)
**Coverage Confidence**: 93% average

---

## G) Commands Executed

```bash
# Compute diff
git diff 48c45dc..099fe0a --stat

# Run contract tests
pnpm test -- test/contracts/workgraph-service.contract.test.ts test/contracts/worknode-service.contract.test.ts test/contracts/workunit-service.contract.test.ts
# Result: 34/34 pass

# Run isolation tests
pnpm test -- test/unit/workgraph/fake-workspace-isolation.test.ts
# Result: 11/11 pass

# Run full suite
just fft
# Result: 129 failures (pre-existing), 2211 pass
```

---

## H) Decision & Next Steps

### Required Before Merge

1. **DOC-001 (HIGH)**: Populate Change Footnotes Ledger with actual FlowSpace node IDs
   - Run: `/plan-6a-update-progress` to sync footnotes
   - Files: All 5 modified files should have corresponding footnote entries

2. **TDD-001 (HIGH)**: Resolve testing doctrine mismatch
   - Option A: Add justification in execution.log.md explaining why Lightweight was appropriate
   - Option B: Update plan Testing Philosophy to acknowledge Lightweight for fake service phases

### Recommended (Non-Blocking)

3. **CORR-001 to CORR-004**: Fix getKey() validation issues
   - Add ctx.worktreePath validation
   - Filter empty parts in key generation
   - Consider using crypto.randomUUID() for question IDs

### Reviewer Sign-Off

- [ ] Address DOC-001: Populate footnotes ledger
- [ ] Address TDD-001: Document testing approach deviation
- [ ] Re-run `/plan-7-code-review` to verify fixes

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag | Node ID |
|-------------------|--------------|---------|
| packages/workgraph/src/fakes/fake-workgraph-service.ts | [^?] | **MISSING** |
| packages/workgraph/src/fakes/fake-worknode-service.ts | [^?] | **MISSING** |
| packages/workgraph/src/fakes/fake-workunit-service.ts | [^?] | **MISSING** |
| test/helpers/workspace-context.ts | [^?] | **MISSING** |
| test/unit/workgraph/fake-workspace-isolation.test.ts | [^?] | **MISSING** |

**Status**: ❌ No footnotes populated. Ledger contains placeholders only.

---

*Generated by plan-7-code-review agent*
