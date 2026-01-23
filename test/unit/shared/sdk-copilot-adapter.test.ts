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
        { type: 'assistant.message', data: { content: 'Test response' } },
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

    it('should throw "Not implemented" for run() in Phase 1', async () => {
      /*
      Test Doc:
      - Why: Phase 1 creates skeleton only; implementation is Phase 2
      - Contract: run() throws Error with "Not implemented" message
      - Usage Notes: This test will be updated in Phase 2
      - Quality Contribution: Documents Phase 1 behavior explicitly
      - Worked Example: adapter.run() → throw 'Not implemented'
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      await expect(adapter.run({ prompt: 'test' })).rejects.toThrow(/[Nn]ot implemented/);
    });

    it('should throw "Not implemented" for compact() in Phase 1', async () => {
      /*
      Test Doc:
      - Why: Phase 1 creates skeleton only; implementation is Phase 3
      - Contract: compact() throws Error with "Not implemented" message
      - Usage Notes: This test will be updated in Phase 3
      - Quality Contribution: Documents Phase 1 behavior explicitly
      - Worked Example: adapter.compact() → throw 'Not implemented'
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      await expect(adapter.compact('session-123')).rejects.toThrow(/[Nn]ot implemented/);
    });

    it('should throw "Not implemented" for terminate() in Phase 1', async () => {
      /*
      Test Doc:
      - Why: Phase 1 creates skeleton only; implementation is Phase 3
      - Contract: terminate() throws Error with "Not implemented" message
      - Usage Notes: This test will be updated in Phase 3
      - Quality Contribution: Documents Phase 1 behavior explicitly
      - Worked Example: adapter.terminate() → throw 'Not implemented'
      */
      const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');
      const adapter = new SdkCopilotAdapter(fakeClient);

      await expect(adapter.terminate('session-123')).rejects.toThrow(/[Nn]ot implemented/);
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
});
