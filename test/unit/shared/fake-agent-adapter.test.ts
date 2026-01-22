import { describe, expect, it, beforeEach } from 'vitest';

import type { AgentRunOptions, TokenMetrics } from '@chainglass/shared';
import { FakeAgentAdapter } from '@chainglass/shared';

describe('FakeAgentAdapter', () => {
  describe('run() behavior', () => {
    it('should return configured response on run()', async () => {
      /*
      Test Doc:
      - Why: FakeAgentAdapter must return predictable responses for unit testing
      - Contract: Constructor config determines run() return values
      - Usage Notes: Pass desired response fields in constructor options
      - Quality Contribution: Enables deterministic unit tests without real CLI
      - Worked Example: FakeAgentAdapter({sessionId:'abc'}) → run() returns {sessionId:'abc'}
      */
      const tokens: TokenMetrics = { used: 100, total: 500, limit: 200000 };
      const fake = new FakeAgentAdapter({
        sessionId: 'test-session-123',
        output: 'Hello from fake agent',
        tokens,
      });

      const result = await fake.run({ prompt: 'test prompt' });

      expect(result.sessionId).toBe('test-session-123');
      expect(result.output).toBe('Hello from fake agent');
      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
      expect(result.tokens).toEqual(tokens);
    });

    it('should record run() call in history', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify what prompts were sent to the adapter
      - Contract: getRunHistory() returns all run() calls with options
      - Usage Notes: Call history is preserved across multiple run() calls
      - Quality Contribution: Enables verification of caller behavior
      - Worked Example: run({prompt:'a'}), run({prompt:'b'}) → history=[{prompt:'a'},{prompt:'b'}]
      */
      const fake = new FakeAgentAdapter();

      await fake.run({ prompt: 'first prompt' });
      await fake.run({ prompt: 'second prompt', sessionId: 'sess-1' });

      const history = fake.getRunHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ prompt: 'first prompt' });
      expect(history[1]).toEqual({ prompt: 'second prompt', sessionId: 'sess-1' });
    });

    it('should preserve sessionId when provided in options', async () => {
      /*
      Test Doc:
      - Why: Session resumption requires returning the same sessionId
      - Contract: run() with sessionId returns result with that sessionId
      - Usage Notes: This simulates session continuation
      - Quality Contribution: Verifies session resumption behavior
      - Worked Example: run({prompt:'x', sessionId:'abc'}) → {sessionId:'abc'}
      */
      const fake = new FakeAgentAdapter({ sessionId: 'default-session' });

      const result = await fake.run({ prompt: 'test', sessionId: 'override-session' });

      expect(result.sessionId).toBe('override-session');
    });
  });

  describe('assertion helpers', () => {
    let fake: FakeAgentAdapter;

    beforeEach(() => {
      fake = new FakeAgentAdapter();
    });

    it('should assertRunCalled() pass when run() was called with matching options', async () => {
      /*
      Test Doc:
      - Why: Tests need concise assertion for verifying run() was called
      - Contract: assertRunCalled() passes if matching call exists, throws otherwise
      - Usage Notes: Uses partial matching - all specified fields must match
      - Quality Contribution: Simplifies test assertions
      - Worked Example: run({prompt:'x'}); assertRunCalled({prompt:'x'}) → pass
      */
      await fake.run({ prompt: 'expected prompt' });

      expect(() => fake.assertRunCalled({ prompt: 'expected prompt' })).not.toThrow();
    });

    it('should assertRunCalled() throw when run() was not called', () => {
      /*
      Test Doc:
      - Why: Assertion must fail when expected call didn't happen
      - Contract: assertRunCalled() throws descriptive error if no match
      - Usage Notes: Error message includes actual call history
      - Quality Contribution: Clear failure messages for debugging
      - Worked Example: assertRunCalled({prompt:'x'}) with no calls → throw
      */
      expect(() => fake.assertRunCalled({ prompt: 'never called' })).toThrow(
        /Expected run\(\) to be called with/
      );
    });

    it('should assertRunCalled() throw when prompt does not match', async () => {
      /*
      Test Doc:
      - Why: Assertion must fail when call exists but doesn't match
      - Contract: assertRunCalled() matches exact prompt text
      - Usage Notes: Partial matching on other fields, exact on prompt
      - Quality Contribution: Catches prompt mismatches
      - Worked Example: run({prompt:'a'}); assertRunCalled({prompt:'b'}) → throw
      */
      await fake.run({ prompt: 'actual prompt' });

      expect(() => fake.assertRunCalled({ prompt: 'different prompt' })).toThrow();
    });

    it('should assertTerminateCalled() pass when terminate() was called', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify terminate() was invoked
      - Contract: assertTerminateCalled() passes if terminate() called with sessionId
      - Usage Notes: Must specify expected sessionId
      - Quality Contribution: Simplifies termination verification
      - Worked Example: terminate('abc'); assertTerminateCalled('abc') → pass
      */
      await fake.terminate('session-to-kill');

      expect(() => fake.assertTerminateCalled('session-to-kill')).not.toThrow();
    });

    it('should assertTerminateCalled() throw when terminate() was not called', () => {
      /*
      Test Doc:
      - Why: Assertion must fail when terminate() wasn't called
      - Contract: assertTerminateCalled() throws if no matching call
      - Usage Notes: Error includes actual terminate history
      - Quality Contribution: Clear failure messages
      - Worked Example: assertTerminateCalled('x') with no calls → throw
      */
      expect(() => fake.assertTerminateCalled('never-terminated')).toThrow(
        /Expected terminate\(\) to be called/
      );
    });

    it('should assertCompactCalled() pass when compact() was called', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify compact() was invoked
      - Contract: assertCompactCalled() passes if compact() called with sessionId
      - Usage Notes: Must specify expected sessionId
      - Quality Contribution: Simplifies compact verification
      - Worked Example: compact('abc'); assertCompactCalled('abc') → pass
      */
      await fake.compact('session-to-compact');

      expect(() => fake.assertCompactCalled('session-to-compact')).not.toThrow();
    });
  });

  describe('termination behavior', () => {
    it('should return killed status on terminate()', async () => {
      /*
      Test Doc:
      - Why: AC-7 requires status='killed' after terminate()
      - Contract: terminate() returns result with status='killed'
      - Usage Notes: exitCode may vary; status is the key indicator
      - Quality Contribution: Ensures contract compliance
      - Worked Example: terminate('sess') → {status:'killed'}
      */
      const fake = new FakeAgentAdapter({ sessionId: 'sess-123' });

      const result = await fake.terminate('sess-123');

      expect(result.status).toBe('killed');
      expect(result.sessionId).toBe('sess-123');
    });

    it('should record terminate() calls', async () => {
      /*
      Test Doc:
      - Why: Tests may need to verify multiple terminate calls
      - Contract: getTerminateHistory() returns all terminated session IDs
      - Usage Notes: History preserved across calls
      - Quality Contribution: Enables call verification
      - Worked Example: terminate('a'), terminate('b') → history=['a','b']
      */
      const fake = new FakeAgentAdapter();

      await fake.terminate('session-1');
      await fake.terminate('session-2');

      const history = fake.getTerminateHistory();
      expect(history).toEqual(['session-1', 'session-2']);
    });
  });

  describe('compact behavior', () => {
    it('should return completed status on compact()', async () => {
      /*
      Test Doc:
      - Why: AC-12 requires compact() to return result
      - Contract: compact() returns result with status='completed'
      - Usage Notes: Tokens may be reduced; fake can configure this
      - Quality Contribution: Ensures contract compliance
      - Worked Example: compact('sess') → {status:'completed'}
      */
      const fake = new FakeAgentAdapter({ sessionId: 'sess-123' });

      const result = await fake.compact('sess-123');

      expect(result.status).toBe('completed');
      expect(result.sessionId).toBe('sess-123');
    });

    it('should record compact() calls', async () => {
      /*
      Test Doc:
      - Why: Tests may need to verify compact was called
      - Contract: getCompactHistory() returns all compacted session IDs
      - Usage Notes: History preserved across calls
      - Quality Contribution: Enables call verification
      - Worked Example: compact('a'), compact('b') → history=['a','b']
      */
      const fake = new FakeAgentAdapter();

      await fake.compact('session-1');
      await fake.compact('session-2');

      const history = fake.getCompactHistory();
      expect(history).toEqual(['session-1', 'session-2']);
    });
  });

  describe('failure simulation', () => {
    it('should return failed status when configured', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify error handling paths
      - Contract: Constructor status='failed' makes run() return failed
      - Usage Notes: exitCode should be non-zero for failures
      - Quality Contribution: Enables failure path testing
      - Worked Example: FakeAgentAdapter({status:'failed', exitCode:1}) → run() fails
      */
      const fake = new FakeAgentAdapter({
        status: 'failed',
        exitCode: 1,
        stderr: 'Something went wrong',
      });

      const result = await fake.run({ prompt: 'test' });

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('Something went wrong');
    });

    it('should return null tokens when configured', async () => {
      /*
      Test Doc:
      - Why: Copilot may not provide token metrics
      - Contract: tokens: null simulates unavailable metrics
      - Usage Notes: Per DYK-03, null means "not available"
      - Quality Contribution: Enables testing null token handling
      - Worked Example: FakeAgentAdapter({tokens:null}) → run() returns {tokens:null}
      */
      const fake = new FakeAgentAdapter({ tokens: null });

      const result = await fake.run({ prompt: 'test' });

      expect(result.tokens).toBeNull();
    });
  });

  describe('reset functionality', () => {
    it('should clear all history on reset()', async () => {
      /*
      Test Doc:
      - Why: Tests may need fresh state between test cases
      - Contract: reset() clears run, terminate, compact history
      - Usage Notes: Call in beforeEach for isolation
      - Quality Contribution: Enables test isolation
      - Worked Example: run(), terminate(), compact(), reset() → all histories empty
      */
      const fake = new FakeAgentAdapter();

      await fake.run({ prompt: 'test' });
      await fake.terminate('sess');
      await fake.compact('sess');

      fake.reset();

      expect(fake.getRunHistory()).toHaveLength(0);
      expect(fake.getTerminateHistory()).toHaveLength(0);
      expect(fake.getCompactHistory()).toHaveLength(0);
    });
  });
});
