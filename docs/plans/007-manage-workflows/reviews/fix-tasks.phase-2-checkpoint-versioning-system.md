# Fix Tasks: Phase 2 - Checkpoint & Versioning System

**Review**: [./review.phase-2-checkpoint-versioning-system.md](./review.phase-2-checkpoint-versioning-system.md)
**Date**: 2026-01-24

---

## Priority Order

Fix in order (HIGH severity first, then MEDIUM):

1. **[BLOCKING]** SEC-001 + SEC-002: Path traversal protection
2. **[BLOCKING]** CORR-001: Rollback on partial failure
3. SEC-003 + CORR-003 + CORR-004: Error handling
4. CORR-002: TOCTOU race condition
5. LINT-001: Formatting fixes

---

## Task 1: Path Traversal Protection (SEC-001, SEC-002)

**Severity**: HIGH (BLOCKING)
**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/services/workflow-registry.service.ts`

### Problem

`collectFilesForHash()` and `copyDirectoryRecursive()` lack canonical path validation. An attacker could use symlinks or `../` to read/copy files outside the intended directory.

### Test First (TDD)

Add to `checkpoint.test.ts`:

```typescript
describe('path traversal protection', () => {
  it('should reject entries with .. path components', async () => {
    /*
    Test Doc:
    - Why: Security - prevent path traversal attacks
    - Contract: Entries with '..' are rejected, not processed
    - Usage Notes: Applies to both hash generation and copy operations
    - Quality Contribution: Catches directory escape attempts
    - Worked Example: current/ contains '../../../etc/passwd' symlink → rejected
    */
    fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, JSON.stringify({...}));
    fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
    // Simulate malicious entry (in real scenario this would be a symlink)
    fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/../../../etc/passwd`, 'root:x:0:0');
    
    const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});
    
    // Should NOT include the traversal path in hash or copy
    // OR should return an error
    expect(result.errors.length).toBe(0); // If silently ignored
    // OR
    expect(result.errors[0].code).toBe('E0XX'); // If explicit error
  });

  it('should not follow symlinks outside workflow directory', async () => {
    // Similar test with symlink scenario
  });
});
```

### Implementation Fix

Add path validation helper and use in both functions:

```typescript
// Add at line ~70 (after EXCLUDED_DIRS constant)
/**
 * Validate that a path does not escape the base directory.
 * Checks for '..' components and ensures resolved path is within base.
 */
private isPathWithinBase(entryPath: string, basePath: string): boolean {
  // Reject any path containing '..'
  if (entryPath.includes('..')) {
    return false;
  }
  
  // Normalize and check prefix
  const normalizedEntry = this.pathResolver.join(basePath, entryPath);
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  
  return normalizedEntry.startsWith(normalizedBase) || normalizedEntry === basePath.replace(/\/$/, '');
}

// Update collectFilesForHash() at line ~375 (inside the for loop)
for (const entry of entries) {
  // Check exclusions
  if (WorkflowRegistryService.EXCLUDED_DIRS.includes(entry)) {
    continue;
  }
  
  // ADD THIS: Path traversal protection (SEC-001)
  const entryPath = relativePath
    ? this.pathResolver.join(relativePath, entry)
    : entry;
  if (!this.isPathWithinBase(entryPath, basePath)) {
    continue; // Silently skip malicious entries
  }
  
  // ... rest of function
}

// Update copyDirectoryRecursive() at line ~755 (inside the for loop)
for (const entry of entries) {
  // Skip excluded directories
  if (WorkflowRegistryService.EXCLUDED_DIRS.includes(entry)) {
    continue;
  }

  // ADD THIS: Path traversal protection (SEC-002)
  const entryRelPath = relativePath
    ? this.pathResolver.join(relativePath, entry)
    : entry;
  if (!this.isPathWithinBase(entryRelPath, sourceDir)) {
    continue; // Silently skip malicious entries
  }
  
  // ... rest of function
}
```

### Verification

```bash
npx vitest run test/unit/workflow/checkpoint.test.ts --testNamePattern="path traversal"
```

---

## Task 2: Rollback on Partial Failure (CORR-001)

**Severity**: HIGH (BLOCKING)
**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/services/workflow-registry.service.ts`

### Problem

If `copyDirectoryRecursive()` succeeds but writing `.checkpoint.json` fails, an orphaned checkpoint directory remains.

### Test First (TDD)

Add to `checkpoint.test.ts`:

```typescript
describe('checkpoint failure recovery', () => {
  it('should clean up checkpoint directory if manifest write fails', async () => {
    /*
    Test Doc:
    - Why: Data integrity - no partial checkpoints should exist
    - Contract: On failure, checkpoint directory is deleted
    - Usage Notes: Uses atomic-like pattern: all-or-nothing
    - Quality Contribution: Prevents inconsistent state
    - Worked Example: copy succeeds, manifest fails → directory cleaned up
    */
    fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, JSON.stringify({...}));
    fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
    
    // Make writeFile fail for .checkpoint.json specifically
    fs.setWriteError('.checkpoint.json', new Error('Disk full'));
    
    const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});
    
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('E099'); // Or appropriate code
    
    // Verify checkpoint directory was cleaned up
    const checkpointsDir = `${WORKFLOWS_DIR}/test-wf/checkpoints`;
    const entries = await fs.readDir(checkpointsDir);
    expect(entries).toEqual([]); // No orphaned directories
  });
});
```

### Implementation Fix

Wrap the checkpoint creation in try/catch with cleanup:

```typescript
// In checkpoint() method, replace lines 561-593 with:

