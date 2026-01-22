# Phase 2: Claude Code Adapter – Fix Tasks

**Review Report**: [./review.phase-2-claude-code-adapter.md](./review.phase-2-claude-code-adapter.md)  
**Generated**: 2026-01-22  
**Status**: REQUEST_CHANGES - 8 blockers (3 CRITICAL + 5 HIGH)

---

## Priority 1: CRITICAL Fixes (Must fix before any testing)

### FIX-001 [CRITICAL]: Implement Real Process Output Collection

**Severity**: CRITICAL  
**Finding**: SEM-001  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 115-159 (run method), 240-248 (_getOutput helper)

**Issue**: Adapter only works with FakeProcessManager. Real ProcessManager returns empty string, breaking session ID extraction and token metrics.

**Current Code**:
```typescript
async run(options: AgentRunOptions): Promise<AgentResult> {
  // ... build args
  const handle = await this.processManager.spawn({ command, args, options });
  await this.processManager.waitForExit(handle.pid);
  
  // BROKEN: Only works with FakeProcessManager
  const rawOutput = this._getOutput(handle.pid);
  // ...
}

private _getOutput(pid: number): string {
  if ('getProcessOutput' in this.processManager) {
    return (this.processManager as any).getProcessOutput(pid);
  }
  return ''; // Real ProcessManager returns empty!
}
```

**Fix Strategy** (2 options):

**Option A: Add stdout/stderr to IProcessManager interface** (recommended for Phase 3)
```typescript
// In packages/shared/src/interfaces/process-manager.interface.ts
export interface ProcessHandle {
  pid: number;
  stdout?: NodeJS.ReadableStream; // Add stream access
  stderr?: NodeJS.ReadableStream;
}

// In claude-code.adapter.ts
async run(options: AgentRunOptions): Promise<AgentResult> {
  const handle = await this.processManager.spawn({ command, args, options });
  
  // Accumulate stdout from stream
  let rawOutput = '';
  if (handle.stdout) {
    handle.stdout.on('data', (chunk: Buffer) => {
      rawOutput += chunk.toString('utf-8');
    });
  }
  
  await this.processManager.waitForExit(handle.pid);
  // Now rawOutput contains actual CLI output
  
  const sessionId = this.parser.extractSessionId(rawOutput);
  // ... rest of method
}
```

**Option B: Quick fix for Phase 2 only** (if Phase 3 not ready)
```typescript
// Add to IProcessManager interface as optional method
export interface IProcessManager {
  spawn(options: SpawnOptions): Promise<ProcessHandle>;
  waitForExit(pid: number): Promise<number>;
  terminate(pid: number): Promise<void>;
  signal(pid: number, signal: NodeJS.Signals): Promise<void>;
  isRunning(pid: number): Promise<boolean>;
  
  // NEW: Optional method for buffered output (Phase 2 compatibility)
  getProcessOutput?(pid: number): string;
}

// In FakeProcessManager: already implements this
// In real ProcessManager (Phase 3): implement buffering
```

**Testing**:
```typescript
// test/integration/claude-code-adapter.test.ts
it('should collect real CLI output via stdout', async () => {
  /*
  Test Doc:
  - Why: Verify output collection works with real ProcessManager
  - Contract: run() returns actual CLI output, not empty string
  - Usage Notes: Requires Claude CLI installed
  - Quality Contribution: Catches broken output collection
  - Worked Example: Real CLI spawn → output contains text
  */
  const adapter = new ClaudeCodeAdapter({
    processManager: new RealProcessManager(), // Not FakeProcessManager
    parser: new StreamJsonParser(),
  });
  
  const result = await adapter.run({ prompt: 'Say hello' });
  
  expect(result.output).not.toBe(''); // Must have content
  expect(result.sessionId).toBeDefined(); // Session ID extracted
});
```

**Acceptance Criteria**:
- [ ] Integration tests pass with real ProcessManager (not fake)
- [ ] Session ID extracted from real CLI output
- [ ] Token metrics extracted from real CLI output
- [ ] FakeProcessManager tests still pass (backward compatibility)

**Estimated Effort**: 2-3 hours (depends on Phase 3 readiness)

---

### FIX-002 [CRITICAL]: Add Spawn Error Handling

**Severity**: CRITICAL  
**Finding**: COR-001  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 115-132

**Issue**: spawn() failures propagate uncaught. CLI not found, permissions, or resource exhaustion will crash.

