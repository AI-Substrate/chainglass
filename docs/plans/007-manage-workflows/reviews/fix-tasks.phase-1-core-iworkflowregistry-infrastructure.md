# Phase 1: Fix Tasks

**Review**: [./review.phase-1-core-iworkflowregistry-infrastructure.md](./review.phase-1-core-iworkflowregistry-infrastructure.md)
**Status**: REQUEST_CHANGES

---

## Fix Tasks (Priority Order)

### FIX-001: Replace path.join() with pathResolver.join() (CRITICAL + HIGH)

**Severity**: CRITICAL (SEC-001) + HIGH (UNI-001)
**File**: `packages/workflow/src/services/workflow-registry.service.ts`
**Testing Approach**: Full TDD - Write failing test first, then fix

#### Step 1: Write Test (RED)

Add test to `test/unit/workflow/registry-list.test.ts`:

```typescript
it('should use IPathResolver for path composition', async () => {
  /*
  Test Doc:
  - Why: Verify pathResolver is used for secure path composition
  - Contract: Service calls pathResolver.join() for all path operations
  - Usage Notes: Required to maintain path security abstraction
  - Quality Contribution: Ensures IPathResolver injection is not wasted
  - Worked Example: list() should call pathResolver.join(dir, entry) for each workflow
  */
  const workflowJson = JSON.stringify({
    slug: 'test-wf',
    name: 'Test Workflow',
    created_at: '2026-01-24T10:00:00Z',
  });
  
  fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
  fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);
  
  await service.list(WORKFLOWS_DIR);
  
  // Verify pathResolver.join() was called (FakePathResolver tracks calls)
  expect(pathResolver.getJoinCalls().length).toBeGreaterThan(0);
});
```

#### Step 2: Fix Implementation (GREEN)

Replace all `path.join()` calls with `this.pathResolver.join()`:

```diff
--- a/packages/workflow/src/services/workflow-registry.service.ts
+++ b/packages/workflow/src/services/workflow-registry.service.ts
@@ -5,7 +5,6 @@
  * methods for querying workflow templates in .chainglass/workflows/.
  */

-import * as path from 'node:path';
 import type {
   CheckpointInfo,
   IFileSystem,
@@ -88,8 +87,8 @@ export class WorkflowRegistryService implements IWorkflowRegistry {

     // Process each potential workflow directory
     for (const entry of entries) {
-      const workflowDir = path.join(workflowsDir, entry);
-      const workflowJsonPath = path.join(workflowDir, 'workflow.json');
+      const workflowDir = this.pathResolver.join(workflowsDir, entry);
+      const workflowJsonPath = this.pathResolver.join(workflowDir, 'workflow.json');

       // Skip if no workflow.json
       if (!(await this.fs.exists(workflowJsonPath))) {
@@ -111,7 +110,7 @@ export class WorkflowRegistryService implements IWorkflowRegistry {
         const metadata: WorkflowMetadata = parsed.data;

         // Count checkpoints
-        const checkpointsDir = path.join(workflowDir, 'checkpoints');
+        const checkpointsDir = this.pathResolver.join(workflowDir, 'checkpoints');
         const checkpointCount = await this.countCheckpoints(checkpointsDir);

         workflows.push({
@@ -140,8 +139,8 @@ export class WorkflowRegistryService implements IWorkflowRegistry {
    * @returns InfoResult with workflow details or error
    */
   async info(workflowsDir: string, slug: string): Promise<InfoResult> {
-    const workflowDir = path.join(workflowsDir, slug);
-    const workflowJsonPath = path.join(workflowDir, 'workflow.json');
+    const workflowDir = this.pathResolver.join(workflowsDir, slug);
+    const workflowJsonPath = this.pathResolver.join(workflowDir, 'workflow.json');

     // Check if workflow directory exists
     if (!(await this.fs.exists(workflowDir))) {
@@ -209,7 +208,7 @@ export class WorkflowRegistryService implements IWorkflowRegistry {
     }

     // Get checkpoint versions
-    const checkpointsDir = path.join(workflowDir, 'checkpoints');
+    const checkpointsDir = this.pathResolver.join(workflowDir, 'checkpoints');
     const versions = await this.getVersions(checkpointsDir);

     const workflow: WorkflowInfo = {
@@ -234,7 +233,7 @@ export class WorkflowRegistryService implements IWorkflowRegistry {
    * @returns Path to checkpoints directory
    */
   getCheckpointDir(workflowsDir: string, slug: string): string {
-    return path.join(workflowsDir, slug, 'checkpoints');
+    return this.pathResolver.join(workflowsDir, slug, 'checkpoints');
   }

   /**
@@ -283,7 +282,7 @@ export class WorkflowRegistryService implements IWorkflowRegistry {

         const ordinal = Number.parseInt(match[1], 10);
         const hash = match[2];
-        const manifestPath = path.join(checkpointsDir, entry, '.checkpoint.json');
+        const manifestPath = this.pathResolver.join(checkpointsDir, entry, '.checkpoint.json');

         let createdAt = new Date().toISOString();
         let comment: string | undefined;
```

