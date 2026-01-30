# Phase 3: WorkGraph Core - Code Review

**Plan**: [agent-units-plan.md](../agent-units-plan.md)
**Phase Doc**: [tasks.md](../tasks/phase-3-workgraph-core/tasks.md)
**Review Date**: 2026-01-27
**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)
**Mock Policy**: Fakes only (no vi.mock/jest.mock/vi.spyOn)

---

## A) Verdict

### **REQUEST_CHANGES**

Two critical security/correctness issues must be fixed before merge.

---

## B) Summary

Phase 3 implementation demonstrates excellent TDD discipline with 31 passing tests and complete RED-GREEN-REFACTOR cycle documentation. The core functionality (create, load, show, status) is well-implemented with proper error handling and Zod schema validation. However, two critical issues were discovered:

1. **SEC-001 (CRITICAL)**: Path traversal vulnerability - `load()`, `show()`, `status()` methods don't validate slug parameter, allowing potential escape from `.chainglass/work-graphs/` directory.

2. **COR-001 (CRITICAL)**: Contract violation - `addNodeAfter()` and `removeNode()` throw exceptions instead of returning error results, violating Critical Discovery 02.

Additionally, one HIGH issue: atomic write utilities are defined but not used in production code.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (All 27 tests have 5-field Test Doc comment blocks)
- [x] Mock usage matches spec: Fakes only (0 vi.mock instances found)
- [x] Negative/edge cases covered (E101, E104, E105, E130, E132)

**Universal Checks:**

- [x] BridgeContext patterns followed (N/A - not VS Code extension)
- [ ] Only in-scope files changed (T010a was justified scope extension)
- [x] Linters/type checks are clean (biome + tsc pass)
- [x] Absolute paths used (IPathResolver injected)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | CRITICAL | workgraph.service.ts:144,235,306 | Path traversal in read operations | Add isValidSlug() check |
| COR-001 | CRITICAL | workgraph.service.ts:434,451 | Methods throw instead of return errors | Return error result |
| SEC-002 | HIGH | workgraph.service.ts:98,110 | Atomic writes not used | Use atomicWriteFile() |
| COR-002 | HIGH | workgraph.service.ts:376-387 | Start node status edge case | Add special case |
| DOC-001 | LOW | workgraph-service.test.ts:329 | E105/E106 comment confusion | Fix comment |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: SKIPPED - Phase 3 is first implementation phase (Phase 1-2 were foundation/interface phases with no prior production code to regress against).

---

### E.1) Doctrine & Testing Compliance

#### TDD Compliance ✅ PASSED

- **TDD Order**: Execution log shows T002 (RED) completed before T003 (GREEN) for all task pairs
- **Test Documentation**: All 27 tests include complete Test Doc comment blocks:
  - Why, Contract, Usage Notes, Quality Contribution, Worked Example
- **RED-GREEN-REFACTOR**: Each cycle documented with failure→pass evidence
- **Mock Policy**: Zero prohibited patterns (vi.mock, jest.mock, vi.spyOn)

#### Plan Compliance ✅ PASSED (with notes)

- **Task Completion**: 14/14 tasks (100%)
- **Non-Goals Respected**: addNodeAfter/removeNode properly stubbed (Phase 4)
- **Scope Extension**: T010a (IFileSystem.rename) was justified per DYK#4, following Phase 2 T002a pattern

#### Link Validation ⚠️ MINOR GAPS

- **Footnote Stubs**: Phase Footnote Stubs section in tasks.md is empty (line 524-526)
- **Plan Ledger**: Plan § 10 Change Footnotes Ledger has placeholder entries only
- **Impact**: Graph integrity incomplete - recommend running plan-6a to populate

---

### E.2) Semantic Analysis

**Domain Logic**: ✅ Implementation correctly follows spec requirements:
- AC-01: create() creates directory structure, work-graph.yaml, state.json
- AC-02: show() displays graph as tree structure (linear + diverging)
- AC-03: status() shows all 6 node execution states

**Algorithm Accuracy**: ✅ DFS tree building and upstream status computation are correct

**Specification Drift**: None detected

---

### E.3) Quality & Safety Analysis

**Safety Score: -200/100** (CRITICAL: 2, HIGH: 2, MEDIUM: 0, LOW: 1)
**Verdict: REQUEST_CHANGES**

#### SEC-001 [CRITICAL] Path Traversal in Read Operations

**File**: `packages/workgraph/src/services/workgraph.service.ts`
**Lines**: 144, 235, 306

**Issue**: `load()`, `show()`, and `status()` methods accept a `slug` parameter but do NOT validate it against `isValidSlug()` before using it in path operations. Only `create()` validates the slug.

