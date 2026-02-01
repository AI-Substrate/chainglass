# Phase 3: Graph and Line CRUD Operations — Code Review

**Plan**: 026-positional-graph
**Phase**: Phase 3: Graph and Line CRUD Operations
**Date**: 2026-02-01
**Reviewer**: plan-7-code-review

---

## A. Verdict

**APPROVE** ✅

Phase 3 implementation passes all quality gates with advisory findings. All 11 tasks complete, 138 tests pass (41 new), lint/typecheck clean. Minor administrative gap (missing footnotes) and known concurrency limitations documented as advisory.

---

## B. Summary

Phase 3 implements the `PositionalGraphService` with full graph CRUD (create, load, show, delete, list) and line operations (addLine, removeLine, moveLine, setLineTransition, setLineLabel, setLineDescription). The implementation follows the Full TDD approach per plan specification, uses no mocks (FakeFileSystem + real YamlParserAdapter), and satisfies all acceptance criteria.

**Key Metrics**:
- Tasks: 11/11 complete (T001-T011)
- Tests: 41 new tests (15 graph-crud + 26 line-ops), 138 total positional-graph tests
- Lint: 0 errors (biome)
- Typecheck: pass
- Build: success
- Prior Phase Regression: 0 failures (77 Phase 2 tests pass)

---

## C. Checklist

**Testing Approach: Full TDD** | **Mock Usage: Avoid mocks entirely**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior: error codes, line formats, invariants)
- [x] Mock usage matches spec: Avoid (ZERO mock instances found)
- [x] Negative/edge cases covered (E150-E158 guards, invalid YAML, schema failures)
- [x] BridgeContext patterns: N/A (server-side Node.js, no VS Code extension)
- [x] Only in-scope files changed (all match task table Absolute Path(s))
- [x] Linters/type checks are clean
- [x] Absolute paths used (adapter validates slugs, paths resolved via pathResolver)

---

## D. Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| ADM-001 | MEDIUM | plan.md:487-493 | Phase 3 footnotes missing from Change Footnotes Ledger | Add [^9] entries for Phase 3 files per plan convention |
| CONC-001 | MEDIUM | atomic-file.ts:15 | Predictable temp file naming (`.tmp` suffix) | Use random suffix for temp files in production |
| CONC-002 | MEDIUM | service.ts:124-156 | TOCTOU race in create() between graphExists and ensureGraphDir | Document as known limitation; add locking for concurrent access |
| CORR-001 | LOW | service.ts:83-95 | Schema validation reports only first error | Consider reporting all validation errors |
| TDD-001 | INFO | execution.log:Discovery 1 | TDD adaptation: full service impl in T005 (pragmatic) | Documented and accepted; all behavior tested |

---

## E. Detailed Findings

### E.0 Cross-Phase Regression Analysis

**Prior Phase Tests**: All 77 Phase 2 tests pass (adapter=17, schemas=50, id-generation=10)

| Test Suite | Count | Status |
|------------|-------|--------|
| adapter.test.ts | 17 | ✅ Pass |
| schemas.test.ts | 50 | ✅ Pass |
| id-generation.test.ts | 10 | ✅ Pass |
| **Total Phase 2** | **77** | ✅ Pass |

**Verdict**: No regression detected. Phase 2 artifacts (adapter, schemas, ID gen) function correctly with Phase 3 additions.

---

### E.1 Doctrine & Testing Compliance

#### Graph Integrity (Link Validation)

| Link Type | Status | Notes |
|-----------|--------|-------|
| Task↔Log | ✅ VALID | All 11 tasks have log entries (T007-T008 and T009-T010 consolidated) |
| Task↔Footnote | ⚠️ MISSING | Phase 3 tasks have no footnotes in plan (Notes column shows `-`) |
| Footnote↔File | ⚠️ MISSING | No [^9]+ entries in Change Footnotes Ledger for Phase 3 files |
| Plan↔Dossier | ✅ VALID | Dossier tasks match plan Phase 3 tasks (3.1-3.7 → T001-T011) |
| Parent↔Subtask | N/A | No subtasks in Phase 3 |

**Footnote Gap**: Plan § 16 Change Footnotes Ledger ends at [^8] (Phase 2). Phase 3 dossier explicitly states "No footnotes created during planning. Plan-6 will add [^N] entries post-implementation." This is a **known gap** that should be resolved post-review.

