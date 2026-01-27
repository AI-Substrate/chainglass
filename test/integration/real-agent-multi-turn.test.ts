/**
 * Real Agent Multi-Turn Integration Tests
 *
 * These tests exercise REAL adapters (Claude CLI & Copilot SDK) with multi-turn
 * conversations to verify:
 * 1. New event types (tool_call, tool_result, thinking) are captured
 * 2. Session resumption works correctly across turns
 * 3. The adapter → event pipeline is functioning end-to-end
 *
 * Test Pattern (3-Turn):
 *   Turn 1: Write poem about [random subject] → Establish context, get sessionId
 *   Turn 2: List files using ls → Trigger tool use, capture events
 *   Turn 3: What was the poem about? → Prove context retention
 *
 * Per Phase 5 Subtask 001: Uses describe.skip - tests require auth and take 60s+.
 * To run manually: Remove .skip and ensure CLI is authenticated.
 *
 * Run manually:
 *   npx vitest run test/integration/real-agent-multi-turn.test.ts --no-file-parallelism
 */

import { execSync } from 'node:child_process';
import type {
  AgentEvent,
  AgentThinkingEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
} from '@chainglass/shared';
import { beforeAll, describe, expect, it } from 'vitest';

// ============================================================================
// SKIP LOGIC
// ============================================================================

/**
 * Check if Claude CLI is installed and available.
 */
