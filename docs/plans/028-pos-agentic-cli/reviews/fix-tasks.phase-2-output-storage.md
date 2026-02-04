# Phase 2: Output Storage — Fix Tasks

**Review**: [./review.phase-2-output-storage.md](./review.phase-2-output-storage.md)
**Created**: 2026-02-03

---

## Priority Order

Fix in this order (CRITICAL → HIGH → MEDIUM):

1. F01 — Missing interface exports (blocks compilation)
2. F03 — Error factory signature mismatch (blocks compilation)
3. F02 — Security: path traversal prevention
4. F04 — Plan task table sync
5. F05 — Execution log completion
6. F06 — TOCTOU race condition (optional)
7. F07 — Footnotes (optional)

---

## F01: Add Missing Interface Exports (CRITICAL)

**File**: `/home/jak/substrate/028-pos-agentic-cli/packages/positional-graph/src/interfaces/index.ts`

**Issue**: 4 result types defined in interface file but not exported from index.

**Patch**:
```diff
 export type {
   AddLineOptions,
   AddLineResult,
   AddNodeOptions,
   AddNodeResult,
   AvailableInput,
   AvailableSource,
   CanRunResult,
   ErrorInput,
   ExecutionStatus,
+  GetOutputDataResult,
+  GetOutputFileResult,
   GraphCreateResult,
   GraphStatusResult,
   InputEntry,
   InputPack,
   IPositionalGraphService,
   IWorkUnitLoader,
   LineStatusResult,
   MoveNodeOptions,
   NarrowWorkUnit,
   NarrowWorkUnitInput,
   NarrowWorkUnitOutput,
   NodeShowResult,
   NodeStatusResult,
   PGListResult,
   PGLoadResult,
   PGShowResult,
+  SaveOutputDataResult,
+  SaveOutputFileResult,
   StarterReadiness,
   WaitingInput,
 } from './positional-graph-service.interface.js';
```

**Validation**: `pnpm typecheck` passes

---

## F03: Fix Error Factory Signature (HIGH)

**File**: `/home/jak/substrate/028-pos-agentic-cli/packages/positional-graph/src/errors/positional-graph-errors.ts`

**Option A**: Update factory to accept optional reason (RECOMMENDED):
```diff
-export function fileNotFoundError(sourcePath: string): ResultError {
+export function fileNotFoundError(sourcePath: string, reason?: string): ResultError {
   return {
     code: POSITIONAL_GRAPH_ERROR_CODES.E179,
-    message: `Source file not found: ${sourcePath}`,
+    message: reason 
+      ? `${reason}: ${sourcePath}` 
+      : `Source file not found: ${sourcePath}`,
     action: 'Verify file path exists and is accessible',
   };
 }
```

**Option B**: Simplify service calls to single argument:
```diff
 // packages/positional-graph/src/services/positional-graph.service.ts
-errors: [fileNotFoundError(outputName, 'Output name contains invalid path traversal')],
+errors: [fileNotFoundError(`Path traversal in output name: ${outputName}`)],

-errors: [fileNotFoundError(sourcePath, 'Source path contains path traversal')],
+errors: [fileNotFoundError(`Path traversal in source: ${sourcePath}`)],

-errors: [fileNotFoundError(sourcePath, 'Source file does not exist')],
+errors: [fileNotFoundError(sourcePath)],
```

**Validation**: `pnpm typecheck` passes

---

## F02: Implement Path Containment Check (CRITICAL)

**File**: `/home/jak/substrate/028-pos-agentic-cli/packages/positional-graph/src/services/positional-graph.service.ts`

**Location**: `saveOutputFile` method, after node validation

**Current code** (lines 1471-1497):
```typescript
// Security: reject path traversal in output name
if (outputName.includes('..')) {
  return { saved: false, errors: [...] };
}

// Security: reject path traversal in source path
if (sourcePath.includes('..')) {
  return { saved: false, errors: [...] };
}
```

**Replace with belt-and-suspenders approach**:
```typescript
// Security: reject path traversal in output name
if (outputName.includes('..') || outputName.includes('/') || outputName.includes('\\')) {
  return {
    saved: false,
    errors: [fileNotFoundError(outputName, 'Invalid output name (path traversal or separators)')],
  };
}

// Security: reject obvious path traversal patterns
if (sourcePath.includes('..')) {
  return {
    saved: false,
    errors: [fileNotFoundError(sourcePath, 'Source path contains path traversal')],
  };
}

// Security: resolve and verify containment (belt-and-suspenders)
const resolvedSource = this.pathResolver.resolve(sourcePath);
const workspaceRoot = ctx.worktreePath;
if (!resolvedSource.startsWith(workspaceRoot + '/') && resolvedSource !== workspaceRoot) {
  return {
    saved: false,
    errors: [fileNotFoundError(sourcePath, 'Source path outside workspace')],
  };
}
```

**Note**: If `IPathResolver` doesn't have a `resolve()` method, use:
```typescript
import { resolve as pathResolve } from 'node:path';
const resolvedSource = pathResolve(sourcePath);
```

**Add tests** to `output-storage.test.ts`:
```typescript
it('rejects absolute path outside workspace', async () => {
  const result = await service.saveOutputFile(
    ctx, 'test-graph', nodeId, 'secret', '/etc/passwd'
  );
  expect(result.saved).toBe(false);
  expect(result.errors.length).toBe(1);
});
```