**Files needing footnotes**:
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` (NEW)
- `packages/positional-graph/src/interfaces/index.ts` (NEW)
- `packages/positional-graph/src/services/positional-graph.service.ts` (NEW)
- `test/unit/positional-graph/graph-crud.test.ts` (NEW)
- `test/unit/positional-graph/line-operations.test.ts` (NEW)
- Modified: container.ts, index.ts, services/index.ts, errors.ts, errors/index.ts, package.json, error-codes.test.ts

#### TDD Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| RED-GREEN-REFACTOR cycles | ✅ PASS | T004 "Tests FAIL (RED)", T005 "11 tests passed (GREEN)" |
| Tests as documentation | ✅ PASS | Test names describe behavior; assertions verify error codes, formats |
| Mock usage = 0 | ✅ PASS | No vi.mock, vi.spyOn, jest.mock, sinon, MagicMock in test files |
| Real implementations | ✅ PASS | FakeFileSystem, FakePathResolver, YamlParserAdapter (real parser) |

**TDD Adaptation (TDD-001)**: Execution log Discovery 1 notes the strict RED-GREEN per task pair was adapted for architectural coherence. Full service implementation done in T005 (single pass) because internal helpers (`loadGraphDefinition`, `persistGraph`, `findLine`) cut across graph/line boundary. All behavior is tested; adaptation documented.

#### Plan Compliance

| Task | Status | Files Verified | Validation |
|------|--------|----------------|------------|
| T001 | ✅ PASS | interface.ts, interfaces/index.ts | Interface compiles, method signatures match workshop |
| T002 | ✅ PASS | errors.ts, errors/index.ts | E157/E158 factories present, tests updated |
| T003 | ✅ PASS | container.ts, package.json, index.ts, services/index.ts | DI registration, /interfaces subpath, barrels |
| T004 | ✅ PASS | graph-crud.test.ts | 11 failing tests (RED) |
| T005 | ✅ PASS | service.ts | Graph CRUD implemented, 11 tests pass (GREEN) |
| T006 | ✅ PASS | graph-crud.test.ts | +4 edge case tests, 15 total |
| T007 | ✅ PASS | line-operations.test.ts | 7 addLine tests |
| T008 | ✅ PASS | service.ts | addLine implemented |
| T009 | ✅ PASS | line-operations.test.ts | 15 remove/move/set tests |
| T010 | ✅ PASS | service.ts | removeLine, moveLine, set* implemented |
| T011 | ✅ PASS | line-operations.test.ts | 4 invariant tests |

**Scope Creep**: None detected. All modified files appear in task table Absolute Path(s).

---

### E.2 Semantic Analysis

**Domain Logic Correctness**: All graph and line operations implement specified behavior:

| Method | Spec Requirement | Implementation |
|--------|------------------|----------------|
| create | Produces 1 empty line + state.json | ✅ Generates lineId, writes graph.yaml + state.json |
| load | Returns validated definition | ✅ Parses YAML, validates with Zod |
| show | Returns lightweight summary | ✅ Returns slug, version, lines[].nodeCount |
| delete | Removes graph files | ✅ Delegates to adapter.removeGraph (idempotent) |
| list | Returns all slugs | ✅ Delegates to adapter.listGraphSlugs |
| addLine | Supports append/atIndex/after/before | ✅ All positioning modes, mutual exclusivity guard |
| removeLine | Enforces E151 (empty) + E156 (last) | ✅ No cascade per DYK-P3-I4 |
| moveLine | Reorders lines array | ✅ Splice-based reorder |
| setLine* | Updates line properties | ✅ Persists via atomicWriteFile |

**Error Codes**: E150, E151, E152, E156, E157, E158 all correctly implemented.

---

### E.3 Quality & Safety Analysis

**Safety Score: 90/100** (MEDIUM: 2, LOW: 1)

#### Correctness Findings

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| CORR-001 | LOW | Schema validation reports only first error (`[0]?.message`) | Report all: `validated.error.issues.map(i => i.message).join('; ')` |

#### Concurrency Findings

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| CONC-001 | MEDIUM | Predictable temp file naming (`.tmp` suffix) | Use random suffix: `${path}.tmp.${crypto.randomUUID().slice(0,8)}` |
| CONC-002 | MEDIUM | TOCTOU race between graphExists and ensureGraphDir | Document limitation; use exclusive mkdir or file locking for production |

**Note**: Concurrency issues are acceptable for CLI context (single-user, single-process). Document as known limitations for future multi-user scenarios.

#### Security Findings

- **Path traversal**: ✅ SAFE — Adapter validates slug format before path construction
- **Input validation**: ✅ SAFE — Zod schemas validate all parsed data
- **Error information disclosure**: ✅ SAFE — Error messages include slug but slug is pre-validated

**Verdict**: APPROVE — no blocking security issues.

---

### E.4 Doctrine Evolution Recommendations

**ADR Candidates**: None identified. Phase 3 follows established patterns from workgraph.

**Rules Candidates**:
- Consider documenting the "FakeFileSystem + real parser" test pattern as a project idiom
- Document `loadGraphDefinition` discriminated union pattern for error handling

**Architecture Updates**: None needed.

---

## F. Coverage Map

**Testing Approach**: Full TDD | **Overall Confidence**: 95%

| Acceptance Criterion | Test(s) | Confidence | Notes |
|---------------------|---------|------------|-------|
| AC1: Graph lifecycle | graph-crud.test.ts (15 tests) | 100% | Explicit criterion mapping |
| AC2: Line operations | line-operations.test.ts (26 tests) | 100% | All modes tested |
| AC4: Positional invariants | invariant tests (4 tests) | 100% | Ordering, uniqueness verified |
| AC9: Workspace isolation | Implicit via adapter | 75% | Tested in Phase 2 adapter tests |
| AC10: Error codes | error-codes.test.ts (20 tests) | 100% | E150-E171 all tested |

**Narrative Tests**: None. All tests have clear acceptance criterion mapping.

---

## G. Commands Executed

```bash
# Tests
pnpm test -- --run test/unit/positional-graph/
# Result: 138 passed

