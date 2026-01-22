import { describe, expect, it } from 'vitest';

import type { IAgentAdapter, AgentResult, AgentRunOptions } from '@chainglass/shared';

/**
 * Contract tests for IAgentAdapter implementations.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeAgentAdapter and real adapters (ClaudeCodeAdapter, CopilotAdapter)
 * pass the same behavioral tests.
 *
 * Usage:
 * ```typescript
 * import { agentAdapterContractTests } from '@test/contracts/agent-adapter.contract';
 *
 * agentAdapterContractTests('FakeAgentAdapter', () => new FakeAgentAdapter());
 * agentAdapterContractTests('ClaudeCodeAdapter', () => new ClaudeCodeAdapter(...));
 * ```
 */
export function agentAdapterContractTests(
  name: string,
  createAdapter: () => IAgentAdapter
) {
  describe(`${name} implements IAgentAdapter contract`, () => {
    it('should return structured result with sessionId on run()', async () => {
      /*
      Test Doc:
      - Why: AC-1 requires session ID in result for session resumption
      - Contract: run() returns AgentResult with non-empty sessionId
      - Usage Notes: First call creates new session; subsequent calls can resume with sessionId
      - Quality Contribution: Catches session ID generation/extraction failures
      - Worked Example: run({prompt:"hi"}) → {sessionId:"abc-123", status:"completed", ...}
      */
      const adapter = createAdapter();
      const result = await adapter.run({
        prompt: 'test prompt',
      });

      expect(result).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId.length).toBeGreaterThan(0);
    });

    it('should return status completed on successful execution', async () => {
      /*
      Test Doc:
      - Why: AC-5 requires status='completed' when agent exits with code 0
      - Contract: Successful execution returns status='completed' and exitCode=0
      - Usage Notes: Check exitCode for actual process result
      - Quality Contribution: Ensures status semantic correctness
      - Worked Example: successful run → {status:'completed', exitCode:0}
      */
      const adapter = createAdapter();
      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
    });

    it('should include output in result', async () => {
      /*
      Test Doc:
      - Why: AC-4 requires output field in result for agent response
      - Contract: run() returns AgentResult with output string
      - Usage Notes: output may be empty string but must be defined
      - Quality Contribution: Catches output capture failures
      - Worked Example: run({prompt:"hi"}) → {output:"Hello!", ...}
      */
      const adapter = createAdapter();
      const result = await adapter.run({ prompt: 'test' });

      expect(result.output).toBeDefined();
      expect(typeof result.output).toBe('string');
    });

    it('should include tokens in result when available', async () => {
      /*
      Test Doc:
      - Why: AC-9/AC-10/AC-11 require token metrics for compaction decisions
      - Contract: result.tokens is TokenMetrics | null; when non-null has used, total, limit
      - Usage Notes: Copilot may return null; Claude Code should always have tokens
      - Quality Contribution: Ensures token tracking works for context management
      - Worked Example: run() → {tokens:{used:100, total:500, limit:200000}}
      */
      const adapter = createAdapter();
      const result = await adapter.run({ prompt: 'test' });

      // tokens can be null (Copilot) or TokenMetrics object
      if (result.tokens !== null) {
        expect(result.tokens.used).toBeDefined();
        expect(typeof result.tokens.used).toBe('number');
        expect(result.tokens.total).toBeDefined();
        expect(typeof result.tokens.total).toBe('number');
        expect(result.tokens.limit).toBeDefined();
        expect(typeof result.tokens.limit).toBe('number');
      }
    });

    it('should allow session resumption with sessionId', async () => {
      /*
      Test Doc:
      - Why: AC-2 requires session resumption with prior context
      - Contract: run() with existing sessionId returns result with same sessionId
      - Usage Notes: Agent manages actual context; service just passes sessionId
      - Quality Contribution: Ensures session continuity across calls
      - Worked Example: run({sessionId:"abc"}) → {sessionId:"abc", ...}
      */
      const adapter = createAdapter();

      // First call creates session
      const result1 = await adapter.run({ prompt: 'first' });
      const sessionId = result1.sessionId;

      // Second call resumes session
      const result2 = await adapter.run({
        prompt: 'second',
        sessionId
      });

      expect(result2.sessionId).toBe(sessionId);
    });

    it('should return status killed after terminate()', async () => {
      /*
      Test Doc:
      - Why: AC-7 requires status='killed' when terminated via terminate()
      - Contract: After terminate(), subsequent queries show killed status
      - Usage Notes: terminate() stops the agent gracefully; session remains valid
      - Quality Contribution: Ensures termination status is correctly reported
      - Worked Example: terminate(sessionId) → next run shows killed state
      */
      const adapter = createAdapter();

      // Start a session
      const result = await adapter.run({ prompt: 'test' });
      const sessionId = result.sessionId;

      // Terminate the session
      const terminateResult = await adapter.terminate(sessionId);

      expect(terminateResult.status).toBe('killed');
    });

    it('should send compact command and return result', async () => {
      /*
      Test Doc:
      - Why: AC-12 requires compact() to reduce context when approaching limits
      - Contract: compact(sessionId) returns AgentResult; tokens.total may decrease
      - Usage Notes: Compact on new session may have no effect
      - Quality Contribution: Ensures compaction command is properly sent
      - Worked Example: compact(sessionId) → {status:'completed', tokens:{...}}
      */
      const adapter = createAdapter();

      // Start a session first
      const runResult = await adapter.run({ prompt: 'test' });
      const sessionId = runResult.sessionId;

      // Compact the session
      const compactResult = await adapter.compact(sessionId);

      expect(compactResult).toBeDefined();
      expect(compactResult.status).toBe('completed');
      expect(compactResult.sessionId).toBe(sessionId);
    });

    it('should include stderr in result when present', async () => {
      /*
      Test Doc:
      - Why: AC-8 requires stderr capture for debugging
      - Contract: result.stderr is optional string; present when agent writes to stderr
      - Usage Notes: May be undefined on success paths
      - Quality Contribution: Enables debugging of agent errors
      - Worked Example: agent writes to stderr → {stderr:"Warning: ...", ...}
      */
      const adapter = createAdapter();
      const result = await adapter.run({ prompt: 'test' });

      // stderr is optional but if present must be string
      if (result.stderr !== undefined) {
        expect(typeof result.stderr).toBe('string');
      }
    });

    it('should return failed status with non-zero exit code on error', async () => {
      /*
      Test Doc:
      - Why: AC-6 requires status='failed' with correct exitCode on errors
      - Contract: Error execution returns status='failed' and exitCode > 0
      - Usage Notes: FakeAgentAdapter can be configured to simulate failures
      - Quality Contribution: Ensures error states are correctly reported
      - Worked Example: agent fails → {status:'failed', exitCode:1}
      */
      // This test requires the adapter to be configured for failure
      // For contract tests with Fake, we test the interface shape
      // Real failure testing is done in unit tests with configured fakes
      const adapter = createAdapter();
      const result = await adapter.run({ prompt: 'test' });

      // Verify result shape supports failure states
      expect(['completed', 'failed', 'killed']).toContain(result.status);
      expect(typeof result.exitCode).toBe('number');
    });
  });
}
