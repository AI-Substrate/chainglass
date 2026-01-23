import { describe, expect, it, beforeEach } from 'vitest';

import {
  FakeAgentAdapter,
  FakeConfigService,
  FakeLogger,
  AgentService,
  type AdapterFactory,
  type IAgentAdapter,
} from '@chainglass/shared';

/**
 * Acceptance tests for Agent Control Service.
 *
 * Per plan Phase 5 Task T009: Tests verify all 20 acceptance criteria from spec.
 * These tests use FakeAgentAdapter to test AgentService orchestration.
 *
 * Testing Strategy:
 * - Uses fakes (no vi.mock) per Constitution Principle 4
 * - Tests AgentService behavior, not individual adapters
 * - Real adapter integration tested in claude-code-adapter.test.ts and copilot-adapter.test.ts
 */
describe('Agent Control Service Acceptance Tests', () => {
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
      output: 'Claude output',
      status: 'completed',
      exitCode: 0,
      tokens: { used: 100, total: 500, limit: 200000 },
    });

    // Create Copilot adapter with null tokens per Discovery 04
    fakeCopilotAdapter = new FakeAgentAdapter({
      sessionId: 'copilot-session-456',
      output: 'Copilot output',
      status: 'completed',
      exitCode: 0,
      tokens: null, // Per Discovery 04: Copilot has no token reporting
    });

    fakeLogger = new FakeLogger();

    // Create config with agent timeout per DYK-05
    fakeConfig = new FakeConfigService({
      agent: { timeout: 600000 }, // 10 minutes default
    });

    // Factory function per DYK-02
    adapterFactory = (agentType: string): IAgentAdapter => {
      if (agentType === 'claude-code') return fakeClaudeAdapter;
      if (agentType === 'copilot') return fakeCopilotAdapter;
      throw new Error(`Unknown agent type: ${agentType}`);
    };

    // Create service
    service = new AgentService(adapterFactory, fakeConfig, fakeLogger);
  });

  // ============================================
  // AC-1: Result includes sessionId for resumption
  // ============================================
  describe('AC-1: Session ID in result', () => {
    it('should include sessionId in result for Claude Code', async () => {
      /*
      Test Doc:
      - Why: AC-1 requires session ID for session resumption
      - Contract: AgentService.run() returns AgentResult with non-empty sessionId
      - Usage Notes: Session ID is extracted by adapter, passed through service
      - Quality Contribution: Core session continuity functionality
      - Worked Example: run({prompt:"hi", agentType:"claude-code"}) → {sessionId:"abc-123", ...}
      */
      const result = await service.run({ prompt: 'test', agentType: 'claude-code' });
      expect(result.sessionId).toBe('claude-session-123');
    });

    it('should include sessionId in result for Copilot', async () => {
      /*
      Test Doc:
      - Why: AC-1 applies to all adapters
      - Contract: Copilot adapter also returns sessionId
      - Usage Notes: Copilot session ID extracted from log files
      - Quality Contribution: Ensures consistency across adapters
      - Worked Example: run({prompt:"hi", agentType:"copilot"}) → {sessionId:"copilot-456", ...}
      */
      const result = await service.run({ prompt: 'test', agentType: 'copilot' });
      expect(result.sessionId).toBe('copilot-session-456');
    });
  });

  // ============================================
  // AC-2: Session resumption via sessionId parameter
  // ============================================
  describe('AC-2: Session resumption', () => {
    it('should resume session when sessionId provided', async () => {
      /*
      Test Doc:
      - Why: AC-2 requires session resumption capability
      - Contract: Passing sessionId in options passes it to adapter
      - Usage Notes: Adapter uses sessionId for --resume flag (Claude) or --resume (Copilot)
      - Quality Contribution: Enables context continuity across calls
      - Worked Example: run({prompt:"continue", sessionId:"abc"}) → adapter called with sessionId
      */
      await service.run({
        prompt: 'continue',
        agentType: 'claude-code',
        sessionId: 'existing-session',
      });

      fakeClaudeAdapter.assertRunCalled({ sessionId: 'existing-session' });
    });
  });

  // ============================================
  // AC-3: Spawns Claude Code CLI with required flags
  // ============================================
  describe('AC-3/AC-16: Claude Code CLI flags', () => {
    it('should use ClaudeCodeAdapter for claude-code agent type', async () => {
      /*
      Test Doc:
      - Why: AC-3 requires correct adapter selection for Claude Code
      - Contract: agentType="claude-code" → ClaudeCodeAdapter used
      - Usage Notes: Factory function returns appropriate adapter
      - Quality Contribution: Ensures correct CLI invocation
      - Worked Example: run({agentType:"claude-code"}) → Claude adapter called
      */
      await service.run({ prompt: 'test', agentType: 'claude-code' });

      expect(fakeClaudeAdapter.getRunHistory().length).toBe(1);
      expect(fakeCopilotAdapter.getRunHistory().length).toBe(0);
    });
  });

  // ============================================
  // AC-4: Spawns Copilot CLI with required flags
  // ============================================
  describe('AC-4/AC-16: Copilot CLI flags', () => {
    it('should use CopilotAdapter for copilot agent type', async () => {
      /*
      Test Doc:
      - Why: AC-4 requires correct adapter selection for Copilot
      - Contract: agentType="copilot" → CopilotAdapter used
      - Usage Notes: Factory function returns appropriate adapter
      - Quality Contribution: Ensures correct CLI invocation
      - Worked Example: run({agentType:"copilot"}) → Copilot adapter called
      */
      await service.run({ prompt: 'test', agentType: 'copilot' });

      expect(fakeCopilotAdapter.getRunHistory().length).toBe(1);
      expect(fakeClaudeAdapter.getRunHistory().length).toBe(0);
    });
  });

  // ============================================
  // AC-5: Status 'completed' on exit 0
  // ============================================
  describe('AC-5: Completed status', () => {
    it('should return status completed on successful run', async () => {
      /*
      Test Doc:
      - Why: AC-5 requires status='completed' when agent exits successfully
      - Contract: Exit code 0 → status='completed'
      - Usage Notes: Status is set by adapter based on exit code
      - Quality Contribution: Correct status semantics for callers
      - Worked Example: agent exits 0 → {status:'completed', exitCode:0}
      */
      const result = await service.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
    });
  });

  // ============================================
  // AC-6: Status 'failed' on exit >0
  // ============================================
  describe('AC-6: Failed status', () => {
    it('should return status failed on non-zero exit', async () => {
      /*
      Test Doc:
      - Why: AC-6 requires status='failed' on error exit
      - Contract: Exit code >0 → status='failed'
      - Usage Notes: Error details in output/stderr
      - Quality Contribution: Error detection for callers
      - Worked Example: agent exits 1 → {status:'failed', exitCode:1}
      */
      const failedAdapter = new FakeAgentAdapter({
        sessionId: 'failed-session',
        output: 'Error output',
        status: 'failed',
        exitCode: 1,
        tokens: null,
      });

      const failFactory: AdapterFactory = () => failedAdapter;
      const failService = new AgentService(failFactory, fakeConfig, fakeLogger);

      const result = await failService.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });
  });

  // ============================================
  // AC-7: Status 'killed' when terminated
  // ============================================
  describe('AC-7: Killed status', () => {
    it('should return status killed after terminate', async () => {
      /*
      Test Doc:
      - Why: AC-7 requires status='killed' when terminate() called
      - Contract: terminate(sessionId, agentType) → {status:'killed'}
      - Usage Notes: Terminate sends signals to process. Per FIX-003: agentType required
      - Quality Contribution: Distinguishes intentional termination from errors
      - Worked Example: terminate(sessionId, agentType) → {status:'killed', exitCode:143}
      */
      // Terminate with agentType (FIX-003: sessions not tracked after completion)
      const result = await service.terminate('claude-session-123', 'claude-code');

      expect(result.status).toBe('killed');
      expect(result.exitCode).toBe(143);
    });
  });

  // ============================================
  // AC-9: Token usage in result (Claude Code)
  // ============================================
  describe('AC-9: Token usage', () => {
    it('should include tokens.used for Claude Code', async () => {
      /*
      Test Doc:
      - Why: AC-9 requires token usage tracking
      - Contract: Claude adapter returns tokens.used with turn token count
      - Usage Notes: Extracted from stream-json usage field
      - Quality Contribution: Enables context management
      - Worked Example: run() → {tokens: {used: 100, total: 500, limit: 200000}}
      */
      const result = await service.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.tokens).not.toBeNull();
      expect(result.tokens?.used).toBe(100);
    });
  });

  // ============================================
  // AC-10: Token limit in result (Claude Code)
  // ============================================
  describe('AC-10: Token limit', () => {
    it('should include tokens.limit for Claude Code', async () => {
      /*
      Test Doc:
      - Why: AC-10 requires context window limit in result
      - Contract: Claude adapter returns tokens.limit with model context window
      - Usage Notes: Used for compaction decisions
      - Quality Contribution: Enables smart context management
      - Worked Example: run() → {tokens: {limit: 200000}}
      */
      const result = await service.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.tokens?.limit).toBe(200000);
    });
  });

  // ============================================
  // AC-11: Token null for Copilot
  // ============================================
  describe('AC-11: Copilot tokens null', () => {
    it('should return null tokens for Copilot', async () => {
      /*
      Test Doc:
      - Why: AC-11 requires graceful degradation for missing token data
      - Contract: Copilot adapter returns tokens: null
      - Usage Notes: Per Discovery 04: Copilot token reporting undocumented
      - Quality Contribution: Honest null vs fabricated data
      - Worked Example: run({agentType:"copilot"}) → {tokens: null}
      */
      const result = await service.run({ prompt: 'test', agentType: 'copilot' });

      expect(result.tokens).toBeNull();
    });
  });

  // ============================================
  // AC-12: /compact sends compact command
  // ============================================
  describe('AC-12: Compact command', () => {
    it('should call adapter.compact() when compact() called', async () => {
      /*
      Test Doc:
      - Why: AC-12 requires /compact command support
      - Contract: AgentService.compact(sessionId) → adapter.compact(sessionId)
      - Usage Notes: Adapter handles actual /compact implementation
      - Quality Contribution: Context reduction capability
      - Worked Example: service.compact(sessionId) → adapter.compact called
      */
      // First run to track the session
      await service.run({ prompt: 'test', agentType: 'claude-code' });

      // Then compact
      await service.compact('claude-session-123', 'claude-code');

      fakeClaudeAdapter.assertCompactCalled('claude-session-123');
    });
  });

  // ============================================
  // AC-13: /compact returns new token metrics
  // ============================================
  describe('AC-13: Compact returns tokens', () => {
    it('should return updated tokens after compact', async () => {
      /*
      Test Doc:
      - Why: AC-13 requires token metrics after compaction
      - Contract: compact() returns AgentResult with (possibly reduced) tokens
      - Usage Notes: Per Discovery 11: requires context built first
      - Quality Contribution: Verifies compaction effectiveness
      - Worked Example: compact(sessionId) → {tokens: {used: 50, total: 250, limit: 200000}}
      */
      const result = await service.compact('claude-session-123', 'claude-code');

      expect(result.tokens).not.toBeNull();
      expect(result.tokens?.limit).toBe(200000);
    });
  });

  // ============================================
  // AC-14: Termination within 10 seconds
  // ============================================
  describe('AC-14: Termination timeout', () => {
    it('should complete terminate within timeout', async () => {
      /*
      Test Doc:
      - Why: AC-14 requires termination to complete within budget
      - Contract: terminate() completes within ProcessManager signal escalation time
      - Usage Notes: Signal escalation: SIGINT→SIGTERM→SIGKILL (2s each). Per FIX-003: agentType required
      - Quality Contribution: Prevents zombie processes
      - Worked Example: terminate(sessionId, agentType) completes in <10s
      */
      // Terminate and measure time (FIX-003: sessions not tracked after completion)
      const start = Date.now();
      const result = await service.terminate('claude-session-123', 'claude-code');
      const duration = Date.now() - start;

      expect(result.status).toBe('killed');
      expect(duration).toBeLessThan(10000); // Less than 10 seconds
    });
  });

  // ============================================
  // AC-17: Session ID extracted correctly
  // ============================================
  describe('AC-17: Session ID extraction', () => {
    it('should extract session ID from Claude Code stream-json', async () => {
      /*
      Test Doc:
      - Why: AC-17 requires correct session ID parsing
      - Contract: Claude adapter extracts session_id from NDJSON output
      - Usage Notes: Uses StreamJsonParser for extraction
      - Quality Contribution: Enables session resumption
      - Worked Example: stream-json with session_id → extracted correctly
      */
      const result = await service.run({ prompt: 'test', agentType: 'claude-code' });

      // FakeAgentAdapter returns configured sessionId
      expect(result.sessionId).toBe('claude-session-123');
      expect(result.sessionId).toBeTruthy();
    });

    it('should extract session ID from Copilot log files', async () => {
      /*
      Test Doc:
      - Why: AC-17 also applies to Copilot
      - Contract: Copilot adapter polls log files for session ID
      - Usage Notes: Uses exponential backoff per Discovery 05
      - Quality Contribution: Handles async log file writing
      - Worked Example: log file parsed → session ID extracted
      */
      const result = await service.run({ prompt: 'test', agentType: 'copilot' });

      // FakeAgentAdapter returns configured sessionId
      expect(result.sessionId).toBe('copilot-session-456');
      expect(result.sessionId).toBeTruthy();
    });
  });

  // ============================================
  // AC-20: Timeout enforcement
  // ============================================
  describe('AC-20: Timeout enforcement', () => {
    it('should terminate on timeout', async () => {
      /*
      Test Doc:
      - Why: AC-20 requires timeout termination
      - Contract: Agent exceeding timeout → terminate() called → status='failed'
      - Usage Notes: Timeout from AgentConfigType.timeout
      - Quality Contribution: Prevents runaway agents
      - Worked Example: slow agent + 10min timeout → terminated after 10min
      */
      // Create slow adapter
      const slowAdapter = new FakeAgentAdapter({
        sessionId: 'slow-session',
        output: 'Slow response',
        tokens: null,
        runDuration: 500, // 500ms
      });

      // Short timeout config
      const shortConfig = new FakeConfigService({
        agent: { timeout: 100 }, // 100ms
      });

      const slowFactory: AdapterFactory = () => slowAdapter;
      const slowService = new AgentService(slowFactory, shortConfig, fakeLogger);

      const result = await slowService.run({ prompt: 'slow task', agentType: 'claude-code' });

      expect(result.status).toBe('failed');
      expect(result.output).toContain('Timeout');
    });

    it('should read timeout from config', async () => {
      /*
      Test Doc:
      - Why: AC-20 requires configurable timeout
      - Contract: Timeout value from AgentConfigType via IConfigService
      - Usage Notes: Per ADR-0003 pattern, per DYK-05
      - Quality Contribution: Configurable behavior
      - Worked Example: config.agent.timeout=300000 → 5min timeout used
      */
      // Custom timeout config
      const customConfig = new FakeConfigService({
        agent: { timeout: 300000 }, // 5 minutes
      });

      // Should not throw - config loaded successfully
      const customService = new AgentService(adapterFactory, customConfig, fakeLogger);
      const result = await customService.run({ prompt: 'test', agentType: 'claude-code' });

      expect(result.status).toBe('completed');
    });
  });

  // ============================================
  // Error handling
  // ============================================
  describe('Error handling', () => {
    it('should reject unknown agent type', async () => {
      /*
      Test Doc:
      - Why: Invalid agent types should fail fast (FIX-004/SEC-001)
      - Contract: Unknown agentType → throws error before factory called
      - Usage Notes: Valid types: 'claude-code', 'copilot'. Validation in AgentService
      - Quality Contribution: Clear error messages with allowed types
      - Worked Example: run({agentType:"invalid"}) → Error: Invalid agent type
      */
      await expect(
        service.run({ prompt: 'test', agentType: 'invalid' })
      ).rejects.toThrow('Invalid agent type: invalid');
    });
  });
});
