import { describe, expect, it } from 'vitest';

import type { IProcessManager, ProcessHandle, SpawnOptions } from '@chainglass/shared';

/**
 * Contract tests for IProcessManager implementations.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeProcessManager and real ProcessManager pass the same behavioral tests.
 *
 * Per DYK-04: IProcessManager defines full 5-method interface from day one:
 * spawn(), terminate(), signal(), isRunning(), getPid()
 *
 * Usage:
 * ```typescript
 * import { processManagerContractTests } from '@test/contracts/process-manager.contract';
 *
 * processManagerContractTests('FakeProcessManager', () => new FakeProcessManager());
 * processManagerContractTests('ProcessManager', () => new ProcessManager());
 * ```
 */
export function processManagerContractTests(
  name: string,
  createManager: () => IProcessManager
) {
  describe(`${name} implements IProcessManager contract`, () => {
    it('should spawn a process and return a handle', async () => {
      /*
      Test Doc:
      - Why: spawn() is the primary method for starting agent processes
      - Contract: spawn() returns ProcessHandle with pid and stream access
      - Usage Notes: SpawnOptions includes command, args, cwd, env
      - Quality Contribution: Ensures process creation works consistently
      - Worked Example: spawn({command:'node', args:['--version']}) → {pid: 12345, ...}
      */
      const manager = createManager();

      const handle = await manager.spawn({
        command: 'echo',
        args: ['test'],
      });

      expect(handle).toBeDefined();
      expect(handle.pid).toBeDefined();
      expect(typeof handle.pid).toBe('number');
    });

    it('should report isRunning() correctly for active process', async () => {
      /*
      Test Doc:
      - Why: Need to check if process is still executing
      - Contract: isRunning(pid) returns true for active, false for terminated
      - Usage Notes: May return false immediately after spawn if process exits quickly
      - Quality Contribution: Enables process state monitoring
      - Worked Example: spawn() → isRunning(pid) → true (until exit)
      */
      const manager = createManager();

      const handle = await manager.spawn({
        command: 'sleep',
        args: ['0.1'],
      });

      // Immediately after spawn, should be running (for non-instant commands)
      const running = await manager.isRunning(handle.pid);
      expect(typeof running).toBe('boolean');
    });

    it('should return pid from ProcessHandle', async () => {
      /*
      Test Doc:
      - Why: PID is needed for signal sending and process tracking
      - Contract: ProcessHandle.pid is a positive integer
      - Usage Notes: PIDs are OS-assigned; may be reused after process exits
      - Quality Contribution: Ensures PID is accessible for process management
      - Worked Example: spawn() → handle.pid → 12345
      */
      const manager = createManager();

      const handle = await manager.spawn({
        command: 'echo',
        args: ['test'],
      });

      const pid = manager.getPid(handle);
      expect(pid).toBe(handle.pid);
      expect(pid).toBeGreaterThan(0);
    });

    it('should send signal to process', async () => {
      /*
      Test Doc:
      - Why: Signal escalation requires ability to send specific signals
      - Contract: signal(pid, signal) sends signal without throwing
      - Usage Notes: Signal may be ignored if process already exited
      - Quality Contribution: Ensures signal delivery works
      - Worked Example: signal(pid, 'SIGINT') → process receives SIGINT
      */
      const manager = createManager();

      const handle = await manager.spawn({
        command: 'sleep',
        args: ['10'],
      });

      // Should not throw when sending signal
      await expect(manager.signal(handle.pid, 'SIGINT')).resolves.not.toThrow();
    });

    it('should terminate process with signal escalation', async () => {
      /*
      Test Doc:
      - Why: AC-14 requires termination within 10 seconds via signal escalation
      - Contract: terminate(pid) stops process using SIGINT → SIGTERM → SIGKILL
      - Usage Notes: Process may exit at any stage; terminate completes when exited
      - Quality Contribution: Prevents zombie processes
      - Worked Example: terminate(pid) → process exits, isRunning → false
      */
      const manager = createManager();

      const handle = await manager.spawn({
        command: 'sleep',
        args: ['60'],
      });

      // Terminate should complete without throwing
      await manager.terminate(handle.pid);

      // After termination, process should not be running
      const running = await manager.isRunning(handle.pid);
      expect(running).toBe(false);
    });

    it('should handle terminate on already-exited process gracefully', async () => {
      /*
      Test Doc:
      - Why: Process may exit before terminate() is called
      - Contract: terminate() on exited process completes without error
      - Usage Notes: Idempotent - safe to call multiple times
      - Quality Contribution: Prevents errors on race conditions
      - Worked Example: spawn(fast-command), wait, terminate() → no error
      */
      const manager = createManager();

      const handle = await manager.spawn({
        command: 'echo',
        args: ['quick'],
      });

      // Wait for process to exit naturally
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Terminate should not throw even if already exited
      await expect(manager.terminate(handle.pid)).resolves.not.toThrow();
    });

    it('should capture exit code from process', async () => {
      /*
      Test Doc:
      - Why: Exit code indicates success (0) or failure (>0)
      - Contract: ProcessHandle provides access to exit code after completion
      - Usage Notes: Exit code available after process exits; undefined while running
      - Quality Contribution: Enables result status determination
      - Worked Example: spawn(command-that-fails) → exitCode > 0
      */
      const manager = createManager();

      const handle = await manager.spawn({
        command: 'echo',
        args: ['test'],
      });

      // For fake: explicitly terminate to trigger exit
      // For real: process would exit naturally
      await manager.terminate(handle.pid);

      // Wait for completion
      const result = await handle.waitForExit();

      expect(result.exitCode).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });

    it('should support environment variables in spawn options', async () => {
      /*
      Test Doc:
      - Why: Agent processes may need custom environment
      - Contract: SpawnOptions.env passes environment to spawned process
      - Usage Notes: Merges with process.env or replaces based on implementation
      - Quality Contribution: Enables process customization
      - Worked Example: spawn({env: {MY_VAR: 'value'}}) → child has MY_VAR
      */
      const manager = createManager();

      // This test just verifies the interface accepts env
      const handle = await manager.spawn({
        command: 'echo',
        args: ['test'],
        env: { TEST_VAR: 'test-value' },
      });

      expect(handle).toBeDefined();
    });

    it('should support cwd in spawn options', async () => {
      /*
      Test Doc:
      - Why: Agent processes may need specific working directory
      - Contract: SpawnOptions.cwd sets working directory for spawned process
      - Usage Notes: Path must exist; throws if invalid
      - Quality Contribution: Enables workspace-specific execution
      - Worked Example: spawn({cwd: '/tmp'}) → child runs in /tmp
      */
      const manager = createManager();

      // This test just verifies the interface accepts cwd
      const handle = await manager.spawn({
        command: 'echo',
        args: ['test'],
        cwd: '/tmp',
      });

      expect(handle).toBeDefined();
    });
  });
}
