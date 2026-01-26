# Phase 4: Init Command with Starter Templates - Fix Tasks

**Phase**: Phase 4: Init Command with Starter Templates
**Date**: 2026-01-25
**Review**: [review.phase-4-init-command-starter-templates.md](./review.phase-4-init-command-starter-templates.md)
**Testing Approach**: Full TDD

---

## Required Fixes (Must complete before merge)

### FIX-01: Add Slug Validation (SEC-01)

**Severity**: HIGH
**File**: `packages/workflow/src/services/init.service.ts`
**Lines**: 183-192

**Problem**: Template slugs from filesystem are used directly in path construction without validation. Path traversal attack possible with directory names like `../../tmp`.

**Fix Steps** (TDD):

1. **Write failing test** in `test/unit/workflow/init-service.test.ts`:
```typescript
it('should skip template directories with invalid slugs', async () => {
  /*
  Test Doc:
  - Why: Prevent path traversal attacks via malicious template directory names
  - Contract: Only template directories matching slug pattern are processed
  - Usage Notes: Invalid slugs are silently skipped
  - Quality Contribution: Security - prevents arbitrary file write
  - Worked Example: '../escape' template → skipped, not copied
  */
  // Add malicious directory to bundled templates
  fs.setDir(`${bundleDir}/assets/templates/workflows/../../../tmp`);
  fs.setFile(`${bundleDir}/assets/templates/workflows/../../../tmp/wf.yaml`, 'name: Evil');

  const result = await initService.init(projectDir);

  // Should not process malicious directory
  expect(result.hydratedTemplates).not.toContain('../../../tmp');
  expect(await fs.exists(`${projectDir}/../../../tmp`)).toBe(false);
});
```

2. **Implement fix** in `init.service.ts`:
```typescript
// Add at top of file after imports
const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

// In hydrateStarterTemplates(), after line 183:
for (const slug of templateDirs) {
  // SEC-01: Validate slug before path construction
  if (!SLUG_PATTERN.test(slug)) {
    continue; // Skip invalid template directory names
  }
  // ... rest of loop
}
```

3. **Verify test passes**:
```bash
pnpm test -- test/unit/workflow/init-service.test.ts
```

---

### FIX-02: Add Error Handling to init() (SEC-02)

**Severity**: HIGH
**File**: `packages/workflow/src/services/init.service.ts`
**Lines**: 69-91

**Problem**: No try-catch blocks; filesystem errors bubble up uncaught instead of being captured in `result.errors`.

**Fix Steps** (TDD):

1. **Write failing test** in `test/unit/workflow/init-service.test.ts`:
```typescript
it('should capture filesystem errors in result.errors', async () => {
  /*
  Test Doc:
  - Why: Graceful error handling instead of uncaught exceptions
  - Contract: Filesystem errors are captured in result.errors with actionable messages
  - Usage Notes: Errors include error code and suggested action
  - Quality Contribution: User experience - clear error messages
  - Worked Example: Permission denied → { code: 'E040', message: '...', action: '...' }
  */
  // Simulate filesystem error
  fs.setSimulatedError(`${projectDir}/.chainglass/workflows`, new Error('EACCES: Permission denied'));

  const result = await initService.init(projectDir);

  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].code).toBe('E040');
  expect(result.errors[0].message).toContain('Permission denied');
  expect(result.errors[0].action).toBeDefined();
});

it('should capture template hydration errors separately', async () => {
  /*
  Test Doc:
  - Why: Distinguish directory creation errors from template errors
  - Contract: Template hydration errors use different error code
  - Usage Notes: Allows partial success (dirs created but templates failed)
  - Quality Contribution: Debugging - specific error codes
  - Worked Example: Template copy fails → { code: 'E041', ... }
  */
  // Simulate error during template copy
  fs.setSimulatedError(`${bundleDir}/assets/templates/workflows/hello-workflow`, new Error('ENOENT'));

  const result = await initService.init(projectDir);

  // Directories should be created
  expect(result.createdDirs).toContain('.chainglass/workflows');
  // But template hydration should fail
  expect(result.errors.some(e => e.code === 'E041')).toBe(true);
});
```

