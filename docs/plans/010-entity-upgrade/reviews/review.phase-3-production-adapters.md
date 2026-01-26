# Code Review: Phase 3 - Production Adapters

**Review Date**: 2026-01-26
**Reviewer**: Automated Code Review Agent
**Plan**: [../../entity-upgrade-plan.md](../../entity-upgrade-plan.md)
**Phase Doc**: [../tasks/phase-3-production-adapters/tasks.md](../tasks/phase-3-production-adapters/tasks.md)
**Diff Range**: `e4e0192..54d9ffa`

---

## A) Verdict

**REQUEST_CHANGES**

Two HIGH severity findings require fixes before merge:
1. Missing try-catch around JSON.parse in `loadCheckpoint()` 
2. Missing test for malformed checkpoint metadata JSON

---

## B) Summary

Phase 3 implements production WorkflowAdapter and PhaseAdapter with 87 new tests. The implementation demonstrates exemplary TDD compliance and proper use of DI patterns. All path operations correctly use `pathResolver.join()`.

**Key Strengths:**
- Full TDD compliance: RED→GREEN→REFACTOR documented
- Zero mock library usage (Fakes via DI only)
- All 17 tasks completed successfully
- 87 comprehensive tests with Test Doc blocks
- Contract tests verify fake/real parity
- Path security: 100% pathResolver usage

**Issues Found:**
- 1 HIGH: Unsafe JSON.parse in `loadCheckpoint()` without try-catch
- 1 HIGH: Missing test for corrupted checkpoint-metadata.json
- 1 MEDIUM: Missing name-based tiebreaker in `listRuns()` sorting
- 1 LOW: Import organization in phase.adapter.ts

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior with Test Doc blocks)
- [x] Mock usage matches spec: Fakes via DI (no vi.mock)
- [x] Negative/edge cases covered (24+ error scenarios)

**Critical Insights Applied:**
- [x] Critical Insight 1: JSON.parse wrapped in try-catch for `loadRun()` ✓
- [ ] Critical Insight 1: JSON.parse wrapped in try-catch for `loadCheckpoint()` ✗ MISSING
- [x] Critical Insight 5: Defensive sorting with name-based tiebreaker for `listForWorkflow()` ✓
- [ ] Critical Insight 5: Defensive sorting with name-based tiebreaker for `listRuns()` ✗ MISSING

**Universal:**
- [x] BridgeContext patterns followed (pathResolver, no direct path.join)
- [x] Only in-scope files changed (17 planned files)
- [x] TypeScript compiles clean
- [ ] Linters clean (1 import organization issue in phase.adapter.ts)
- [x] Absolute paths used via pathResolver (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | HIGH | workflow.adapter.ts:97 | Unsafe JSON.parse in loadCheckpoint() | Wrap in try-catch, throw CheckpointCorruptError |
| TEST-001 | HIGH | workflow-adapter.test.ts | Missing test for malformed checkpoint-metadata.json | Add test case per Critical Insight 1 |
| CORR-001 | MEDIUM | workflow.adapter.ts:276-280 | listRuns() sorting lacks name-based tiebreaker | Add secondary sort by slug per Critical Insight 5 |
| LINT-001 | LOW | phase.adapter.ts:14-21 | Import statements not sorted | Run `pnpm lint --fix` |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**N/A** - Phase 3 adds new adapters without modifying Phase 1 or Phase 2 deliverables. No regression risk.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Link Validation)
- **Task↔Log**: All 17 tasks have execution log entries ✓
- **Task↔Footnote**: N/A for this phase (no plan § 12 footnotes required for adapter code)
- **Plan↔Dossier**: Task statuses synchronized ✓
- **Verdict**: ✅ INTACT

#### TDD Compliance (Subagent 1 Report)
- **TDD Order**: ✓ VERIFIED - Tests written before implementation
- **RED Phase**: 56 tests failing with "constructor not defined" documented
- **GREEN Phase**: All tests passing after implementation
- **REFACTOR Phase**: Contract tests, navigation tests, container registration completed
- **Verdict**: ✅ PASS (A+ Grade - exemplary compliance)

#### Mock Usage (Subagent 2 Report)
- **Policy**: Fakes via DI (no vi.mock/jest.mock)
- **Violations**: 0
- **Fakes Used**: FakeFileSystem, FakePathResolver, FakeYamlParser, FakeWorkflowAdapter, FakePhaseAdapter
- **Verdict**: ✅ PASS

#### Path Security (Subagent 3 Report)
- **pathResolver.join() usage**: 19 instances across both adapters ✓
- **direct path.join() usage**: 0 ✓
- **relative path strings**: 0 ✓
- **Verdict**: ✅ PASS

#### Plan Compliance (Subagent 4 Report)
- **Task Completion**: 17/17 tasks PASS
- **Scope Creep**: None detected
- **ADR-0004 Compliance**: useFactory pattern used in both containers ✓
- **Verdict**: ✅ PASS

### E.2) Semantic Analysis

