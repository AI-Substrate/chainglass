# Phase 3 Code Review: Compose Extension for Versioned Runs

**Plan**: [../manage-workflows-plan.md](../manage-workflows-plan.md)
**Phase**: Phase 3: Compose Extension for Versioned Runs
**Dossier**: [../tasks/phase-3-compose-extension-versioned-runs/tasks.md](../tasks/phase-3-compose-extension-versioned-runs/tasks.md)
**Reviewer**: AI Code Review Agent (plan-7-code-review)
**Date**: 2026-01-24

---

## A) Verdict

**APPROVE** ✅

All acceptance criteria met. 967 tests pass. TypeScript compiles. Linting passes. TDD compliance exemplary. No CRITICAL issues that block merge.

**Notes**:
- One missing file update discovered (MCP workflow.tools.ts) - **fixed during review**
- Some MEDIUM-severity security recommendations for hardening (see E.3)

---

## B) Summary

Phase 3 extends `WorkflowService.compose()` to require checkpoints and create versioned run paths. Key changes:

1. **IWorkflowRegistry injection**: WorkflowService now requires IWorkflowRegistry as 5th constructor parameter (DYK-01)
2. **Checkpoint resolution**: `composeFromRegistry()` resolves checkpoints by ordinal (v001) or full version (v001-abc12345)
3. **Versioned paths**: Runs created at `<runsDir>/<slug>/<version>/run-YYYY-MM-DD-NNN/`
4. **Extended wf-status.json**: Added `slug`, `version_hash`, `checkpoint_comment` fields (optional for backward compat)
5. **E034 error**: Returns NO_CHECKPOINT when workflow has no checkpoints

**Scope**: 14 modified files, 1 new test file (compose-checkpoint.test.ts with 13 tests)

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution.log.md)
- [x] Tests as docs (all 13 tests have complete Test Doc blocks with 5 fields)
- [x] Mock usage matches spec: **Avoid mocks** ✅ (uses Fakes only: FakeFileSystem, FakeWorkflowRegistry, etc.)
- [x] Negative/edge cases covered (E033, E034, ambiguous ordinal)

**Universal Checks:**

- [x] BridgeContext patterns followed (uses pathResolver.join(), not path.join() for new code)
- [x] Only in-scope files changed (all modified files are in task table or justified)
- [x] Linters/type checks are clean (fixed workflow.tools.ts during review)
- [x] Absolute paths used (no hidden context assumptions)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F01 | HIGH | workflow.tools.ts:99 | Missing IWorkflowRegistry dependency after Phase 3 constructor change | **FIXED** during review |
| F02 | MEDIUM | workflow.service.ts:461 | Phase name from YAML not validated against path traversal | Add isPathSafe() check or schema pattern (see E.3) |
| F03 | MEDIUM | workflow.service.ts:333-337 | Assumes versionsResult.errors[0] exists when errors.length > 0 | Defensive check recommended |
| F04 | LOW | workflow.service.ts:149-152 | Legacy compose() uses path.join() while new code uses pathResolver.join() | Minor inconsistency, not blocking |

---

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis

**Status**: PASS (prior phases committed and stable)

- Phases 1 and 2 are committed and merged
- 967 tests pass including Phase 1/2 tests
- No regression in existing functionality

### E.1 Doctrine & Testing Compliance

#### TDD Compliance: PASS ✅

| Check | Status | Evidence |
|-------|--------|----------|
| TDD Order | ✅ PASS | Execution log shows T001-T004 (tests) completed 20:28-20:30, before T005-T013 (implementation) |
| Test Doc Blocks | ✅ PASS | 13/13 tests have complete 5-field Test Doc blocks |
| RED-GREEN-REFACTOR | ✅ PASS | Execution log documents clear cycle progression |
| Behavioral Clarity | ✅ PASS | Assertions document expected behavior (error codes, path formats, field values) |

#### Mock Usage: PASS ✅

- **Policy**: Avoid mocks entirely - use Fakes only
- **Compliance**: 100% - Zero mock framework usage detected
- **Fakes Used**: FakeFileSystem, FakePathResolver, FakeYamlParser, FakeSchemaValidator, FakeWorkflowRegistry, FakeHashGenerator
- **Pattern**: 3-part API (state setup, error injection, inspection) followed consistently

#### Graph Integrity: PASS ✅

- Task table complete with all 13 tasks marked [x]
- Execution log documents all task completions with timestamps
- Discoveries table populated with 5 DYK insights
- Footnote ledger note present (awaiting plan-6a population)

### E.2 Semantic Analysis

#### Domain Logic: PASS ✅

- Checkpoint resolution correctly implements latest/ordinal/full version matching per spec
- E034 error returns actionable guidance with checkpoint command
- Versioned path format matches spec: `<slug>/<version>/run-YYYY-MM-DD-NNN/`
- wf-status.json correctly populated with new fields

#### Specification Alignment: PASS ✅

| Acceptance Criteria | Status | Evidence |
|---------------------|--------|----------|
| AC-06: Latest checkpoint resolution | ✅ | T001-1 test + implementation |
| AC-06a: --checkpoint flag | ✅ | T001-2, T001-3 tests + resolveCheckpoint() |
| AC-06b: E034 when no checkpoints | ✅ | T004-1, T004-2 tests + error handling |
| AC-07: wf-status.json extended | ✅ | T003-1 through T003-4 tests + wfStatus creation |

### E.3 Quality & Safety Analysis

**Safety Score: 85/100** (CRITICAL: 0, HIGH: 1 fixed, MEDIUM: 2, LOW: 1)
**Verdict: APPROVE** (no blocking issues)

#### F01 [FIXED]: Missing IWorkflowRegistry in MCP Tools (was HIGH)