2. **Implement fix** in `init.service.ts`:
```typescript
async init(projectDir: string, options?: InitOptions): Promise<InitResult> {
  const result: InitResult = {
    errors: [],
    createdDirs: [],
    hydratedTemplates: [],
    overwrittenTemplates: [],
    skippedTemplates: [],
  };

  const force = options?.force ?? false;

  // Step 1: Create directory structure
  try {
    const createdDirs = await this.createDirectoryStructure(projectDir);
    result.createdDirs.push(...createdDirs);
  } catch (error) {
    result.errors.push({
      code: 'E040',
      message: `Failed to create directory structure: ${error instanceof Error ? error.message : String(error)}`,
      action: 'Check filesystem permissions and try again.',
    });
    return result; // Early return on directory creation failure
  }

  // Step 2: Hydrate starter templates
  try {
    const templateResult = await this.hydrateStarterTemplates(projectDir, force);
    result.hydratedTemplates.push(...templateResult.hydrated);
    result.skippedTemplates.push(...templateResult.skipped);
    result.overwrittenTemplates.push(...templateResult.overwritten);
  } catch (error) {
    result.errors.push({
      code: 'E041',
      message: `Failed to hydrate templates: ${error instanceof Error ? error.message : String(error)}`,
      action: 'Check bundled templates and filesystem permissions.',
    });
  }

  return result;
}
```

3. **Verify tests pass**:
```bash
pnpm test -- test/unit/workflow/init-service.test.ts
```

---

## Recommended Fixes (Can defer to follow-up)

### FIX-03: Use path.join() in copyDirectoryRecursive() (QUA-01)

**Severity**: MEDIUM
**File**: `packages/shared/src/adapters/node-filesystem.adapter.ts`
**Lines**: 163-176

**Problem**: Uses string concatenation for path construction.

**Fix**:
```typescript
import { join } from 'node:path';

// Replace:
const currentSource = relativePath ? `${sourceBase}/${relativePath}` : sourceBase;
const currentDest = relativePath ? `${destBase}/${relativePath}` : destBase;

// With:
const currentSource = relativePath ? join(sourceBase, relativePath) : sourceBase;
const currentDest = relativePath ? join(destBase, relativePath) : destBase;

// Same for other path constructions in the method
```

---

### FIX-04: Add Cleanup on Partial Copy Failure (QUA-02)

**Severity**: MEDIUM
**File**: `packages/workflow/src/services/init.service.ts`
**Lines**: 220-238

**Problem**: Partial copy leaves inconsistent state.

**Fix**:
```typescript
// In hydrateStarterTemplates(), around line 221:
try {
  await this.fs.copyDirectory(sourcePath, currentDir);
} catch (error) {
  // Cleanup partial copy
  if (await this.fs.exists(currentDir)) {
    try {
      await this.fs.rmdir(currentDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  throw error; // Re-throw to be caught by init()
}
```

---

## Verification Steps

After implementing fixes:

```bash
# 1. Run all Phase 4 tests
pnpm test -- test/unit/workflow/init-service.test.ts test/unit/shared/filesystem-copy-directory.test.ts

# 2. Run type check
pnpm typecheck

# 3. Run linter
pnpm lint

# 4. Build and verify
pnpm build
ls apps/cli/dist/assets/templates/workflows/hello-workflow/

# 5. Manual verification
cd /tmp && mkdir test-init && cd test-init
node /path/to/apps/cli/dist/cli.cjs init
node /path/to/apps/cli/dist/cli.cjs init --force
```

---

## Summary

| Fix ID | Severity | Effort | Status |
|--------|----------|--------|--------|
| FIX-01 | HIGH | 30min | Required |
| FIX-02 | HIGH | 45min | Required |
| FIX-03 | MEDIUM | 15min | Recommended |
| FIX-04 | MEDIUM | 20min | Recommended |

**Estimated Total Effort**: ~2 hours (required fixes only: ~1.5 hours)

---

*Fix tasks generated by plan-7-code-review on 2026-01-25*
