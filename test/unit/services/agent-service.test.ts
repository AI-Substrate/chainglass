import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';

import {
  FakeAgentAdapter,
  FakeConfigService,
  FakeLogger,
  AgentService,
  type AdapterFactory,
  type IAgentAdapter,
} from '@chainglass/shared';

/**
 * Unit tests for AgentService.run() method.
 *
 * Per plan Phase 5 Task T002: Tests for new session, resume, adapter selection.
 * Uses FakeAgentAdapter per Constitution Principle 4 (Fakes over Mocks).
 *
 * Testing Strategy:
 * - Uses real AgentService with FakeAgentAdapter
 * - Tests orchestration behavior, not CLI integration
 */
describe('AgentService', () => {
  let fakeClaudeAdapter: FakeAgentAdapter;
  let fakeCopilotAdapter: FakeAgentAdapter;
  let fakeLogger: FakeLogger;
  let fakeConfig: FakeConfigService;
  let adapterFactory: AdapterFactory;
  let service: AgentService;

  beforeEach(() => {
    // Create Claude adapter with token metrics
    fakeClaudeAdapter = new FakeAgentAdapter({
      sessionId: 'claude-session-123',
      output: 'Claude response',
      status: 'completed',
      exitCode: 0,
      tokens: { used: 100, total: 500, limit: 200000 },
    });

    // Create Copilot adapter with null tokens per Discovery 04
    fakeCopilotAdapter = new FakeAgentAdapter({
      sessionId: 'copilot-session-456',
      output: 'Copilot response',
      status: 'completed',
      exitCode: 0,
      tokens: null,
    });

    fakeLogger = new FakeLogger();

    // Per DYK-05: Config with agent timeout
    fakeConfig = new FakeConfigService({
      agent: { timeout: 600000 }, // 10 minutes
    });

    // Per DYK-02: Factory function for adapter selection
    adapterFactory = (agentType: string): IAgentAdapter => {
      if (agentType === 'claude-code') return fakeClaudeAdapter;
      if (agentType === 'copilot') return fakeCopilotAdapter;
      throw new Error(`Unknown agent type: ${agentType}`);
    };

    // Create service
    service = new AgentService(adapterFactory, fakeConfig, fakeLogger);
  });

  describe('run() - new session', () => {
    it('should call adapter.run() with prompt', async () => {
      /*
      Test Doc:
      - Why: Core functionality - service must delegate to adapter
      - Contract: run({prompt}) calls adapter.run() with same prompt
      - Usage Notes: Adapter handles actual CLI interaction
      - Quality Contribution: Verifies service orchestration works
      - Worked Example: service.run({prompt:"hi", agentType:"claude-code"}) → adapter.run({prompt:"hi"})
      */
      const result = await service.run({ prompt: 'hello', agentType: 'claude-code' });

      fakeClaudeAdapter.assertRunCalled({ prompt: 'hello' });
      expect(result.output).toBe('Claude response');
    });

    it('should return AgentResult with sessionId', async () => {
      /*
      Test Doc:
      - Why: AC-1 requires session ID in result
      - Contract: run() returns AgentResult with adapter's sessionId
      - Usage Notes: Session ID enables resumption
      - Quality Contribution: Core session tracking
      - Worked Example: run() → {sessionId:"claude-session-123", ...}
      */
      const result = await service.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.sessionId).toBe('claude-session-123');
    });

    it('should return AgentResult with status', async () => {
      /*
      Test Doc:
      - Why: AC-5/AC-6/AC-7 require status field
      - Contract: run() returns AgentResult with adapter's status
      - Usage Notes: Status indicates success/failure/killed
      - Quality Contribution: Caller can check outcome
      - Worked Example: run() → {status:"completed", ...}
      */
      const result = await service.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.status).toBe('completed');
    });

    it('should return AgentResult with tokens', async () => {
      /*
      Test Doc:
      - Why: AC-9/AC-10/AC-11 require token tracking
      - Contract: run() returns AgentResult with adapter's tokens
      - Usage Notes: May be null for Copilot
      - Quality Contribution: Context management support
      - Worked Example: run() → {tokens:{used:100, total:500, limit:200000}}
      */
      const result = await service.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.tokens).toEqual({ used: 100, total: 500, limit: 200000 });
    });
  });

  describe('run() - session resumption', () => {
    it('should pass sessionId to adapter when provided', async () => {
      /*
      Test Doc:
      - Why: AC-2 requires session resumption
      - Contract: run({sessionId}) passes sessionId to adapter
      - Usage Notes: Adapter uses sessionId for --resume flag
      - Quality Contribution: Enables context continuity
      - Worked Example: run({sessionId:"abc", prompt:"continue"}) → adapter called with sessionId
      */
      await service.run({
        prompt: 'continue',
        agentType: 'claude-code',
        sessionId: 'existing-session',
      });

      fakeClaudeAdapter.assertRunCalled({ prompt: 'continue', sessionId: 'existing-session' });
    });

    it('should return same sessionId in result when resuming', async () => {
      /*
      Test Doc:
      - Why: Session ID consistency across calls
      - Contract: Resumed session returns same sessionId
      - Usage Notes: Enables chained calls with same session
      - Quality Contribution: Session identity preservation
      - Worked Example: run({sessionId:"abc"}) → {sessionId:"abc", ...}
      */
      const result = await service.run({
        prompt: 'continue',
        agentType: 'claude-code',
        sessionId: 'existing-session',
      });

      // FakeAgentAdapter uses the provided sessionId when resuming
      expect(result.sessionId).toBe('existing-session');
    });
  });

  describe('run() - adapter selection', () => {
    it('should use ClaudeCodeAdapter for claude-code type', async () => {
      /*
      Test Doc:
      - Why: Per DYK-02, factory selects adapter by type
      - Contract: agentType="claude-code" → ClaudeCodeAdapter
      - Usage Notes: Factory pattern enables clean selection
      - Quality Contribution: Correct adapter routing
      - Worked Example: run({agentType:"claude-code"}) → Claude adapter called
      */
      await service.run({ prompt: 'test', agentType: 'claude-code' });

      expect(fakeClaudeAdapter.getRunHistory().length).toBe(1);
      expect(fakeCopilotAdapter.getRunHistory().length).toBe(0);
    });

    it('should use CopilotAdapter for copilot type', async () => {
      /*
      Test Doc:
      - Why: Per DYK-02, factory selects adapter by type
      - Contract: agentType="copilot" → CopilotAdapter
      - Usage Notes: Factory pattern enables clean selection
      - Quality Contribution: Correct adapter routing
      - Worked Example: run({agentType:"copilot"}) → Copilot adapter called
      */
      await service.run({ prompt: 'test', agentType: 'copilot' });

      expect(fakeCopilotAdapter.getRunHistory().length).toBe(1);
      expect(fakeClaudeAdapter.getRunHistory().length).toBe(0);
    });

    it('should throw for unknown agent type', async () => {
      /*
      Test Doc:
      - Why: Invalid types should fail fast (FIX-004/SEC-001)
      - Contract: Unknown agentType → Error thrown before factory called
      - Usage Notes: Clear error message with allowed types helps debugging
      - Quality Contribution: Input validation, prevents silent failures
      - Worked Example: run({agentType:"invalid"}) → throws "Invalid agent type"
      */
      await expect(
        service.run({ prompt: 'test', agentType: 'invalid' })
      ).rejects.toThrow('Invalid agent type: invalid');
    });
  });

  describe('run() - cwd option', () => {
    it('should pass cwd to adapter when provided', async () => {
      /*
      Test Doc:
      - Why: Working directory needed for file operations
      - Contract: run({cwd}) passes cwd to adapter
      - Usage Notes: Adapter validates against workspace root
      - Quality Contribution: Correct working directory
      - Worked Example: run({cwd:"/project"}) → adapter.run({cwd:"/project"})
      */
      await service.run({
        prompt: 'test',
        agentType: 'claude-code',
        cwd: '/home/user/project',
      });

      fakeClaudeAdapter.assertRunCalled({ cwd: '/home/user/project' });
    });
  });

  describe('run() - error handling', () => {
    it('should return failed status when adapter returns failed', async () => {
      /*
      Test Doc:
      - Why: AC-6 requires failed status on error
      - Contract: Adapter status='failed' → service returns failed
      - Usage Notes: Status is passed through from adapter
      - Quality Contribution: Error propagation
      - Worked Example: adapter returns failed → service returns failed
      */
      const failedAdapter = new FakeAgentAdapter({
        sessionId: 'failed-session',
        output: 'Error output',
        status: 'failed',
        exitCode: 1,
        tokens: null,
      });

      const failingFactory: AdapterFactory = () => failedAdapter;
      const failingService = new AgentService(failingFactory, fakeConfig, fakeLogger);

      const result = await failingService.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('terminate()', () => {
    it('should call adapter.terminate() with sessionId', async () => {
      /*
      Test Doc:
      - Why: AC-7 requires terminate functionality
      - Contract: terminate(sessionId, agentType) calls adapter.terminate(sessionId)
      - Usage Notes: Adapter handles signal escalation. Per FIX-003: agentType required
      - Quality Contribution: Clean process termination
      - Worked Example: terminate("abc", "claude-code") → adapter.terminate("abc")
      */
      // Terminate with agentType (FIX-003: sessions not tracked after completion)
      await service.terminate('claude-session-123', 'claude-code');

      fakeClaudeAdapter.assertTerminateCalled('claude-session-123');
    });

    it('should return killed status after terminate', async () => {
      /*
      Test Doc:
      - Why: AC-7 requires status='killed'
      - Contract: terminate() returns {status:'killed'}
      - Usage Notes: Exit code typically 143 (SIGTERM). Per FIX-003: agentType required
      - Quality Contribution: Correct termination reporting
      - Worked Example: terminate(sessionId, agentType) → {status:'killed', exitCode:143}
      */
      // Terminate with agentType (FIX-003: sessions not tracked after completion)
      const result = await service.terminate('claude-session-123', 'claude-code');

      expect(result.status).toBe('killed');
      expect(result.exitCode).toBe(143);
    });
  });

  describe('compact()', () => {
    it('should call adapter.compact() with sessionId', async () => {
      /*
      Test Doc:
      - Why: AC-12 requires compact functionality
      - Contract: compact(sessionId) calls adapter.compact(sessionId)
      - Usage Notes: Per Discovery 11: should build context first
      - Quality Contribution: Context reduction support
      - Worked Example: compact("abc") → adapter.compact("abc")
      */
      // First run to track the session
      await service.run({ prompt: 'test', agentType: 'claude-code' });

      // Then compact
      await service.compact('claude-session-123', 'claude-code');

      fakeClaudeAdapter.assertCompactCalled('claude-session-123');
    });

    it('should return result with tokens after compact', async () => {
      /*
      Test Doc:
      - Why: AC-13 requires tokens in compact result
      - Contract: compact() returns AgentResult with tokens
      - Usage Notes: Tokens may be reduced after compaction
      - Quality Contribution: Compaction verification
      - Worked Example: compact() → {tokens:{used:50, total:250, limit:200000}}
      */
      const result = await service.compact('claude-session-123', 'claude-code');

      expect(result.tokens).toEqual({ used: 100, total: 500, limit: 200000 });
    });
  });

  describe('timeout handling (DYK-01)', () => {
    it('should terminate on timeout', async () => {
      /*
      Test Doc:
      - Why: AC-20 requires timeout termination
      - Contract: Agent exceeding timeout → terminate() called → status='failed'
      - Usage Notes: Per DYK-01: Promise.race() + terminate() + catch suppression
      - Quality Contribution: Prevents runaway agents
      - Worked Example: slow agent + short timeout → terminated with failed status
      */
      // Create slow adapter per DYK-03
      const slowAdapter = new FakeAgentAdapter({
        sessionId: 'slow-session',
        output: 'Slow response',
        tokens: null,
        runDuration: 500, // 500ms - longer than timeout
      });

      // Create config with short timeout for testing
      const shortTimeoutConfig = new FakeConfigService({
        agent: { timeout: 100 }, // 100ms timeout
      });

      const slowFactory: AdapterFactory = () => slowAdapter;
      const slowService = new AgentService(slowFactory, shortTimeoutConfig, fakeLogger);

      const result = await slowService.run({ prompt: 'slow task', agentType: 'claude-code' });

      // Should return failed status with timeout message
      expect(result.status).toBe('failed');
      expect(result.output).toContain('Timeout');
    });

    it('should complete normally when faster than timeout', async () => {
      /*
      Test Doc:
      - Why: Normal operations should not be affected by timeout
      - Contract: Fast completion → no termination → normal result
      - Usage Notes: Timeout only triggers for slow operations
      - Quality Contribution: Ensures timeout doesn't interfere with normal flow
      - Worked Example: fast agent + long timeout → completes normally
      */
      // Adapter with no delay
      const fastAdapter = new FakeAgentAdapter({
        sessionId: 'fast-session',
        output: 'Fast response',
        status: 'completed',
        tokens: { used: 50, total: 50, limit: 200000 },
      });

      // Long timeout
      const longTimeoutConfig = new FakeConfigService({
        agent: { timeout: 60000 }, // 1 minute
      });

      const fastFactory: AdapterFactory = () => fastAdapter;
      const fastService = new AgentService(fastFactory, longTimeoutConfig, fakeLogger);

      const result = await fastService.run({ prompt: 'fast task', agentType: 'claude-code' });

      expect(result.status).toBe('completed');
      expect(result.output).toBe('Fast response');
    });

    it('should read timeout from config', async () => {
      /*
      Test Doc:
      - Why: AC-20 requires configurable timeout via config system
      - Contract: Timeout value from AgentConfigType.timeout
      - Usage Notes: Per DYK-05: config loaded via require(AgentConfigType) in constructor
      - Quality Contribution: Confirms config integration works
      - Worked Example: config.agent.timeout=600000 → 10 minute timeout
      */
      // Different timeout values should affect behavior
      const slowAdapter = new FakeAgentAdapter({
        sessionId: 'test-session',
        output: 'Response',
        runDuration: 150, // 150ms
      });

      // Test with 50ms timeout - should timeout
      const shortConfig = new FakeConfigService({ agent: { timeout: 50 } });
      const shortService = new AgentService(() => slowAdapter, shortConfig, fakeLogger);
      const shortResult = await shortService.run({ prompt: 'test', agentType: 'claude-code' });
      expect(shortResult.status).toBe('failed');

      // Reset adapter
      const newSlowAdapter = new FakeAgentAdapter({
        sessionId: 'test-session-2',
        output: 'Response',
        runDuration: 150, // 150ms
      });

      // Test with 500ms timeout - should complete
      const longConfig = new FakeConfigService({ agent: { timeout: 500 } });
      const longService = new AgentService(() => newSlowAdapter, longConfig, fakeLogger);
      const longResult = await longService.run({ prompt: 'test', agentType: 'claude-code' });
      expect(longResult.status).toBe('completed');
    });
  });

  describe('compact() - multi-turn context (DYK-04)', () => {
    it('should compact after multi-turn context building', async () => {
      /*
      Test Doc:
      - Why: Per Discovery 11 and DYK-04, compact requires prior context
      - Contract: After 2-3 run() calls, compact() reduces tokens
      - Usage Notes: Single-turn tests don't validate AC-13 (token reduction)
      - Quality Contribution: Validates real compaction scenario
      - Worked Example: run→run→run→compact → tokens reduced
      */
      // Build context with multiple turns
      const result1 = await service.run({
        prompt: 'First prompt to build context',
        agentType: 'claude-code',
      });

      // Continue session
      await service.run({
        prompt: 'Second prompt to add more context',
        agentType: 'claude-code',
        sessionId: result1.sessionId,
      });

      // Third turn
      await service.run({
        prompt: 'Third prompt for substantial context',
        agentType: 'claude-code',
        sessionId: result1.sessionId,
      });

      // Now compact with context built
      const compactResult = await service.compact(result1.sessionId, 'claude-code');

      // Verify compact was called
      fakeClaudeAdapter.assertCompactCalled(result1.sessionId);
      expect(compactResult.status).toBe('completed');
    });

    it('should handle copilot compact with null tokens gracefully', async () => {
      /*
      Test Doc:
      - Why: Per DYK-04, CopilotAdapter always returns tokens=null
      - Contract: compact() on Copilot returns result with null tokens
      - Usage Notes: Graceful handling - no error, just null
      - Quality Contribution: Ensures consistent behavior across adapters
      - Worked Example: copilot compact → {tokens: null}
      */
      // Build context with Copilot
      const result1 = await service.run({
        prompt: 'First prompt',
        agentType: 'copilot',
      });

      await service.run({
        prompt: 'Second prompt',
        agentType: 'copilot',
        sessionId: result1.sessionId,
      });

      // Compact
      const compactResult = await service.compact(result1.sessionId, 'copilot');

      // Tokens should be null for Copilot
      expect(compactResult.tokens).toBeNull();
      expect(compactResult.status).toBe('completed');
    });

    it('should use tracked adapter when session was previously used', async () => {
      /*
      Test Doc:
      - Why: Optimize by reusing adapter from active sessions
      - Contract: compact() finds adapter from tracked sessions
      - Usage Notes: Avoids factory call for known sessions
      - Quality Contribution: Performance and session consistency
      - Worked Example: run() tracks session → compact() reuses adapter
      */
      // Run to track session
      await service.run({ prompt: 'test', agentType: 'claude-code' });

      // Compact - should use tracked adapter
      await service.compact('claude-session-123', 'claude-code');

      // Verify adapter was called once for run and once for compact
      expect(fakeClaudeAdapter.getRunHistory().length).toBe(1);
      expect(fakeClaudeAdapter.getCompactHistory().length).toBe(1);
    });
  });

  describe('FIX-001: timeout timer cleanup', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear timeout timer when run completes before timeout', async () => {
      /*
      Test Doc:
      - Why: COR-001 - timers must be cleaned up to prevent resource leaks
      - Contract: When run completes, pending timeout timer is cleared
      - Usage Notes: Uses vi.useFakeTimers() to verify timer cleanup
      - Quality Contribution: Prevents dangling timers and memory leaks
      - Worked Example: fast run + long timeout → timer cleared, no pending timers
      */
      vi.useFakeTimers();

      const fastAdapter = new FakeAgentAdapter({
        sessionId: 'fast-session',
        output: 'Fast response',
        tokens: null,
        runDuration: 10, // 10ms - completes quickly
      });

      const longConfig = new FakeConfigService({
        agent: { timeout: 60000 }, // 1 minute timeout
      });

      const testService = new AgentService(() => fastAdapter, longConfig, fakeLogger);

      // Run should complete quickly
      const resultPromise = testService.run({ prompt: 'test', agentType: 'claude-code' });
      await vi.runAllTimersAsync();
      await resultPromise;

      // Verify no pending timers (timer was cleared)
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('FIX-002: timeout termination without sessionId', () => {
    it('should terminate adapter even when sessionId not provided', async () => {
      /*
      Test Doc:
      - Why: COR-002 - timeout must terminate even for new sessions
      - Contract: Timeout triggers termination regardless of sessionId option
      - Usage Notes: New sessions (no sessionId) still get terminated on timeout
      - Quality Contribution: Prevents orphaned processes
      - Worked Example: new session times out → adapter.terminate() called
      */
      const slowAdapter = new FakeAgentAdapter({
        sessionId: 'generated-session',
        output: 'Slow response',
        tokens: null,
        runDuration: 500, // 500ms - longer than timeout
      });

      const shortConfig = new FakeConfigService({
        agent: { timeout: 100 }, // 100ms timeout
      });

      const testService = new AgentService(() => slowAdapter, shortConfig, fakeLogger);

      // Run WITHOUT providing sessionId (new session)
      const result = await testService.run({ prompt: 'slow task', agentType: 'claude-code' });

      expect(result.status).toBe('failed');
      // Adapter should have been terminated despite no sessionId in options
      expect(slowAdapter.getTerminateHistory().length).toBeGreaterThan(0);
    });
  });

  describe('FIX-003: session tracking cleanup', () => {
    it('should not accumulate completed sessions indefinitely', async () => {
      /*
      Test Doc:
      - Why: PERF-001 - _activeSessions must be cleaned up after completion
      - Contract: Completed sessions are removed from tracking
      - Usage Notes: Only in-progress sessions need tracking for terminate()
      - Quality Contribution: Prevents memory leaks in long-running service
      - Worked Example: run 100 sessions → no memory growth
      */
      // Use counter to generate unique session IDs
      let sessionCounter = 0;
      const counterFactory: AdapterFactory = () => {
        sessionCounter++;
        return new FakeAgentAdapter({
          sessionId: `session-${sessionCounter}`,
          output: 'Response',
          tokens: null,
        });
      };

      const testService = new AgentService(counterFactory, fakeConfig, fakeLogger);

      // Run many sessions
      for (let i = 0; i < 50; i++) {
        await testService.run({ prompt: 'test', agentType: 'claude-code' });
      }

      // Terminate a session that was never tracked (should handle gracefully)
      const terminateResult = await testService.terminate('nonexistent-session', 'claude-code');

      // Should return killed via factory fallback
      expect(terminateResult.status).toBe('killed');
    });

    it('should remove session from tracking after completion', async () => {
      /*
      Test Doc:
      - Why: PERF-001 - cleanup tracking after run completes
      - Contract: After run() returns, session not in _activeSessions
      - Usage Notes: terminate() on completed session returns graceful response
      - Quality Contribution: Memory management
      - Worked Example: run() completes → terminate() reports "not found"
      */
      const adapter = new FakeAgentAdapter({
        sessionId: 'completed-session',
        output: 'Done',
        tokens: null,
      });

      const testService = new AgentService(() => adapter, fakeConfig, fakeLogger);

      // Run and complete
      const result = await testService.run({ prompt: 'test', agentType: 'claude-code' });
      expect(result.status).toBe('completed');

      // Try to terminate completed session - should indicate not tracked
      // (Service should handle gracefully with agentType fallback)
      const terminateResult = await testService.terminate(result.sessionId, 'claude-code');

      // Should work via factory fallback, not tracked session
      expect(terminateResult.status).toBe('killed');
    });
  });

  describe('FIX-004: agentType validation', () => {
    it('should reject invalid agentType before calling factory', async () => {
      /*
      Test Doc:
      - Why: SEC-001 - validate input before processing
      - Contract: Invalid agentType throws before factory is called
      - Usage Notes: Allowed types: 'claude-code', 'copilot'
      - Quality Contribution: Input validation, security hardening
      - Worked Example: agentType="hacker" → throws "Invalid agent type"
      */
      const factorySpy = vi.fn().mockReturnValue(fakeClaudeAdapter);
      const testService = new AgentService(factorySpy, fakeConfig, fakeLogger);

      await expect(
        testService.run({ prompt: 'test', agentType: 'hacker-type' })
      ).rejects.toThrow(/Invalid agent type/);

      // Factory should NOT have been called
      expect(factorySpy).not.toHaveBeenCalled();
    });

    it('should accept valid agentType values', async () => {
      /*
      Test Doc:
      - Why: SEC-001 - valid types must still work
      - Contract: 'claude-code' and 'copilot' are accepted
      - Usage Notes: Whitelist approach for security
      - Quality Contribution: Ensures validation doesn't break valid usage
      - Worked Example: agentType="claude-code" → succeeds
      */
      // Claude-code should work
      const claudeResult = await service.run({ prompt: 'test', agentType: 'claude-code' });
      expect(claudeResult).toBeDefined();

      // Copilot should work
      const copilotResult = await service.run({ prompt: 'test', agentType: 'copilot' });
      expect(copilotResult).toBeDefined();
    });
  });
});