function hasClaudeCli(): boolean {
  try {
    execSync('claude --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if GitHub Copilot CLI is installed and available.
 */
function hasCopilotCli(): boolean {
  try {
    execSync('npx -y @github/copilot --version', { stdio: 'ignore', timeout: 30000 });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// EVENT COLLECTOR
// ============================================================================

/**
 * Collects and categorizes events during adapter.run()
 * Provides typed accessors for filtering by event type.
 */
class EventCollector {
  private _all: AgentEvent[] = [];

  get all(): AgentEvent[] {
    return [...this._all];
  }

  get toolCalls(): AgentToolCallEvent[] {
    return this._all.filter((e): e is AgentToolCallEvent => e.type === 'tool_call');
  }

  get toolResults(): AgentToolResultEvent[] {
    return this._all.filter((e): e is AgentToolResultEvent => e.type === 'tool_result');
  }

  get thinking(): AgentThinkingEvent[] {
    return this._all.filter((e): e is AgentThinkingEvent => e.type === 'thinking');
  }

  get textDeltas(): AgentEvent[] {
    return this._all.filter((e) => e.type === 'text_delta');
  }

  handler = (event: AgentEvent): void => {
    this._all.push(event);
  };

  clear(): void {
    this._all = [];
  }

  /**
   * Pretty-print events for debugging failed assertions
   */
  dump(): void {
    console.log('\n=== Event Dump ===');
    for (const event of this._all) {
      const ts = event.timestamp.split('T')[1]?.slice(0, 12) ?? '';
      console.log(`[${ts}] ${event.type}`, JSON.stringify(event.data).slice(0, 100));
    }
    console.log(`=== ${this._all.length} events total ===\n`);
  }
}

// ============================================================================
// RANDOM SUBJECT HELPER
// ============================================================================

const POEM_SUBJECTS = [
  'quantum physics',
  'ancient Rome',
  'jazz music',
  'coral reefs',
  'origami',
  'neural networks',
  'medieval castles',
  'blues guitar',
  'rainforests',
  'chess',
];

function randomSubject(): string {
  return POEM_SUBJECTS[Math.floor(Math.random() * POEM_SUBJECTS.length)];
}

// ============================================================================
// CLAUDE REAL MULTI-TURN TESTS
// ============================================================================

describe.skip('Claude Real Multi-Turn Tests', { timeout: 120_000 }, () => {
  // Dynamic imports to avoid loading in unit test context
  let ClaudeCodeAdapter: Awaited<typeof import('@chainglass/shared')>['ClaudeCodeAdapter'];
  let UnixProcessManager: Awaited<typeof import('@chainglass/shared')>['UnixProcessManager'];
  let FakeLogger: Awaited<typeof import('@chainglass/shared')>['FakeLogger'];

  beforeAll(async () => {
    if (!hasClaudeCli()) {
      console.log('Claude CLI not installed - tests will fail');
      return;
    }
    console.log('Claude CLI detected - running real multi-turn tests');

    const shared = await import('@chainglass/shared');
    ClaudeCodeAdapter = shared.ClaudeCodeAdapter;
    UnixProcessManager = shared.UnixProcessManager;
    FakeLogger = shared.FakeLogger;
  });

  it('should emit tool_call and tool_result events across multi-turn session', async () => {
    /**
     * Test Doc:
     * - Why: Proves adapters emit new Phase 2 event types with real agents
     * - Contract: tool_call/tool_result events have correct shapes per schema
     * - Usage Notes: Requires Claude CLI authenticated, takes ~60s
     * - Quality Contribution: Source of truth for adapter behavior
     */
    const logger = new FakeLogger();
    const processManager = new UnixProcessManager(logger);
    const adapter = new ClaudeCodeAdapter(processManager, { logger });

    // Random subject to avoid caching/memorization
    const subject = randomSubject();

    // === TURN 1: Establish context ===
    console.log(`\n=== Turn 1: Writing poem about "${subject}" ===`);
    const turn1Events = new EventCollector();

    const turn1Result = await adapter.run({
      prompt: `Write a very short (2 line) poem about ${subject}. Be concise.`,
      onEvent: turn1Events.handler,
    });

    expect(turn1Result.status).toBe('completed');
    expect(turn1Result.sessionId).toBeTruthy();
    console.log(`SessionId: ${turn1Result.sessionId}`);
    console.log(`Turn 1 events: ${turn1Events.all.length}`);

    const sessionId = turn1Result.sessionId;

    // === TURN 2: Trigger tool use ===
    console.log('\n=== Turn 2: Triggering tool use (ls) ===');
    const turn2Events = new EventCollector();

    const turn2Result = await adapter.run({
      prompt: 'Please list the files in the current directory using the ls command.',
      sessionId,
      onEvent: turn2Events.handler,
    });

    expect(turn2Result.status).toBe('completed');

    // KEY ASSERTION: We captured tool events
    console.log(`Turn 2 events: ${turn2Events.all.length}`);
    console.log(`  tool_call: ${turn2Events.toolCalls.length}`);
    console.log(`  tool_result: ${turn2Events.toolResults.length}`);

    if (turn2Events.toolCalls.length === 0) {
      turn2Events.dump();
      throw new Error('Expected at least one tool_call event');
    }

    expect(turn2Events.toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(turn2Events.toolResults.length).toBeGreaterThanOrEqual(1);

    // Verify tool_call shape
    const toolCall = turn2Events.toolCalls[0];
    expect(toolCall.data.toolName).toBeTruthy();
    expect(toolCall.data.toolCallId).toBeTruthy();
    expect(toolCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Verify tool_result shape
    const toolResult = turn2Events.toolResults[0];
    expect(toolResult.data.toolCallId).toBeTruthy();
    expect(typeof toolResult.data.output).toBe('string');
    expect(typeof toolResult.data.isError).toBe('boolean');

    // Verify correlation: tool_result links to tool_call
    expect(toolResult.data.toolCallId).toBe(toolCall.data.toolCallId);

    // === TURN 3: Verify context retention ===
    console.log('\n=== Turn 3: Verifying context retention ===');
    const turn3Events = new EventCollector();

    const turn3Result = await adapter.run({
      prompt: 'What was the subject of the poem you wrote earlier? Just say the topic in one word.',
      sessionId,
      onEvent: turn3Events.handler,
    });

    expect(turn3Result.status).toBe('completed');

    // Context check: output should mention the subject (any word from it)
    const outputLower = turn3Result.output.toLowerCase();
    const subjectWords = subject.toLowerCase().split(' ');
    const hasContext = subjectWords.some((word) => outputLower.includes(word));

    console.log(`Subject was: "${subject}"`);
    console.log(`Turn 3 output: "${turn3Result.output}"`);

    expect(hasContext).toBe(true);

    console.log('\n✓ All assertions passed');
  });
});

// ============================================================================
// COPILOT REAL MULTI-TURN TESTS
// ============================================================================

describe.skip('Copilot Real Multi-Turn Tests', { timeout: 120_000 }, () => {
  // Dynamic imports to avoid loading SDK in unit test context
  let SdkCopilotAdapter: Awaited<typeof import('@chainglass/shared/adapters')>['SdkCopilotAdapter'];
  let CopilotClient: Awaited<typeof import('@github/copilot-sdk')>['CopilotClient'];

  beforeAll(async () => {
    if (!hasCopilotCli()) {
      console.log('Copilot SDK not available - tests will fail');
      return;
    }
    console.log('Copilot SDK detected - running real multi-turn tests');

    const adapters = await import('@chainglass/shared/adapters');
    const sdk = await import('@github/copilot-sdk');
    SdkCopilotAdapter = adapters.SdkCopilotAdapter;
    CopilotClient = sdk.CopilotClient;
  });

  it('should emit tool_call and tool_result events across multi-turn session', async () => {
    /**
     * Test Doc:
     * - Why: Proves Copilot adapter emits same event shapes as Claude
     * - Contract: tool_call/tool_result match Phase 2 contract tests
     * - Usage Notes: Requires Copilot SDK authenticated
     */
    const client = new CopilotClient();
    const adapter = new SdkCopilotAdapter(client);

    try {
      const subject = randomSubject();

      // === TURN 1: Establish context ===
      console.log(`\n=== Turn 1: Writing poem about "${subject}" ===`);
      const turn1Events = new EventCollector();

      const turn1Result = await adapter.run({
        prompt: `Write a very short (2 line) poem about ${subject}. Be concise.`,
        onEvent: turn1Events.handler,
      });

      expect(turn1Result.status).toBe('completed');
      expect(turn1Result.sessionId).toBeTruthy();
      console.log(`SessionId: ${turn1Result.sessionId}`);
      console.log(`Turn 1 events: ${turn1Events.all.length}`);

      const sessionId = turn1Result.sessionId;

      // === TURN 2: Trigger tool use ===
      console.log('\n=== Turn 2: Triggering tool use (ls) ===');
      const turn2Events = new EventCollector();

      const turn2Result = await adapter.run({
        prompt: 'Please list the files in the current directory using the ls command.',
        sessionId,
        onEvent: turn2Events.handler,
      });

      expect(turn2Result.status).toBe('completed');

      // KEY ASSERTION: We captured tool events
      console.log(`Turn 2 events: ${turn2Events.all.length}`);
      console.log(`  tool_call: ${turn2Events.toolCalls.length}`);
      console.log(`  tool_result: ${turn2Events.toolResults.length}`);

      // Copilot tool events come from tool.execution_start / tool.execution_complete
      if (turn2Events.toolCalls.length === 0) {
        turn2Events.dump();
        throw new Error('Expected at least one tool_call event');
      }

      expect(turn2Events.toolCalls.length).toBeGreaterThanOrEqual(1);
      expect(turn2Events.toolResults.length).toBeGreaterThanOrEqual(1);

      // Verify same shape as Claude (contract parity)
      const toolCall = turn2Events.toolCalls[0];
      expect(toolCall.data.toolName).toBeTruthy();
      expect(toolCall.data.toolCallId).toBeTruthy();
      expect(toolCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const toolResult = turn2Events.toolResults[0];
      expect(toolResult.data.toolCallId).toBe(toolCall.data.toolCallId);
      expect(typeof toolResult.data.isError).toBe('boolean');

      // === TURN 3: Verify context retention ===
      console.log('\n=== Turn 3: Verifying context retention ===');

      const turn3Result = await adapter.run({
        prompt: 'What was the subject of the poem you wrote earlier? Just say the topic.',
        sessionId,
        onEvent: () => {},
      });

      expect(turn3Result.status).toBe('completed');

      const outputLower = turn3Result.output.toLowerCase();
      const subjectWords = subject.toLowerCase().split(' ');
      const hasContext = subjectWords.some((word) => outputLower.includes(word));

      console.log(`Subject was: "${subject}"`);
      console.log(`Turn 3 output: "${turn3Result.output}"`);

      expect(hasContext).toBe(true);

      console.log('\n✓ All assertions passed');
    } finally {
      await client.stop();
    }
  });
});

// ============================================================================
// DIAGNOSTIC TESTS (run when CLI not installed)
// ============================================================================

describe.skipIf(hasClaudeCli())('Claude Real Multi-Turn (CLI not installed)', () => {
  it('should skip tests when Claude CLI is not available', () => {
    console.log('Claude CLI not detected - real multi-turn tests skipped');
    expect(true).toBe(true);
  });
});

describe.skipIf(hasCopilotCli())('Copilot Real Multi-Turn (CLI not installed)', () => {
  it('should skip tests when Copilot CLI is not available', () => {
    console.log('Copilot CLI not detected - real multi-turn tests skipped');
    expect(true).toBe(true);
  });
});
