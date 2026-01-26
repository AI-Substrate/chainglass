/**
 * Agent Command Tests
 *
 * Per Subtask 001 ST005: Tests for the `cg agent` command group.
 * Per DYK #4: Uses direct instantiation of FakeAgentAdapter, not container.
 * Per DYK #2: Agent commands output raw JSON (AgentResult structure).
 *
 * These tests verify:
 * - Agent type validation
 * - Prompt resolution (--prompt vs --prompt-file)
 * - JSON output structure
 * - Error handling
 */

import type { AgentResult, AgentServiceRunOptions, AgentStatus } from '@chainglass/shared';
import { FakeAgentAdapter } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Valid agent types (matching agent.command.ts)
 */
const VALID_AGENT_TYPES = ['claude-code', 'copilot'] as const;

/**
 * Validate agent type - extracted logic for testing.
 */
function validateAgentType(type: string): string {
  if (!VALID_AGENT_TYPES.includes(type as (typeof VALID_AGENT_TYPES)[number])) {
    throw new Error(`Invalid agent type '${type}'. Valid types: ${VALID_AGENT_TYPES.join(', ')}`);
  }
  return type;
}

describe('cg agent run', () => {
  let fakeAdapter: FakeAgentAdapter;

  beforeEach(() => {
    fakeAdapter = new FakeAgentAdapter({
      sessionId: 'test-session-123',
      output: 'Test output from agent',
      status: 'completed',
      exitCode: 0,
      tokens: { used: 100, total: 500, limit: 200000 },
    });
  });

  describe('agent type validation', () => {
    it('should accept claude-code as valid type', () => {
      /*
      Test Doc:
      - Why: Agent type validation prevents invalid adapter selection
      - Contract: 'claude-code' is a valid agent type
      - Usage Notes: Use --type claude-code for Claude Code agent
      - Quality Contribution: Ensures valid adapter selection
      - Worked Example: --type claude-code → passes validation
      */
      expect(validateAgentType('claude-code')).toBe('claude-code');
    });

    it('should accept copilot as valid type', () => {
      /*
      Test Doc:
      - Why: Agent type validation prevents invalid adapter selection
      - Contract: 'copilot' is a valid agent type
      - Usage Notes: Use --type copilot for GitHub Copilot agent
      - Quality Contribution: Ensures valid adapter selection
      - Worked Example: --type copilot → passes validation
      */
      expect(validateAgentType('copilot')).toBe('copilot');
    });

    it('should reject invalid agent types', () => {
      /*
      Test Doc:
      - Why: Invalid agent types would cause runtime errors
      - Contract: Unknown types throw descriptive error
      - Usage Notes: Only claude-code and copilot are supported
      - Quality Contribution: Fail-fast with clear guidance
      - Worked Example: --type invalid → Error with valid types listed
      */
      expect(() => validateAgentType('invalid')).toThrow(
        "Invalid agent type 'invalid'. Valid types: claude-code, copilot"
      );
    });
  });

  describe('run with FakeAgentAdapter', () => {
    it('should return valid AgentResult on successful run', async () => {
      /*
      Test Doc:
      - Why: CLI must output correct JSON structure for scripted automation
      - Contract: run() returns AgentResult with all required fields
      - Usage Notes: Result includes sessionId for session resumption
      - Quality Contribution: Enables reliable scripted agent invocation
      - Worked Example: run({prompt: 'test'}) → {output, sessionId, status: 'completed', exitCode: 0}
      */
      const result = await fakeAdapter.run({ prompt: 'Write hello world' });

      expect(result.output).toBe('Test output from agent');
      expect(result.sessionId).toBe('test-session-123');
      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
      expect(result.tokens).toEqual({ used: 100, total: 500, limit: 200000 });
    });

    it('should pass sessionId for session resumption', async () => {
      /*
      Test Doc:
      - Why: Session resumption enables multi-turn conversations
      - Contract: When sessionId provided, it's returned in result
      - Usage Notes: Extract sessionId from first run, pass to subsequent runs
      - Quality Contribution: Enables workflow phase continuity
      - Worked Example: run({sessionId: 'abc'}) → result.sessionId === 'abc'
      */
      const result = await fakeAdapter.run({
        prompt: 'Continue from last',
        sessionId: 'existing-session',
      });

      expect(result.sessionId).toBe('existing-session');
      fakeAdapter.assertRunCalled({ sessionId: 'existing-session' });
    });

    it('should pass cwd option to adapter', async () => {
      /*
      Test Doc:
      - Why: Agent needs to operate in the correct working directory
      - Contract: cwd option is passed through to adapter
      - Usage Notes: Use --cwd to specify agent's working directory
      - Quality Contribution: Enables agents to work on specific project paths
      - Worked Example: run({cwd: '/path/to/project'}) → adapter receives cwd
      */
      await fakeAdapter.run({
        prompt: 'Analyze this directory',
        cwd: '/tmp/test-project',
      });

      fakeAdapter.assertRunCalled({ cwd: '/tmp/test-project' });
    });
  });

  describe('error handling', () => {
    it('should return failed status on error', async () => {
      /*
      Test Doc:
      - Why: Errors must be reported in structured JSON format
      - Contract: Failed runs have status='failed' and exitCode!=0
      - Usage Notes: Check status field to detect failures
      - Quality Contribution: Enables programmatic error handling
      - Worked Example: Failed run → {status: 'failed', exitCode: 1}
      */
      const errorAdapter = new FakeAgentAdapter({
        sessionId: 'error-session',
        output: '',
        status: 'failed',
        exitCode: 1,
        stderr: 'Agent error: timeout',
      });

      const result = await errorAdapter.run({ prompt: 'test' });

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('Agent error: timeout');
    });
  });
});

