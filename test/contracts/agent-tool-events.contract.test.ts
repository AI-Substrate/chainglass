/**
 * Agent Tool Events Contract Tests
 *
 * Per DYK-05 and Insight 3 (Option B):
 * Contract tests verify that both ClaudeCodeAdapter and SdkCopilotAdapter
 * emit identical AgentToolCallEvent and AgentToolResultEvent shapes.
 *
 * This ensures UI components can handle events from either adapter
 * without adapter-specific code paths.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 2)
 */

import type {
  AgentEvent,
  AgentThinkingEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
} from '@chainglass/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Test helper types
interface AdapterFactory {
  name: string;
  emitEvents: (eventTypes: EventType[]) => Promise<AgentEvent[]>;
  cleanup: () => Promise<void>;
}

type EventType = 'tool_call' | 'tool_result' | 'thinking';

/**
 * Contract test suite for adapter tool event parity.
 * Run this suite against any adapter to verify event shape compliance.
 */
function agentAdapterToolEventsContractTests(
  name: string,
  createAdapter: () => Promise<AdapterFactory>
) {
  describe(`${name} emits correct tool event shapes`, () => {
    let factory: AdapterFactory;

    beforeEach(async () => {
      factory = await createAdapter();
    });

    afterEach(async () => {
      await factory.cleanup();
    });

    describe('AgentToolCallEvent contract', () => {
      it('should emit tool_call event with toolName, input, and toolCallId', async () => {
        /*
        Test Doc:
        - Why: Contract requires all adapters emit same tool_call shape
        - Contract: tool_call event has data.{toolName, input, toolCallId}
        - Usage Notes: UI depends on these fields for tool card rendering
        - Quality Contribution: Ensures adapter parity
        - Worked Example: tool_call → { toolName: string, input: any, toolCallId: string }
        */
        const events = await factory.emitEvents(['tool_call']);
        const toolCallEvent = events.find((e) => e.type === 'tool_call') as
          | AgentToolCallEvent
          | undefined;

        expect(toolCallEvent).toBeDefined();
        expect(toolCallEvent?.data.toolName).toBeDefined();
        expect(typeof toolCallEvent?.data.toolName).toBe('string');
        expect(toolCallEvent?.data.input).toBeDefined();
        expect(toolCallEvent?.data.toolCallId).toBeDefined();
        expect(typeof toolCallEvent?.data.toolCallId).toBe('string');
      });

      it('should include timestamp in tool_call event', async () => {
        /*
        Test Doc:
        - Why: All events must have timestamps for ordering
        - Contract: tool_call event has ISO 8601 timestamp
        - Usage Notes: Used for event ordering in UI
        - Quality Contribution: Validates event metadata
        - Worked Example: event.timestamp matches ISO format
        */
        const events = await factory.emitEvents(['tool_call']);
        const toolCallEvent = events.find((e) => e.type === 'tool_call');

        expect(toolCallEvent?.timestamp).toBeDefined();
        expect(toolCallEvent?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    describe('AgentToolResultEvent contract', () => {
      it('should emit tool_result event with toolCallId, output, and isError', async () => {
        /*
        Test Doc:
        - Why: Contract requires all adapters emit same tool_result shape
        - Contract: tool_result event has data.{toolCallId, output, isError}
        - Usage Notes: UI depends on these fields for result display
        - Quality Contribution: Ensures adapter parity
        - Worked Example: tool_result → { toolCallId: string, output: string, isError: boolean }
        */
        const events = await factory.emitEvents(['tool_result']);
        const toolResultEvent = events.find((e) => e.type === 'tool_result') as
          | AgentToolResultEvent
          | undefined;

        expect(toolResultEvent).toBeDefined();
        expect(toolResultEvent?.data.toolCallId).toBeDefined();
        expect(typeof toolResultEvent?.data.toolCallId).toBe('string');
        expect(toolResultEvent?.data.output).toBeDefined();
        expect(typeof toolResultEvent?.data.output).toBe('string');
        expect(typeof toolResultEvent?.data.isError).toBe('boolean');
      });

      it('should include timestamp in tool_result event', async () => {
        /*
        Test Doc:
        - Why: All events must have timestamps for ordering
        - Contract: tool_result event has ISO 8601 timestamp
        - Usage Notes: Used for event ordering in UI
        - Quality Contribution: Validates event metadata
        - Worked Example: event.timestamp matches ISO format
        */
        const events = await factory.emitEvents(['tool_result']);
        const toolResultEvent = events.find((e) => e.type === 'tool_result');

        expect(toolResultEvent?.timestamp).toBeDefined();
        expect(toolResultEvent?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    describe('AgentThinkingEvent contract', () => {
      it('should emit thinking event with content', async () => {
        /*
        Test Doc:
        - Why: Contract requires all adapters emit same thinking shape
        - Contract: thinking event has data.content (string)
        - Usage Notes: Signature is optional (Claude only)
        - Quality Contribution: Ensures adapter parity
        - Worked Example: thinking → { content: string, signature?: string }
        */
        const events = await factory.emitEvents(['thinking']);
        const thinkingEvent = events.find((e) => e.type === 'thinking') as
          | AgentThinkingEvent
          | undefined;

        expect(thinkingEvent).toBeDefined();
        expect(thinkingEvent?.data.content).toBeDefined();
        expect(typeof thinkingEvent?.data.content).toBe('string');
      });

      it('should include timestamp in thinking event', async () => {
        /*
        Test Doc:
        - Why: All events must have timestamps for ordering
        - Contract: thinking event has ISO 8601 timestamp
        - Usage Notes: Used for event ordering in UI
        - Quality Contribution: Validates event metadata
        - Worked Example: event.timestamp matches ISO format
        */
        const events = await factory.emitEvents(['thinking']);
        const thinkingEvent = events.find((e) => e.type === 'thinking');

        expect(thinkingEvent?.timestamp).toBeDefined();
        expect(thinkingEvent?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it('should allow optional signature field', async () => {
        /*
        Test Doc:
        - Why: Signature is optional (Claude extended thinking only)
        - Contract: thinking.data.signature may be undefined or string
        - Usage Notes: Don't rely on signature presence
        - Quality Contribution: Ensures optional field handling
        - Worked Example: signature: undefined | string
        */
        const events = await factory.emitEvents(['thinking']);
        const thinkingEvent = events.find((e) => e.type === 'thinking') as
          | AgentThinkingEvent
          | undefined;

        expect(thinkingEvent).toBeDefined();
        // Signature is optional - may be undefined or string
        expect(
          thinkingEvent?.data.signature === undefined ||
            typeof thinkingEvent?.data.signature === 'string'
        ).toBe(true);
      });
    });
  });
}

// ============================================================
// Run contract tests against ClaudeCodeAdapter
// ============================================================

import { ClaudeCodeAdapter, FakeProcessManager } from '@chainglass/shared';

agentAdapterToolEventsContractTests('ClaudeCodeAdapter', async () => {
  const fakeProcessManager = new FakeProcessManager();
  const adapter = new ClaudeCodeAdapter(fakeProcessManager);

  // Pre-configure process output for each event type
  const eventFixtures: Record<EventType, string> = {
    tool_call: JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_contract_123',
            name: 'Bash',
            input: { command: 'ls -la' },
          },
        ],
      },
    }),
    tool_result: JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_contract_123',
            content: 'file1.txt\nfile2.txt',
            is_error: false,
          },
        ],
      },
    }),
    thinking: JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'thinking',
            thinking: 'Let me analyze this...',
          },
        ],
      },
    }),
  };

  return {
    name: 'ClaudeCodeAdapter',
    emitEvents: async (eventTypes: EventType[]) => {
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      // Wait for spawn to register
      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      // Emit configured event lines
      const lines = eventTypes.map((type) => eventFixtures[type]);
      fakeProcessManager.emitStdoutLines(pid, lines);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;
      return events;
    },
    cleanup: async () => {
      // FakeProcessManager is stateless per test
    },
  };
});