**Current Code**:
```typescript
async run(options: AgentRunOptions): Promise<AgentResult> {
  // NO try-catch
  const handle = await this.processManager.spawn({ command, args, options });
  // If spawn fails, unhandled rejection crashes caller
}
```

**Fix**:
```typescript
async run(options: AgentRunOptions): Promise<AgentResult> {
  let handle: ProcessHandle;
  
  try {
    const command = 'npx';
    const args = this._buildArgs(options);
    const spawnOptions = {
      cwd: this._validateCwd(options.cwd), // See FIX-004
    };
    
    handle = await this.processManager.spawn({
      command,
      args,
      options: spawnOptions,
    });
  } catch (error) {
    // Spawn failed - return failed status
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    return {
      output: `Failed to spawn Claude CLI: ${errorMsg}`,
      sessionId: '', // No session when spawn fails
      status: 'failed',
      exitCode: -1,
      tokens: null,
      stderr: errorMsg,
    };
  }
  
  // Continue with normal flow
  let exitCode: number;
  try {
    exitCode = await this.processManager.waitForExit(handle.pid);
  } catch (error) {
    // Wait failed - process already dead or killed
    return {
      output: '',
      sessionId: '',
      status: 'killed',
      exitCode: -1,
      tokens: null,
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
  
  // ... rest of method
}
```

**Testing**:
```typescript
// test/unit/shared/claude-code-adapter.test.ts
describe('error handling', () => {
  it('should return failed status when spawn throws', async () => {
    /*
    Test Doc:
    - Why: CLI unavailable should not crash adapter
    - Contract: spawn() errors return failed AgentResult
    - Usage Notes: FakeProcessManager throws on spawn
    - Quality Contribution: Prevents production crashes
    - Worked Example: spawn throws ENOENT → status='failed', exitCode=-1
    */
    const fakeProcess = new FakeProcessManager();
    fakeProcess.makeSpawnThrow(new Error('ENOENT: command not found'));
    
    const adapter = new ClaudeCodeAdapter({
      processManager: fakeProcess,
      parser: new StreamJsonParser(),
    });
    
    const result = await adapter.run({ prompt: 'test' });
    
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(-1);
    expect(result.output).toContain('Failed to spawn Claude CLI');
    expect(result.output).toContain('ENOENT');
  });
  
  it('should return killed status when waitForExit throws', async () => {
    /*
    Test Doc:
    - Why: Process killed externally should not crash
    - Contract: waitForExit() errors return killed AgentResult
    - Usage Notes: Simulate external SIGKILL
    - Quality Contribution: Handles unexpected termination
    - Worked Example: waitForExit throws → status='killed'
    */
    const fakeProcess = new FakeProcessManager();
    fakeProcess.makeWaitForExitThrow(new Error('Process killed'));
    
    const adapter = new ClaudeCodeAdapter({
      processManager: fakeProcess,
      parser: new StreamJsonParser(),
    });
    
    const result = await adapter.run({ prompt: 'test' });
    
    expect(result.status).toBe('killed');
  });
});
```

**Acceptance Criteria**:
- [ ] spawn() errors return failed AgentResult (not crash)
- [ ] waitForExit() errors return killed AgentResult
- [ ] Error messages include original error context
- [ ] Unit tests verify both error paths

**Estimated Effort**: 1 hour

---

### FIX-003 [CRITICAL]: Validate Empty Prompts

**Severity**: CRITICAL  
**Finding**: COR-002  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 202-215 (_buildArgs method)

**Issue**: Empty or whitespace-only prompts passed to CLI as `-p ''`, causing silent failures.

**Current Code**:
```typescript
private _buildArgs(options: AgentRunOptions): string[] {
  const args = ['claude', '--output-format=stream-json', '--dangerously-skip-permissions'];
  
  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }
  
  args.push('-p', options.prompt); // NO validation
  
  return args;
}
```

**Fix**:
```typescript
private _buildArgs(options: AgentRunOptions): string[] {
  const args = ['claude', '--output-format=stream-json', '--dangerously-skip-permissions'];
  
  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }
  
  // Validate prompt
  const trimmed = options.prompt.trim();
  if (!trimmed) {
    throw new Error('Prompt cannot be empty or whitespace-only');
  }
  
  args.push('-p', trimmed);
  
  return args;
}
```