// Create checkpoint directory
await this.fs.mkdir(checkpointPath, { recursive: true });

try {
  // Copy all files from current/ to checkpoint (using recursive helper)
  await this.copyDirectoryRecursive(currentDir, checkpointPath);

  // Create .checkpoint.json manifest
  const manifest: CheckpointManifest = {
    ordinal,
    hash,
    createdAt,
  };
  if (options.comment) {
    manifest.comment = options.comment;
  }
  await this.fs.writeFile(
    this.pathResolver.join(checkpointPath, '.checkpoint.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Auto-generate workflow.json if missing (per CD03)
  if (!(await this.fs.exists(workflowJsonPath))) {
    await this.generateWorkflowJson(workflowDir, slug, wfYamlPath, createdAt);
  }
} catch (error) {
  // Cleanup on partial failure (CORR-001)
  try {
    await this.fs.rmdir(checkpointPath, { recursive: true });
  } catch {
    // Best effort cleanup - ignore if already gone
  }
  return {
    errors: [
      {
        code: WorkflowRegistryErrorCodes.CHECKPOINT_FAILED,
        message: `Checkpoint creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'Check disk space and file permissions, then retry',
      },
    ],
    ordinal: 0,
    hash: '',
    version: '',
    checkpointPath: '',
    createdAt,
  };
}

return {
  errors: [],
  ordinal,
  hash,
  version,
  checkpointPath,
  createdAt,
};
```

**Note**: You'll need to add `CHECKPOINT_FAILED = 'E038'` to the error codes if not present.

### Verification

```bash
npx vitest run test/unit/workflow/checkpoint.test.ts --testNamePattern="failure recovery"
```

---

## Task 3: Error Handling for File Operations (SEC-003, CORR-003, CORR-004)

**Severity**: MEDIUM
**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/services/workflow-registry.service.ts`

### Problem

Multiple I/O operations lack try/catch, causing unhandled rejections.

### Fixes

**A) collectFilesForHash (SEC-003)** - Line 385

```typescript
// Replace:
const content = await this.fs.readFile(fullPath);
results.push({ path: entryPath, content });

// With:
try {
  const content = await this.fs.readFile(fullPath);
  results.push({ path: entryPath, content });
} catch {
  // Skip unreadable files (permissions, deleted during iteration)
  // Log warning in production
  continue;
}
```

**B) generateCheckpointHash (CORR-003)** - Line 530

```typescript
// Replace:
const hash = await this.generateCheckpointHash(workflowsDir, slug);

// With:
let hash: string;
try {
  hash = await this.generateCheckpointHash(workflowsDir, slug);
} catch (error) {
  return {
    errors: [
      {
        code: WorkflowRegistryErrorCodes.INVALID_TEMPLATE,
        message: `Failed to hash template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'Check file permissions in current/ directory',
      },
    ],
    ordinal: 0,
    hash: '',
    version: '',
    checkpointPath: '',
    createdAt,
  };
}
```

**C) restore copyDirectoryRecursive (CORR-004)** - Line 681

```typescript
// Replace:
await this.copyDirectoryRecursive(checkpointPath, currentDir);

// With:
try {
  await this.copyDirectoryRecursive(checkpointPath, currentDir);
} catch (error) {
  return {
    errors: [
      {
        code: WorkflowRegistryErrorCodes.RESTORE_FAILED,
        message: `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'Check file permissions and retry',
      },
    ],
    slug,
    version: '',
    currentPath: currentDir,
  };
}
```

---

## Task 4: TOCTOU Race Condition (CORR-002)

**Severity**: MEDIUM
**File**: `/home/jak/substrate/007-manage-workflows/packages/workflow/src/services/workflow-registry.service.ts`

### Problem

Line 774 checks `exists()` before `mkdir()`, creating a race condition.

### Fix

Remove the exists check - `mkdir({ recursive: true })` handles existing directories:

```typescript
// Replace lines 774-777:
if (parentDir !== destDir && !(await this.fs.exists(parentDir))) {
  await this.fs.mkdir(parentDir, { recursive: true });
}

// With:
if (parentDir !== destDir) {
  await this.fs.mkdir(parentDir, { recursive: true });
}
```

---

## Task 5: Lint Formatting (LINT-001)

**Severity**: LOW
**Files**: Multiple test files

### Fix

```bash
cd /home/jak/substrate/007-manage-workflows
pnpm biome check --fix --unsafe
```

This will auto-fix the 14 formatting issues in test files.

---

## Verification Checklist

After applying all fixes:

```bash
# 1. Run all tests
pnpm run test

# 2. Type check
pnpm run typecheck

# 3. Lint (should pass now)
pnpm run lint

# 4. Specifically test new security tests
npx vitest run test/unit/workflow/checkpoint.test.ts --testNamePattern="traversal|recovery"
```

---

## Error Codes to Add

If not already present, add these to `WorkflowRegistryErrorCodes`:

```typescript
export const WorkflowRegistryErrorCodes = {
  // ... existing codes
  CHECKPOINT_FAILED: 'E038',
  RESTORE_FAILED: 'E039',
} as const;
```

---

*Fix tasks generated 2026-01-24 by plan-7-code-review*