// ============================================================
// Run contract tests against SdkCopilotAdapter
// ============================================================

import { SdkCopilotAdapter } from '@chainglass/shared/adapters';
import { FakeCopilotClient } from '@chainglass/shared/fakes';

agentAdapterToolEventsContractTests('SdkCopilotAdapter', async () => {
  // Pre-configure event sequences for each event type
  const eventFixtures: Record<EventType, Array<{ type: string; data: unknown }>> = {
    tool_call: [
      {
        type: 'tool.execution_start',
        data: {
          toolName: 'bash',
          arguments: { command: 'npm test' },
          toolCallId: 'tool_contract_456',
        },
      },
      { type: 'assistant.message', data: { content: 'Done', messageId: 'msg-001' } },
      { type: 'session.idle', data: {} },
    ],
    tool_result: [
      {
        type: 'tool.execution_complete',
        data: {
          toolCallId: 'tool_contract_456',
          result: { content: 'All tests passed' },
          success: true,
        },
      },
      { type: 'assistant.message', data: { content: 'Done', messageId: 'msg-001' } },
      { type: 'session.idle', data: {} },
    ],
    thinking: [
      {
        type: 'assistant.reasoning',
        data: {
          content: 'I need to think about this...',
          reasoningId: 'reason_contract_789',
        },
      },
      { type: 'assistant.message', data: { content: 'Done', messageId: 'msg-001' } },
      { type: 'session.idle', data: {} },
    ],
  };

  let currentClient: FakeCopilotClient | null = null;

  return {
    name: 'SdkCopilotAdapter',
    emitEvents: async (eventTypes: EventType[]) => {
      // Flatten all requested event fixtures
      const allEvents: Array<{ type: string; data: unknown }> = [];
      for (const type of eventTypes) {
        allEvents.push(...eventFixtures[type]);
      }

      currentClient = new FakeCopilotClient({
        events: allEvents,
      });

      const adapter = new SdkCopilotAdapter(currentClient);
      const events: AgentEvent[] = [];

      await adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      return events;
    },
    cleanup: async () => {
      currentClient = null;
    },
  };
});