#### Step 3: Verify (REFACTOR)

```bash
npx vitest run test/unit/workflow/registry-list.test.ts
npx vitest run test/unit/workflow/registry-info.test.ts
npx tsc --noEmit
```

---

### FIX-002: Add JSON File Size Validation (HIGH)

**Severity**: HIGH (SEC-002)
**File**: `packages/workflow/src/services/workflow-registry.service.ts`

#### Step 1: Add Constant

```typescript
/** Maximum workflow.json file size (10MB) */
const MAX_WORKFLOW_JSON_SIZE = 10 * 1024 * 1024;
```

#### Step 2: Add Size Check Before JSON.parse

In `info()` method (around line 174):

```typescript
const content = await this.fs.readFile(workflowJsonPath);

// Size validation to prevent DoS
if (content.length > MAX_WORKFLOW_JSON_SIZE) {
  return {
    errors: [{
      code: WorkflowRegistryErrorCodes.INVALID_TEMPLATE,
      message: `workflow.json for ${slug} exceeds maximum size (${MAX_WORKFLOW_JSON_SIZE} bytes)`,
      action: `Reduce workflow.json size or split configuration`,
    }],
    workflow: undefined,
  };
}

const rawData = JSON.parse(content);
```

Similarly in `list()` method (around line 100).

---

### FIX-003: Improve Error Handling (MEDIUM)

**Severity**: MEDIUM (ERR-001, ERR-002, ERR-003)
**File**: `packages/workflow/src/services/workflow-registry.service.ts`

#### Option A: Add Error Code for Directory Read Failures

Add to `WorkflowRegistryErrorCodes`:

```typescript
/** Failed to read directory */
DIR_READ_FAILED: 'E037',
```

#### Option B: Return Error in Result Instead of Silent Catch

Replace silent catches with error returns:

```typescript
// Lines 85-86 - currently
} catch {
  return { errors: [], workflows: [] };
}

// Should be
} catch (err) {
  return {
    errors: [{
      code: WorkflowRegistryErrorCodes.DIR_READ_FAILED,
      message: `Failed to read workflows directory: ${err instanceof Error ? err.message : String(err)}`,
      action: `Check directory permissions and existence`,
    }],
    workflows: [],
  };
}
```

---

### FIX-004: Fix Lint Warnings (LOW)

**Severity**: LOW (LINT-001, LINT-002)

#### LINT-001: Replace Non-Null Assertions with Optional Chaining

In `test/unit/workflow/registry-info.test.ts`:

```diff
- expect(result.workflow!.slug).toBe('hello-wf');
+ expect(result.workflow?.slug).toBe('hello-wf');
```

Or add explicit check before assertions:

```typescript
expect(result.workflow).toBeDefined();
if (!result.workflow) return; // TypeScript now knows it's defined

expect(result.workflow.slug).toBe('hello-wf');
```

#### LINT-002: Remove Unnecessary Continue

In `workflow-registry.service.ts` line 125:

```diff
- } catch {
-   // Skip workflows with parse errors silently
-   continue;
- }
+ } catch {
+   // Skip workflows with parse errors silently (handled by outer loop)
+ }
```

---

## Validation Commands

After all fixes:

```bash
# Run all tests
npx vitest run

# Type check
npx tsc --noEmit

# Lint (should have 0 errors related to changes)
npm run lint

# Verify test count unchanged
npx vitest run --reporter=verbose | grep "Tests:"
# Expected: 908 passed (or 909+ if FIX-001 test added)
```

---

## Workshop Decisions (2026-01-24)

1. **FIX-001**: Approved as-is
2. **FIX-002**: 10MB limit confirmed
3. **FIX-003**: Option A - Add explicit E037 error code
4. **FIX-004**: Use explicit `expect().toBeDefined()` guard (clearer failure messages)

---

## Acceptance Criteria

- [x] All `path.join()` replaced with `this.pathResolver.join()` (8 locations)
- [x] `import * as path from 'node:path'` removed
- [x] JSON file size validation added (10MB limit)
- [x] E037 DIR_READ_FAILED error code added
- [x] Silent catches replaced with error returns (1 location - list() dir read)
- [x] Non-null assertions replaced with explicit guards (2 test blocks)
- [x] All 909 tests pass (1 new test added for pathResolver verification)
- [x] TypeScript compiles without errors

**Completed**: 2026-01-24

---

*Fix tasks generated 2026-01-24 by plan-7-code-review*