No semantic issues found. Business logic correctly implements the unified entity model:
- `isCurrent XOR isCheckpoint XOR isRun` invariant enforced by factory methods
- Data locality maintained (each entity loads from its own path)
- No caching (always fresh reads per spec Q5)

### E.3) Quality & Safety Analysis

**Safety Score: 60/100** (CRITICAL: 0, HIGH: 2, MEDIUM: 1, LOW: 1)
**Verdict: REQUEST_CHANGES**

#### SEC-001 [HIGH] - Unsafe JSON.parse in loadCheckpoint()

**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/adapters/workflow.adapter.ts`
**Lines**: 95-97

**Issue**: `JSON.parse()` for checkpoint-metadata.json is not wrapped in try-catch, violating Critical Insight 1 which requires defensive JSON parsing with proper error types.

**Evidence**:
```typescript
// Line 97 - UNSAFE
const metadata: CheckpointMetadataFile = JSON.parse(metadataContent);
```

Compare with `loadRun()` which correctly wraps JSON.parse (lines 136-145):
```typescript
// Lines 136-145 - CORRECT
let wfStatus: WfStatus;
try {
  wfStatus = JSON.parse(content);
} catch {
  throw new RunCorruptError(
    this.pathResolver.basename(runDir),
    runDir,
    'Invalid JSON in wf-status.json'
  );
}
```

**Impact**: Malformed checkpoint-metadata.json will cause unhandled exception instead of descriptive error.

**Fix**: Wrap JSON.parse in try-catch, throw descriptive error.

**Patch**:
```diff
- const metadata: CheckpointMetadataFile = JSON.parse(metadataContent);
+ let metadata: CheckpointMetadataFile;
+ try {
+   metadata = JSON.parse(metadataContent);
+ } catch {
+   throw new EntityNotFoundError(
+     'Checkpoint',
+     version,
+     workflowDir,
+     'Invalid JSON in checkpoint-metadata.json'
+   );
+ }
```

---

#### TEST-001 [HIGH] - Missing test for malformed checkpoint metadata

**File**: `/home/jak/substrate/007-manage-workflows/test/unit/workflow/workflow-adapter.test.ts`

**Issue**: No test case exists for `loadCheckpoint()` when checkpoint-metadata.json contains malformed JSON.

**Evidence**: Grep search for "malformed.*checkpoint", "corrupt.*checkpoint" returns no matches.

Compare with `loadRun()` which has malformed JSON test (lines 427-439):
```typescript
it('should throw RunCorruptError when wf-status.json is malformed JSON', async () => {
  // ...test for malformed JSON handling
});
```

**Impact**: Critical Insight 1 compliance not validated for loadCheckpoint().

**Fix**: Add test case following the pattern from loadRun() tests.

**Patch**:
```typescript
it('should throw error when checkpoint-metadata.json is malformed JSON', async () => {
  /*
  Test Doc:
  - Why: Per Critical Insight 1, must handle malformed JSON gracefully
  - Contract: Malformed metadata JSON → descriptive error thrown
  - Quality Contribution: Verifies defensive JSON parsing
  - Worked Example: Invalid JSON → EntityNotFoundError with context
  */
  fs.setFile(`${CHECKPOINTS_DIR}/v001-abc12345/wf.yaml`, 'name: hello-wf\nversion: 1.0.0');
  yamlParser.setResult(SAMPLE_WF_DEFINITION);
  fs.setFile(`${CHECKPOINTS_DIR}/v001-abc12345/checkpoint-metadata.json`, '{ invalid json }');

  await expect(adapter.loadCheckpoint(SLUG, 'v001-abc12345'))
    .rejects.toThrow(EntityNotFoundError);
});
```

---

#### CORR-001 [MEDIUM] - listRuns() sorting lacks name-based tiebreaker

**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/adapters/workflow.adapter.ts`
**Lines**: 276-280

**Issue**: Per Critical Insight 5, sorting must use name-based tiebreaker for deterministic ordering. `listRuns()` only sorts by createdAt timestamp - runs with identical timestamps will have non-deterministic order.

**Evidence**:
```typescript
// Lines 276-280 - Missing tiebreaker
runs.sort((a, b) => {
  const dateA = a.run?.createdAt.getTime() ?? 0;
  const dateB = b.run?.createdAt.getTime() ?? 0;
  return dateB - dateA;
});
```

Compare with `listForWorkflow()` in phase.adapter.ts which correctly implements tiebreaker:
```typescript
// Lines 157-161 - CORRECT
return phases.sort((a, b) => {
  const orderDiff = a.order - b.order;
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name);
});
```

**Impact**: Non-deterministic run ordering when timestamps are identical. Tests may be flaky.

**Fix**: Add slug-based secondary sort for stability.

**Patch**:
```diff
  runs.sort((a, b) => {
    const dateA = a.run?.createdAt.getTime() ?? 0;
    const dateB = b.run?.createdAt.getTime() ?? 0;
-   return dateB - dateA;
+   const timeDiff = dateB - dateA;
+   if (timeDiff !== 0) return timeDiff;
+   return a.slug.localeCompare(b.slug);
  });
```