**Evidence**:
```typescript
// Line 144 - load() has no validation
async load(slug: string): Promise<GraphLoadResult> {
  const graphPath = this.pathResolver.join(this.graphsDir, slug);
  // ...attacker can pass slug='../../etc' to escape graphsDir
}
```

**Impact**: An attacker could pass `slug='../../../sensitive'` to escape the `.chainglass/work-graphs` directory and read arbitrary files.

**Constraint Violated**: Discovery 10: "Reject paths containing '..' before resolution"

**Fix**:
```typescript
async load(slug: string): Promise<GraphLoadResult> {
  if (!this.isValidSlug(slug)) {
    return {
      graph: undefined,
      status: undefined,
      errors: [invalidGraphSlugError(slug)],
    };
  }
  // ...existing code
}
```

Apply same pattern to `show()` (line 235) and `status()` (line 306).

---

#### COR-001 [CRITICAL] Methods Throw Instead of Return Errors

**File**: `packages/workgraph/src/services/workgraph.service.ts`
**Lines**: 434, 451

**Issue**: `addNodeAfter()` and `removeNode()` throw `Error('Not implemented')` instead of returning error results.

**Evidence**:
```typescript
// Line 434
async addNodeAfter(...): Promise<AddNodeResult> {
  throw new Error('Not implemented');  // VIOLATES CD02
}
```

**Constraint Violated**: Critical Discovery 02: "All service methods return `Promise<T extends BaseResult>` where BaseResult includes `errors: ResultError[]`"

**Impact**: Agent workflows cannot handle these errors structurally - causes unhandled promise rejections.

**Fix**:
```typescript
async addNodeAfter(
  graphSlug: string,
  afterNodeId: string,
  unitSlug: string,
  options?: AddNodeOptions
): Promise<AddNodeResult> {
  return {
    nodeId: '',
    inputs: {},
    errors: [unimplementedFeatureError('addNodeAfter', 'Phase 4')],
  };
}
```

---

#### SEC-002 [HIGH] Atomic Writes Not Used in Production

**File**: `packages/workgraph/src/services/workgraph.service.ts`
**Lines**: 98, 110

**Issue**: `atomic-file.ts` provides `atomicWriteFile()` and `atomicWriteJson()` functions following the correct temp-file-then-rename pattern. However, `WorkGraphService.create()` uses `fs.writeFile()` directly.

**Evidence**:
```typescript
// Lines 98, 110-113 - Direct writes, not atomic
await this.fs.writeFile(this.pathResolver.join(graphPath, 'work-graph.yaml'), graphYaml);
await this.fs.writeFile(this.pathResolver.join(graphPath, 'state.json'), JSON.stringify(stateData, null, 2));
```

**Constraint Violated**: Critical Discovery 03: "All state.json and data.json writes must use atomic pattern"

**Impact**: If process crashes mid-write, files could be left corrupted.

**Fix**: Import and use atomic utilities:
```typescript
import { atomicWriteFile, atomicWriteJson } from './atomic-file.js';

// In create():
await atomicWriteFile(this.fs, yamlPath, graphYaml);
await atomicWriteJson(this.fs, statePath, stateData);
```

---

#### COR-002 [HIGH] Start Node Status Edge Case

**File**: `packages/workgraph/src/services/workgraph.service.ts`
**Lines**: 376-387

**Issue**: The `status()` method's computation logic will return `'ready'` for the start node if its stored status is missing. Per DYK#1, start node should ALWAYS be `'complete'`.

**Evidence**:
```typescript
// Lines 376-387 - Missing special case for 'start'
if (storedNode) {
  nodeStatus = storedNode.status as NodeStatus;
} else {
  const upstream = upstreamNodes.get(nodeId) ?? [];
  const allUpstreamComplete = upstream.every(...);
  nodeStatus = allUpstreamComplete ? 'ready' : 'pending';  // BUG: start has no upstream → returns 'ready'
}
```

**Contract Violated**: DYK#1: "Start node is semantically different (a gate, not work) - always complete"

**Fix**:
```typescript
if (nodeId === 'start') {
  nodeStatus = 'complete';  // Start node is always complete
} else if (storedNode) {
  nodeStatus = storedNode.status as NodeStatus;
} else {
  // ...existing computation
}
```

---

#### DOC-001 [LOW] Test Comment Confusion

**File**: `test/unit/workgraph/workgraph-service.test.ts`
**Line**: 329

**Issue**: Test comment says "E106 = graphAlreadyExistsError" but test asserts E105. The implementation correctly uses E105.

**Fix**: Update comment to: `// E105 = graphAlreadyExistsError`

---

### E.4) Doctrine Evolution Recommendations

**Advisory - Does not affect verdict**

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 1 | 0 | 0 |
| Idioms | 1 | 0 | 0 |

#### New Rules Candidate: RULE-REC-001

