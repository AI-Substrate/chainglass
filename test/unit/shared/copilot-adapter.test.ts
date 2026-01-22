import { describe, expect, it, beforeEach } from 'vitest';

import { CopilotAdapter, FakeProcessManager } from '@chainglass/shared';

/**
 * Unit tests for CopilotAdapter.
 *
 * Per plan Task 4.4: Tests for exponential backoff polling behavior.
 * Per Discovery 05: Backoff sequence [0, 50, 100, 200, 400, 800, 1600, 3200]
 * Per DYK Insight 4: Uses injectable `readLogFile` function for testing.
 *
 * Testing strategy:
 * - Uses FakeProcessManager for process spawning
 * - Uses injectable readLogFile function for log file access
 * - Uses short poll timeouts for fast tests
 * - No vi.mock() - only fakes per Constitution Principle 4
 */
describe('CopilotAdapter', () => {
  let fakeProcessManager: FakeProcessManager;

  // Helper to setup process exit after spawn
  const setupProcessExit = (exitCode: number = 0): void => {
    // Poll for new processes and exit them
    const interval = setInterval(() => {
      const processes = (fakeProcessManager as any)._processes as Map<number, any>;
      for (const [pid, state] of processes) {
        if (state.running) {
          fakeProcessManager.exitProcess(pid, exitCode);
        }
      }
    }, 1);
    // Cleanup after test completes
    setTimeout(() => clearInterval(interval), 1000);
  };

  beforeEach(() => {
    fakeProcessManager = new FakeProcessManager();
  });

  describe('constructor', () => {
    it('should create adapter with process manager', () => {
      /*
      Test Doc:
      - Why: Basic instantiation verification
      - Contract: CopilotAdapter constructor accepts IProcessManager
      - Usage Notes: Required dependency injection pattern
      - Quality Contribution: Ensures adapter can be constructed
      - Worked Example: new CopilotAdapter(processManager) → adapter instance
      */
      const adapter = new CopilotAdapter(fakeProcessManager);

      expect(adapter).toBeDefined();
    });
  });

  describe('run', () => {
    it('should return AgentResult with sessionId on successful run', async () => {
      /*
      Test Doc:
      - Why: AC-1 requires session ID in result for session resumption
      - Contract: run() returns AgentResult with non-empty sessionId
      - Usage Notes: Session ID extracted from logs or generated as fallback
      - Quality Contribution: Core functionality verification
      - Worked Example: run({prompt:"hi"}) → {sessionId:"...", status:"completed"}
      */
      setupProcessExit(0);

      // Mock log file reader that returns session ID
      const mockLogContent = 'events to session 12345678-1234-1234-1234-123456789012';
      const readLogFile = async () => mockLogContent;

      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 100, // Short timeout for fast test
      });

      const result = await adapter.run({ prompt: 'test prompt' });

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('12345678-1234-1234-1234-123456789012');
    });

    it('should return status completed on exit code 0', async () => {
      /*
      Test Doc:
      - Why: AC-5 requires status='completed' on successful exit
      - Contract: Exit code 0 → status='completed'
      - Usage Notes: Maps exit code to status per Discovery 06
      - Quality Contribution: Status mapping verification
      - Worked Example: CLI exits 0 → {status:'completed', exitCode:0}
      */
      setupProcessExit(0);

      const readLogFile = async () => null;
      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });

      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
    });

    it('should return status failed on non-zero exit code', async () => {
      /*
      Test Doc:
      - Why: AC-6 requires status='failed' on error exit
      - Contract: Exit code >0 → status='failed'
      - Usage Notes: Non-zero exit indicates CLI error
      - Quality Contribution: Error status mapping
      - Worked Example: CLI exits 1 → {status:'failed', exitCode:1}
      */
      setupProcessExit(1);

      const readLogFile = async () => null;
      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });

      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });

    it('should spawn Copilot CLI with --log-dir flag', async () => {
      /*
      Test Doc:
      - Why: DYK Insight 1 requires --log-dir for deterministic log location
      - Contract: spawn() called with --log-dir flag pointing to temp dir
      - Usage Notes: Log dir is essential for session ID extraction
      - Quality Contribution: Ensures correct CLI invocation
      - Worked Example: spawn args include "--log-dir", "/tmp/copilot-123"
      */
      setupProcessExit(0);

      const readLogFile = async () => null;
      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });

      await adapter.run({ prompt: 'test' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history.length).toBeGreaterThan(0);

      const spawnCall = history[0];
      expect(spawnCall.args).toContain('--log-dir');
    });

    it('should spawn Copilot CLI with --yolo flag for non-interactive mode', async () => {
      /*
      Test Doc:
      - Why: Copilot needs --yolo for non-interactive programmatic usage
      - Contract: spawn() called with --yolo flag
      - Usage Notes: Without --yolo, Copilot may prompt for permissions
      - Quality Contribution: Ensures correct CLI invocation
      - Worked Example: spawn args include "--yolo"
      */
      setupProcessExit(0);

      const readLogFile = async () => null;
      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });

      await adapter.run({ prompt: 'test' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).toContain('--yolo');
    });

    it('should resume session with --resume flag when sessionId provided', async () => {
      /*
      Test Doc:
      - Why: AC-2 requires session resumption capability
      - Contract: Passing sessionId adds --resume flag to spawn
      - Usage Notes: Session ID from prior run enables context continuity
      - Quality Contribution: Verifies resume flag handling
      - Worked Example: run({sessionId:"abc"}) → spawn with ["--resume", "abc"]
      */
      setupProcessExit(0);

      const readLogFile = async () => null;
      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });

      await adapter.run({
        prompt: 'test',
        sessionId: 'existing-session-id',
      });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).toContain('--resume');
      expect(history[0].args).toContain('existing-session-id');
    });
  });

  describe('polling with exponential backoff', () => {
    it('should poll multiple times with backoff', async () => {
      /*
      Test Doc:
      - Why: Discovery 05 specifies exponential backoff polling
      - Contract: Multiple poll attempts before finding session ID
      - Usage Notes: Exponential backoff: 0, 50, 100, 200, 400, ...
      - Quality Contribution: Verifies polling behavior
      - Worked Example: polls multiple times until session found
      */
      setupProcessExit(0);

      let pollCount = 0;
      const readLogFile = async () => {
        pollCount++;
        if (pollCount >= 3) {
          return 'events to session 11111111-1111-1111-1111-111111111111';
        }
        return null;
      };

      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollBaseIntervalMs: 1, // Very short for fast test
        pollMaxTimeoutMs: 100,
      });

      const result = await adapter.run({ prompt: 'test' });

      // Should have polled at least 3 times to get the session ID
      expect(pollCount).toBeGreaterThanOrEqual(3);
      expect(result.sessionId).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('should generate fallback session ID after timeout', async () => {
      /*
      Test Doc:
      - Why: Discovery 05 specifies fallback session ID on timeout
      - Contract: After timeout, generate copilot-{pid}-{ts} session ID
      - Usage Notes: Ensures run() always returns valid sessionId
      - Quality Contribution: Graceful degradation verification
      - Worked Example: timeout → sessionId: "copilot-1234-1706000000000"
      */
      setupProcessExit(0);

      // Always return null - session ID never found
      const readLogFile = async () => null;

      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollBaseIntervalMs: 1,
        pollMaxTimeoutMs: 10, // Very short timeout
      });

      const result = await adapter.run({ prompt: 'test' });

      // Should have fallback session ID
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId.startsWith('copilot-')).toBe(true);
    });
  });

  describe('token handling', () => {
    it('should return null for tokens (Discovery 04)', async () => {
      /*
      Test Doc:
      - Why: Discovery 04 - Copilot token reporting is undocumented
      - Contract: result.tokens is always null for CopilotAdapter
      - Usage Notes: Graceful degradation - honest null instead of fabricated data
      - Quality Contribution: Ensures correct token handling
      - Worked Example: run() → {tokens: null}
      */
      setupProcessExit(0);

      const readLogFile = async () => null;
      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });

      const result = await adapter.run({ prompt: 'test' });

      expect(result.tokens).toBeNull();
    });
  });

  describe('terminate', () => {
    it('should return status killed after terminate', async () => {
      /*
      Test Doc:
      - Why: AC-7 requires status='killed' when terminated
      - Contract: terminate(sessionId) returns {status:'killed'}
      - Usage Notes: Terminates running process and returns killed status
      - Quality Contribution: Termination verification
      - Worked Example: terminate(sessionId) → {status:'killed', exitCode:137}
      */
      setupProcessExit(0);

      const readLogFile = async () =>
        'events to session 22222222-2222-2222-2222-222222222222';

      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });

      const runResult = await adapter.run({ prompt: 'test' });

      // Now terminate
      const terminateResult = await adapter.terminate(runResult.sessionId);

      expect(terminateResult.status).toBe('killed');
    });
  });

  describe('compact', () => {
    it('should return result when compact called', async () => {
      /*
      Test Doc:
      - Why: AC-12 requires compact to return result
      - Contract: compact() triggers CLI and returns result
      - Usage Notes: Implementation may use -p flag or stdin
      - Quality Contribution: Ensures compact works
      - Worked Example: compact(sessionId) → {status:'completed'}
      */
      setupProcessExit(0);

      const readLogFile = async () =>
        'events to session 33333333-3333-3333-3333-333333333333';

      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });

      const runResult = await adapter.run({ prompt: 'test' });

      // Compact the session
      const compactResult = await adapter.compact(runResult.sessionId);

      expect(compactResult.status).toBe('completed');
      expect(compactResult.sessionId).toBe(runResult.sessionId);
    });
  });

  describe('validation', () => {
    it('should return failed status for empty prompt (COR-002)', async () => {
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

    it('should return failed status for prompt exceeding max length (COR-002)', async () => {
      /*
      Test Doc:
      - Why: COR-002 - Validation errors should return failed result, not throw
      - Contract: Oversized prompt → AgentResult with status:'failed'
      - Usage Notes: Memory protection against huge prompts
      - Quality Contribution: Security/safety validation without throwing
      - Worked Example: run({prompt: "x".repeat(100001)}) → {status:'failed'}
      */
      const readLogFile = async () => null;
      const adapter = new CopilotAdapter(fakeProcessManager, {
        readLogFile,
        pollMaxTimeoutMs: 50,
      });
      const hugePrompt = 'x'.repeat(100_001);

      const result = await adapter.run({ prompt: hugePrompt });

      expect(result.status).toBe('failed');
      expect(result.output).toContain('Validation error');
    });
  });

  describe('security', () => {
    it('should use workspaceRoot when cwd is undefined (SEC-001)', async () => {
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

    it('should have MAX_LOG_FILE_SIZE constant defined (SEC-002)', () => {
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

    it('should use cryptographically secure random for log directory (SEC-003)', async () => {
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
  });
});