**Testing**:
```typescript
// test/unit/shared/claude-code-adapter.test.ts
describe('prompt validation', () => {
  it('should throw when prompt is empty string', async () => {
    /*
    Test Doc:
    - Why: Empty prompts cause confusing CLI errors
    - Contract: _buildArgs() throws for empty prompt
    - Usage Notes: Validate before spawn to fail fast
    - Quality Contribution: Clear error messages for invalid input
    - Worked Example: prompt='' → throws 'cannot be empty'
    */
    const adapter = new ClaudeCodeAdapter({
      processManager: new FakeProcessManager(),
      parser: new StreamJsonParser(),
    });
    
    await expect(adapter.run({ prompt: '' }))
      .rejects.toThrow('Prompt cannot be empty');
  });
  
  it('should throw when prompt is whitespace only', async () => {
    const adapter = new ClaudeCodeAdapter({
      processManager: new FakeProcessManager(),
      parser: new StreamJsonParser(),
    });
    
    await expect(adapter.run({ prompt: '   \n\t  ' }))
      .rejects.toThrow('Prompt cannot be empty');
  });
  
  it('should trim whitespace from valid prompts', async () => {
    const fakeProcess = new FakeProcessManager();
    const adapter = new ClaudeCodeAdapter({
      processManager: fakeProcess,
      parser: new StreamJsonParser(),
    });
    
    await adapter.run({ prompt: '  test prompt  ' });
    
    const history = fakeProcess.getSpawnHistory();
    expect(history[0].args).toContain('test prompt'); // Trimmed
  });
});
```

**Acceptance Criteria**:
- [ ] Empty string prompts throw descriptive error
- [ ] Whitespace-only prompts throw error
- [ ] Valid prompts are trimmed before use
- [ ] Unit tests cover all edge cases

**Estimated Effort**: 30 minutes

---

## Priority 2: HIGH Severity Fixes (Security & Correctness)

### FIX-004 [HIGH]: Sanitize cwd Option (Path Traversal)

**Severity**: HIGH (Security)  
**Finding**: SEC-001  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 119-129

**Issue**: `cwd` option passed unsanitized to spawn(), enabling path traversal attacks.

**Current Code**:
```typescript
const options = {
  cwd: runOptions.cwd, // NO validation
};
await this.processManager.spawn({ command, args, options });
```

**Fix**:
```typescript
import * as path from 'node:path';

private _validateCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  
  // Resolve to absolute path
  const resolved = path.resolve(cwd);
  
  // Get workspace root (or inject via constructor for testability)
  const workspaceRoot = this.options?.workspaceRoot ?? process.cwd();
  const normalizedRoot = path.resolve(workspaceRoot);
  
  // Ensure cwd is within workspace
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(
      `cwd must be within workspace. Got: ${cwd}, Expected within: ${normalizedRoot}`
    );
  }
  
  // Verify directory exists (optional - may want to fail fast)
  // Note: Don't check existence in unit tests (filesystem dependency)
  
  return resolved;
}

// In run():
const spawnOptions = {
  cwd: this._validateCwd(options.cwd),
};
```

**Testing**:
```typescript
// test/unit/shared/claude-code-adapter.test.ts
describe('cwd validation', () => {
  it('should reject path traversal attempts', async () => {
    /*
    Test Doc:
    - Why: Prevent arbitrary directory execution (security)
    - Contract: cwd outside workspace throws error
    - Usage Notes: Uses path.resolve() to detect traversal
    - Quality Contribution: Prevents path traversal attacks
    - Worked Example: cwd='../../etc' → throws 'must be within workspace'
    */
    const adapter = new ClaudeCodeAdapter({
      processManager: new FakeProcessManager(),
      parser: new StreamJsonParser(),
      workspaceRoot: '/home/user/workspace',
    });
    
    await expect(adapter.run({
      prompt: 'test',
      cwd: '../../etc',
    })).rejects.toThrow('must be within workspace');
  });
  
  it('should reject absolute paths outside workspace', async () => {
    const adapter = new ClaudeCodeAdapter({
      processManager: new FakeProcessManager(),
      parser: new StreamJsonParser(),
      workspaceRoot: '/home/user/workspace',
    });
    
    await expect(adapter.run({
      prompt: 'test',
      cwd: '/etc',
    })).rejects.toThrow('must be within workspace');
  });
  
  it('should allow valid subdirectories', async () => {
    const fakeProcess = new FakeProcessManager();
    const adapter = new ClaudeCodeAdapter({
      processManager: fakeProcess,
      parser: new StreamJsonParser(),
      workspaceRoot: '/home/user/workspace',
    });
    
    await adapter.run({
      prompt: 'test',
      cwd: '/home/user/workspace/subdir',
    });
    
    // Should not throw
    expect(fakeProcess.getSpawnHistory()).toHaveLength(1);
  });
});
```

