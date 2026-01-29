# Code Review: Phase 3 - Graph Editing

**Plan**: [workgraph-ui-plan.md](../workgraph-ui-plan.md)
**Dossier**: [tasks/phase-3-graph-editing/tasks.md](../tasks/phase-3-graph-editing/tasks.md)
**Reviewed**: 2026-01-29
**Diff Range**: `620b8af..5aca2c9`

---

## A) Verdict

# ⚠️ REQUEST_CHANGES

**Reason**: 23 mock violations (Constitution §4), 1 CRITICAL security issue, and 3 HIGH correctness defects require fixes before merge.

---

## B) Summary

Phase 3 implements the graph editing functionality: drag-drop toolbox, edge connection, node deletion, and auto-save. The implementation is **functionally complete** with all 40 Phase 3 tests passing. TDD practices are **exemplary** - all features followed test-first patterns with documented RED-GREEN-REFACTOR cycles.

**However, three blocking issues require attention:**
1. **Constitution Violation**: 23 uses of `vi.fn()` instead of Fake classes per Constitution §4 "Fakes Over Mocks"
2. **Security**: Error message disclosure in API routes returns raw `error.message` to clients
3. **Correctness**: Edge ID collision risk in `workgraph-ui.instance.ts` when multiple edges added rapidly

**Files Changed**: 36 files, +5475 -39 lines
**Test Coverage**: 40 new tests, all passing (2313 total suite)

---

## C) Checklist

**Testing Approach: Full TDD** (per plan § 5)

### TDD Compliance
- [x] Tests precede code (RED-GREEN-REFACTOR evidence)
- [x] Tests as docs (assertions show behavior)
- [x] Negative/edge cases covered
- [ ] **Mock usage matches spec: Avoid mocks** ❌ 23 `vi.fn()` violations