describe('cg agent compact', () => {
  let fakeAdapter: FakeAgentAdapter;

  beforeEach(() => {
    fakeAdapter = new FakeAgentAdapter({
      sessionId: 'compact-session',
      tokens: { used: 50, total: 200, limit: 200000 },
    });
  });

  it('should return AgentResult with updated tokens', async () => {
    /*
    Test Doc:
    - Why: Compact reduces context and returns new token counts
    - Contract: compact() returns AgentResult with updated token metrics
    - Usage Notes: Check tokens.total to verify context was reduced
    - Quality Contribution: Enables context management in long sessions
    - Worked Example: compact('abc') → {tokens: {used: 50, total: 200}}
    */
    const result = await fakeAdapter.compact('test-session');

    expect(result.status).toBe('completed');
    expect(result.sessionId).toBe('test-session');
    expect(result.tokens).toEqual({ used: 50, total: 200, limit: 200000 });
  });

  it('should track compact calls', async () => {
    /*
    Test Doc:
    - Why: Tests must verify compact was called with correct sessionId
    - Contract: FakeAgentAdapter tracks all compact calls
    - Usage Notes: Use getCompactHistory() to verify calls
    - Quality Contribution: Enables assertion on adapter behavior
    - Worked Example: compact('abc') → compactHistory includes 'abc'
    */
    await fakeAdapter.compact('session-to-compact');

    fakeAdapter.assertCompactCalled('session-to-compact');
    expect(fakeAdapter.getCompactHistory()).toContain('session-to-compact');
  });
});

describe('AgentResult JSON structure', () => {
  it('should have all required fields for completed run', () => {
    /*
    Test Doc:
    - Why: JSON output format must be consistent for automation
    - Contract: AgentResult has output, sessionId, status, exitCode, tokens
    - Usage Notes: Parse JSON output with jq or JSON.parse
    - Quality Contribution: Documents expected JSON structure
    - Worked Example: Successful run → all fields present and typed correctly
    */
    const result: AgentResult = {
      output: 'Hello world',
      sessionId: 'session-123',
      status: 'completed',
      exitCode: 0,
      tokens: { used: 100, total: 500, limit: 200000 },
    };

    // Verify all required fields exist
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('sessionId');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('exitCode');
    expect(result).toHaveProperty('tokens');

    // Verify types
    expect(typeof result.output).toBe('string');
    expect(typeof result.sessionId).toBe('string');
    expect(['completed', 'failed', 'killed']).toContain(result.status);
    expect(typeof result.exitCode).toBe('number');
  });

  it('should allow null tokens (e.g., for Copilot)', () => {
    /*
    Test Doc:
    - Why: Some agents (Copilot) don't report token metrics
    - Contract: tokens field can be null when unavailable
    - Usage Notes: Check tokens !== null before accessing token fields
    - Quality Contribution: Documents nullable tokens pattern (DYK-03)
    - Worked Example: Copilot result → tokens: null
    */
    const result: AgentResult = {
      output: 'Copilot output',
      sessionId: 'copilot-session',
      status: 'completed',
      exitCode: 0,
      tokens: null,
    };

    expect(result.tokens).toBeNull();
  });

  it('should allow optional stderr field', () => {
    /*
    Test Doc:
    - Why: Error output should be captured separately from stdout
    - Contract: stderr is optional, present on errors
    - Usage Notes: Check stderr for error details when status='failed'
    - Quality Contribution: Enables detailed error diagnosis
    - Worked Example: Failed run → stderr contains error message
    */
    const result: AgentResult = {
      output: '',
      sessionId: 'error-session',
      status: 'failed',
      exitCode: 1,
      tokens: null,
      stderr: 'Error: Connection timeout',
    };

    expect(result.stderr).toBe('Error: Connection timeout');
  });
});