**Acceptance Criteria**:
- [ ] Path traversal attempts (../) rejected
- [ ] Absolute paths outside workspace rejected
- [ ] Valid subdirectories allowed
- [ ] Error messages are clear and actionable

**Estimated Effort**: 1 hour

---

### FIX-005 [HIGH]: Sanitize Prompt Parameter (Command Injection)

**Severity**: HIGH (Security)  
**Finding**: SEC-002  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 202-215

**Issue**: Prompt string passed unsanitized. Special characters could cause unexpected CLI behavior.

**Current Code**:
```typescript
args.push('-p', options.prompt); // NO sanitization
```

**Fix**:
```typescript
private _sanitizePrompt(prompt: string): string {
  const MAX_PROMPT_LENGTH = 100_000; // 100k chars (adjust per spec)
  
  // Length check
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt exceeds max length: ${MAX_PROMPT_LENGTH} chars`);
  }
  
  // Reject control characters except newline, tab, carriage return
  // Allow: \n (0x0A), \r (0x0D), \t (0x09)
  // Reject: \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F
  const hasInvalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(prompt);
  if (hasInvalidChars) {
    throw new Error('Prompt contains invalid control characters');
  }
  
  return prompt;
}

// In _buildArgs():
const trimmed = options.prompt.trim();
if (!trimmed) {
  throw new Error('Prompt cannot be empty or whitespace-only');
}

args.push('-p', this._sanitizePrompt(trimmed));
```

**Testing**:
```typescript
// test/unit/shared/claude-code-adapter.test.ts
describe('prompt sanitization', () => {
  it('should reject prompts with null bytes', async () => {
    /*
    Test Doc:
    - Why: Prevent command injection via control characters
    - Contract: Invalid control chars throw error
    - Usage Notes: Allows newline/tab, rejects others
    - Quality Contribution: Security hardening
    - Worked Example: prompt with \x00 → throws 'invalid control characters'
    */
    const adapter = new ClaudeCodeAdapter({
      processManager: new FakeProcessManager(),
      parser: new StreamJsonParser(),
    });
    
    await expect(adapter.run({
      prompt: 'test\x00malicious',
    })).rejects.toThrow('invalid control characters');
  });
  
  it('should reject prompts exceeding max length', async () => {
    const adapter = new ClaudeCodeAdapter({
      processManager: new FakeProcessManager(),
      parser: new StreamJsonParser(),
    });
    
    const longPrompt = 'x'.repeat(100_001); // Exceeds 100k limit
    
    await expect(adapter.run({ prompt: longPrompt }))
      .rejects.toThrow('exceeds max length');
  });
  
  it('should allow newlines and tabs in prompts', async () => {
    const fakeProcess = new FakeProcessManager();
    const adapter = new ClaudeCodeAdapter({
      processManager: fakeProcess,
      parser: new StreamJsonParser(),
    });
    
    await adapter.run({
      prompt: 'Line 1\nLine 2\tTabbed',
    });
    
    // Should not throw
    const history = fakeProcess.getSpawnHistory();
    expect(history[0].args).toContain('Line 1\nLine 2\tTabbed');
  });
});
```

**Acceptance Criteria**:
- [ ] Null bytes and control characters rejected
- [ ] Excessive length prompts rejected (define max in config)
- [ ] Newlines and tabs allowed (valid use cases)
- [ ] Error messages specify which validation failed

**Estimated Effort**: 1 hour

---

### FIX-006 [HIGH]: Distinguish CLI Not Found from Version Failures

**Severity**: HIGH  
**Finding**: COR-003  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 63-87

**Issue**: getCliVersion() catch silently swallows all errors without distinguishing ENOENT from other failures.

**Current Code**:
```typescript
async getCliVersion(): Promise<string | undefined> {
  try {
    // ... spawn logic
  } catch (error) {
    // Silently swallows - could be ENOENT or anything
    return undefined;
  }
}
```

**Fix**:
```typescript
async getCliVersion(): Promise<string | undefined> {
  try {
    const handle = await this.processManager.spawn({
      command: 'npx',
      args: ['claude', '--version'],
      options: {},
    });
    
    const exitCode = await this.processManager.waitForExit(handle.pid);
    const output = this._getOutput(handle.pid); // Fix after FIX-001
    
    if (exitCode !== 0) {
      this.logger?.warn('CLI version command exited with non-zero code', {
        exitCode,
        output,
      });
      return undefined;
    }
    
    return output.trim();
  } catch (error) {
    // Distinguish error types
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      this.logger?.warn('Claude CLI not found in PATH - install with: npm install -g @anthropic-ai/claude-code');
    } else if (error instanceof Error) {
      this.logger?.warn('CLI version check failed', {
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.logger?.warn('CLI version check failed with unknown error', { error });
    }
    
    return undefined;
  }
}
```

**Testing**:
```typescript
// test/unit/shared/claude-code-adapter.test.ts
describe('getCliVersion', () => {
  it('should log specific warning when CLI not found', async () => {
    const fakeLogger = new FakeLogger();
    const fakeProcess = new FakeProcessManager();
    
    // Simulate ENOENT error
    const enoent = new Error('ENOENT: command not found') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    fakeProcess.makeSpawnThrow(enoent);
    
    const adapter = new ClaudeCodeAdapter({
      processManager: fakeProcess,
      parser: new StreamJsonParser(),
      logger: fakeLogger,
    });
    
    const version = await adapter.getCliVersion();
    
    expect(version).toBeUndefined();
    fakeLogger.assertWarnLogged('Claude CLI not found in PATH');
  });
  
  it('should log generic warning for other spawn errors', async () => {
    const fakeLogger = new FakeLogger();
    const fakeProcess = new FakeProcessManager();
    fakeProcess.makeSpawnThrow(new Error('Permission denied'));
    
    const adapter = new ClaudeCodeAdapter({
      processManager: fakeProcess,
      parser: new StreamJsonParser(),
      logger: fakeLogger,
    });
    
    const version = await adapter.getCliVersion();
    
    expect(version).toBeUndefined();
    fakeLogger.assertWarnLogged('CLI version check failed');
  });
});
```

**Acceptance Criteria**:
- [ ] ENOENT errors log "CLI not found" with install instructions
- [ ] Other spawn errors log generic warning with error details
- [ ] Version check failures are non-fatal (return undefined)
- [ ] Unit tests verify both error paths

**Estimated Effort**: 30 minutes

---

### FIX-007 [HIGH]: Validate Token Values (Negative Checks)

**Severity**: HIGH  
**Finding**: COR-004  
**File**: packages/shared/src/adapters/stream-json-parser.ts  
**Lines**: 92-101

**Issue**: Negative token values not rejected; could produce invalid metrics.

**Current Code**:
```typescript
const used =
  usage.input_tokens +
  usage.output_tokens +
  (usage.cache_creation_input_tokens ?? 0) +
  (usage.cache_read_input_tokens ?? 0);
// NO validation
```

**Fix**:
```typescript
private _validateToken(value: unknown, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new Error(`Token field '${fieldName}' must be a number, got ${typeof value}`);
  }
  
  if (!Number.isInteger(value)) {
    throw new Error(`Token field '${fieldName}' must be an integer, got ${value}`);
  }
  
  if (value < 0) {
    throw new Error(`Token field '${fieldName}' cannot be negative, got ${value}`);
  }
  
  return value;
}

