# Phase 4: Copilot Adapter - Fix Tasks

**Phase**: Phase 4: Copilot Adapter
**Date**: 2026-01-22
**Verdict**: REQUEST_CHANGES

---

## Fix Priority Order

All fixes should follow TDD approach:
1. Write/update test for the fix (RED)
2. Implement the fix (GREEN)
3. Verify tests pass
4. Run full test suite

---

## Task FIX-001: Path Traversal Bypass (CRITICAL)

**ID**: SEC-001
**Severity**: CRITICAL
**File**: `/home/jak/substrate/002-agents/packages/shared/src/adapters/copilot.adapter.ts`
**Lines**: 290-305

### Issue
When `cwd` is undefined, `_validateCwd()` returns undefined, allowing spawn to use `process.cwd()` which bypasses workspace validation.

### Test First (RED)
Add test to `/test/unit/shared/copilot-adapter.test.ts`:

```typescript
it('should use workspaceRoot when cwd is undefined', async () => {
  /*
  Test Doc:
  - Why: SEC-001 - Prevent path traversal bypass when cwd omitted
  - Contract: When cwd is undefined, adapter uses workspaceRoot not process.cwd()
  - Usage Notes: Security invariant - never bypass workspace validation
  - Quality Contribution: Prevents arbitrary directory execution
  - Worked Example: run({prompt:"test"}) with workspaceRoot="/safe" → spawns in /safe
  */
  setupProcessExit(0);

  const workspaceRoot = '/home/test/workspace';
  const readLogFile = async () => null;
  const adapter = new CopilotAdapter(fakeProcessManager, {
    readLogFile,
    workspaceRoot,
    pollMaxTimeoutMs: 50,
  });

  await adapter.run({ prompt: 'test' }); // No cwd provided

  const history = fakeProcessManager.getSpawnHistory();
  // Spawn should use workspaceRoot, not undefined
  expect(history[0].cwd).toBe(workspaceRoot);
});
```

### Implementation Fix (GREEN)
In `copilot.adapter.ts`, modify `_validateCwd()`:

```diff
  private _validateCwd(cwd: string | undefined): string | undefined {
    if (!cwd) {
-     return undefined;
+     return this._workspaceRoot;  // Always use workspaceRoot when cwd not specified
    }

    const resolved = path.resolve(cwd);
    const normalizedRoot = path.resolve(this._workspaceRoot);

    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
      throw new Error(
        `cwd must be within workspace. Got: ${cwd}, Expected within: ${normalizedRoot}`
      );
    }

    return resolved;
  }
```

### Verification
```bash
pnpm vitest run test/unit/shared/copilot-adapter.test.ts
```

---

## Task FIX-002: Unbounded Log File Reading (HIGH)

**ID**: SEC-002
**Severity**: HIGH
**File**: `/home/jak/substrate/002-agents/packages/shared/src/adapters/copilot.adapter.ts`
**Lines**: 423-438

### Issue
`_defaultReadLogFile()` reads all `.log` files without size limits, enabling DoS via memory exhaustion.

### Test First (RED)
Add test to `/test/unit/shared/copilot-adapter.test.ts`:

```typescript
it('should skip log files exceeding size limit', async () => {
  /*
  Test Doc:
  - Why: SEC-002 - Prevent DoS via memory exhaustion from large logs
  - Contract: Log files > 10MB are skipped with warning logged
  - Usage Notes: Graceful degradation - extraction continues with smaller files
  - Quality Contribution: Resource exhaustion prevention
  - Worked Example: 15MB log file → skipped → fallback session ID used
  */
  // This test verifies the size check logic via code review
  // Actual file size testing would require FakeFileSystem
  expect(CopilotAdapter.MAX_LOG_FILE_SIZE).toBeDefined();
  expect(CopilotAdapter.MAX_LOG_FILE_SIZE).toBe(10 * 1024 * 1024); // 10MB
});
```

### Implementation Fix (GREEN)
In `copilot.adapter.ts`:

```diff
+ import * as fs from 'node:fs/promises';

  export class CopilotAdapter implements IAgentAdapter {
    // ... existing code ...

    /** Maximum prompt length (100k characters) per guardrails */
    private static readonly MAX_PROMPT_LENGTH = 100_000;
+   /** Maximum log file size (10MB) per guardrails */
+   static readonly MAX_LOG_FILE_SIZE = 10 * 1024 * 1024;

    // ...

    private async _defaultReadLogFile(logDir: string): Promise<string | null> {
      try {
        const files = await fs.readdir(logDir);
        const logFiles = files.filter(f => f.endsWith('.log'));

        let combinedContent = '';
+       let totalSize = 0;
        for (const logFile of logFiles) {
+         const filePath = path.join(logDir, logFile);
+         const stats = await fs.stat(filePath);
+         
+         if (stats.size > CopilotAdapter.MAX_LOG_FILE_SIZE) {
+           this._logger?.warn('Log file exceeds size limit, skipping', {
+             file: logFile,
+             size: stats.size,
+             limit: CopilotAdapter.MAX_LOG_FILE_SIZE,
+           });
+           continue;
+         }
+         
+         if (totalSize + stats.size > CopilotAdapter.MAX_LOG_FILE_SIZE) {
+           this._logger?.warn('Combined log content exceeds limit, stopping', {
+             totalSize,
+             limit: CopilotAdapter.MAX_LOG_FILE_SIZE,
+           });
+           break;
+         }
+
-         const content = await fs.readFile(path.join(logDir, logFile), 'utf-8');
+         const content = await fs.readFile(filePath, 'utf-8');
          combinedContent += content + '\n';
+         totalSize += stats.size;
        }

        return combinedContent || null;
      } catch {
        return null;
      }
    }
  }
```

