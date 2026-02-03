# Phase 2: Output Storage — Code Review Report

**Plan**: [../../pos-agentic-cli-plan.md](../../pos-agentic-cli-plan.md)
**Phase**: Phase 2: Output Storage
**Review Date**: 2026-02-03
**Reviewer**: plan-7-code-review

---

## A) Verdict

**REQUEST_CHANGES**

---

## B) Summary

Phase 2 implements output storage methods (`saveOutputData`, `saveOutputFile`, `getOutputData`, `getOutputFile`) for the positional graph execution lifecycle. The implementation demonstrates **strong TDD discipline** with 21 passing tests, but has **critical issues** that must be fixed before merge:

1. **TypeScript compilation failure** — 4 result types not exported from interfaces/index.ts
2. **Security vulnerability** — Incomplete path traversal prevention (missing `path.resolve()` + containment check)
3. **API signature mismatch** — `fileNotFoundError()` called with 2 arguments, accepts only 1
4. **Plan/dossier desync** — Plan task table shows [ ] but dossier shows [x] for all 14 tasks
5. **Incomplete execution log** — 8 of 14 tasks lack individual log entries

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution.log.md)
- [x] Tests as docs (assertions show behavior with Purpose/Quality/Acceptance comments)
- [x] Mock usage matches spec: Avoid mocks ✓ (uses FakeFileSystem/FakePathResolver)
- [x] Negative/edge cases covered (E153, E175, E179 error paths, path traversal)

**Universal:**

- [ ] BridgeContext patterns followed — N/A (no VS Code extension code)
- [ ] Only in-scope files changed ✓ (3 files + 1 new test file)
- [ ] **Linters/type checks are clean** ✗ (TypeScript compilation errors)
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F01 | CRITICAL | interfaces/index.ts | Missing exports for 4 result types | Add exports to index.ts |
| F02 | CRITICAL | service.ts:1471-1497 | Incomplete path traversal prevention | Add path.resolve() + containment check |
| F03 | HIGH | service.ts:1474,1482,1497 | fileNotFoundError() signature mismatch | Fix to single-arg signature or update factory |
| F04 | HIGH | pos-agentic-cli-plan.md:251-270 | Plan task statuses not updated | Update plan Phase 2 tasks to [x] |
| F05 | HIGH | execution.log.md | 8 tasks without log entries | Add log entries for T005-T007, T009-T014 |
| F06 | MEDIUM | service.ts:1493-1515 | TOCTOU race condition | Remove redundant exists() check |
| F07 | MEDIUM | tasks.md:542-544 | Empty footnote stubs | Populate with Phase 2 footnotes [^4]+ |
| F08 | LOW | service.ts:1511-1530 | outputName validation incomplete | Validate no path separators |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: ✅ PASS

All 293 tests pass (14 test files including output-storage.test.ts).

| Prior Phase | Tests | Status |
|-------------|-------|--------|
| Phase 1: Foundation | 89 tests (execution-errors, schemas, test-helpers) | ✓ Pass |
| Plan 026: Positional Graph | 183 tests (CRUD, status, can-run, collate) | ✓ Pass |
| Phase 2: Output Storage | 21 tests | ✓ Pass |

No regression detected.

---

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Violations

| Link Type | Status | Issue |
|-----------|--------|-------|
| Task↔Log | ❌ BROKEN | 8 tasks (T005-T007, T009-T014) lack individual log entries |
| Task↔Footnote | ❌ BROKEN | No footnotes defined for Phase 2 |
| Plan↔Dossier | ❌ BROKEN | Plan shows [ ] but dossier shows [x] for all tasks |

**Graph Integrity Score**: ❌ BROKEN (must fix before merge)

#### Authority Conflicts

**Plan § Phase 2 Task Table** (lines 251-270):
- All 14 tasks show `[ ]` status with `Log: -`
- Expected: `[x]` status with `Log: [📋](tasks/phase-2.../execution.log.md#task-tXXX)`

**Dossier § Tasks** (lines 253-268):
- All 14 tasks show `[x]` status with completion evidence
- This is the accurate representation of work done

**Resolution**: Update plan to match dossier (plan is stale).