extractTokens(output: string): TokenMetrics | null {
  // ... existing NDJSON parsing
  
  const parsedResult = JSON.parse(resultLine);
  
  if (!parsedResult.usage) {
    return null;
  }
  
  const usage = parsedResult.usage;
  
  // Validate all token fields
  const inputTokens = this._validateToken(usage.input_tokens, 'input_tokens');
  const outputTokens = this._validateToken(usage.output_tokens, 'output_tokens');
  const cacheCreation = this._validateToken(usage.cache_creation_input_tokens ?? 0, 'cache_creation_input_tokens');
  const cacheRead = this._validateToken(usage.cache_read_input_tokens ?? 0, 'cache_read_input_tokens');
  
  const used = inputTokens + outputTokens + cacheCreation + cacheRead;
  
  // Validate context_window if present
  let limit = 200_000; // Default for Claude Code
  if (parsedResult.context_window !== undefined) {
    limit = this._validateToken(parsedResult.context_window, 'context_window');
  }
  
  return {
    used,
    total: used, // Single-turn context
    limit,
  };
}
```

**Testing**:
```typescript
// test/unit/shared/stream-json-parser.test.ts
describe('token validation', () => {
  it('should reject negative input_tokens', () => {
    /*
    Test Doc:
    - Why: Prevent invalid token metrics from corrupt API data
    - Contract: Negative tokens throw descriptive error
    - Usage Notes: Validates all token fields independently
    - Quality Contribution: Data integrity enforcement
    - Worked Example: input_tokens=-10 → throws 'cannot be negative'
    */
    const parser = new StreamJsonParser();
    const output = JSON.stringify({
      type: 'result',
      usage: {
        input_tokens: -10, // Invalid
        output_tokens: 50,
      },
      context_window: 200000,
    });
    
    expect(() => parser.extractTokens(output))
      .toThrow('input_tokens cannot be negative');
  });
  
  it('should reject non-integer token values', () => {
    const parser = new StreamJsonParser();
    const output = JSON.stringify({
      type: 'result',
      usage: {
        input_tokens: 100.5, // Invalid
        output_tokens: 50,
      },
      context_window: 200000,
    });
    
    expect(() => parser.extractTokens(output))
      .toThrow('input_tokens must be an integer');
  });
  
  it('should reject non-number token values', () => {
    const parser = new StreamJsonParser();
    const output = JSON.stringify({
      type: 'result',
      usage: {
        input_tokens: '100', // Invalid (string)
        output_tokens: 50,
      },
      context_window: 200000,
    });
    
    expect(() => parser.extractTokens(output))
      .toThrow('input_tokens must be a number');
  });
});
```

**Acceptance Criteria**:
- [ ] Negative token values throw descriptive error
- [ ] Non-integer values rejected
- [ ] Non-number types rejected
- [ ] All 5 token fields validated (input, output, cache_creation, cache_read, context_window)

**Estimated Effort**: 1 hour

---

### FIX-008 [HIGH]: Remove FakeProcessManager Leak from Production

**Severity**: HIGH  
**Finding**: SEM-002  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 240-248

**Issue**: Production code depends on test double interface (`getProcessOutput` type check).

**Current Code**:
```typescript
private _getOutput(pid: number): string {
  if ('getProcessOutput' in this.processManager) {
    return (this.processManager as any).getProcessOutput(pid);
  }
  return '';
}
```

**Fix**: Resolve after FIX-001 (real output collection). Two approaches:

**Approach A**: Remove _getOutput entirely (preferred)
```typescript
// After FIX-001, stdout collection is direct from handle
async run(options: AgentRunOptions): Promise<AgentResult> {
  const handle = await this.processManager.spawn({ command, args, options });
  
  // Collect output from handle.stdout (FIX-001)
  let rawOutput = '';
  if (handle.stdout) {
    handle.stdout.on('data', (chunk: Buffer) => {
      rawOutput += chunk.toString('utf-8');
    });
  }
  
  await this.processManager.waitForExit(handle.pid);
  
  // No need for _getOutput() anymore
  const sessionId = this.parser.extractSessionId(rawOutput);
  // ...
}