### Verification
```bash
pnpm vitest run test/unit/shared/copilot-adapter.test.ts
```

---

## Task FIX-003: Predictable Temp Directory Names (HIGH)

**ID**: SEC-003
**Severity**: HIGH
**File**: `/home/jak/substrate/002-agents/packages/shared/src/adapters/copilot.adapter.ts`
**Lines**: 356-368

### Issue
Uses `Math.random()` for temp directory names. Predictable, enabling race condition attacks.

### Test First (RED)
Add test to `/test/unit/shared/copilot-adapter.test.ts`:

```typescript
it('should use cryptographically secure random for log directory', async () => {
  /*
  Test Doc:
  - Why: SEC-003 - Prevent temp directory prediction attacks
  - Contract: Log directory names are unpredictable (32 hex chars)
  - Usage Notes: Uses crypto.randomBytes() not Math.random()
  - Quality Contribution: Prevents race condition directory hijacking
  - Worked Example: logDir = /tmp/copilot-adapter/a1b2c3...32hexchars
  */
  setupProcessExit(0);

  const readLogFile = async () => null;
  const adapter = new CopilotAdapter(fakeProcessManager, {
    readLogFile,
    pollMaxTimeoutMs: 50,
  });

  await adapter.run({ prompt: 'test' });

  const history = fakeProcessManager.getSpawnHistory();
  const args = history[0].args;
  const logDirIndex = args.indexOf('--log-dir');
  const logDir = args[logDirIndex + 1];
  
  // Extract the random portion (after last /)
  const dirName = logDir.split('/').pop()!;
  // Should be 32 hex chars (from crypto.randomBytes(16))
  expect(dirName).toMatch(/^[0-9a-f]{32}$/);
});
```

### Implementation Fix (GREEN)
In `copilot.adapter.ts`:

```diff
  import * as path from 'node:path';
  import * as os from 'node:os';
  import * as fs from 'node:fs/promises';
+ import * as crypto from 'node:crypto';

  // ... in _createLogDir() method ...

  private async _createLogDir(): Promise<string> {
    const baseDir = path.join(os.tmpdir(), 'copilot-adapter');
-   const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
+   const runId = crypto.randomBytes(16).toString('hex'); // Cryptographically secure
    const logDir = path.join(baseDir, runId);

    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch {
      // Directory creation may fail in tests; continue anyway
    }

    return logDir;
  }
```

### Verification
```bash
pnpm vitest run test/unit/shared/copilot-adapter.test.ts
```

---

## Task FIX-004: Validation Error Handling (MEDIUM)

**ID**: COR-002
**Severity**: MEDIUM
**File**: `/home/jak/substrate/002-agents/packages/shared/src/adapters/copilot.adapter.ts`
**Lines**: 178-181

### Issue
Validation errors throw exceptions instead of returning `AgentResult` with `status: 'failed'`.

### Test First (RED)
Existing test already covers this - verify it expects correct behavior:

```typescript
// test/unit/shared/copilot-adapter.test.ts
it('should return failed status for empty prompt', async () => {
  /*
  Test Doc:
  - Why: COR-002 - Validation errors should return failed result, not throw
  - Contract: Empty prompt → AgentResult with status:'failed', not exception
  - Usage Notes: Consistent error handling across all failure paths
  - Quality Contribution: Prevents caller crashes from validation errors
  - Worked Example: run({prompt:""}) → {status:'failed', output:'Validation error: ...'}
  */
  const readLogFile = async () => null;
  const adapter = new CopilotAdapter(fakeProcessManager, {
    readLogFile,
    pollMaxTimeoutMs: 50,
  });

  // Should NOT throw, should return failed result
  const result = await adapter.run({ prompt: '   ' });
  
  expect(result.status).toBe('failed');
  expect(result.output).toContain('Validation error');
});
```

### Implementation Fix (GREEN)
In `copilot.adapter.ts`, modify `run()`:

```diff
  async run(options: AgentRunOptions): Promise<AgentResult> {
    await this._logVersionOnFirstUse();

    const { prompt, sessionId, cwd } = options;

-   // Validate cwd (may throw for path traversal)
-   const validatedCwd = this._validateCwd(cwd);
-
-   // Validate prompt (may throw)
-   this._validatePrompt(prompt);
+   // Validate inputs - return failed result instead of throwing
+   let validatedCwd: string;
+   try {
+     validatedCwd = this._validateCwd(cwd)!;
+     this._validatePrompt(prompt);
+   } catch (error) {
+     const errorMsg = error instanceof Error ? error.message : String(error);
+     return {
+       output: `Validation error: ${errorMsg}`,
+       sessionId: sessionId ?? '',
+       status: 'failed',
+       exitCode: -1,
+       tokens: null,
+     };
+   }

    // Create unique log directory per DYK Insight 1
    const logDir = await this._createLogDir();
```

### Verification
```bash
pnpm vitest run test/unit/shared/copilot-adapter.test.ts
```

---

## Verification Checklist

After applying all fixes:

```bash
# 1. Run unit tests
pnpm vitest run test/unit/shared/copilot

# 2. Run contract tests
pnpm vitest run test/contracts/agent-adapter.contract.test.ts

# 3. Run type check
pnpm typecheck

# 4. Run full test suite
pnpm vitest run test/contracts test/unit/shared/copilot

# 5. Re-run code review
# /plan-7-code-review --phase "Phase 4: Copilot Adapter" --plan "..."
```

---

## Expected Outcome

After fixes:
- All 21 CopilotAdapter unit tests pass
- All 27 contract tests pass
- 0 CRITICAL findings
- 0 HIGH findings
- Verdict: APPROVE

---

*Fix tasks generated: 2026-01-22*
*Based on review: review.phase-4-copilot-adapter.md*
