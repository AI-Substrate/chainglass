/**
 * Agent CLI E2E Tests — Tier 3
 *
 * Plan 034, Phase 4: Spawns actual `cg agent run` and `cg agent compact`
 * CLI processes and verifies stdout, exit codes, and session chaining.
 *
 * These tests use `describe.skip` (hardcoded) — they never run automatically.
 * To run manually, remove `.skip`, ensure Claude CLI is authenticated,
 * and build the CLI first: `pnpm --filter @chainglass/shared build && pnpm --filter @chainglass/cli build`
 *
 * Per DYK-P4#1: test/e2e/ is excluded from vitest config. Use `just test-e2e` to run.
 * Per DYK-P4#2: Using `describe.skip` matches existing real agent test pattern.
 * Per DYK-P4#3: Default mode outputs JSON (not --quiet which suppresses all output).
 *
 * Run manually:
 *   npx vitest run test/e2e/agent-cli-e2e.test.ts --config vitest.config.ts --testPathPattern=test/e2e
 *   (or override exclude in config)
 */

import { type ExecSyncOptions, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ============================================================================
// CLI HELPER
// ============================================================================

const CLI_PATH = resolve(__dirname, '../../apps/cli/dist/cli.cjs');

/**
 * Run a `cg agent` CLI command and return stdout.
 * Throws on non-zero exit code.
 */
function runAgentCli(args: string[], options: ExecSyncOptions = {}): string {
  const cmd = `node ${CLI_PATH} agent ${args.join(' ')}`;
  return execSync(cmd, {
    encoding: 'utf-8',
    timeout: 120_000,
    cwd: process.cwd(),
    ...options,
  });
}

/**
 * Run a `cg agent` CLI command, returning stdout and allowing non-zero exit.
 */
function runAgentCliSafe(args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = runAgentCli(args);
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

// ============================================================================
// CLI E2E TESTS
// ============================================================================

describe.skip('cg agent run CLI E2E', { timeout: 180_000 }, () => {
  it('new session returns JSON result and exits 0', () => {
    /**
     * Test Doc:
     * - Why: Proves CLI end-to-end: command parsing → DI → AgentManagerService → adapter → output
     * - Contract: Exit 0, stdout is valid JSON with status=completed and sessionId
     * - Usage Notes: CLI must be built. Default mode outputs JSON (per DYK-P3#1).
     */
    if (!existsSync(CLI_PATH)) {
      throw new Error('CLI not built. Run: pnpm --filter @chainglass/cli build');
    }

    const output = runAgentCli([
      'run',
      '-t',
      'claude-code',
      '-p',
      '"What is 2+2? Reply with just the number."',
    ]);

    // Default mode outputs single-line JSON result
    const trimmed = output.trim();
    const result = JSON.parse(trimmed);

    expect(result.status).toBe('completed');
    expect(result.sessionId).toBeTruthy();
    expect(typeof result.output).toBe('string');
  });

  it('session chaining across CLI invocations', () => {
    /**
     * Test Doc:
     * - Why: Proves sessionId can be passed across separate CLI invocations
     * - Contract: Turn 2 completes with Turn 1's sessionId
     * - Usage Notes: Default mode returns JSON, parse to extract sessionId (per DYK-P4#3)
     */
    // Turn 1: new session
    const output1 = runAgentCli([
      'run',
      '-t',
      'claude-code',
      '-p',
      '"Remember the number 42. Confirm."',
    ]);

    const result1 = JSON.parse(output1.trim());
    expect(result1.status).toBe('completed');
    expect(result1.sessionId).toBeTruthy();

    const sessionId = result1.sessionId;

    // Turn 2: resume with sessionId
    const output2 = runAgentCli([
      'run',
      '-t',
      'claude-code',
      '-s',
      sessionId,
      '-p',
      '"What number did I ask you to remember?"',
    ]);

    const result2 = JSON.parse(output2.trim());
    expect(result2.status).toBe('completed');
    expect(result2.sessionId).toBeTruthy();
  });

  it('compact session and continue', () => {
    /**
     * Test Doc:
     * - Why: Proves compact command works via CLI
     * - Contract: Compact completes, then resume works
     */
    // Turn 1: create session with content
    const output1 = runAgentCli([
      'run',
      '-t',
      'claude-code',
      '-p',
      '"Explain the Fibonacci sequence in detail."',
    ]);

    const result1 = JSON.parse(output1.trim());
    expect(result1.status).toBe('completed');
    const sessionId = result1.sessionId;

    // Compact
    const compactOutput = runAgentCli(['compact', '-t', 'claude-code', '-s', sessionId]);

    const compactResult = JSON.parse(compactOutput.trim());
    expect(compactResult.status).toBe('completed');

    // Turn 2: resume after compact
    const output2 = runAgentCli([
      'run',
      '-t',
      'claude-code',
      '-s',
      sessionId,
      '-p',
      '"What were we discussing?"',
    ]);

    const result2 = JSON.parse(output2.trim());
    expect(result2.status).toBe('completed');
  });

  it('--stream outputs NDJSON events', () => {
    /**
     * Test Doc:
     * - Why: Proves --stream flag produces machine-readable NDJSON output
     * - Contract: Each line is valid JSON, has text events, last line has status
     * - Usage Notes: Events from console.log, result from process.stdout.write (DYK-P4#4)
     */
    const output = runAgentCli(['run', '-t', 'claude-code', '-p', '"Say hello."', '--stream']);

    const lines = output.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);

    // Each line should be valid JSON
    const parsed = lines.map((line) => {
      const obj = JSON.parse(line);
      expect(obj).toBeDefined();
      return obj;
    });

    // Should contain at least one text event (type field = AgentEvent)
    const hasTextEvent = parsed.some((e) => e.type === 'text_delta' || e.type === 'message');
    expect(hasTextEvent).toBe(true);

    // Last line should be the AgentResult (has status field, no type field)
    const last = parsed[parsed.length - 1];
    expect(last.status).toBe('completed');
    expect(last.sessionId).toBeTruthy();
  });
});

// ============================================================================
// DIAGNOSTIC (ensures file is valid even when skipped)
// ============================================================================

describe('Agent CLI E2E Tests (skip confirmation)', () => {
  it('CLI E2E tests are skipped by default', () => {
    expect(existsSync(CLI_PATH) || true).toBe(true);
  });
});