// DELETE _getOutput() method entirely
```

**Approach B**: Make getProcessOutput official IProcessManager method
```typescript
// In packages/shared/src/interfaces/process-manager.interface.ts
export interface IProcessManager {
  // ... existing methods
  
  /**
   * Get buffered output from a completed process.
   * Optional method for process managers that buffer output.
   * @returns Process stdout, or empty string if unavailable
   */
  getProcessOutput?(pid: number): string;
}

// In claude-code.adapter.ts (no type assertion needed)
private _getOutput(pid: number): string {
  return this.processManager.getProcessOutput?.(pid) ?? '';
}
```

**Recommendation**: Use Approach A after FIX-001. Approach B only if buffering pattern is needed for other adapters.

**Testing**: Covered by FIX-001 tests (real output collection).

**Acceptance Criteria**:
- [ ] No type assertions (`as any`) in production code
- [ ] No feature detection (`'getProcessOutput' in`) for test doubles
- [ ] Real and fake ProcessManager both work correctly

**Estimated Effort**: 30 minutes (after FIX-001 complete)

---

## Priority 3: MEDIUM Severity Fixes (Quality Improvements)

### FIX-009 [MEDIUM]: Document Hardcoded Context Window Default

**Severity**: MEDIUM  
**Finding**: SEM-003, COR-007  
**File**: packages/shared/src/adapters/stream-json-parser.ts  
**Lines**: 109

**Issue**: Missing `context_window` silently defaults to 200k without warning.

**Fix**:
```typescript
extractTokens(output: string): TokenMetrics | null {
  // ... existing parsing
  
  let limit = 200_000; // Claude Code default context window (as of 2026-01)
  
  if (parsedResult.context_window !== undefined) {
    limit = this._validateToken(parsedResult.context_window, 'context_window');
  } else {
    // Warn when using default (helps detect API changes)
    this.logger?.warn('context_window missing from Result message, using default 200k');
  }
  
  return {
    used,
    total: used,
    limit,
  };
}
```

**Alternative**: Return null when context_window missing (per DYK-03 nullable pattern)
```typescript
let limit: number | null = null;

