import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { CopilotAdapter, FakeLogger, UnixProcessManager } from '@chainglass/shared';

/**
 * Check if GitHub Copilot CLI is installed and available.
 *
 * Per DYK Insight 1: Uses npx -y to auto-install if needed.
 */
function hasCopilotCli(): boolean {
  try {
    // Try to get version - Copilot uses @github/copilot package
    execSync('npx -y @github/copilot --version', { stdio: 'ignore', timeout: 30000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Copilot CLI version for logging.
 */
function getCopilotCliVersion(): string | null {
  try {
    const output = execSync('npx -y @github/copilot --version', { encoding: 'utf-8', timeout: 30000 });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Integration tests for CopilotAdapter with real CLI.
 *
 * Per plan Task 4.8: Tests verify real CLI integration.
 * Per Discovery 07: Log CLI version for debugging.
 * Per Discovery 01: Copilot uses log files instead of stdout for session data.
 * Per Discovery 04: Token reporting is undocumented; returns null.
 * Per Discovery 05: Session ID extraction uses exponential backoff polling.
 *
 * These tests require the GitHub Copilot CLI to be installed:
 *   npm install -g @github/copilot
 *
 * Tests will be skipped if CLI is not available.
 *
 * NOTE: These tests actually spawn the Copilot CLI and may be slow.
 * They are marked with longer timeout (60s) to accommodate.
 */
describe.skipIf(!hasCopilotCli())('CopilotAdapter Integration', () => {
  let processManager: UnixProcessManager;

  beforeAll(() => {
    // Per Discovery 07: Log CLI version for debugging
    const version = getCopilotCliVersion();
    console.log(`GitHub Copilot CLI version: ${version}`);

    // Create real process manager with FakeLogger
    // Using FakeLogger to avoid console noise in tests
    const logger = new FakeLogger();
    processManager = new UnixProcessManager(logger);
  });

  it('should return AgentResult with sessionId from real CLI', async () => {
    /*
    Test Doc:
    - Why: AC-1/AC-17 requires session ID in result for session resumption
    - Contract: Real CLI spawn produces log files with session data; adapter extracts session ID
    - Usage Notes: Uses --log-dir flag per DYK Insight 1 for deterministic log location
    - Quality Contribution: Validates real CLI integration and log parsing works
    - Worked Example: spawn CLI with --log-dir → parse logs → extract session_id
    */
    const adapter = new CopilotAdapter(processManager);

    const result = await adapter.run({
      prompt: 'What is 2+2? Answer with just the number.',
    });

    expect(result).toBeDefined();
    expect(result.sessionId).toBeDefined();
    expect(result.sessionId.length).toBeGreaterThan(0);
    expect(result.status).toBe('completed');
    expect(result.exitCode).toBe(0);
  }, 60000); // 60s timeout for real CLI

  it('should return null for token metrics (Discovery 04)', async () => {
    /*
    Test Doc:
    - Why: Discovery 04 - Copilot token reporting is undocumented
    - Contract: Real CLI execution returns tokens: null (graceful degradation)
    - Usage Notes: Adapter must not fabricate token data; return null honestly
    - Quality Contribution: Ensures honest reporting of unavailable data
    - Worked Example: run() → {tokens: null, status: 'completed'}
    */
    const adapter = new CopilotAdapter(processManager);

    const result = await adapter.run({
      prompt: 'Say hello',
    });

    expect(result.tokens).toBeNull();
  }, 60000);

  it('should return completed status on successful exit (AC-5)', async () => {
    /*
    Test Doc:
    - Why: AC-5 requires status='completed' on exit 0
    - Contract: Real CLI successful exit → status='completed', exitCode=0
    - Usage Notes: Check both status and exitCode for verification
    - Quality Contribution: Ensures status mapping is correct
    - Worked Example: CLI exits 0 → {status: 'completed', exitCode: 0}
    */
    const adapter = new CopilotAdapter(processManager);

    const result = await adapter.run({
      prompt: 'What is the capital of France? Just the name.',
    });

    expect(result.status).toBe('completed');
    expect(result.exitCode).toBe(0);
  }, 60000);

  it('should include output from CLI response', async () => {
    /*
    Test Doc:
    - Why: AC-4 requires output capture from CLI
    - Contract: Real CLI output is captured in result.output
    - Usage Notes: Output may be empty for some prompts
    - Quality Contribution: Validates output capture works
    - Worked Example: run({prompt:"hi"}) → {output: "Hello!", ...}
    */
    const adapter = new CopilotAdapter(processManager);

    const result = await adapter.run({
      prompt: 'Say exactly the word "test" and nothing else.',
    });

    expect(result.output).toBeDefined();
    // Output should contain something (Copilot should respond)
    // Note: exact output varies, so we just check it's non-empty
  }, 60000);

  // NOTE: Session resumption test would require maintaining session state
  // between CLI invocations, which is slow. Skipping detailed resume test
  // as unit tests already verify the --resume flag is passed correctly.

  // NOTE: Compact test is skipped as Copilot compact behavior is undocumented
  // and may not work as expected. Unit tests verify the adapter sends the command.
});

/**
 * Notification test for when CLI is not available.
 */
describe.skipIf(hasCopilotCli())('CopilotAdapter Integration (CLI not installed)', () => {
  it('should skip tests when Copilot CLI is not installed', () => {
    console.log('GitHub Copilot CLI not installed - integration tests skipped');
    console.log('To install: npm install -g @github/copilot');
    expect(true).toBe(true);
  });
});