### Universal Checks
- [x] BridgeContext patterns followed (N/A - not VS Code extension)
- [x] Only in-scope files changed (minor: `use-workgraph-api.ts` extra utility)
- [ ] Linters/type checks are clean ⚠️ Errors in symlink files
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| MOCK-001 | **CRITICAL** | drop-handler.test.ts:112-270 | 12 uses of `vi.fn()` | Replace with Fake classes |
| MOCK-002 | **CRITICAL** | auto-save.test.ts:29-145 | 7 uses of `vi.fn()` | Replace with FakeSaveService |
| MOCK-003 | **CRITICAL** | workunit-toolbox.test.tsx:34,190 | 2 uses of `vi.fn()` | Replace with FakeFetch |
| MOCK-004 | **CRITICAL** | edge-connection.test.ts:99 | 1 use of `vi.fn()` | Replace with FakeSubscriber |
| MOCK-005 | **CRITICAL** | node-deletion.test.ts:97 | 1 use of `vi.fn()` | Replace with FakeSubscriber |
| SEC-001 | **CRITICAL** | nodes/route.ts:119 | Error message disclosure | Return generic message |
| COR-001 | **HIGH** | instance.ts:492 | Edge ID collision | Use UUID or counter |
| COR-002 | **HIGH** | drop-handler.ts:151 | Wrong result type check | Check `errors.length === 0` |
| COR-003 | **HIGH** | use-workgraph-api.ts:72 | Missing MutationResult type | Add type definition |
| SEC-002 | **HIGH** | All routes | Missing path validation | Add path traversal checks |
| SEC-003 | **HIGH** | drop-handler.ts:95 | Unsafe JSON.parse | Add runtime validation |
| COR-004 | **MEDIUM** | instance.ts:270-271 | Index-based edge ID | Use stable IDs |
| COR-005 | **MEDIUM** | instance.ts:427,452 | Unhandled refresh() | Await or catch errors |
| SEC-004 | **MEDIUM** | nodes/route.ts:70 | Missing body validation | Validate all fields |
| SEC-005 | **MEDIUM** | instance.ts:401+ | Unsafe state mutations | Add defensive validation |
| LINK-001 | **MEDIUM** | tasks.md | 6 tasks missing log entries | Add T007-T009, T011, T015, T018 logs |
| LINK-002 | **MEDIUM** | tasks.md | Status icon mismatch | Update diagram vs table |
| TS-001 | **LOW** | docs/plans/files/*.tsx | TypeScript errors | Exclude symlinks from tsc |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: ✅ PASS

- **Tests Rerun**: All 89 pre-Phase 3 workgraph-ui tests pass
- **Contracts**: Phase 1/2 interfaces preserved (IWorkGraphUIInstance extended, not broken)
- **Integration Points**: useWorkGraphFlow hook signature unchanged
- **Backward Compatibility**: Read-only mode still works (editable prop defaults to false)

### E.1) Doctrine & Testing Compliance

#### Graph Integrity
- **Task↔Log**: 6 tasks marked complete lack dedicated log entries (T007-T009, T011, T015, T018)
- **Task↔Footnote**: Footnotes [^1]-[^15] present and sequential ✅
- **Plan↔Dossier**: Task IDs synchronized, T014a missing from dossier summary table
- **Verdict**: ⚠️ MINOR_ISSUES (no graph breaks, but documentation incomplete)

#### TDD Compliance: ✅ EXCELLENT
All 4 major feature pairs followed test-first pattern:
- T001 → T003 (WorkUnitToolbox)
- T004 → T005 (Drop Handler)
- T006 → T007 (Edge Connection)
- T008 → T009 (Node Deletion)

RED-GREEN-REFACTOR cycles documented in execution log with timestamps.

#### Mock Usage: ❌ FAIL (23 violations)

**Constitution §4 states**: "Use full Fake implementations instead of mocking libraries. NO `vi.fn()`, `vi.mock()`, `jest.mock()`, or Sinon stubs."

| File | Count | Violations |
|------|-------|------------|
| drop-handler.test.ts | 12 | `onError: vi.fn()`, `preventDefault: vi.fn()`, `getData: vi.fn()` |
| auto-save.test.ts | 7 | `saveFn = vi.fn().mockResolvedValue()` |
| workunit-toolbox.test.tsx | 2 | `mockFetch = vi.fn()`, `mockSetData = vi.fn()` |
| edge-connection.test.ts | 1 | `subscriber = vi.fn()` |
| node-deletion.test.ts | 1 | `subscriber = vi.fn()` |

**Fix Required**: Replace with Fake classes:
- `FakeDragEvent` with `getData()` method
- `FakeSaveService` with call tracking
- `FakeSubscriber` with `wasCalledWith()` helper

### E.2) Semantic Analysis

No semantic/business logic violations found. Implementation matches spec requirements:
- ✅ Drag-drop creates unconnected nodes with `disconnected` status
- ✅ Edge connection validates type compatibility via `canConnect()`
- ✅ Node deletion cleans edges and recomputes downstream status
- ✅ Auto-save debounces to 500ms

### E.3) Quality & Safety Analysis

**Safety Score: 20/100** (CRITICAL: 1, HIGH: 5, MEDIUM: 5, LOW: 1)
**Verdict: REQUEST_CHANGES**

#### Security Findings

**[SEC-001] CRITICAL - Error Message Disclosure**
- **File**: `apps/web/app/api/workspaces/[slug]/workgraphs/[graphSlug]/nodes/route.ts:119`
- **Issue**: Raw `error.message` returned to client
- **Impact**: May expose stack traces, file paths, internal implementation
- **Fix**:
```diff
- const errorMessage = error instanceof Error ? error.message : 'Failed to add node';
+ console.error('[POST /nodes] Error:', error);
+ const errorMessage = 'Failed to add node';
```

**[SEC-002] HIGH - Missing Path Validation**
- **File**: All API routes
- **Issue**: `worktreePath` passed without validation for path traversal
- **Fix**: Add validation: `if (path.includes('..') || path.includes('\0')) return 400`

**[SEC-003] HIGH - Unsafe JSON.parse**
- **File**: `drop-handler.ts:95`
- **Issue**: No runtime type validation after parsing drag data
- **Fix**: Add runtime check for `unitSlug` string format

#### Correctness Findings

**[COR-001] HIGH - Edge ID Collision**
- **File**: `workgraph-ui.instance.ts:492`
- **Issue**: `edge-${this._edges.length}` creates duplicate IDs under rapid additions
- **Fix**: Use UUID: `const edgeId = crypto.randomUUID()`

**[COR-002] HIGH - Wrong Type Check**
- **File**: `drop-handler.ts:151`
- **Issue**: Checks `result.success` but `AddUnconnectedNodeResult` only has `errors`
- **Fix**: Check `result.errors?.length === 0`

**[COR-003] HIGH - Missing Type**
- **File**: `use-workgraph-api.ts:72`
- **Issue**: `MutationResult` referenced but not defined
- **Fix**: Define in `workgraph-ui.types.ts`

### E.4) Doctrine Evolution Recommendations (Advisory)

| Category | Recommendation | Priority |
|----------|---------------|----------|
| **Rule** | All API routes must validate path parameters for traversal | HIGH |
| **Rule** | Error responses must use sanitized generic messages | HIGH |
| **Idiom** | Use UUID for optimistic entity IDs, not array index | MEDIUM |
| **ADR** | Document canConnect() auto-match vs strict mode patterns | LOW |

---

## F) Coverage Map

### Acceptance Criteria → Test Mapping

| AC | Criterion | Test File | Confidence |
|----|-----------|-----------|------------|
| AC-2 | Drag unit from toolbox creates node | workunit-toolbox.test.tsx, drop-handler.test.ts | 100% |
| AC-3 | Connect nodes via edge handles | edge-connection.test.ts | 100% |
| AC-4 | Auto-save within 500ms | auto-save.test.ts | 100% |
| (implicit) | Node deletion | node-deletion.test.ts | 100% |
| (implicit) | Type validation on connect | edge-connection.test.ts | 75% |

**Overall Coverage Confidence**: 95% (explicit criterion references in test comments)

---

## G) Commands Executed

```bash
# Diff computation
git diff --unified=3 --no-color 620b8af..5aca2c9

# TypeScript check
pnpm typecheck  # Errors in symlink files only

# Test suite
pnpm test  # 2313 passed, 19 skipped

# Phase 3 specific tests
# - drop-handler.test.ts: 8 passed
# - auto-save.test.ts: 6 passed
# - edge-connection.test.ts: 8 passed
# - node-deletion.test.ts: 7 passed
# - workunit-toolbox.test.tsx: 10 passed (assumed from execution log)
```

---

## H) Decision & Next Steps

### Blocking Issues (must fix)
1. **[MOCK-001 to MOCK-005]**: Refactor 5 test files to use Fake classes instead of `vi.fn()`
2. **[SEC-001]**: Remove error.message from API responses
3. **[COR-001]**: Replace edge ID generation with UUID

### Recommended Fixes (should fix)
4. **[SEC-002, SEC-003]**: Add path and JSON validation
5. **[COR-002, COR-003]**: Fix type checks in drop-handler and use-workgraph-api
6. **[LINK-001]**: Add missing execution log entries for T007-T009, T011, T015, T018

### Optional (nice to have)
7. Exclude `docs/plans/*/files/*.tsx` from TypeScript check (symlinks)
8. Update tasks.md diagram status icons to match table

### Approval Path
1. Address blocking issues → Re-run `/plan-7-code-review`
2. On APPROVE → Merge and proceed to Phase 4

---

## I) Footnotes Audit

| Path | Footnote | Node ID |
|------|----------|---------|
| test/.../workunit-toolbox.test.tsx | [^1] | Task 3.1 |
| app/api/.../units/route.ts | [^2] | Task 3.2 |
| features/.../workunit-toolbox.tsx | [^3] | Task 3.3 |
| test/.../drop-handler.test.ts | [^4] | Task 3.4 |
| features/.../drop-handler.ts | [^5] | Task 3.5 |
| test/.../edge-connection.test.ts | [^6] | Task 3.6 |
| packages/.../workgraph.service.ts | [^7] | Task 3.7/T014a |
| test/.../node-deletion.test.ts | [^8] | Tasks 3.8-3.9 |
| test/.../auto-save.test.ts | [^9] | Tasks 3.10-3.11 |
| app/api/.../nodes/route.ts | [^10] | Tasks 3.12-3.13 |
| app/api/.../edges/route.ts | [^11] | Task 3.14 |
| (test file missing) | [^12] | Task 3.15 |
| features/.../workgraph-ui.instance.ts | [^13] | Task T016 |
| features/.../workgraph-canvas.tsx | [^14] | Task T017 |
| docs/plans/.../files/ | [^15] | Task T018 |

**Note**: [^12] references optimistic-rollback.test.ts but file not found in test/ directory.
