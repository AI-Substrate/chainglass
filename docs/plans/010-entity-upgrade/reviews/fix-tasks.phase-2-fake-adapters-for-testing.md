# Phase 2: Fake Adapters for Testing - Fix Tasks

**Review**: [./review.phase-2-fake-adapters-for-testing.md](./review.phase-2-fake-adapters-for-testing.md)
**Status**: APPROVED with 1 required fix

---

## Required Before Merge

### FIX-001: Revert Out-of-Scope Changes (HIGH)

**Finding**: SC-001
**File**: `test/integration/agent-streaming.test.ts`
**Lines**: 58-61, 186-189

**Issue**: This file was modified outside Phase 2 scope. The changes permanently skip integration tests instead of using conditional skip.

**Fix Options**:

**Option A (Recommended): Revert the changes**
```bash
git checkout HEAD -- test/integration/agent-streaming.test.ts
```

**Option B: Create separate PR**
If the change is intentional (tests are permanently flaky), create a separate PR with:
1. Clear commit message explaining why tests are skipped
2. Issue link if this is tracking a known problem
3. Update execution.log.md to document this decision

**Verification**:
```bash
# After reverting, check the file is back to original:
git diff HEAD -- test/integration/agent-streaming.test.ts
# Should show no output (file unchanged)
```

---

## Optional Improvements

### OPT-001: Add Empty Filter Edge Case Test (LOW)

**Finding**: Q-006
**File**: `test/unit/workflow/fake-workflow-adapter.test.ts`

**Add this test to the `listRuns()` describe block:**
```typescript
it('should return empty array when filter status does not match any runs', async () => {
  /*
  Test Doc:
  - Why: Edge case where filter excludes all runs should return empty array
  - Contract: listRuns with non-matching status filter returns []
  - Usage Notes: Tests filtering edge case
  - Quality Contribution: Ensures filter doesn't throw on empty result
  - Worked Example: Filter { status: 'failed' } with only active/complete runs → []
  */
  const activeRun = Workflow.createRun({
    slug: 'hello-wf',
    workflowDir: '/path/run-001',
    version: '1.0.0',
    phases: [],
    checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
    run: { runId: 'run-001', runDir: '/path/run-001', status: 'active', createdAt: new Date() },
  });

  adapter.listRunsResult = [activeRun];

  const result = await adapter.listRuns('hello-wf', { status: 'failed' });

  expect(result).toEqual([]);
});
```

### OPT-002: Improve Path Extraction (MEDIUM)

**Finding**: Q-001
**File**: `packages/workflow/src/fakes/fake-phase-adapter.ts`
**Line**: 121

**Current**:
```typescript
const phaseName = phaseDir.split('/').pop() ?? phaseDir;
```

**Improved**:
```typescript
// Handle edge cases: empty path, path without slashes, trailing slashes
const phaseName = phaseDir.split('/').filter(Boolean).pop() ?? phaseDir || 'unknown';
```

---

## Completion

After fixing FIX-001:
1. Run tests: `pnpm vitest run test/unit/workflow/fake-*.test.ts test/unit/workflow/container.test.ts`
2. Commit with message: `fix(review): revert out-of-scope changes to agent-streaming.test.ts`
3. Phase 2 is ready for merge

---

*Generated 2026-01-26*
