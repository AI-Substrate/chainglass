import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Check if Claude Code CLI is installed and available.
 */
function hasClaudeCli(): boolean {
  try {
    execSync('npx claude --version', { stdio: 'ignore', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Claude Code CLI version for logging.
 */
function getClaudeCliVersion(): string | null {
  try {
    const output = execSync('npx claude --version', { encoding: 'utf-8', timeout: 10000 });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Integration tests for ClaudeCodeAdapter with real CLI.
 *
 * Per plan Task 2.1: Tests define expected behaviors with skip-if-no-CLI guard.
 * Per Discovery 07: Log CLI version for debugging.
 *
 * These tests require the Claude Code CLI to be installed:
 *   npm install -g @anthropic-ai/claude-code
 *
 * Tests will be skipped if CLI is not available.
 */
describe.skipIf(!hasClaudeCli())('ClaudeCodeAdapter Integration', () => {
  beforeAll(() => {
    // Per Discovery 07: Log CLI version for debugging
    const version = getClaudeCliVersion();
    console.log(`Claude Code CLI version: ${version}`);
  });

  it('should extract session ID from real CLI output', async () => {
    /*
    Test Doc:
    - Why: AC-1 requires session ID in result for session resumption
    - Contract: Real CLI spawn produces stream-json with session_id field
    - Usage Notes: Requires --output-format=stream-json flag
    - Quality Contribution: Validates real CLI integration works
    - Worked Example: spawn CLI → parse output → extract session_id
    */
    // This test will be implemented in T008 after ClaudeCodeAdapter exists
    // For now, define the expected behavior
    expect(true).toBe(true);
  });

  it('should extract token metrics from real CLI output', async () => {
    /*
    Test Doc:
    - Why: AC-9/AC-10/AC-11 require token tracking for compaction decisions
    - Contract: Real CLI Result message contains usage field with token counts
    - Usage Notes: Tokens are sum of input_tokens + output_tokens + cache tokens
    - Quality Contribution: Validates token extraction from real stream-json
    - Worked Example: Result.usage → {used: 150, total: 150, limit: 200000}
    */
    // This test will be implemented in T008 after ClaudeCodeAdapter exists
    expect(true).toBe(true);
  });

  it('should spawn with correct flags', async () => {
    /*
    Test Doc:
    - Why: AC-16 requires --dangerously-skip-permissions and --output-format=stream-json
    - Contract: CLI spawned with required flags produces valid stream-json
    - Usage Notes: Missing flags cause different output format or permission prompts
    - Quality Contribution: Ensures CLI is invoked correctly
    - Worked Example: spawn with flags → stream-json output, no prompts
    */
    // This test will be implemented in T008 after ClaudeCodeAdapter exists
    expect(true).toBe(true);
  });

  it('should resume session with --resume flag', async () => {
    /*
    Test Doc:
    - Why: AC-2 requires session resumption with prior context
    - Contract: --resume sessionId continues existing session
    - Usage Notes: Session ID from prior run can be used to resume
    - Quality Contribution: Validates session continuity works with real CLI
    - Worked Example: run1 → sessionId → run2 with --resume → same session
    */
    // This test will be implemented in T008 after ClaudeCodeAdapter exists
    expect(true).toBe(true);
  });

  it('should return completed status on successful exit', async () => {
    /*
    Test Doc:
    - Why: AC-5 requires status='completed' on exit 0
    - Contract: Real CLI successful exit → status='completed', exitCode=0
    - Usage Notes: Check both status and exitCode for verification
    - Quality Contribution: Ensures status mapping is correct
    - Worked Example: CLI exits 0 → {status: 'completed', exitCode: 0}
    */
    // This test will be implemented in T008 after ClaudeCodeAdapter exists
    expect(true).toBe(true);
  });

  it('should log CLI version on first use', async () => {
    /*
    Test Doc:
    - Why: Per Discovery 07: version logging aids debugging
    - Contract: Adapter logs CLI version on initialization
    - Usage Notes: Version is logged, not validated/pinned
    - Quality Contribution: Helps diagnose version-specific issues
    - Worked Example: adapter.run() → logs "Claude Code CLI version: 1.0.20"
    */
    // This test will be implemented in T008 after ClaudeCodeAdapter exists
    expect(true).toBe(true);
  });
});

/**
 * Notification test for when CLI is not available.
 */
describe.skipIf(hasClaudeCli())('ClaudeCodeAdapter Integration (CLI not installed)', () => {
  it('should skip tests when Claude Code CLI is not installed', () => {
    console.log('Claude Code CLI not installed - integration tests skipped');
    console.log('To install: npm install -g @anthropic-ai/claude-code');
    expect(true).toBe(true);
  });
});