---

#### LINT-001 [LOW] - Import organization

**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/adapters/phase.adapter.ts`
**Lines**: 14-21

**Issue**: Import statements not sorted per Biome configuration.

**Fix**: Run `pnpm lint --fix` or manually reorder imports.

---

### E.4) Doctrine Evolution Recommendations

**Advisory - Does NOT affect verdict**

No new ADRs, rules, or idioms identified from this implementation. The adapters correctly follow existing patterns:
- useFactory registration per ADR-0004
- FakeFileSystem for testing per existing fakes pattern
- Entity factory pattern per Phase 1 decisions

---

## F) Coverage Map

### Acceptance Criteria Coverage

| Criterion | Test File | Lines | Confidence |
|-----------|-----------|-------|------------|
| loadCurrent returns Workflow with isCurrent=true | workflow-adapter.test.ts | 104-155 | 100% (explicit) |
| loadCheckpoint returns Workflow with checkpoint metadata | workflow-adapter.test.ts | 240-310 | 100% (explicit) |
| loadRun returns Workflow with run metadata | workflow-adapter.test.ts | 320-440 | 100% (explicit) |
| loadRun throws RunCorruptError on malformed JSON | workflow-adapter.test.ts | 427-439 | 100% (explicit) |
| listCheckpoints sorted by ordinal desc | workflow-adapter.test.ts | 450-510 | 100% (explicit) |
| listRuns applies status filter | workflow-adapter.test.ts | 620-650 | 100% (explicit) |
| listRuns applies date filters | workflow-adapter.test.ts | 653-691 | 100% (explicit) |
| PhaseAdapter.loadFromPath populates exists/valid/answered | phase-adapter.test.ts | 145-225 | 100% (explicit) |
| PhaseAdapter.listForWorkflow returns ordered phases | phase-adapter.test.ts | 340-390 | 100% (explicit) |
| Contract tests pass for both fake and real | contract tests | all | 100% (explicit) |

**Overall Coverage Confidence: 95%**

**Gap Identified**: Missing test for loadCheckpoint with malformed checkpoint-metadata.json.

---

## G) Commands Executed

```bash
# Test Phase 3 files (87 tests pass)
pnpm test -- --run --reporter=dot \
  test/unit/workflow/workflow-adapter.test.ts \
  test/unit/workflow/phase-adapter.test.ts \
  test/contracts/workflow-adapter.contract.test.ts \
  test/contracts/phase-adapter.contract.test.ts \
  test/unit/workflow/entity-navigation.test.ts

# TypeScript check (clean)
pnpm typecheck

# Lint check (1 issue found)
pnpm lint
```

---

## H) Decision & Next Steps

### Verdict: REQUEST_CHANGES

**Before merge, fix the following in priority order:**

1. **[HIGH] SEC-001**: Add try-catch around JSON.parse in loadCheckpoint()
2. **[HIGH] TEST-001**: Add test for malformed checkpoint-metadata.json
3. **[MEDIUM] CORR-001**: Add name-based tiebreaker to listRuns() sorting
4. **[LOW] LINT-001**: Run `pnpm lint --fix` to sort imports

**Approval Flow:**
- Fix SEC-001 + TEST-001 → Re-run tests → Update
- Fix CORR-001 → Add test for tiebreaker → Re-run tests
- Fix LINT-001 → Run lint --fix
- Re-run full test suite + lint
- Request re-review

### Recommended Workflow

```bash
# After fixes, verify:
pnpm test -- --run test/unit/workflow/workflow-adapter.test.ts
pnpm lint --fix
pnpm test
pnpm typecheck
```

---

## I) Footnotes Audit

Phase 3 does not require Change Footnotes Ledger entries as the changes are new files (not modifications to existing tracked code). The following files were added/modified:

| File | Action | Notes |
|------|--------|-------|
| packages/workflow/src/adapters/workflow.adapter.ts | Added | New file (363 lines) |
| packages/workflow/src/adapters/phase.adapter.ts | Added | New file (282 lines) |
| packages/workflow/src/adapters/index.ts | Modified | +2 exports |
| packages/workflow/src/container.ts | Modified | +21 lines (adapter registration) |
| packages/workflow/src/index.ts | Modified | +2 exports |
| apps/cli/src/lib/container.ts | Modified | +21 lines (adapter registration) |
| test/unit/workflow/workflow-adapter.test.ts | Added | New file (859 lines, 39 tests) |
| test/unit/workflow/phase-adapter.test.ts | Added | New file (448 lines, 17 tests) |
| test/contracts/workflow-adapter.contract.test.ts | Added | New file (293 lines, 14 tests) |
| test/contracts/phase-adapter.contract.test.ts | Added | New file (227 lines, 10 tests) |
| test/unit/workflow/entity-navigation.test.ts | Added | New file (207 lines, 7 tests) |

**Total**: 87 new tests, ~3,700 lines of code added