**Title**: Validate all user inputs at method entry before path operations
**Evidence**: SEC-001 shows `create()` validates but `load()/show()/status()` don't
**Priority**: HIGH
**Recommendation**: Add to `docs/project-rules/rules.md`:
> "All public service methods that accept user input (slugs, paths, identifiers) MUST validate input as the first operation before any filesystem or business logic."

#### New Idioms Candidate: IDIOM-REC-001

**Title**: Stub unimplemented methods with error results
**Pattern**: Return `{ ..., errors: [unimplementedFeatureError(methodName, phase)] }` instead of throwing
**Evidence**: COR-001 - addNodeAfter/removeNode throw
**Priority**: MEDIUM

---

## F) Coverage Map

**Testing Approach**: Full TDD
**Overall Coverage Confidence**: 90%

| Acceptance Criterion | Test File | Test Name | Confidence |
|---------------------|-----------|-----------|------------|
| AC-01: create() creates directory structure | workgraph-service.test.ts:307 | should create graph with valid slug | 100% |
| AC-01: work-graph.yaml created | workgraph-service.test.ts:356 | should create work-graph.yaml with start node | 100% |
| AC-01: state.json created | workgraph-service.test.ts:376 | should create state.json with start node complete | 100% |
| AC-02: show() displays tree | workgraph-service.test.ts:572 | should return tree for linear graph | 100% |
| AC-02: diverging graph | workgraph-service.test.ts:603 | should return tree for diverging graph | 100% |
| AC-03: status() shows states | workgraph-service.test.ts:740 | should return stored status for running/waiting/blocked/complete | 100% |
| Error E101 (not found) | workgraph-service.test.ts:447 | should return E101 for non-existent graph | 100% |
| Error E104 (invalid slug) | workgraph-service.test.ts:341 | should return E104 for invalid slug format | 100% |
| Error E105 (exists) | workgraph-service.test.ts:322 | should return E106 for duplicate slug | 100% |
| Error E130 (YAML parse) | workgraph-service.test.ts:463 | should return E130 for corrupted YAML | 100% |
| Error E132 (schema) | workgraph-service.test.ts:490 | should return E132 for invalid schema | 100% |
| Path traversal | workgraph-service.test.ts:399 | should reject path traversal in slug | 100% |

---

## G) Commands Executed

```bash
# Test execution
pnpm vitest run test/unit/workgraph/workgraph-service.test.ts test/integration/workgraph/workgraph-lifecycle.test.ts --reporter=basic
# Result: 31 passed (27 unit + 4 integration)

# Type check
just typecheck
# Result: pnpm tsc --noEmit - exit 0

# Lint check
just lint
# Result: pnpm biome check . - Checked 514 files, no fixes applied

# Diff generation
git diff HEAD --unified=3
# Result: 6 files modified, ~186 lines added
```

---

## H) Decision & Next Steps

### Approvers
- Security review required for SEC-001 fix
- Implementation review for COR-001 fix

### Blocking Issues (Must Fix)

1. **SEC-001**: Add `isValidSlug()` validation to `load()`, `show()`, `status()`
2. **COR-001**: Change `addNodeAfter()` and `removeNode()` to return error results

### Recommended Fixes (Should Fix)

3. **SEC-002**: Use `atomicWriteFile()` instead of `fs.writeFile()` in `create()`
4. **COR-002**: Add start node special case in `status()` computation

### After Fixes

1. Re-run `/plan-7-code-review` to verify fixes
2. Run `/plan-6a-update-progress` to populate footnotes ledger
3. Commit Phase 3 implementation
4. Proceed to Phase 4 tasks dossier

---

## I) Footnotes Audit

**Status**: ⚠️ INCOMPLETE

The Phase Footnote Stubs section in tasks.md (line 524-526) is empty. The Plan § 10 Change Footnotes Ledger has placeholder entries only.

**Impact**: Graph integrity incomplete - cannot navigate from File→Task via footnotes.

**Recommendation**: After fixing blocking issues, run `plan-6a-update-progress` to populate:
- Footnote entries for all modified files
- FlowSpace node IDs for changed symbols
- Cross-references between plan and dossier

| Diff Path | Footnote Tags | Plan Ledger Entry |
|-----------|---------------|-------------------|
| packages/workgraph/src/services/workgraph.service.ts | (none) | (placeholder) |
| packages/workgraph/src/services/atomic-file.ts | (none) | (placeholder) |
| packages/shared/src/interfaces/filesystem.interface.ts | (none) | (placeholder) |
| test/unit/workgraph/workgraph-service.test.ts | (none) | (placeholder) |
| test/integration/workgraph/workgraph-lifecycle.test.ts | (none) | (placeholder) |

---

*Review completed 2026-01-27*