**Validation**: New test passes, existing tests pass

---

## F04: Update Plan Task Table (HIGH)

**File**: `/home/jak/substrate/028-pos-agentic-cli/docs/plans/028-pos-agentic-cli/pos-agentic-cli-plan.md`

**Location**: Lines 251-271 (Phase 2 task table)

**Change**: Update all `[ ]` to `[x]` and add Log column links:

```diff
 | # | Status | Task | CS | Success Criteria | Log | Notes |
 |---|--------|------|----|------------------|-----|-------|
-| 2.1 | [ ] | Write tests for `saveOutputData` service method | 2 | Tests: saves value to data.json, merges with existing, handles JSON types | - | output-storage.test.ts |
+| 2.1 | [x] | Write tests for `saveOutputData` service method | 2 | Tests: saves value to data.json, merges with existing, handles JSON types | [📋](tasks/phase-2-output-storage/execution.log.md#task-t001) | output-storage.test.ts |
```

(Repeat for all 14 tasks: 2.1-2.13)

**Validation**: Visual inspection confirms sync with dossier

---

## F05: Complete Execution Log (HIGH)

**File**: `/home/jak/substrate/028-pos-agentic-cli/docs/plans/028-pos-agentic-cli/tasks/phase-2-output-storage/execution.log.md`

**Add missing task entries** (T005-T007, T009-T010, T012-T014):

The current log consolidates T004, T008, T011, T014 into one section. Add individual entries for remaining tasks or expand the consolidated section to clarify which tests/code addressed each task.

**Template for each missing task**:
```markdown
---

## Task T005: Write tests for saveOutputFile with path validation
**Started**: 2026-02-03
**Status**: ✅ Complete (included in T001)

### What I Did
Tests for saveOutputFile were included in the comprehensive T001 test suite:
- copies file to data/outputs/ directory
- rejects path traversal in source path  
- rejects path traversal in output name
- returns E179 for missing source file
- creates data/outputs/ directory if missing
- preserves file extension
- returns E153 for unknown node

### Evidence
See T001 Evidence — all 21 tests pass.

### Files Changed
- (same as T001) test/unit/positional-graph/output-storage.test.ts

**Completed**: 2026-02-03
```

**Validation**: All 14 tasks have log entries with anchors

---

## F06: Remove TOCTOU Race (MEDIUM)

**File**: `/home/jak/substrate/028-pos-agentic-cli/packages/positional-graph/src/services/positional-graph.service.ts`

**Location**: `saveOutputFile` method, lines 1493-1515

**Remove redundant exists check**:
```diff
-    // Verify source file exists
-    const sourceExists = await this.fs.exists(sourcePath);
-    if (!sourceExists) {
-      return {
-        saved: false,
-        errors: [fileNotFoundError(sourcePath, 'Source file does not exist')],
-      };
-    }
-
     const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
```

**Then wrap readFile in try-catch**:
```typescript
let content: string;
try {
  content = await this.fs.readFile(resolvedSource);
} catch (err: unknown) {
  if ((err as { code?: string }).code === 'ENOENT') {
    return {
      saved: false,
      errors: [fileNotFoundError(sourcePath, 'Source file does not exist')],
    };
  }
  throw err;
}
```

**Validation**: E179 test still passes

---

## F07: Add Phase 2 Footnotes (MEDIUM)

**Files**:
1. `/home/jak/substrate/028-pos-agentic-cli/docs/plans/028-pos-agentic-cli/pos-agentic-cli-plan.md` § Change Footnotes Ledger
2. `/home/jak/substrate/028-pos-agentic-cli/docs/plans/028-pos-agentic-cli/tasks/phase-2-output-storage/tasks.md` § Phase Footnote Stubs

**Add to plan ledger** (after [^3]):
```markdown
### Phase 2: Output Storage

[^4]: Phase 2 - Output storage service methods
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:saveOutputData` - Save JSON output
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:saveOutputFile` - Save file output
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:getOutputData` - Get JSON output
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:getOutputFile` - Get file path

[^5]: Phase 2 - Output storage result types
  - `interface:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts:SaveOutputDataResult`
  - `interface:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts:SaveOutputFileResult`
  - `interface:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts:GetOutputDataResult`
  - `interface:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts:GetOutputFileResult`

[^6]: Phase 2 - Output storage CLI commands
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleSaveOutputData`
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleSaveOutputFile`
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleGetOutputData`
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleGetOutputFile`

[^7]: Phase 2 - Output storage tests
  - `file:test/unit/positional-graph/output-storage.test.ts` - 21 tests
```

**Add to dossier stubs**:
```markdown
| Footnote | Task | Description |
|----------|------|-------------|
| [^4] | T003, T007, T010, T013 | Service method implementations |
| [^5] | T002, T006 | Interface result types |
| [^6] | T004, T008, T011, T014 | CLI command handlers |
| [^7] | T001, T005, T009, T012 | Test implementations |
```

**Validation**: Footnotes sequential [^4]-[^7], cross-referenced

---

## Validation Checklist

After all fixes:

```bash
# Must pass
pnpm typecheck
pnpm vitest run test/unit/positional-graph/output-storage.test.ts
pnpm vitest run test/unit/positional-graph/

# No new lint errors
pnpm lint
```

Then re-run `/plan-7-code-review --phase "Phase 2: Output Storage"`.

---

**End of Fix Tasks**
