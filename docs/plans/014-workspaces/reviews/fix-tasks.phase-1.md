# Phase 1 Fix Tasks

**Review**: [review.phase-1.md](./review.phase-1.md)  
**Verdict**: REQUEST_CHANGES  
**Generated**: 2026-01-27

---

## Priority: CRITICAL (Must Fix)

### FIX-001: Path Traversal via URL Encoding Bypass

**File**: `packages/workflow/src/adapters/workspace-registry.adapter.ts`  
**Lines**: 175-200 (validatePath method)  
**Severity**: CRITICAL  

**Problem**: Path validation can be bypassed using URL-encoded `..` sequences.

**TDD Fix Steps**:

1. **Write failing test** in `test/unit/workflow/workspace-entity.test.ts`:
```typescript
it('should reject URL-encoded directory traversal', async () => {
  /*
  Test Doc:
  - Why: Security - URL encoding can bypass literal string checks
  - Contract: save() returns E076 for URL-encoded traversal paths
  - Quality Contribution: Prevents security bypass
  - Worked Example: "/home/user/%2e%2e/etc/passwd" → E076
  */
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

  // %2e = '.' in URL encoding
  const workspace = Workspace.create({
    name: 'Evil',
    path: '/home/user/%2e%2e/etc/passwd',
  });

  const result = await adapter.save(workspace);

  expect(result.ok).toBe(false);
  expect(result.errorCode).toBe('E076');
});

it('should reject double-encoded directory traversal', async () => {
  /*
  Test Doc:
  - Why: Security - double encoding can bypass single decode
  - Contract: save() returns E076 for double-encoded paths
  */
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

  // %252e = URL-encoded '%2e'
  const workspace = Workspace.create({
    name: 'Evil2',
    path: '/home/user/%252e%252e/etc/passwd',
  });

  const result = await adapter.save(workspace);

  expect(result.ok).toBe(false);
  expect(result.errorCode).toBe('E076');
});
```

2. **Run tests** - verify they FAIL (RED phase)

3. **Implement fix** in `workspace-registry.adapter.ts`:
```typescript
private validatePath(workspacePath: string): WorkspaceSaveResult {
  // Decode URL encoding to prevent bypass (decode twice for double-encoding)
  let decoded = workspacePath;
  try {
    // Decode until no more changes (handles single and double encoding)
    let prev = '';
    while (decoded !== prev) {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
    }
  } catch {
    // If decoding fails, use original (malformed URL encoding)
    decoded = workspacePath;
  }

  // Check for directory traversal in decoded path
  if (decoded.includes('..')) {
    return {
      ok: false,
      errorCode: WorkspaceErrorCodes.INVALID_PATH,
      errorMessage: `Invalid path '${workspacePath}': contains directory traversal (..)`,
      errorAction: 'Provide an absolute path without .. (e.g., /home/user/project or ~/project)',
    };
  }

  // Check if path is absolute (starts with / or ~)
  const isAbsolute = decoded.startsWith('/') || decoded.startsWith('~');
  if (!isAbsolute) {
    return {
      ok: false,
      errorCode: WorkspaceErrorCodes.INVALID_PATH,
      errorMessage: `Invalid path '${workspacePath}': path must be absolute`,
      errorAction: 'Provide an absolute path (e.g., /home/user/project or ~/project)',
    };
  }

  return { ok: true };
}
```

4. **Run tests** - verify they PASS (GREEN phase)

---

## Priority: HIGH (Must Fix)

### FIX-002: Add Path Validation on load()

**File**: `packages/workflow/src/adapters/workspace-registry.adapter.ts`  
**Lines**: 64-79 (load method)  
**Severity**: HIGH  

**Problem**: Paths loaded from registry are not validated, allowing tampered registry to load malicious paths.

**TDD Fix Steps**:

1. **Write failing test** in `test/contracts/workspace-registry-adapter.contract.test.ts`:
```typescript
// Add to WorkspaceRegistryAdapter-specific tests (not in contract factory)
describe('WorkspaceRegistryAdapter security', () => {
  it('should reject loading workspaces with traversal paths from corrupt registry', async () => {
    /*
    Test Doc:
    - Why: Security - tampered registry should not load malicious paths
    - Contract: load() throws error for invalid paths in registry
    - Quality Contribution: Defense in depth for registry tampering
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    // Manually create corrupt registry with malicious path
    const corruptRegistry = {
      version: 1,
      workspaces: [{
        slug: 'evil-workspace',
        name: 'Evil Workspace',
        path: '/home/user/../etc/passwd',
        createdAt: new Date().toISOString()
      }]
    };
    fs.setFile('~/.config/chainglass/workspaces.json', JSON.stringify(corruptRegistry));

    // Attempting to load should fail
    await expect(adapter.load('evil-workspace')).rejects.toThrow();
  });
});
```

2. **Run tests** - verify it FAILS (RED phase)

3. **Implement fix** in `workspace-registry.adapter.ts`:
```typescript
async load(slug: string): Promise<Workspace> {
  const registry = await this.readRegistry();
  const workspaceJson = registry.workspaces.find((w) => w.slug === slug);

  if (!workspaceJson) {
    throw new EntityNotFoundError('Workspace', slug, this.registryPath);
  }

  // Validate path even when loading (defense against tampered registry)
  const pathValidation = this.validatePath(workspaceJson.path);
  if (!pathValidation.ok) {
    throw new RegistryCorruptError(
      `Invalid path in registry for workspace '${slug}': ${pathValidation.errorMessage}`
    );
  }

  return Workspace.create({
    name: workspaceJson.name,
    path: workspaceJson.path,
    slug: workspaceJson.slug,
    createdAt: new Date(workspaceJson.createdAt),
  });
}
```

4. **Add import** for RegistryCorruptError at top of file

5. **Run tests** - verify they PASS (GREEN phase)

---

## Priority: MEDIUM (Should Fix)

### FIX-003: Silent Corruption Recovery

**File**: `packages/workflow/src/adapters/workspace-registry.adapter.ts`  
**Lines**: 239-242 (readRegistry catch block)  
**Severity**: MEDIUM  

**Problem**: Corrupt JSON returns empty registry silently, losing all workspace data.

**Fix**:
```typescript
try {
  const registry = JSON.parse(content) as WorkspaceRegistryFile;
  
  if (!registry.workspaces || !Array.isArray(registry.workspaces)) {
    throw new RegistryCorruptError('Invalid registry structure: missing workspaces array');
  }
  
  return registry;
} catch (error) {
  if (error instanceof RegistryCorruptError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  throw new RegistryCorruptError(`Failed to parse registry: ${message}`);
}
```

---

### FIX-004: Race Condition (Optional)

**File**: `packages/workflow/src/adapters/workspace-registry.adapter.ts`  
**Severity**: MEDIUM  

**Problem**: Concurrent read-modify-write operations can lose data.

**Recommendation**: Consider implementing file locking using `proper-lockfile` npm package in a future phase. For now, document the limitation in the adapter JSDoc.

---

## Verification

After applying fixes:

```bash
# Run all tests
pnpm test

# Verify specific workspace tests
pnpm test -- --filter @chainglass/workflow

# Re-run code review
/plan-7-code-review --phase "Phase 1: Workspace Entity + Registry Adapter + Contract Tests" --plan "/home/jak/substrate/014-workspaces/docs/plans/014-workspaces/workspaces-plan.md"
```

Expected: All tests pass, no CRITICAL or HIGH findings remain.
