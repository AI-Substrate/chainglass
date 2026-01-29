# Phase 6 Fix Tasks: E2E Validation & Cleanup

**Review**: [review.phase-6-e2e-validation-cleanup.md](review.phase-6-e2e-validation-cleanup.md)
**Created**: 2026-01-28
**Priority**: CRITICAL fixes required before merge

---

## Critical Fixes (Required)

### FIX-001: Command Injection in E2E Harness

**File**: `docs/how/dev/workgraph-run/e2e-sample-flow.ts`
**Line**: ~609
**Severity**: CRITICAL

**Issue**: scriptPath from CLI output is interpolated into shell command without sanitization.

**Current Code**:
```typescript
const result = await execAsync(`bash "${scriptPath}"`);
```

**Fixed Code**:
```typescript
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

// Replace execAsync call with spawn
const { stdout, stderr } = await new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
  const proc = spawn('bash', [scriptPath], { cwd: process.cwd() });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (data) => { stdout += data; });
  proc.stderr.on('data', (data) => { stderr += data; });
  proc.on('close', (code) => {
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`Script exited with code ${code}: ${stderr}`));
  });
});
```

**Test**: Run E2E mock mode after fix.

---

### FIX-002: Empty Stdout Handling

**File**: `docs/how/dev/workgraph-run/lib/cli-runner.ts`
**Line**: 72-74
**Severity**: CRITICAL

**Issue**: When stdout is empty, fallback returns empty string causing JSON.parse to fail silently.

**Current Code**:
```typescript
if (!resultLine) {
  // Fallback: try last line
  resultLine = lines[lines.length - 1];
}
```

**Fixed Code**:
```typescript
if (!resultLine) {
  // Fallback: try last line, but check it's not empty
  const lastLine = lines[lines.length - 1]?.trim();
  if (lastLine) {
    resultLine = lastLine;
  } else {
    // No valid JSON found - return explicit error
    return {
      success: false,
      stdout: stdout.trim(),
      stderr,
      data: {
        errors: [{ code: 'CLI_EMPTY_RESPONSE', message: 'CLI returned no JSON output' }],
      } as T,
    };
  }
}
```

**Test**: Add test case for empty stdout scenario.

---

## High Priority Fixes (Recommended)

### FIX-003: Improve JSON Detection

**File**: `docs/how/dev/workgraph-run/lib/cli-runner.ts`
**Line**: 66
**Severity**: HIGH

**Issue**: String matching for JSON fields is brittle - log lines could match.

**Current Code**:
```typescript
if (line && (line.includes('"success"') || line.includes('"error"'))) {
  resultLine = line;
  break;
}
```

**Fixed Code**:
```typescript
if (line) {
  try {
    const parsed = JSON.parse(line);
    if ('success' in parsed || 'error' in parsed) {
      resultLine = line;
      break;
    }
  } catch {
    // Not valid JSON, continue searching
  }
}
```

---

### FIX-004: Path Traversal Validation

**File**: `docs/how/dev/workgraph-run/lib/cli-runner.ts`
**Line**: ~245 (loadPromptTemplate function)
**Severity**: HIGH

**Issue**: unitSlug parameter not validated, allows path traversal.

**Add validation**:
```typescript
export async function loadPromptTemplate(unitSlug: string, templateName: string): Promise<string> {
  // Validate unitSlug - only alphanumeric and hyphens
  if (!/^[a-z0-9-]+$/.test(unitSlug)) {
    throw new Error(`Invalid unit slug: ${unitSlug}`);
  }
  
  const templatePath = resolve(UNITS_DIR, unitSlug, 'commands', templateName);
  // ... rest of function
}
```

---

## Documentation Fixes (Advisory)

### FIX-005: Add Phase 6 Footnotes

**Files**: 
- `docs/plans/021-workgraph-workspaces-upgrade/tasks/phase-6-e2e-validation-cleanup/tasks.md`
- `docs/plans/021-workgraph-workspaces-upgrade/workgraph-workspaces-upgrade-plan.md`

**Action**: Add footnotes [^6]-[^10] tracking Phase 6 file changes:
- [^6]: e2e-sample-flow.ts - cleanup() updated for 3 paths
- [^7]: test/integration/workgraph/*.test.ts - WorkspaceContext added
- [^8]: .chainglass/data/units/* - units migrated from legacy location
- [^9]: CLI command doc comments updated
- [^10]: cli-runner.ts - NDJSON parsing and path updates

---

## Verification Commands

After applying fixes:

```bash
# Run tests
pnpm test

# Run E2E mock mode
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts

# Verify no new issues
pnpm lint
pnpm typecheck
```

---

## Summary

| Fix | Priority | Effort | Blocking? |
|-----|----------|--------|-----------|
| FIX-001 | CRITICAL | 15 min | Yes |
| FIX-002 | CRITICAL | 10 min | Yes |
| FIX-003 | HIGH | 10 min | No |
| FIX-004 | HIGH | 5 min | No |
| FIX-005 | LOW | 15 min | No |

**Total Estimated Effort**: ~55 minutes

After CRITICAL fixes (FIX-001, FIX-002), re-run `/plan-7-code-review` to confirm APPROVE status.
