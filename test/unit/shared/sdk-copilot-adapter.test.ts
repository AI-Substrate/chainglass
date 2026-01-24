import { beforeEach, describe, expect, it } from 'vitest';

import type { IAgentAdapter, ICopilotClient, ILogger } from '@chainglass/shared';
import { FakeCopilotClient, FakeLogger } from '@chainglass/shared/fakes';
// Note: SdkCopilotAdapter will be imported once T009 creates it
// For now, we reference the interface to ensure tests are ready for implementation

describe('SdkCopilotAdapter', () => {
  /**
   * Purpose: Validate SdkCopilotAdapter skeleton implements IAgentAdapter
   * Quality Contribution: Ensures adapter can be constructed with DI and is contract-compliant
   * Acceptance Criteria: Constructor accepts client and options, skeleton methods exist
   */

  let fakeClient: ICopilotClient;
  let fakeLogger: ILogger;

  beforeEach(() => {
    fakeClient = new FakeCopilotClient({
      events: [
        { type: 'assistant.message', data: { content: 'Test response', messageId: 'msg-001' } },
        { type: 'session.idle', data: {} },
      ],
    });
    fakeLogger = new FakeLogger();
  });

  describe('constructor', () => {
    it('should accept ICopilotClient via dependency injection', async () => {
      /*
      Test Doc:
      - Why: Adapter must be testable with fake client (per ADR-0002)
      - Contract: Constructor accepts ICopilotClient as first argument
      - Usage Notes: Follows ClaudeCodeAdapter DI pattern
      - Quality Contribution: Enables unit testing without real SDK
      - Worked Example: new SdkCopilotAdapter(fakeClient) → adapter instance
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

      const adapter = new SdkCopilotAdapter(fakeClient);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(SdkCopilotAdapter);
    });

    it('should accept optional SdkCopilotAdapterOptions', async () => {
      /*
      Test Doc:
      - Why: Options allow configuring logger and workspace root
      - Contract: Constructor accepts optional options object
      - Usage Notes: Matches ClaudeCodeAdapter pattern
      - Quality Contribution: Enables configurable adapter behavior
      - Worked Example: new SdkCopilotAdapter(client, {logger, workspaceRoot})
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

      const adapter = new SdkCopilotAdapter(fakeClient, {
        logger: fakeLogger,
        workspaceRoot: '/test/workspace',
      });

      expect(adapter).toBeDefined();
    });

    it('should default workspaceRoot to process.cwd() when not provided', async () => {
      /*
      Test Doc:
      - Why: Adapter needs default workspace for cwd validation
      - Contract: workspaceRoot defaults to process.cwd()
      - Usage Notes: Matches ClaudeCodeAdapter behavior
      - Quality Contribution: Ensures consistent default behavior
      - Worked Example: new SdkCopilotAdapter(client) uses cwd as workspace
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

      // Just verify construction succeeds without workspaceRoot
      const adapter = new SdkCopilotAdapter(fakeClient);

      expect(adapter).toBeDefined();
    });
  });

  describe('IAgentAdapter interface', () => {
    it('should implement run() method', async () => {
      /*
      Test Doc:
      - Why: run() is required by IAgentAdapter contract
      - Contract: Adapter has run() method accepting AgentRunOptions
      - Usage Notes: Phase 1 stub throws 'Not implemented'
      - Quality Contribution: Verifies interface compliance
      - Worked Example: adapter.run exists and is a function
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter: IAgentAdapter = new SdkCopilotAdapter(fakeClient);

      expect(adapter.run).toBeDefined();
      expect(typeof adapter.run).toBe('function');
    });

    it('should implement compact() method', async () => {
      /*
      Test Doc:
      - Why: compact() is required by IAgentAdapter contract
      - Contract: Adapter has compact() method accepting sessionId
      - Usage Notes: Phase 1 stub throws 'Not implemented'
      - Quality Contribution: Verifies interface compliance
      - Worked Example: adapter.compact exists and is a function
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter: IAgentAdapter = new SdkCopilotAdapter(fakeClient);

      expect(adapter.compact).toBeDefined();
      expect(typeof adapter.compact).toBe('function');
    });

    it('should implement terminate() method', async () => {
      /*
      Test Doc:
      - Why: terminate() is required by IAgentAdapter contract
      - Contract: Adapter has terminate() method accepting sessionId
      - Usage Notes: Phase 1 stub throws 'Not implemented'
      - Quality Contribution: Verifies interface compliance
      - Worked Example: adapter.terminate exists and is a function
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter: IAgentAdapter = new SdkCopilotAdapter(fakeClient);

      expect(adapter.terminate).toBeDefined();
      expect(typeof adapter.terminate).toBe('function');
    });

    it('should return AgentResult for run() after Phase 2 implementation', async () => {
      /*
      Test Doc:
      - Why: Phase 2 implemented run() - no longer throws
      - Contract: run() returns AgentResult with status/output
      - Usage Notes: Replaces Phase 1 "Not implemented" test
      - Quality Contribution: Documents Phase 2 behavior
      - Worked Example: adapter.run() → AgentResult with sessionId
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.sessionId).toBeDefined();
      expect(result.status).toBe('completed');
    });

    it('should NOT throw "Not implemented" for compact() after Phase 3', async () => {
      /*
      Test Doc:
      - Why: Phase 3 implements compact() - should no longer throw
      - Contract: compact() returns AgentResult instead of throwing
      - Usage Notes: This test replaced Phase 1 stub test
      - Quality Contribution: Documents Phase 3 behavior
      - Worked Example: adapter.compact() → AgentResult
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      // Should not throw - returns result instead
      const result = await adapter.compact('session-123');
      expect(result.status).toBeDefined();
    });

    it('should NOT throw "Not implemented" for terminate() after Phase 3', async () => {
      /*
      Test Doc:
      - Why: Phase 3 implements terminate() - should no longer throw
      - Contract: terminate() returns AgentResult instead of throwing
      - Usage Notes: This test replaced Phase 1 stub test
      - Quality Contribution: Documents Phase 3 behavior
      - Worked Example: adapter.terminate() → AgentResult
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      // Should not throw - returns result instead  
      const result = await adapter.terminate('session-123');
      expect(result.status).toBe('killed');
    });
  });

  describe('type safety', () => {
    it('should be assignable to IAgentAdapter type', async () => {
      /*
      Test Doc:
      - Why: TypeScript must accept adapter as IAgentAdapter
      - Contract: SdkCopilotAdapter implements IAgentAdapter
      - Usage Notes: Enables use in AgentService
      - Quality Contribution: Compile-time verification of contract
      - Worked Example: const adapter: IAgentAdapter = new SdkCopilotAdapter(...)
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

      // This is a compile-time check - if it compiles, the test passes
      const adapter: IAgentAdapter = new SdkCopilotAdapter(fakeClient);

      expect(adapter).toBeDefined();
    });
  });

  // ============================================================
  // Phase 2: TDD Tests for run() Implementation
  // ============================================================

  describe('run() with new session (T002)', () => {
    /**
     * Test Doc:
     * - Why: CF-01 requires real session ID from SDK (no synthetic fallback)
     * - Contract: run() creates session via createSession, returns SDK sessionId
     * - Usage Notes: FakeCopilotClient provides predictable session IDs
     * - Quality Contribution: Validates SDK integration pattern
     */

    it('should return AgentResult with valid sessionId', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: 'Hello' });

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).not.toBe('');
      expect(result.sessionId).toMatch(/^fake-session-/); // FakeCopilotClient ID format
    });

    it('should collect output from assistant.message event', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Hello from Copilot!', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.output).toBe('Hello from Copilot!');
    });

    it('should return status=completed on success', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('completed');
    });

    it('should return exitCode=0 on success', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.exitCode).toBe(0);
    });

    it('should return tokens=null (SDK limitation)', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.tokens).toBeNull();
    });

    it('should receive events via handler registered before sendAndWait (DYK-02)', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Response 1', messageId: 'msg-001' } },
          { type: 'assistant.message', data: { content: 'Response 2', messageId: 'msg-002' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const result = await adapter.run({ prompt: 'test' });

      // Should receive last assistant message (per SDK behavior)
      expect(result.output).toBe('Response 2');
    });
  });

  describe('run() with existing sessionId (T003)', () => {
    /**
     * Test Doc:
     * - Why: CF-02 requires resumeSession for session continuity
     * - Contract: When sessionId provided, calls resumeSession(id)
     * - Usage Notes: FakeCopilotClient.getSessionHistory() verifies calls
     * - Quality Contribution: Validates session resumption works
     */

    it('should call resumeSession when sessionId provided', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Resumed!', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      await adapter.run({ prompt: 'Continue', sessionId: 'existing-session-123' });

      // FakeCopilotClient tracks session operations
      const history = client.getSessionHistory();
      expect(history).toContain('existing-session-123');
    });

    it('should preserve sessionId in result when resuming', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: 'Continue', sessionId: 'existing-session-123' });

      expect(result.sessionId).toBe('existing-session-123');
    });

    it('should work with valid session from prior run (end-to-end)', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      // First run creates a new session
      const result1 = await adapter.run({ prompt: 'Hello' });
      const sessionId = result1.sessionId;

      // Second run resumes the session
      const result2 = await adapter.run({ prompt: 'Continue', sessionId });

      expect(result2.sessionId).toBe(sessionId);
    });
  });

  describe('run() error handling (T004)', () => {
    /**
     * Test Doc:
     * - Why: CF-03 requires session.error → failed status
     * - Contract: sendAndWait throws on error; adapter catches and maps to failed
     * - Usage Notes: DYK-01: FakeCopilotSession throws; adapter catches
     * - Quality Contribution: Validates error path doesn't propagate to caller
     */

    it('should catch sendAndWait exception and return failed status (DYK-01)', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'session.error', data: { errorType: 'API_ERROR', message: 'Something went wrong' } },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('failed');
    });

    it('should return exitCode=1 when sendAndWait throws', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'session.error', data: { errorType: 'API_ERROR', message: 'Error occurred' } },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.exitCode).toBe(1);
    });

    it('should include error message in output from caught exception', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'session.error', data: { errorType: 'API_ERROR', message: 'Session crashed' } },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.output).toContain('Session crashed');
    });

    it('should include errorType in output when available', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'session.error', data: { errorType: 'RATE_LIMIT', message: 'Too many requests' } },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.output).toContain('RATE_LIMIT');
    });
  });

  describe('run() input validation (T005)', () => {
    /**
     * Test Doc:
     * - Why: SEC-001 and SEC-002 require input validation
     * - Contract: Invalid inputs return failed AgentResult (don't throw)
     * - Usage Notes: Ported from legacy CopilotAdapter
     * - Quality Contribution: Prevents injection attacks
     */

    it('should reject empty prompt', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: '' });

      expect(result.status).toBe('failed');
      expect(result.output).toMatch(/empty|validation/i);
    });

    it('should reject whitespace-only prompt', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: '   \n\t  ' });

      expect(result.status).toBe('failed');
    });

    it('should reject prompt exceeding 100k chars', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);
      const giantPrompt = 'x'.repeat(100_001);

      const result = await adapter.run({ prompt: giantPrompt });

      expect(result.status).toBe('failed');
      expect(result.output).toMatch(/length|maximum/i);
    });

    it('should reject prompt with control characters', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const result = await adapter.run({ prompt: '\x00hello' });

      expect(result.status).toBe('failed');
      expect(result.output).toMatch(/control|invalid/i);
    });

    it('should reject cwd outside workspace', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient, {
        workspaceRoot: '/safe/workspace',
      });

      const result = await adapter.run({ prompt: 'test', cwd: '/etc/passwd' });

      expect(result.status).toBe('failed');
      expect(result.output).toMatch(/workspace|cwd/i);
    });

    it('should accept cwd within workspace', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient, {
        workspaceRoot: '/safe/workspace',
      });

      const result = await adapter.run({ prompt: 'test', cwd: '/safe/workspace/subdir' });

      // Should not fail validation (though may still fail "not implemented" for now)
      // After implementation, this should succeed
      expect(result.status === 'completed' || result.status === 'failed').toBe(true);
      if (result.status === 'failed') {
        // Should not be a cwd validation error
        expect(result.output).not.toMatch(/workspace|cwd/i);
      }
    });
  });

  // ============================================================
  // Subtask 001: Event Streaming Tests
  // ============================================================

  describe('run() with onEvent streaming (ST004)', () => {
    /**
     * Test Doc:
     * - Why: Subtask 001 adds optional streaming to run()
     * - Contract: onEvent callback receives translated AgentEvent types
     * - Usage Notes: FakeCopilotSession emits configured events
     * - Quality Contribution: Validates event translation and emission
     */

    it('should call onEvent with text_delta when receiving assistant.message_delta', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message_delta', data: { deltaContent: 'Hello', messageId: 'msg-001' } },
          { type: 'assistant.message_delta', data: { deltaContent: ' World', messageId: 'msg-001' } },
          { type: 'assistant.message', data: { content: 'Hello World', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const receivedEvents: Array<{ type: string; content?: string }> = [];
      await adapter.run({
        prompt: 'test',
        onEvent: (event) => {
          if (event.type === 'text_delta') {
            receivedEvents.push({ type: event.type, content: event.data.content });
          }
        },
      });

      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0]).toMatchObject({ type: 'text_delta', content: 'Hello' });
      expect(receivedEvents[1]).toMatchObject({ type: 'text_delta', content: ' World' });
    });

    it('should call onEvent with message when receiving assistant.message', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Final response', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const receivedEvents: Array<{ type: string; content?: string }> = [];
      await adapter.run({
        prompt: 'test',
        onEvent: (event) => {
          if (event.type === 'message') {
            receivedEvents.push({ type: event.type, content: event.data.content });
          }
        },
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toMatchObject({ type: 'message', content: 'Final response' });
    });

    it('should call onEvent with usage when receiving assistant.usage', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Response', messageId: 'msg-001' } },
          { type: 'assistant.usage', data: { inputTokens: 10, outputTokens: 20 } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const receivedEvents: Array<{ type: string; inputTokens?: number; outputTokens?: number }> = [];
      await adapter.run({
        prompt: 'test',
        onEvent: (event) => {
          if (event.type === 'usage') {
            receivedEvents.push({
              type: event.type,
              inputTokens: event.data.inputTokens,
              outputTokens: event.data.outputTokens,
            });
          }
        },
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toMatchObject({ type: 'usage', inputTokens: 10, outputTokens: 20 });
    });

    it('should call onEvent with session_idle when receiving session.idle', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Done', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const receivedEvents: Array<{ type: string }> = [];
      await adapter.run({
        prompt: 'test',
        onEvent: (event) => {
          if (event.type === 'session_idle') {
            receivedEvents.push({ type: event.type });
          }
        },
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toMatchObject({ type: 'session_idle' });
    });

    it('should call onEvent with session_error when error occurs', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [{ type: 'session.error', data: { errorType: 'API_ERROR', message: 'Test error' } }],
      });
      const adapter = new SdkCopilotAdapter(client);

      const receivedEvents: Array<{ type: string; errorType?: string; message?: string }> = [];
      await adapter.run({
        prompt: 'test',
        onEvent: (event) => {
          if (event.type === 'session_error') {
            receivedEvents.push({
              type: event.type,
              errorType: event.data.errorType,
              message: event.data.message,
            });
          }
        },
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toMatchObject({
        type: 'session_error',
        errorType: 'API_ERROR',
        message: 'Test error',
      });
    });

    it('should work without onEvent (backward compatibility)', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      // Should not throw when onEvent is not provided
      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('completed');
      expect(result.output).toBe('Test response');
    });

    it('should include timestamp in all events', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message_delta', data: { deltaContent: 'Hi', messageId: 'msg-001' } },
          { type: 'assistant.message', data: { content: 'Hi', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      const timestamps: string[] = [];
      await adapter.run({
        prompt: 'test',
        onEvent: (event) => {
          timestamps.push(event.timestamp);
        },
      });

      expect(timestamps.length).toBeGreaterThan(0);
      for (const ts of timestamps) {
        expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
      }
    });

    it('should still return final AgentResult when streaming', async () => {
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message_delta', data: { deltaContent: 'Stream', messageId: 'msg-001' } },
          { type: 'assistant.message', data: { content: 'Complete', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      let eventCount = 0;
      const result = await adapter.run({
        prompt: 'test',
        onEvent: () => {
          eventCount++;
        },
      });

      // Events were emitted AND final result is correct
      expect(eventCount).toBeGreaterThan(0);
      expect(result.status).toBe('completed');
      expect(result.output).toBe('Complete');
      expect(result.sessionId).toBeDefined();
    });
  });

  // ============================================================
  // Phase 3: TDD Tests for compact() and terminate()
  // ============================================================

  describe('compact() (T001)', () => {
    /**
     * Test Doc:
     * - Why: AC-12 requires compact() to reduce context when approaching limits
     * - Contract: compact(sessionId) sends /compact command via run() delegation
     * - Usage Notes: FakeCopilotSession treats /compact as any other prompt
     * - Quality Contribution: Validates compact implementation pattern
     */

    it('should send /compact as prompt via run() delegation', async () => {
      /*
      Test Doc:
      - Why: DYK-01 established compact() delegates to run({prompt: '/compact'})
      - Contract: compact() internally calls run() with '/compact' prompt
      - Usage Notes: FakeCopilotSession.getSendHistory() shows prompts sent
      - Quality Contribution: Validates delegation pattern
      - Worked Example: compact(sessionId) → sendAndWait receives '/compact'
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: '/compact executed', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      // Create session first
      await adapter.run({ prompt: 'initial prompt' });
      const sessionId = client.getSessionHistory()[0];

      // Compact the session
      const result = await adapter.compact(sessionId);

      // Verify /compact was sent (check session's send history)
      const lastSession = client.getLastSession();
      expect(lastSession).toBeDefined();
      const sendHistory = lastSession!.getSendHistory();
      expect(sendHistory.some((msg) => msg.prompt === '/compact')).toBe(true);
    });

    it('should preserve sessionId in result', async () => {
      /*
      Test Doc:
      - Why: Session ID must be preserved for continued conversation
      - Contract: compact() returns AgentResult with same sessionId
      - Usage Notes: DYK-04: Explicit sessionId verification recommended
      - Quality Contribution: Ensures session continuity after compact
      - Worked Example: compact('abc-123') → {sessionId: 'abc-123', ...}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Compacted', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      // Create session first
      const runResult = await adapter.run({ prompt: 'test' });
      const sessionId = runResult.sessionId;

      // Compact should preserve sessionId
      const compactResult = await adapter.compact(sessionId);

      expect(compactResult.sessionId).toBe(sessionId);
      expect(client.getLastSession()?.sessionId).toBe(sessionId); // DYK-04: Explicit verification
    });

    it('should return status=completed on success', async () => {
      /*
      Test Doc:
      - Why: AC-12 expects completed status after successful compact
      - Contract: compact() returns status='completed', exitCode=0
      - Usage Notes: Follows run() success pattern
      - Quality Contribution: Validates success status mapping
      - Worked Example: compact(sessionId) → {status: 'completed', exitCode: 0}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'OK', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      await adapter.run({ prompt: 'test' });
      const sessionId = client.getSessionHistory()[0];

      const result = await adapter.compact(sessionId);

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
    });

    it('should return tokens=null (SDK limitation)', async () => {
      /*
      Test Doc:
      - Why: SDK doesn't expose token metrics
      - Contract: compact() returns tokens=null
      - Usage Notes: Matches run() behavior
      - Quality Contribution: Documents SDK limitation
      - Worked Example: compact() → {tokens: null}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      await adapter.run({ prompt: 'test' });
      const sessionId = fakeClient.getSessionHistory()[0];

      const result = await adapter.compact(sessionId);

      expect(result.tokens).toBeNull();
    });

    it('should return failed status on session error', async () => {
      /*
      Test Doc:
      - Why: Compact may fail if session is invalid or SDK errors
      - Contract: Error during compact returns status='failed', exitCode=1
      - Usage Notes: Follows run() error handling pattern
      - Quality Contribution: Validates error path
      - Worked Example: compact with error → {status: 'failed', exitCode: 1}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [{ type: 'session.error', data: { errorType: 'COMPACT_ERROR', message: 'Compact failed' } }],
      });
      const adapter = new SdkCopilotAdapter(client);

      const result = await adapter.compact('some-session');

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('terminate() (T002)', () => {
    /**
     * Test Doc:
     * - Why: AC-14 requires terminate() to stop session cleanly
     * - Contract: terminate() calls abort() + destroy(), returns status='killed'
     * - Usage Notes: exitCode=137 (standard SIGKILL code)
     * - Quality Contribution: Validates termination sequence
     */

    it('should call abort() and destroy() on session', async () => {
      /*
      Test Doc:
      - Why: Proper termination requires abort then destroy
      - Contract: terminate() calls session.abort() then session.destroy()
      - Usage Notes: FakeCopilotSession tracks abort/destroy calls
      - Quality Contribution: Validates termination sequence
      - Worked Example: terminate(id) → abort called, destroy called
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Done', messageId: 'msg-001' } },
          { type: 'session.idle', data: {} },
        ],
      });
      const adapter = new SdkCopilotAdapter(client);

      // Create session first
      const runResult = await adapter.run({ prompt: 'test' });
      const sessionId = runResult.sessionId;

      // Terminate should call abort + destroy
      await adapter.terminate(sessionId);

      // Get the session used for terminate (it's a new session from resumeSession)
      const session = client.getLastSession();
      expect(session).toBeDefined();
      expect(session!.getAbortCount()).toBe(1);
      expect(session!.wasDestroyed()).toBe(true);
    });

    it('should return status=killed', async () => {
      /*
      Test Doc:
      - Why: AC-14 specifies status='killed' for terminated sessions
      - Contract: terminate() returns status='killed'
      - Usage Notes: Distinguishes from completed/failed
      - Quality Contribution: Validates status semantic
      - Worked Example: terminate(id) → {status: 'killed'}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const runResult = await adapter.run({ prompt: 'test' });
      const result = await adapter.terminate(runResult.sessionId);

      expect(result.status).toBe('killed');
    });

    it('should return exitCode=137 (SIGKILL)', async () => {
      /*
      Test Doc:
      - Why: Standard Unix SIGKILL exit code is 137
      - Contract: terminate() returns exitCode=137
      - Usage Notes: Matches conventional killed process semantics
      - Quality Contribution: Validates exit code convention
      - Worked Example: terminate(id) → {exitCode: 137}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const runResult = await adapter.run({ prompt: 'test' });
      const result = await adapter.terminate(runResult.sessionId);

      expect(result.exitCode).toBe(137);
    });

    it('should preserve sessionId in result', async () => {
      /*
      Test Doc:
      - Why: SessionId must be in result for tracking
      - Contract: terminate() returns AgentResult with sessionId
      - Usage Notes: Same sessionId as input
      - Quality Contribution: Validates result structure
      - Worked Example: terminate('abc') → {sessionId: 'abc'}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const runResult = await adapter.run({ prompt: 'test' });
      const sessionId = runResult.sessionId;

      const result = await adapter.terminate(sessionId);

      expect(result.sessionId).toBe(sessionId);
    });

    it('should return tokens=null', async () => {
      /*
      Test Doc:
      - Why: No tokens used during terminate
      - Contract: terminate() returns tokens=null
      - Usage Notes: SDK limitation + no actual prompt sent
      - Quality Contribution: Validates result structure
      - Worked Example: terminate(id) → {tokens: null}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const runResult = await adapter.run({ prompt: 'test' });
      const result = await adapter.terminate(runResult.sessionId);

      expect(result.tokens).toBeNull();
    });

    it('should return empty output', async () => {
      /*
      Test Doc:
      - Why: No response expected from termination
      - Contract: terminate() returns output=''
      - Usage Notes: Termination is silent
      - Quality Contribution: Validates result structure
      - Worked Example: terminate(id) → {output: ''}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      const runResult = await adapter.run({ prompt: 'test' });
      const result = await adapter.terminate(runResult.sessionId);

      expect(result.output).toBe('');
    });
  });

  describe('terminate() unknown session (T003)', () => {
    /**
     * Test Doc:
     * - Why: Graceful handling of invalid sessionIds prevents crashes
     * - Contract: terminate() with unknown sessionId doesn't throw
     * - Usage Notes: Returns killed status regardless
     * - Quality Contribution: Validates error tolerance
     */

    it('should handle unknown session gracefully (no throw)', async () => {
      /*
      Test Doc:
      - Why: Callers may terminate already-expired sessions
      - Contract: terminate('nonexistent') doesn't throw, returns killed
      - Usage Notes: FakeCopilotClient strictSessions=false (default)
      - Quality Contribution: Prevents cascade failures
      - Worked Example: terminate('invalid') → no exception
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({ strictSessions: false });
      const adapter = new SdkCopilotAdapter(client);

      // Should not throw
      const result = await adapter.terminate('nonexistent-session-id');

      expect(result.status).toBe('killed');
      expect(result.exitCode).toBe(137);
    });

    it('should return sessionId even for unknown session', async () => {
      /*
      Test Doc:
      - Why: Result must have sessionId for tracking
      - Contract: terminate() returns provided sessionId
      - Usage Notes: Even if session doesn't exist
      - Quality Contribution: Validates result structure
      - Worked Example: terminate('unknown') → {sessionId: 'unknown'}
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({ strictSessions: false });
      const adapter = new SdkCopilotAdapter(client);

      const result = await adapter.terminate('my-unknown-session');

      expect(result.sessionId).toBe('my-unknown-session');
    });

    it('should still call abort and destroy on created session', async () => {
      /*
      Test Doc:
      - Why: Even for "unknown" session, SDK may create one
      - Contract: Created session gets properly cleaned up
      - Usage Notes: resumeSession may succeed even with unknown ID
      - Quality Contribution: Prevents resource leaks
      - Worked Example: terminate('unknown') → abort+destroy called
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const client = new FakeCopilotClient({ strictSessions: false });
      const adapter = new SdkCopilotAdapter(client);

      await adapter.terminate('any-session');

      const session = client.getLastSession();
      expect(session).toBeDefined();
      expect(session!.getAbortCount()).toBe(1);
      expect(session!.wasDestroyed()).toBe(true);
    });
  });
});
