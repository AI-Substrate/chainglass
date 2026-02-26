import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UnixProcessManager } from '@chainglass/shared';
import { FakeLogger } from '@chainglass/shared';

/**
 * Unit tests for UnixProcessManager.
 *
 * Per DYK Insight 1: Use vi.useFakeTimers() for timing tests to avoid 6-second waits.
 * Per AC-14: Signal escalation must use 2000ms intervals.
 */
describe('UnixProcessManager', () => {
  let manager: UnixProcessManager;
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
    manager = new UnixProcessManager(logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('spawn()', () => {
    it('should spawn process and return handle with pid', async () => {
      /*
      Test Doc:
      - Why: Core spawn functionality for process creation
      - Contract: spawn() returns ProcessHandle with valid pid > 0
      - Usage Notes: Uses child_process.spawn internally
      - Quality Contribution: Ensures process creation works
      - Worked Example: spawn({command:'echo', args:['test']}) → {pid: 12345, ...}
      */
      const handle = await manager.spawn({
        command: 'echo',
        args: ['test'],
      });

      expect(handle).toBeDefined();
      expect(handle.pid).toBeGreaterThan(0);
    });

    it('should buffer stdout for getProcessOutput retrieval', async () => {
      /*
      Test Doc:
      - Why: Per DYK-06, ClaudeCodeAdapter needs buffered output
      - Contract: getProcessOutput() returns stdout after waitForExit()
      - Usage Notes: Output accumulated during process lifetime
      - Quality Contribution: Enables CLI output parsing
      - Worked Example: echo "hello" → getProcessOutput → "hello\n"
      */
      const handle = await manager.spawn({
        command: 'echo',
        args: ['hello'],
      });

      await handle.waitForExit();

      // Small delay to ensure output buffer is flushed
      await new Promise((r) => setTimeout(r, 50));

      const output = manager.getProcessOutput(handle.pid);
      expect(output).toContain('hello');
    });

    it('should throw on spawn failure', async () => {
      /*
      Test Doc:
      - Why: Error handling for missing commands
      - Contract: spawn() throws when command not found
      - Usage Notes: Error includes ENOENT code for missing commands
      - Quality Contribution: Enables proper error handling
      - Worked Example: spawn({command:'nonexistent'}) → throws ENOENT
      */
      await expect(
        manager.spawn({
          command: 'this-command-definitely-does-not-exist-anywhere',
        })
      ).rejects.toThrow();
    });

    it.skip('should support cwd option', async () => {
      /*
      Test Doc:
      - Why: Agent processes need workspace directory
      - Contract: cwd option sets working directory for process
      - Usage Notes: Path must exist
      - Quality Contribution: Enables workspace-specific execution
      - Worked Example: spawn({cwd:'/tmp', command:'pwd'}) → "/tmp"
      */
      const handle = await manager.spawn({
        command: 'pwd',
        cwd: '/tmp',
      });

      // Must wait for exit to capture all output
      await handle.waitForExit();

      // Small delay to ensure buffers are flushed
      await new Promise((r) => setTimeout(r, 50));

      const output = manager.getProcessOutput(handle.pid);
      expect(output.trim()).toBe('/tmp');
    });

    it('should support env option', async () => {
      /*
      Test Doc:
      - Why: Agent processes may need custom environment
      - Contract: env option passes environment variables to process
      - Usage Notes: Merges with or replaces parent env
      - Quality Contribution: Enables process customization
      - Worked Example: spawn({env:{MY_VAR:'test'}, command:'printenv MY_VAR'}) → "test"
      */
      const handle = await manager.spawn({
        command: 'sh',
        args: ['-c', 'echo $TEST_VAR'],
        env: { ...process.env, TEST_VAR: 'test-value-123' },
      });

      await handle.waitForExit();

      const output = manager.getProcessOutput(handle.pid);
      expect(output.trim()).toBe('test-value-123');
    });
  });

  describe('Signal Escalation (AC-14)', () => {
    it('should send SIGINT then SIGTERM then SIGKILL with 2s intervals', async () => {
      /*
      Test Doc:
      - Why: AC-14 requires termination within 10 seconds via signal escalation
      - Contract: terminate() sends SIGINT, waits 2s, SIGTERM, waits 2s, SIGKILL
      - Usage Notes: Uses real stubborn process (ignores SIGINT/SIGTERM)
      - Quality Contribution: Verifies signal escalation timing
      - Worked Example: terminate(stubbornPid) → signals at t=0, t=2000, t=4000
      */
      // Create a UnixProcessManager with short interval for testing (100ms)
      const fastManager = new UnixProcessManager(logger, 100);

      // Spawn a process that ignores SIGINT and SIGTERM
      // Using 'sh -c "trap ... && sleep 60"' to create a stubborn process
      const handle = await fastManager.spawn({
        command: 'sh',
        args: ['-c', 'trap "" INT TERM; sleep 60'],
      });

      // Wait for process to start and set up trap
      await new Promise((r) => setTimeout(r, 100));

      const startTime = Date.now();
      await fastManager.terminate(handle.pid);
      const duration = Date.now() - startTime;

      // With 100ms intervals, should take ~200ms (2 waits after SIGINT and SIGTERM)
      // Allow some slack for process startup
      expect(duration).toBeGreaterThanOrEqual(180);
      expect(duration).toBeLessThan(1000);

      // Process should be terminated
      const running = await fastManager.isRunning(handle.pid);
      expect(running).toBe(false);
    }, 10000);

    it('should stop escalation when process exits on SIGTERM', async () => {
      /*
      Test Doc:
      - Why: Early exit should not send unnecessary signals
      - Contract: If process exits on SIGTERM, SIGKILL is not sent
      - Usage Notes: Graceful processes exit before SIGKILL needed
      - Quality Contribution: Prevents unnecessary force-kills
      - Worked Example: terminate(gracefulPid) → SIGINT, SIGTERM, process exits
      */
      // Create manager with short interval
      const fastManager = new UnixProcessManager(logger, 100);

      // Process that ignores SIGINT but exits on SIGTERM
      const handle = await fastManager.spawn({
        command: 'sh',
        args: ['-c', 'trap "" INT; sleep 60'],
      });

      await new Promise((r) => setTimeout(r, 100));

      const startTime = Date.now();
      await fastManager.terminate(handle.pid);
      const duration = Date.now() - startTime;

      // Should take ~100ms (one wait after SIGINT, then SIGTERM kills)
      expect(duration).toBeGreaterThanOrEqual(80);
      expect(duration).toBeLessThan(500);

      const running = await fastManager.isRunning(handle.pid);
      expect(running).toBe(false);
    }, 10000);

    it('should stop escalation when process exits on SIGINT', async () => {
      /*
      Test Doc:
      - Why: Quick exit should not send unnecessary signals
      - Contract: If process exits on SIGINT, no further signals sent
      - Usage Notes: Well-behaved processes exit on first signal
      - Quality Contribution: Minimal signal usage
      - Worked Example: terminate(wellBehavedPid) → SIGINT, process exits
      */
      // Create manager with short interval
      const fastManager = new UnixProcessManager(logger, 100);

      // Normal process (responds to SIGINT)
      const handle = await fastManager.spawn({
        command: 'sleep',
        args: ['60'],
      });

      await new Promise((r) => setTimeout(r, 50));

      const startTime = Date.now();
      await fastManager.terminate(handle.pid);
      const duration = Date.now() - startTime;

      // Should be fast - SIGINT kills immediately
      expect(duration).toBeLessThan(200);

      const running = await fastManager.isRunning(handle.pid);
      expect(running).toBe(false);
    }, 10000);
  });

  describe('Exit Code Handling (Discovery 06)', () => {
    it('should return exitCode 0 for successful process', async () => {
      /*
      Test Doc:
      - Why: Discovery 06 requires exit code mapping
      - Contract: exitCode is 0 for successful process
      - Usage Notes: Status should map to 'completed'
      - Quality Contribution: Enables success detection
      - Worked Example: true → exitCode 0
      */
      const handle = await manager.spawn({ command: 'true' });
      const result = await handle.waitForExit();

      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeUndefined();
    });

    it('should return exitCode > 0 for failed process', async () => {
      /*
      Test Doc:
      - Why: Discovery 06 requires exit code mapping
      - Contract: exitCode > 0 for failed process
      - Usage Notes: Status should map to 'failed'
      - Quality Contribution: Enables failure detection
      - Worked Example: false → exitCode 1
      */
      const handle = await manager.spawn({ command: 'false' });
      const result = await handle.waitForExit();

      expect(result.exitCode).toBe(1);
      expect(result.signal).toBeUndefined();
    });

    it('should return exitCode null with signal for killed process', async () => {
      /*
      Test Doc:
      - Why: Discovery 06 requires signal capture for killed processes
      - Contract: exitCode is null, signal is set when killed
      - Usage Notes: Status should map to 'killed'
      - Quality Contribution: Enables killed distinction
      - Worked Example: kill with SIGTERM → exitCode null, signal 'SIGTERM'
      */
      const handle = await manager.spawn({
        command: 'sleep',
        args: ['60'],
      });

      // Wait for process to start
      await new Promise((r) => setTimeout(r, 50));

      // Send signal directly
      await manager.signal(handle.pid, 'SIGTERM');

      const result = await handle.waitForExit();

      expect(result.exitCode).toBe(null);
      expect(result.signal).toBe('SIGTERM');
    });
  });

  describe('isRunning()', () => {
    it('should report isRunning true for active process', async () => {
      /*
      Test Doc:
      - Why: Need to check process state for monitoring
      - Contract: isRunning returns true while process is active
      - Usage Notes: Poll this for state detection
      - Quality Contribution: Enables process monitoring
      - Worked Example: spawn sleep 60 → isRunning → true
      */
      const handle = await manager.spawn({
        command: 'sleep',
        args: ['60'],
      });

      const running = await manager.isRunning(handle.pid);
      expect(running).toBe(true);

      // Cleanup
      await manager.terminate(handle.pid);
    });

    it('should report isRunning false after exit', async () => {
      /*
      Test Doc:
      - Why: Need to detect when process has completed
      - Contract: isRunning returns false after process exits
      - Usage Notes: Check after waitForExit or natural completion
      - Quality Contribution: Enables completion detection
      - Worked Example: spawn true → waitForExit → isRunning → false
      */
      const handle = await manager.spawn({ command: 'true' });
      await handle.waitForExit();

      const running = await manager.isRunning(handle.pid);
      expect(running).toBe(false);
    });

    it('should return false for unknown pid', async () => {
      /*
      Test Doc:
      - Why: Handle edge case of unknown process
      - Contract: isRunning returns false for non-existent process
      - Usage Notes: Don't throw on unknown pid
      - Quality Contribution: Safe state checking
      - Worked Example: isRunning(99999999) → false
      */
      const running = await manager.isRunning(99999999);
      expect(running).toBe(false);
    });
  });

  describe('terminate() edge cases', () => {
    it('should handle terminate on already-exited process', async () => {
      /*
      Test Doc:
      - Why: Race condition: process may exit before terminate called
      - Contract: terminate() on exited process completes without error
      - Usage Notes: Idempotent - safe to call multiple times
      - Quality Contribution: Prevents race condition errors
      - Worked Example: spawn true, wait, terminate → no error
      */
      const handle = await manager.spawn({ command: 'true' });
      await handle.waitForExit();

      // Should not throw
      await expect(manager.terminate(handle.pid)).resolves.not.toThrow();
    });

    it('should handle terminate on unknown pid', async () => {
      /*
      Test Doc:
      - Why: Handle edge case of unknown process
      - Contract: terminate() on unknown pid completes without error
      - Usage Notes: Graceful handling of stale PIDs
      - Quality Contribution: Safe termination
      - Worked Example: terminate(99999999) → no error
      */
      await expect(manager.terminate(99999999)).resolves.not.toThrow();
    });
  });

  describe('getPid()', () => {
    it('should return pid from ProcessHandle', async () => {
      /*
      Test Doc:
      - Why: IProcessManager contract requires getPid method
      - Contract: getPid returns the pid from handle
      - Usage Notes: Simple accessor
      - Quality Contribution: Interface compliance
      - Worked Example: spawn → getPid(handle) → same as handle.pid
      */
      const handle = await manager.spawn({ command: 'true' });
      const pid = manager.getPid(handle);

      expect(pid).toBe(handle.pid);
      expect(pid).toBeGreaterThan(0);
    });
  });

  describe('signal()', () => {
    it('should send signal to running process', async () => {
      /*
      Test Doc:
      - Why: Individual signal sending for custom termination
      - Contract: signal() sends specified signal to process
      - Usage Notes: Process may or may not exit depending on signal handling
      - Quality Contribution: Enables custom signal control
      - Worked Example: signal(pid, 'SIGTERM') → process receives SIGTERM
      */
      const handle = await manager.spawn({
        command: 'sleep',
        args: ['60'],
      });

      // Wait for process to start
      await new Promise((r) => setTimeout(r, 50));

      // Should not throw
      await expect(manager.signal(handle.pid, 'SIGTERM')).resolves.not.toThrow();

      // Process should exit
      const result = await handle.waitForExit();
      expect(result.signal).toBe('SIGTERM');
    });

    it('should handle signal to already-exited process', async () => {
      /*
      Test Doc:
      - Why: Race condition: process may exit before signal sent
      - Contract: signal() on exited process completes without error
      - Usage Notes: Graceful handling of stale PIDs
      - Quality Contribution: Prevents race condition errors
      - Worked Example: spawn true, wait, signal → no error
      */
      const handle = await manager.spawn({ command: 'true' });
      await handle.waitForExit();

      // Should not throw
      await expect(manager.signal(handle.pid, 'SIGTERM')).resolves.not.toThrow();
    });
  });
});
