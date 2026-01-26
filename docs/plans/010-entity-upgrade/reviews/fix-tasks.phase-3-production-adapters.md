# Fix Tasks: Phase 3 - Production Adapters

**Generated**: 2026-01-26
**Review**: [./review.phase-3-production-adapters.md](./review.phase-3-production-adapters.md)

---

## Priority Order

Complete these fixes in order (highest priority first):

---

## FIX-001: Wrap JSON.parse in loadCheckpoint() [HIGH - SEC-001]

**Severity**: HIGH
**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/adapters/workflow.adapter.ts`
**Lines**: 95-97

### What to Fix

The `JSON.parse()` call for checkpoint-metadata.json is not wrapped in try-catch, violating Critical Insight 1.

### Current Code (Line 97)

```typescript
const metadata: CheckpointMetadataFile = JSON.parse(metadataContent);
```

### Fixed Code

```typescript
let metadata: CheckpointMetadataFile;
try {
  metadata = JSON.parse(metadataContent);
} catch {
  throw new EntityNotFoundError(
    'Checkpoint',
    version,
    workflowDir,
    'Invalid JSON in checkpoint-metadata.json'
  );
}
```

### Validation

After fix, the test added in FIX-002 should pass.

---

## FIX-002: Add test for malformed checkpoint metadata [HIGH - TEST-001]

**Severity**: HIGH  
**File**: `/home/jak/substrate/007-manage-workflows/test/unit/workflow/workflow-adapter.test.ts`
**Location**: After the "loadCheckpoint: should throw EntityNotFoundError when version missing" test (around line 310)

### What to Add

Add a new test case for malformed JSON in checkpoint-metadata.json.

### Test Code to Add

```typescript
it('should throw error when checkpoint-metadata.json is malformed JSON', async () => {
  /*
  Test Doc:
  - Why: Per Critical Insight 1, must handle malformed JSON gracefully
  - Contract: Malformed metadata JSON → EntityNotFoundError thrown
  - Usage Notes: JSON parse errors should not propagate as raw exceptions
  - Quality Contribution: Verifies defensive JSON parsing per Critical Insight 1
  - Worked Example: checkpoint-metadata.json with invalid JSON → EntityNotFoundError
  */
  fs.setFile(`${CHECKPOINTS_DIR}/v001-abc12345/wf.yaml`, 'name: hello-wf\nversion: 1.0.0');
  yamlParser.setResult(SAMPLE_WF_DEFINITION);
  fs.setFile(`${CHECKPOINTS_DIR}/v001-abc12345/checkpoint-metadata.json`, '{ invalid json }');

  await expect(adapter.loadCheckpoint(SLUG, 'v001-abc12345'))
    .rejects.toThrow(EntityNotFoundError);
});
```

### Validation

```bash
pnpm test -- --run test/unit/workflow/workflow-adapter.test.ts
```

Test count should increase from 39 to 40, and all tests should pass.

---

## FIX-003: Add name-based tiebreaker to listRuns() sorting [MEDIUM - CORR-001]

**Severity**: MEDIUM
**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/adapters/workflow.adapter.ts`
**Lines**: 276-280

### What to Fix

Per Critical Insight 5, sorting must use name-based tiebreaker for deterministic ordering.

### Current Code (Lines 276-280)

```typescript
runs.sort((a, b) => {
  const dateA = a.run?.createdAt.getTime() ?? 0;
  const dateB = b.run?.createdAt.getTime() ?? 0;
  return dateB - dateA;
});
```

### Fixed Code

```typescript
// Per Critical Insight 5: Defensive sorting with name-based tiebreaker
runs.sort((a, b) => {
  const dateA = a.run?.createdAt.getTime() ?? 0;
  const dateB = b.run?.createdAt.getTime() ?? 0;
  const timeDiff = dateB - dateA;
  if (timeDiff !== 0) return timeDiff;
  return a.slug.localeCompare(b.slug);
});
```

### Optional: Add test for tiebreaker

Add test to verify deterministic ordering when timestamps are equal:

```typescript
it('should use slug-based tiebreaker when createdAt times are equal', async () => {
  /*
  Test Doc:
  - Why: Per Critical Insight 5, sorting must be deterministic
  - Contract: Equal timestamps → sort by slug alphabetically
  - Quality Contribution: Prevents non-deterministic ordering
  - Worked Example: 2 runs with same timestamp → sorted by slug
  */
  const sameTime = '2026-01-25T12:00:00Z';
  createRun('run-2026-01-25-001', 'active', sameTime); // slug inherits from workflow
  // ... create second run with different slug but same time
  
  const runs = await adapter.listRuns(SLUG);
  
  // Verify deterministic order across multiple calls
  const runs2 = await adapter.listRuns(SLUG);
  expect(runs.map(r => r.run?.runId)).toEqual(runs2.map(r => r.run?.runId));
});
```

### Validation

```bash
pnpm test -- --run test/unit/workflow/workflow-adapter.test.ts
```

---

## FIX-004: Sort imports in phase.adapter.ts [LOW - LINT-001]

**Severity**: LOW
**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/adapters/phase.adapter.ts`
**Lines**: 14-21

### What to Fix

Import statements need reordering per Biome configuration.

### Fix Command

```bash
cd /home/jak/substrate/007-manage-workflows
pnpm lint --fix packages/workflow/src/adapters/phase.adapter.ts
```

### Validation

```bash
pnpm lint
```

Should complete with no errors.

---

## Final Validation

After completing all fixes:

```bash
cd /home/jak/substrate/007-manage-workflows

# Run all Phase 3 tests
pnpm test -- --run \
  test/unit/workflow/workflow-adapter.test.ts \
  test/unit/workflow/phase-adapter.test.ts \
  test/contracts/workflow-adapter.contract.test.ts \
  test/contracts/phase-adapter.contract.test.ts \
  test/unit/workflow/entity-navigation.test.ts

# Run full test suite
pnpm test

# Run type check
pnpm typecheck

# Run linter
pnpm lint
```

**Expected Results:**
- Test count: 88+ tests (40 workflow adapter + 17 phase adapter + 24 contracts + 7 navigation)
- All tests pass
- TypeScript compiles clean
- Lint passes with no errors

---

## Re-Review Trigger

After completing all fixes:
1. Commit changes
2. Request re-review with: `/plan-7-code-review --phase "Phase 3: Production Adapters"`
3. Expected verdict: **APPROVE**