- **File**: packages/mcp-server/src/tools/workflow.tools.ts:99
- **Issue**: WorkflowService constructor changed to require IWorkflowRegistry as 5th parameter, but MCP tools weren't updated
- **Resolution**: Fixed during review - added HashGeneratorAdapter and WorkflowRegistryService instantiation
- **Status**: RESOLVED ✅

#### F02 [MEDIUM]: Phase Name Path Traversal Mitigation

- **File**: packages/workflow/src/services/workflow.service.ts:461
- **Issue**: Phase names from wf.yaml used in path construction without explicit validation
- **Mitigating Factors**:
  - Phase names come from checkpoint wf.yaml, which is in trusted registry
  - Schema validates workflow structure (though not phase name keys specifically)
  - `pathResolver.join()` provides some protection
- **Recommendation**: Add `isPathSafe()` check before using phase.name in paths:
  ```typescript
  if (phase.name.includes('..') || phase.name.includes('/')) {
    // Return error or skip
  }
  ```
- **Severity**: MEDIUM (trusted source, but defense-in-depth recommended)

#### F03 [MEDIUM]: Defensive Error Array Access

- **File**: packages/workflow/src/services/workflow.service.ts:333-337
- **Issue**: Code accesses `versionsResult.errors[0]` after checking `errors.length > 0`
- **Problem**: Technically safe, but fragile if error structure changes
- **Recommendation**: Add defensive check:
  ```typescript
  const firstError = versionsResult.errors[0];
  if (!firstError) return this.createErrorResult('E030', { message: 'Unknown error' });
  ```
- **Severity**: MEDIUM (low likelihood of issue, but good practice)

#### F04 [LOW]: Inconsistent Path Resolution

- **File**: packages/workflow/src/services/workflow.service.ts:149-152 vs 409-412
- **Issue**: Legacy `compose()` uses Node's `path.join()` while new `composeFromRegistry()` uses injected `pathResolver.join()`
- **Impact**: Minor inconsistency, could cause platform differences in edge cases
- **Recommendation**: Future refactor to unify path handling (not blocking)
- **Severity**: LOW

### E.4 Doctrine Evolution Recommendations

**Advisory recommendations (do not affect approval):**

| Category | Priority | Recommendation |
|----------|----------|----------------|
| Rules | MEDIUM | Add path sanitization rule: "All user-derived values used in paths MUST be validated with isPathSafe()" |
| Idioms | LOW | Document the checkpoint resolution pattern (latest/ordinal/full) as a reusable idiom |

---

## F) Coverage Map

| Acceptance Criterion | Test File | Test(s) | Confidence |
|---------------------|-----------|---------|------------|
| AC-06: Latest checkpoint | compose-checkpoint.test.ts | T001-1 | 100% (explicit ID) |
| AC-06a: --checkpoint flag | compose-checkpoint.test.ts | T001-2, T001-3 | 100% (explicit ID) |
| AC-06b: E034 no checkpoints | compose-checkpoint.test.ts | T004-1, T004-2 | 100% (explicit ID) |
| AC-07: Extended wf-status | compose-checkpoint.test.ts | T003-1 through T003-4 | 100% (explicit ID) |
| Versioned path format | compose-checkpoint.test.ts | T002-1, T002-2 | 100% |
| Error E033 VERSION_NOT_FOUND | compose-checkpoint.test.ts | T001-4, T001-5 | 100% |

**Overall Coverage Confidence**: 100% - All acceptance criteria have explicit test coverage with criterion IDs in test names.

---

## G) Commands Executed

```bash
# Test suite
just test
# Result: 71 test files, 967 tests passed

# Type check
just typecheck
# Result: PASS (after fixing workflow.tools.ts)

# Linting
just lint
# Result: Checked 289 files in 48ms. No fixes applied.

# Git status
git status --porcelain
# Result: 14 modified files, 2 new files (compose-checkpoint.test.ts, tasks dir)
```

---

## H) Decision & Next Steps

### Decision: APPROVE ✅

Phase 3 implementation is complete and meets all acceptance criteria. The code follows Full TDD practices with exemplary test documentation. One issue discovered during review (MCP tools missing IWorkflowRegistry) has been fixed.

### Next Steps

1. **Commit Phase 3 changes** including the MCP fix:
   ```bash
   git add -A
   git commit -m "feat(workflow): Phase 3 Compose Extension for Versioned Runs"
   ```

2. **Optional hardening** (can be done in Phase 5 or later):
   - Add `isPathSafe()` check for phase names (F02)
   - Add defensive error check (F03)

3. **Proceed to Phase 4**: Init Command with Starter Templates
   - Run `/plan-5-phase-tasks-and-brief --phase "Phase 4: Init Command with Starter Templates"`

---

## I) Footnotes Audit

| Diff Path | Task | Footnote | Plan Ledger |
|-----------|------|----------|-------------|
| packages/workflow/src/services/workflow.service.ts | T008, T009, T010, T011 | Pending | § 17 (to be populated by plan-6a) |
| packages/workflow/src/interfaces/workflow-service.interface.ts | T007 | Pending | § 17 |
| packages/workflow/schemas/wf-status.schema.json | T005 | Pending | § 17 |
| packages/workflow/src/types/wf-status.types.ts | T006 | Pending | § 17 |
| packages/workflow/src/fakes/fake-workflow-service.ts | T012 | Pending | § 17 |
| packages/workflow/src/fakes/fake-workflow-registry.ts | T012 | Pending | § 17 |
| test/unit/workflow/compose-checkpoint.test.ts | T001-T004, T013 | Pending | § 17 |

**Note**: Footnotes pending plan-6a-update-progress population per plan § 17.

---

*Review generated by plan-7-code-review on 2026-01-24*