# Lint
pnpm biome lint packages/positional-graph/src/ test/unit/positional-graph/
# Result: Checked 22 files, no fixes applied

# Type check
pnpm tsc --noEmit --project packages/positional-graph/tsconfig.json
# Result: success

# Prior phase regression
pnpm test -- --run test/unit/positional-graph/adapter.test.ts test/unit/positional-graph/schemas.test.ts test/unit/positional-graph/id-generation.test.ts
# Result: 77 passed
```

---

## H. Decision & Next Steps

**Decision**: APPROVE ✅

**Rationale**: All 11 tasks complete, 41 new tests pass, lint/typecheck clean, no regression in prior phases. TDD compliance verified (zero mocks, RED-GREEN documented). Security and correctness pass. Concurrency limitations are acceptable for CLI context.

**Next Steps**:
1. ✅ Phase 3 complete — proceed to Phase 4 (Node Operations)
2. **Advisory**: Add [^9] footnotes to Change Footnotes Ledger for Phase 3 files
3. **Advisory**: Consider random temp file suffixes for production use

---

## I. Footnotes Audit

**Note**: Phase 3 footnotes not yet added to plan ledger. Below is the expected mapping:

| Diff-Touched Path | Expected Footnote | Node-ID |
|-------------------|-------------------|---------|
| interfaces/positional-graph-service.interface.ts | [^9] | file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts |
| interfaces/index.ts | [^9] | file:packages/positional-graph/src/interfaces/index.ts |
| services/positional-graph.service.ts | [^9] | class:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService |
| container.ts | [^9] | file:packages/positional-graph/src/container.ts |
| errors/positional-graph-errors.ts | [^9] | function:packages/positional-graph/src/errors/positional-graph-errors.ts:graphNotFoundError |
| errors/positional-graph-errors.ts | [^9] | function:packages/positional-graph/src/errors/positional-graph-errors.ts:graphAlreadyExistsError |
| test/unit/positional-graph/graph-crud.test.ts | [^9] | file:test/unit/positional-graph/graph-crud.test.ts |
| test/unit/positional-graph/line-operations.test.ts | [^9] | file:test/unit/positional-graph/line-operations.test.ts |

**Action**: Run `plan-6a --sync-footnotes` to populate [^9] entries in plan § 17.

---

*Review generated by plan-7-code-review • 2026-02-01*