if (parsedResult.context_window !== undefined) {
  limit = this._validateToken(parsedResult.context_window, 'context_window');
}

return {
  used,
  total: used,
  limit, // May be null
};
```

**Recommendation**: Document default with API version reference, warn when using it.

**Testing**: No new tests needed (edge case already covered). Document in existing test.

**Estimated Effort**: 15 minutes

---

### FIX-010 [MEDIUM]: Add Timeout Deferral Documentation

**Severity**: MEDIUM  
**Finding**: COR-005  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 115-159

**Issue**: No timeout mechanism; not documented as Phase 5 work.

**Fix**:
```typescript
async run(options: AgentRunOptions): Promise<AgentResult> {
  // TODO Phase 5: Implement timeout enforcement per AgentConfigSchema.timeout
  // Current limitation: Adapter waits indefinitely for CLI to complete.
  // Mitigation: Callers MUST implement timeout at orchestration layer.
  // See plan § 5 Tasks 5.3-5.4 for timeout implementation.
  
  const handle = await this.processManager.spawn({ command, args, options });
  // ... rest of method
}
```

**Acceptance Criteria**:
- [ ] Comment added explaining timeout deferral
- [ ] Reference to Phase 5 tasks for implementation
- [ ] Mitigation strategy documented for Phase 2 users

**Estimated Effort**: 5 minutes

---

### FIX-011 [MEDIUM]: Add NDJSON Input Size Limits

**Severity**: MEDIUM  
**Finding**: SEC-003  
**File**: packages/shared/src/adapters/stream-json-parser.ts  
**Lines**: 42-171

**Issue**: Unbounded NDJSON parsing could cause memory exhaustion.

**Fix**:
```typescript
export class StreamJsonParser {
  private readonly MAX_LINE_LENGTH = 1_000_000; // 1MB per line
  private readonly MAX_LINES = 100_000; // 100k lines max
  
  extractSessionId(output: string): string | undefined {
    const lines = output.split('\n');
    
    if (lines.length > this.MAX_LINES) {
      throw new Error(`NDJSON exceeds max lines: ${this.MAX_LINES}`);
    }
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      if (line.length > this.MAX_LINE_LENGTH) {
        throw new Error(`NDJSON line exceeds max length: ${this.MAX_LINE_LENGTH} bytes`);
      }
      
      try {
        const parsed = JSON.parse(line);
        if (parsed.session_id) {
          return parsed.session_id;
        }
      } catch {
        continue; // Malformed line
      }
    }
    
    return undefined;
  }
  
  // Apply same limits to extractTokens() and extractOutput()
}
```

**Testing**:
```typescript
// test/unit/shared/stream-json-parser.test.ts
describe('input size limits', () => {
  it('should reject NDJSON exceeding max lines', () => {
    const parser = new StreamJsonParser();
    const lines = Array(100_001).fill('{"type":"text"}').join('\n');
    
    expect(() => parser.extractSessionId(lines))
      .toThrow('exceeds max lines');
  });
  
  it('should reject lines exceeding max length', () => {
    const parser = new StreamJsonParser();
    const hugeLine = '{"data":"' + 'x'.repeat(1_000_001) + '"}';
    
    expect(() => parser.extractSessionId(hugeLine))
      .toThrow('exceeds max length');
  });
});
```

**Acceptance Criteria**:
- [ ] Line count limit enforced (default 100k lines)
- [ ] Line length limit enforced (default 1MB per line)
- [ ] Limits configurable via constructor (for testing)
- [ ] Descriptive errors when limits exceeded

**Estimated Effort**: 1 hour

---

### FIX-012 [MEDIUM]: Sanitize Version String in Logs

**Severity**: MEDIUM  
**Finding**: SEC-004  
**File**: packages/shared/src/adapters/claude-code.adapter.ts  
**Lines**: 100-106

**Issue**: Version output logged without sanitization.

**Fix**:
```typescript
private async _logVersionOnFirstUse(): Promise<void> {
  if (this._versionLogged) return;
  
  const version = await this.getCliVersion();
  if (version) {
    // Sanitize: only log semantic version pattern
    const semverMatch = version.match(/(\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?)/);
    const safeVersion = semverMatch ? semverMatch[0] : 'unknown';
    
    this.logger?.info('Using Claude Code CLI version', { version: safeVersion });
  }
  
  this._versionLogged = true;
}
```

**Testing**: No new tests needed (cosmetic security hardening).

**Estimated Effort**: 10 minutes

---

## Priority 4: LOW Severity Fixes (Documentation & Consistency)

### FIX-013 [LOW]: Fix Version Logging After Output Collection

**Severity**: LOW  
**Finding**: SEM-004  
**File**: claude-code.adapter.ts:76-77  
**Dependency**: FIX-001

**Issue**: getCliVersion() depends on broken output collection.

**Fix**: Automatically fixed by FIX-001. Verify after FIX-001 complete.

**Acceptance Criteria**:
- [ ] Version logging works with real ProcessManager
- [ ] Integration test verifies version is logged

**Estimated Effort**: 0 hours (fixed by FIX-001)

---

### FIX-014 [LOW]: Document extractOutput() Nullability Difference

**Severity**: LOW  
**Finding**: COR-008  
**File**: stream-json-parser.ts:136-171

**Issue**: Inconsistent return types (string vs null) across parser methods.

**Fix**:
```typescript
/**
 * Extract text output from stream-json messages.
 * 
 * Concatenates content from assistant messages and result fields.
 * 
 * @param output Raw NDJSON stream from Claude Code CLI
 * @returns Output string (may be empty if no content). **Never returns null**.
 * 
 * @remarks
 * Unlike extractSessionId() and extractTokens() which return null for
 * unavailable data, this method always returns a string to distinguish:
 * - Empty string: No output content (valid state)
 * - null: Data unavailable (not applicable for output extraction)
 */