#### TDD Compliance (Full TDD)

| Check | Status | Evidence |
|-------|--------|----------|
| Tests FIRST | ✅ PASS | execution.log.md documents RED phase with 21 failing tests |
| Tests as docs | ✅ PASS | All tests have Purpose/Quality/Acceptance comments |
| RED-GREEN cycles | ✅ PASS | T001 (RED) → T002 (interface) → T003 (GREEN) documented |
| Test coverage | ✅ PASS | 21 tests cover all 4 methods + error paths |

#### Mock Usage (Policy: Avoid mocks)

| Check | Status | Evidence |
|-------|--------|----------|
| No mock frameworks | ✅ PASS | No jest.mock, sinon, vi.mock detected |
| Uses fakes | ✅ PASS | FakeFileSystem, FakePathResolver used throughout |
| Mock count | 0 | Policy compliance: 100% |

---

### E.2) Semantic Analysis

**Domain Logic**: Implementation correctly implements the data flow pattern:
- `saveOutputData`: Persists JSON to `nodes/{nodeId}/data/data.json` with `{ "outputs": {...} }` wrapper
- `saveOutputFile`: Copies file to `data/outputs/`, records relative path
- `getOutputData`: Returns stored value, E175 if missing
- `getOutputFile`: Returns absolute path, E175 if missing

**Specification Drift**: None detected. AC-8 through AC-11 requirements are satisfied.

---

### E.3) Quality & Safety Analysis

**Safety Score: 40/100** (CRITICAL: 2, HIGH: 1, MEDIUM: 2, LOW: 1)

#### F01: Missing Interface Exports (CRITICAL)

**File**: `packages/positional-graph/src/interfaces/index.ts`
**Issue**: 4 result types added to interface file but not exported from index.ts:
- `SaveOutputDataResult`
- `SaveOutputFileResult`
- `GetOutputDataResult`
- `GetOutputFileResult`

**Impact**: TypeScript compilation fails with:
```
TS2305: Module '"../interfaces/index.js"' has no exported member 'GetOutputDataResult'.
```

**Fix**:
```diff
// packages/positional-graph/src/interfaces/index.ts
export type {
  AddLineOptions,
  ...
+  GetOutputDataResult,
+  GetOutputFileResult,
+  SaveOutputDataResult,
+  SaveOutputFileResult,
  ...
} from './positional-graph-service.interface.js';
```

#### F02: Incomplete Path Traversal Prevention (CRITICAL)

**File**: `packages/positional-graph/src/services/positional-graph.service.ts:1471-1497`
**Issue**: Path validation only checks for ".." substring, missing the belt-and-suspenders approach specified in Critical Finding #03.

**Current Code**:
```typescript
// Line 1479
if (sourcePath.includes('..')) {
  return { saved: false, errors: [...] };
}
```

**Missing**:
1. `path.resolve()` to canonicalize path
2. Containment check to verify resolved path is within workspace
3. Symlink detection

**Attack Vectors Not Prevented**:
- Absolute paths: `/etc/passwd` bypasses ".." check
- Symlink attacks: Source could be symlink to sensitive file

**Impact**: Security vulnerability — potential arbitrary file read

**Fix**: Use `pathResolver.resolvePath()` for validation:
```typescript
// After node validation, before source exists check
const resolvedSource = this.pathResolver.resolvePath(ctx.worktreePath, sourcePath);
if (!resolvedSource.startsWith(ctx.worktreePath)) {
  return { saved: false, errors: [pathTraversalError(sourcePath)] };
}
// Then use resolvedSource for file operations
```

#### F03: Error Factory Signature Mismatch (HIGH)

**File**: `packages/positional-graph/src/services/positional-graph.service.ts`
**Lines**: 1474, 1482, 1497
**Issue**: `fileNotFoundError()` called with 2 arguments but factory only accepts 1.

**Current**:
```typescript
fileNotFoundError(outputName, 'Output name contains invalid path traversal')
```

**Factory Signature** (positional-graph-errors.ts:261):
```typescript
export function fileNotFoundError(sourcePath: string): ResultError
```

**Impact**: TypeScript error TS2554, second argument silently ignored

