import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UnixProcessManager } from '@chainglass/shared';
import { FakeLogger } from '@chainglass/shared';

/**
 * Integration tests for ProcessManager implementations.
 *
 * These tests spawn REAL processes and verify process lifecycle management.
 * They are slower than unit tests but validate actual OS-level behavior.
 *
 * Per Critical Discovery 02: Tests verify no zombie processes after termination.
 * Per DYK Insight 2: Use `process.kill(pid, 0)` for cross-platform detection.
 */
describe('UnixProcessManager Integration', () => {
  let manager: UnixProcessManager;
  let logger: FakeLogger;
  const spawnedPids: number[] = [];

  beforeEach(() => {
    logger = new FakeLogger();
    manager = new UnixProcessManager(logger);
    spawnedPids.length = 0;
  });

  afterEach(async () => {
    // Cleanup: terminate any remaining processes
    for (const pid of spawnedPids) {
      try {
        process.kill(pid, 0); // Check if running
        await manager.terminate(pid);
      } catch {
        // Process already exited - expected
      }
    }
  });

  describe('Zombie Prevention (Critical Discovery 02)', () => {
    it('should spawn and terminate 100 processes without zombies', async () => {
      /*
      Test Doc:
      - Why: Critical Discovery 02 warns about zombie processes from improper termination
      - Contract: After 100 spawn/terminate cycles, no process PIDs should remain active
      - Usage Notes: Uses process.kill(pid, 0) to verify process no longer exists (throws ESRCH)
      - Quality Contribution: Prevents resource leaks in long-running service
      - Worked Example: Spawn sleep 60 → terminate → verify pid throws ESRCH
      */
      const CYCLE_COUNT = 100;
      const collectedPids: number[] = [];

      for (let i = 0; i < CYCLE_COUNT; i++) {
        // Spawn a process that would run for a while
        const handle = await manager.spawn({
          command: 'sleep',
          args: ['60'],
        });

        collectedPids.push(handle.pid);
        spawnedPids.push(handle.pid);

        // Terminate immediately
        await manager.terminate(handle.pid);

        // Remove from cleanup list since it's terminated
        const idx = spawnedPids.indexOf(handle.pid);
        if (idx >= 0) spawnedPids.splice(idx, 1);
      }

      // Verify no processes are running
      // process.kill(pid, 0) throws ESRCH (Error: kill ESRCH) if process doesn't exist
      let zombieCount = 0;
      for (const pid of collectedPids) {
        try {
          process.kill(pid, 0);
          zombieCount++; // Process still exists - bad!
        } catch (err) {
          // Expected: ESRCH means process doesn't exist
          const code = (err as NodeJS.ErrnoException).code;
          expect(code).toBe('ESRCH');
        }
      }

      expect(zombieCount).toBe(0);
    }, 60_000); // 60s timeout for 100 cycles

    it('should terminate real long-running process', async () => {
      /*
      Test Doc:
      - Why: Verifies signal escalation works on real processes
      - Contract: terminate() stops a process within reasonable time
      - Usage Notes: Uses sleep 60 as long-running test process
      - Quality Contribution: Validates real OS signal delivery
      - Worked Example: spawn sleep 60 → terminate → isRunning false
      */
      const handle = await manager.spawn({
        command: 'sleep',
        args: ['60'],
      });
      spawnedPids.push(handle.pid);

      // Verify process is running
      const runningBefore = await manager.isRunning(handle.pid);
      expect(runningBefore).toBe(true);

      // Terminate
      await manager.terminate(handle.pid);

      // Verify process stopped
      const runningAfter = await manager.isRunning(handle.pid);
      expect(runningAfter).toBe(false);

      // Cleanup list
      const idx = spawnedPids.indexOf(handle.pid);
      if (idx >= 0) spawnedPids.splice(idx, 1);
    });
  });

  describe('Output Buffering', () => {
    it('should buffer large stdout output', async () => {
      /*
      Test Doc:
      - Why: ClaudeCodeAdapter needs to retrieve CLI output after process exits
      - Contract: getProcessOutput returns buffered stdout content
      - Usage Notes: Output available after waitForExit() completes
      - Quality Contribution: Enables CLI output parsing without streaming
      - Worked Example: echo "hello" → getProcessOutput → "hello\n"
      */
      // Generate ~1KB of output (not truly 1MB for test speed)
      const handle = await manager.spawn({
        command: 'seq',
        args: ['1', '100'],
      });
      spawnedPids.push(handle.pid);

      // Wait for natural exit
      await handle.waitForExit();

      // Get buffered output
      const output = manager.getProcessOutput(handle.pid);

      // Should have 100 lines: "1\n2\n3\n...100\n"
      expect(output).toContain('1\n');
      expect(output).toContain('100\n');
      expect(output.split('\n').filter((l) => l).length).toBe(100);

      // Cleanup
      const idx = spawnedPids.indexOf(handle.pid);
      if (idx >= 0) spawnedPids.splice(idx, 1);
    });
  });

  describe('Exit Code Handling', () => {
    it('should capture exit code 0 for successful process', async () => {
      /*
      Test Doc:
      - Why: Discovery 06 requires exit code mapping: 0 = completed
      - Contract: exitCode is 0 when process completes successfully
      - Usage Notes: Check result.exitCode, not result.signal
      - Quality Contribution: Enables status determination
      - Worked Example: true → exitCode 0
      */
      const handle = await manager.spawn({
        command: 'true', // Always exits 0
      });
      spawnedPids.push(handle.pid);

      const result = await handle.waitForExit();

      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeUndefined();

      const idx = spawnedPids.indexOf(handle.pid);
      if (idx >= 0) spawnedPids.splice(idx, 1);
    });

    it('should capture exit code > 0 for failed process', async () => {
      /*
      Test Doc:
      - Why: Discovery 06 requires exit code mapping: >0 = failed
      - Contract: exitCode matches process exit code for failures
      - Usage Notes: Different commands have different exit code semantics
      - Quality Contribution: Enables error detection
      - Worked Example: false → exitCode 1
      */
      const handle = await manager.spawn({
        command: 'false', // Always exits 1
      });
      spawnedPids.push(handle.pid);

      const result = await handle.waitForExit();

      expect(result.exitCode).toBe(1);
      expect(result.signal).toBeUndefined();

      const idx = spawnedPids.indexOf(handle.pid);
      if (idx >= 0) spawnedPids.splice(idx, 1);
    });

    it('should capture signal for terminated process', async () => {
      /*
      Test Doc:
      - Why: Discovery 06 requires signal capture for killed processes
      - Contract: When killed by signal, exitCode is null and signal is set
      - Usage Notes: SIGKILL = 'SIGKILL', SIGTERM = 'SIGTERM', etc.
      - Quality Contribution: Enables killed vs failed distinction
      - Worked Example: sleep + SIGTERM → exitCode null, signal 'SIGTERM'
      */
      const handle = await manager.spawn({
        command: 'sleep',
        args: ['60'],
      });
      spawnedPids.push(handle.pid);

      // Wait a moment for process to start
      await new Promise((r) => setTimeout(r, 50));

      // Kill with SIGTERM directly
      await manager.signal(handle.pid, 'SIGTERM');

      const result = await handle.waitForExit();

      // When killed by signal: exitCode is null, signal is set
      expect(result.exitCode).toBe(null);
      expect(result.signal).toBe('SIGTERM');

      const idx = spawnedPids.indexOf(handle.pid);
      if (idx >= 0) spawnedPids.splice(idx, 1);
    });
  });
});