extractOutput(output: string): string {
  // ... existing implementation
}
```

**Acceptance Criteria**:
- [ ] JSDoc explains nullability difference
- [ ] Rationale for string-only return documented

**Estimated Effort**: 5 minutes

---

## Summary & Execution Order

### Recommended Sequence

**Phase 1: CRITICAL Blockers** (must complete before any testing)
1. FIX-001: Real process output collection (2-3 hours) - **Blocks all other work**
2. FIX-002: Spawn error handling (1 hour)
3. FIX-003: Empty prompt validation (30 min)

**Phase 2: HIGH Security & Correctness** (before merge)
4. FIX-004: cwd sanitization (1 hour)
5. FIX-005: Prompt sanitization (1 hour)
6. FIX-006: CLI version error distinction (30 min)
7. FIX-007: Token validation (1 hour)
8. FIX-008: Remove FakeProcessManager leak (30 min after FIX-001)

**Phase 3: MEDIUM Quality** (before merge)
9. FIX-009: Document context_window default (15 min)
10. FIX-010: Timeout deferral docs (5 min)
11. FIX-011: NDJSON size limits (1 hour)
12. FIX-012: Sanitize version string (10 min)

**Phase 4: LOW Documentation** (nice-to-have)
13. FIX-013: Verify version logging (auto-fixed by FIX-001)
14. FIX-014: Document extractOutput nullability (5 min)

### Total Estimated Effort
- **CRITICAL**: 3.5 - 4.5 hours
- **HIGH**: 4 hours
- **MEDIUM**: 2.5 hours
- **LOW**: 0.25 hours
- **Total**: ~10-11 hours

### Testing After Fixes

```bash
# Run unit tests
pnpm run test -- test/unit/shared/stream-json-parser.test.ts
pnpm run test -- test/unit/shared/claude-code-adapter.test.ts

# Run contract tests
pnpm run test -- test/contracts/agent-adapter.contract.test.ts

# Run integration tests (with real CLI if available)
pnpm run test -- test/integration/claude-code-adapter.test.ts

# Type checking
pnpm run typecheck

# All tests
pnpm run test
```

### Re-Review Checklist

After fixes complete:
- [ ] All CRITICAL fixes applied and tested
- [ ] All HIGH fixes applied and tested
- [ ] All MEDIUM fixes applied and tested
- [ ] LOW fixes addressed or documented as known limitations
- [ ] `pnpm run test` passes (330+ tests)
- [ ] `pnpm run typecheck` passes
- [ ] Integration tests pass with real CLI (if available)
- [ ] Re-run: `/plan-7-code-review --phase "Phase 2: Claude Code Adapter" --plan docs/plans/002-agent-control/agent-control-plan.md`
- [ ] Expect verdict: **APPROVE**

---

**Next Action**: Start with FIX-001 (blocks all other work). Once output collection works with real ProcessManager, proceed with CRITICAL/HIGH fixes in parallel.