**Fix Options**:
1. Update factory to accept optional message:
   ```typescript
   export function fileNotFoundError(sourcePath: string, reason?: string): ResultError {
     return {
       code: POSITIONAL_GRAPH_ERROR_CODES.E179,
       message: reason ? `${reason}: ${sourcePath}` : `Source file not found: ${sourcePath}`,
       action: 'Verify file path exists and is accessible',
     };
   }
   ```
2. Or create new `pathTraversalError()` factory for security-specific errors

#### F06: TOCTOU Race Condition (MEDIUM)

**File**: `packages/positional-graph/src/services/positional-graph.service.ts:1493-1515`
**Issue**: Gap between `exists()` check and `readFile()` allows race condition.

**Fix**: Remove redundant `exists()` check; `readFile()` throws ENOENT if file missing.

---

### E.4) Doctrine Evolution Recommendations

**ADVISORY — does not affect verdict**

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 1 | 0 | 1 |
| Idioms | 0 | 0 | 0 |

**New Rule Candidate**:
- **Statement**: All file path validation MUST use `path.resolve()` + containment check, not string matching
- **Evidence**: CF-03, saveOutputFile implementation
- **Enforcement**: Code review checklist, consider ESLint rule
- **Priority**: HIGH (security-critical)

---

## F) Coverage Map

| AC | Description | Test Files/Assertions | Confidence |
|----|-------------|----------------------|------------|
| AC-8 | `save-output-data` persists to data.json | output-storage.test.ts lines 91-197 (6 tests) | 100% |
| AC-9 | `save-output-file` copies file to files/ | output-storage.test.ts lines 227-371 (7 tests) | 100% |
| AC-10 | `get-output-data` returns stored value | output-storage.test.ts lines 398-451 (4 tests) | 100% |
| AC-11 | `get-output-file` returns absolute path | output-storage.test.ts lines 481-542 (4 tests) | 100% |

**Overall Coverage Confidence**: 100% (all AC have explicit test mappings)

---

## G) Commands Executed

```bash
# Tests
pnpm vitest run test/unit/positional-graph/output-storage.test.ts
# Result: 21 tests passed

# All positional-graph tests (regression check)
pnpm vitest run test/unit/positional-graph/
# Result: 293 tests passed (14 files)

# Type checking
pnpm typecheck
# Result: FAILED - 7 TypeScript errors (missing exports + signature mismatch)

# Linting
pnpm lint
# Result: No errors in changed files (broken symlinks unrelated)

# Diff generation
git diff HEAD --unified=5 > /tmp/phase2-review.diff
```

---

## H) Decision & Next Steps

### Verdict: REQUEST_CHANGES

**Blocking Issues (must fix)**:

1. **F01 (CRITICAL)**: Add missing exports to `interfaces/index.ts`
2. **F02 (CRITICAL)**: Implement proper path validation with `path.resolve()` + containment
3. **F03 (HIGH)**: Fix `fileNotFoundError()` signature mismatch
4. **F04 (HIGH)**: Update plan Phase 2 task table statuses to [x]
5. **F05 (HIGH)**: Add missing execution log entries for T005-T014

**Non-blocking (recommended)**:

6. **F06 (MEDIUM)**: Remove TOCTOU race condition
7. **F07 (MEDIUM)**: Populate Phase 2 footnotes [^4]+
8. **F08 (LOW)**: Enhance outputName validation

### Approval Conditions

After fixing F01-F05:
1. `pnpm typecheck` must pass with 0 errors
2. All 21 output-storage tests still pass
3. Plan task table shows [x] status for Phase 2 tasks

### Next Command

Run `/plan-6-implement-phase` to address fix tasks, then re-run `/plan-7-code-review`.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote | Node ID |
|-------------------|----------|---------|
| positional-graph.service.ts | ❌ None | — |
| positional-graph-service.interface.ts | ❌ None | — |
| positional-graph.command.ts | ❌ None | — |
| output-storage.test.ts | ❌ None | — |

**Status**: ❌ No footnotes defined for Phase 2. Expected: [^4]+ entries in plan § Change Footnotes Ledger.

---

**End of Review**
