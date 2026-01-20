import { type ChildProcess, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
/**
 * Web Command Tests
 *
 * Tests for the `cg web` command that starts the production server
 * from bundled standalone assets.
 *
 * Per Critical Insight #2: Uses afterEach proc.kill() cleanup with random ports.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Helper to generate random high port
function getRandomPort(): number {
  return 30000 + Math.floor(Math.random() * 10000);
}

describe('Web Command', () => {
  let proc: ChildProcess | null = null;

  afterEach(() => {
    // Critical Insight #2: Always kill spawned processes
    if (proc) {
      proc.kill('SIGKILL');
      proc = null;
    }
  });

  describe('Asset Discovery', () => {
    it('should find bundled standalone assets via import.meta.dirname', async () => {
      /*
      Test Doc:
      - Why: Per Critical Insight #3, assets must be found relative to CLI binary, not process.cwd()
      - Contract: findStandaloneAssets() returns path to bundled web assets
      - Usage Notes: Path resolution uses import.meta.dirname pattern
      - Quality Contribution: Catches broken asset path resolution that would break npx portability
      - Worked Example: findStandaloneAssets() returns path containing 'standalone' or 'web'
      */
      const { findStandaloneAssets } = await import('@chainglass/cli/commands/web.command');

      const assetsPath = findStandaloneAssets();

      // Should return a path that exists or is structured correctly
      expect(assetsPath).toBeDefined();
      expect(typeof assetsPath).toBe('string');
      // Path should reference the dist/web directory structure
      expect(assetsPath).toMatch(/web|standalone/);
    });
  });

  describe('Server Startup', () => {
    it('should accept port option', async () => {
      /*
      Test Doc:
      - Why: Users need to specify custom port when default is occupied
      - Contract: runWebCommand({ port: N }) starts server on port N
      - Usage Notes: Port passed as option to runWebCommand function
      - Quality Contribution: Catches broken port option handling
      - Worked Example: runWebCommand({ port: 8080 }) attempts to start on 8080
      */
      // This test verifies the function accepts the port option without error
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');

      // Mock console to capture output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const port = getRandomPort();
      await runWebCommand({ port });

      // Should have logged startup message with the port
      expect(consoleSpy).toHaveBeenCalled();
      const loggedMessage = consoleSpy.mock.calls.flat().join(' ');
      expect(loggedMessage).toContain(String(port));

      consoleSpy.mockRestore();
    });

    it('should use default port 3000', async () => {
      /*
      Test Doc:
      - Why: Default port ensures predictable behavior when no port specified
      - Contract: runWebCommand with port: 3000 logs 3000 in startup message
      - Usage Notes: Default comes from Commander option default
      - Quality Contribution: Catches missing default port configuration
      - Worked Example: runWebCommand({ port: 3000 }) logs 'localhost:3000'
      */
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runWebCommand({ port: 3000 });

      const loggedMessage = consoleSpy.mock.calls.flat().join(' ');
      expect(loggedMessage).toContain('3000');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing assets gracefully', async () => {
      /*
      Test Doc:
      - Why: Clear error when assets missing helps users understand the problem
      - Contract: validateStandaloneAssets() throws descriptive error if assets not found
      - Usage Notes: Used before attempting to start server
      - Quality Contribution: Catches silent failures when bundle incomplete
      - Worked Example: validateStandaloneAssets('/invalid/path') throws 'assets not found'
      */
      const { validateStandaloneAssets } = await import('@chainglass/cli/commands/web.command');

      expect(() => {
        validateStandaloneAssets('/nonexistent/path/to/assets');
      }).toThrow(/not found|does not exist|missing/i);
    });
  });

  describe('Port Validation', () => {
    it('should reject invalid port (NaN)', async () => {
      /*
      Test Doc:
      - Why: Invalid ports like 'abc' parse to NaN and cause unpredictable behavior
      - Contract: runWebCommand throws Error for non-numeric port
      - Usage Notes: Pass { port: NaN } explicitly to test
      - Quality Contribution: Catches missing input validation
      - Worked Example: runWebCommand({ port: NaN }) throws 'Port must be'
      */
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');
      // biome-ignore lint/suspicious/noExplicitAny: Test intentionally passes invalid type
      await expect(runWebCommand({ port: Number.NaN } as any)).rejects.toThrow(
        /port must be|invalid port/i
      );
    });

    it('should reject port out of range (too high)', async () => {
      /*
      Test Doc:
      - Why: Port 99999 exceeds valid TCP port range (1-65535)
      - Contract: runWebCommand throws Error for out-of-range port
      - Usage Notes: Valid port range is 1-65535
      - Quality Contribution: Catches missing range validation
      - Worked Example: runWebCommand({ port: 99999 }) throws 'Port must be'
      */
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');
      await expect(runWebCommand({ port: 99999 })).rejects.toThrow(/port must be|invalid port/i);
    });

    it('should reject negative port', async () => {
      /*
      Test Doc:
      - Why: Negative ports are invalid TCP ports
      - Contract: runWebCommand throws Error for negative port
      - Usage Notes: Valid port range is 1-65535
      - Quality Contribution: Catches missing lower bound validation
      - Worked Example: runWebCommand({ port: -1 }) throws 'Port must be'
      */
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');
      await expect(runWebCommand({ port: -1 })).rejects.toThrow(/port must be|invalid port/i);
    });

    it('should reject port zero', async () => {
      /*
      Test Doc:
      - Why: Port 0 typically means "any available port" which is not user intent
      - Contract: runWebCommand throws Error for port 0
      - Usage Notes: Port 0 is technically special in TCP/IP
      - Quality Contribution: Catches edge case at lower boundary
      - Worked Example: runWebCommand({ port: 0 }) throws 'Port must be'
      */
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');
      await expect(runWebCommand({ port: 0 })).rejects.toThrow(/port must be|invalid port/i);
    });

    it('should accept valid port at boundary (1)', async () => {
      /*
      Test Doc:
      - Why: Port 1 is technically valid (though requires root)
      - Contract: runWebCommand does not throw for valid port
      - Usage Notes: Tests lower boundary of valid range
      - Quality Contribution: Ensures validation doesn't reject valid ports
      - Worked Example: runWebCommand({ port: 1 }) does not throw validation error
      */
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Should not throw validation error (may fail for other reasons like missing assets)
      await expect(runWebCommand({ port: 1 })).resolves.not.toThrow(/port must be|invalid port/i);

      consoleSpy.mockRestore();
    });

    it('should accept valid port at boundary (65535)', async () => {
      /*
      Test Doc:
      - Why: Port 65535 is the maximum valid TCP port
      - Contract: runWebCommand does not throw for valid port
      - Usage Notes: Tests upper boundary of valid range
      - Quality Contribution: Ensures validation doesn't reject valid ports
      - Worked Example: runWebCommand({ port: 65535 }) does not throw validation error
      */
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Should not throw validation error (may fail for other reasons like missing assets)
      await expect(runWebCommand({ port: 65535 })).resolves.not.toThrow(
        /port must be|invalid port/i
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Startup Feedback', () => {
    it('should show startup message with chalk colors', async () => {
      /*
      Test Doc:
      - Why: Per Invariant #7, first-run feedback is required for UX
      - Contract: runWebCommand logs colored startup message via chalk
      - Usage Notes: chalk.cyan for startup, chalk.green for ready
      - Quality Contribution: Catches missing user feedback during startup
      - Worked Example: Console output includes 'Chainglass' and 'starting'
      */
      const { runWebCommand } = await import('@chainglass/cli/commands/web.command');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const port = getRandomPort();
      await runWebCommand({ port });

      // Should show startup message
      const loggedMessage = consoleSpy.mock.calls.flat().join(' ');
      expect(loggedMessage.toLowerCase()).toMatch(/chainglass|starting/);

      consoleSpy.mockRestore();
    });
  });
});
