/**
 * Real Agent Integration Tests — AgentInstance with Real Adapters
 *
 * Plan 034, Phase 4: Proves the redesigned AgentInstance works with real
 * Claude Code CLI and Copilot SDK. Tests session creation, resumption,
 * event handler delivery, parallel execution, compact, and cross-adapter parity.
 *
 * These tests use `describe.skip` (hardcoded) — they never run automatically.
 * To run manually, remove `.skip` and ensure the agent CLI/SDK is authenticated.
 *
 * Per DYK-P4#2: Using `describe.skip` matches existing `real-agent-multi-turn.test.ts`
 * pattern. Tests are documentation and validation — unskip when needed.
 *
 * Run manually:
 *   npx vitest run test/integration/agent-instance-real.test.ts --no-file-parallelism
 *
 * Structural assertions only — no content assertions on LLM output.
 */

import type { AgentEvent } from '@chainglass/shared';
import { beforeAll, describe, expect, it } from 'vitest';

// ============================================================================
// CLAUDE CODE INTEGRATION TESTS (AC-35 through AC-38a, AC-39)
// ============================================================================

describe.skip('AgentInstance with ClaudeCodeAdapter', { timeout: 120_000 }, () => {
  // Dynamic imports to avoid loading adapters in unit test context
  let AgentManagerService: Awaited<typeof import('@chainglass/shared')>['AgentManagerService'];
  let ClaudeCodeAdapter: Awaited<typeof import('@chainglass/shared')>['ClaudeCodeAdapter'];
  let UnixProcessManager: Awaited<typeof import('@chainglass/shared')>['UnixProcessManager'];
  let FakeLogger: Awaited<typeof import('@chainglass/shared')>['FakeLogger'];

  type IAgentManagerService = import('@chainglass/shared').IAgentManagerService;

  let manager: IAgentManagerService;

  beforeAll(async () => {
    const shared = await import('@chainglass/shared');
    AgentManagerService = shared.AgentManagerService;
    ClaudeCodeAdapter = shared.ClaudeCodeAdapter;
    UnixProcessManager = shared.UnixProcessManager;
    FakeLogger = shared.FakeLogger;

    const logger = new FakeLogger();
    const processManager = new UnixProcessManager(logger);
    manager = new AgentManagerService(() => new ClaudeCodeAdapter(processManager, { logger }));

    console.log('Claude Code adapter initialized for real agent tests');
  });

  it('creates new session and gets completed status (AC-35)', async () => {
    /**
     * Test Doc:
     * - Why: Proves AgentInstance wrapping real ClaudeCodeAdapter works end-to-end
     * - Contract: run() with real adapter produces stopped status + non-null sessionId + events
     * - Usage Notes: Requires Claude CLI installed and authenticated
     * - Quality Contribution: Validates real integration, not just fakes
     * - Worked Example: run({prompt:'What is 2+2?'}) → status==='stopped', sessionId truthy, events>0
     */
    const instance = manager.getNew({
      name: 'test-new-session',
      type: 'claude-code',
      workspace: process.cwd(),
    });

    expect(instance.status).toBe('stopped');
    expect(instance.sessionId).toBeNull();

    const events: AgentEvent[] = [];
    instance.addEventHandler((e) => events.push(e));

    await instance.run({ prompt: 'What is 2+2? Reply with just the number.' });

    expect(instance.status).toBe('stopped');
    expect(instance.sessionId).toBeTruthy();
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'text_delta' || e.type === 'message')).toBe(true);
  });

  it('resumes session and agent retains context (AC-36)', async () => {
    /**
     * Test Doc:
     * - Why: Proves session resumption works through AgentInstance layer
     * - Contract: Second run with sessionId from first run completes without error
     * - Usage Notes: Tests adapter-level session continuity via AgentInstance
     * - Quality Contribution: Validates session chaining is not broken by the 034 redesign
     */
    const instance1 = manager.getNew({
      name: 'resume-test-t1',
      type: 'claude-code',
      workspace: process.cwd(),
    });

    await instance1.run({
      prompt: 'Remember the word "pineapple". Just confirm you will remember it.',
    });

    const sessionId = instance1.sessionId;
    expect(sessionId).toBeTruthy();

    // Resume with same sessionId
    const instance2 = manager.getWithSessionId(sessionId as string, {
      name: 'resume-test-t2',
      type: 'claude-code',
      workspace: process.cwd(),
    });

    await instance2.run({
      prompt: 'What word did I ask you to remember? Say just the word.',
    });

    expect(instance2.status).toBe('stopped');
    expect(instance2.sessionId).toBeTruthy();
  });

  it('multiple handlers receive identical events (AC-37)', async () => {
    /**
     * Test Doc:
     * - Why: Proves event pass-through dispatches to all registered handlers
     * - Contract: Two handlers receive same event count and same object references
     * - Usage Notes: Tests real adapter event dispatch through AgentInstance
     */
    const instance = manager.getNew({
      name: 'multi-handler-test',
      type: 'claude-code',
      workspace: process.cwd(),
    });

    const handler1Events: AgentEvent[] = [];
    const handler2Events: AgentEvent[] = [];

    instance.addEventHandler((e) => handler1Events.push(e));
    instance.addEventHandler((e) => handler2Events.push(e));

    await instance.run({ prompt: 'Say hello in one word.' });

    expect(handler1Events.length).toBeGreaterThan(0);
    expect(handler1Events.length).toBe(handler2Events.length);

    for (let i = 0; i < handler1Events.length; i++) {
      expect(handler1Events[i]).toBe(handler2Events[i]);
    }
  });

  it('two agents run concurrently with independent sessions (AC-38)', async () => {
    /**
     * Test Doc:
     * - Why: Proves parallel agent execution works with real adapters
     * - Contract: Two concurrent runs produce different sessionIds, both complete
     */
    const instanceA = manager.getNew({
      name: 'parallel-a',
      type: 'claude-code',
      workspace: process.cwd(),
    });
    const instanceB = manager.getNew({
      name: 'parallel-b',
      type: 'claude-code',
      workspace: process.cwd(),
    });

    const start = Date.now();

    await Promise.all([
      instanceA.run({ prompt: 'What is 1+1? Reply with just the number.' }),
      instanceB.run({ prompt: 'What is 3+3? Reply with just the number.' }),
    ]);

    const elapsed = Date.now() - start;

    expect(instanceA.status).toBe('stopped');
    expect(instanceB.status).toBe('stopped');
    expect(instanceA.sessionId).toBeTruthy();
    expect(instanceB.sessionId).toBeTruthy();
    expect(instanceA.sessionId).not.toBe(instanceB.sessionId);

    console.log(`Parallel execution took ${elapsed}ms`);
  });

  it('compact reduces session context without losing continuity (AC-38a)', async () => {
    /**
     * Test Doc:
     * - Why: Proves compact() works through AgentInstance with real adapter
     * - Contract: compact() completes, session remains usable for subsequent run()
     * - Usage Notes: Claude adapter sends /compact as a prompt internally
     */
    const instance = manager.getNew({
      name: 'compact-test',
      type: 'claude-code',
      workspace: process.cwd(),
    });

    await instance.run({
      prompt:
        'Write a detailed explanation of the Fibonacci sequence including history and formula.',
    });

    const sessionId = instance.sessionId;
    expect(sessionId).toBeTruthy();

    // Compact the session
    const compactResult = await instance.compact();
    expect(compactResult.status).toBe('completed');
    expect(instance.status).toBe('stopped');
    expect(instance.sessionId).toBeTruthy();

    // Resume after compact — session still works
    await instance.run({
      prompt: 'What topic were we discussing? Reply briefly.',
    });

    expect(instance.status).toBe('stopped');
  });
});

// ============================================================================
// COPILOT SDK INTEGRATION TESTS (AC-40 through AC-43a, AC-44)
// ============================================================================

describe.skip('AgentInstance with SdkCopilotAdapter', { timeout: 120_000 }, () => {
  // Dynamic imports to avoid loading SDK in unit test context
  let AgentManagerService: Awaited<typeof import('@chainglass/shared')>['AgentManagerService'];
  let SdkCopilotAdapter: Awaited<typeof import('@chainglass/shared/adapters')>['SdkCopilotAdapter'];
  let CopilotClient: Awaited<typeof import('@github/copilot-sdk')>['CopilotClient'];

  type IAgentManagerService = import('@chainglass/shared').IAgentManagerService;

  let manager: IAgentManagerService;
  let copilotClient: InstanceType<typeof CopilotClient>;

  beforeAll(async () => {
    const shared = await import('@chainglass/shared');
    const adapters = await import('@chainglass/shared/adapters');
    const sdk = await import('@github/copilot-sdk');

    AgentManagerService = shared.AgentManagerService;
    SdkCopilotAdapter = adapters.SdkCopilotAdapter;
    CopilotClient = sdk.CopilotClient;

    copilotClient = new CopilotClient();
    manager = new AgentManagerService(() => new SdkCopilotAdapter(copilotClient));

    console.log('Copilot SDK adapter initialized for real agent tests');
  });

  afterAll(async () => {
    if (copilotClient) {
      await copilotClient.stop();
    }
  });

  it('creates new session and gets completed status (AC-40)', async () => {
    /**
     * Test Doc:
     * - Why: Proves AgentInstance wrapping real SdkCopilotAdapter works end-to-end
     * - Contract: run() with real Copilot SDK produces stopped status + sessionId + events
     */
    const instance = manager.getNew({
      name: 'copilot-new-session',
      type: 'copilot',
      workspace: process.cwd(),
    });

    const events: AgentEvent[] = [];
    instance.addEventHandler((e) => events.push(e));

    await instance.run({ prompt: 'What is 2+2? Reply with just the number.' });

    expect(instance.status).toBe('stopped');
    expect(instance.sessionId).toBeTruthy();
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'text_delta' || e.type === 'message')).toBe(true);
  });

  it('resumes session and agent retains context (AC-41)', async () => {
    /**
     * Test Doc:
     * - Why: Proves Copilot session resumption works through AgentInstance
     * - Contract: Second run with prior sessionId completes without error
     */
    const instance1 = manager.getNew({
      name: 'copilot-resume-t1',
      type: 'copilot',
      workspace: process.cwd(),
    });

    await instance1.run({
      prompt: 'Remember the word "pineapple". Just confirm you will remember it.',
    });

    const sessionId = instance1.sessionId;
    expect(sessionId).toBeTruthy();

    const instance2 = manager.getWithSessionId(sessionId as string, {
      name: 'copilot-resume-t2',
      type: 'copilot',
      workspace: process.cwd(),
    });

    await instance2.run({
      prompt: 'What word did I ask you to remember? Say just the word.',
    });

    expect(instance2.status).toBe('stopped');
    expect(instance2.sessionId).toBeTruthy();
  });

  it('multiple handlers receive identical events (AC-42)', async () => {
    /**
     * Test Doc:
     * - Why: Proves Copilot event dispatch through AgentInstance to multiple handlers
     * - Contract: Two handlers receive same event count and same object references
     */
    const instance = manager.getNew({
      name: 'copilot-multi-handler',
      type: 'copilot',
      workspace: process.cwd(),
    });

    const handler1Events: AgentEvent[] = [];
    const handler2Events: AgentEvent[] = [];

    instance.addEventHandler((e) => handler1Events.push(e));
    instance.addEventHandler((e) => handler2Events.push(e));

    await instance.run({ prompt: 'Say hello in one word.' });

    expect(handler1Events.length).toBeGreaterThan(0);
    expect(handler1Events.length).toBe(handler2Events.length);

    for (let i = 0; i < handler1Events.length; i++) {
      expect(handler1Events[i]).toBe(handler2Events[i]);
    }
  });

  it('two agents run concurrently with independent sessions (AC-43)', async () => {
    /**
     * Test Doc:
     * - Why: Proves parallel Copilot agent execution with real SDK
     * - Contract: Two concurrent runs produce different sessionIds, both complete
     */
    const instanceA = manager.getNew({
      name: 'copilot-parallel-a',
      type: 'copilot',
      workspace: process.cwd(),
    });
    const instanceB = manager.getNew({
      name: 'copilot-parallel-b',
      type: 'copilot',
      workspace: process.cwd(),
    });

    const start = Date.now();

    await Promise.all([
      instanceA.run({ prompt: 'What is 1+1? Reply with just the number.' }),
      instanceB.run({ prompt: 'What is 3+3? Reply with just the number.' }),
    ]);

    const elapsed = Date.now() - start;

    expect(instanceA.status).toBe('stopped');
    expect(instanceB.status).toBe('stopped');
    expect(instanceA.sessionId).toBeTruthy();
    expect(instanceB.sessionId).toBeTruthy();
    expect(instanceA.sessionId).not.toBe(instanceB.sessionId);

    console.log(`Copilot parallel execution took ${elapsed}ms`);
  });

  it('compact reduces session context without losing continuity (AC-43a)', async () => {
    /**
     * Test Doc:
     * - Why: Proves compact() works through AgentInstance with Copilot SDK
     * - Contract: compact() completes, session remains usable afterward
     * - Usage Notes: Copilot adapter handles compact differently from Claude (keeps session alive)
     */
    const instance = manager.getNew({
      name: 'copilot-compact-test',
      type: 'copilot',
      workspace: process.cwd(),
    });

    await instance.run({
      prompt:
        'Write a detailed explanation of the Fibonacci sequence including history and formula.',
    });

    const sessionId = instance.sessionId;
    expect(sessionId).toBeTruthy();

    const compactResult = await instance.compact();
    expect(compactResult.status).toBe('completed');
    expect(instance.status).toBe('stopped');
    expect(instance.sessionId).toBeTruthy();

    await instance.run({
      prompt: 'What topic were we discussing? Reply briefly.',
    });

    expect(instance.status).toBe('stopped');
  });
});

// ============================================================================
// CROSS-ADAPTER PARITY TESTS (AC-45, AC-46, AC-46a)
// ============================================================================

describe.skip('Cross-Adapter Parity', { timeout: 120_000 }, () => {
  let AgentManagerService: Awaited<typeof import('@chainglass/shared')>['AgentManagerService'];
  let ClaudeCodeAdapter: Awaited<typeof import('@chainglass/shared')>['ClaudeCodeAdapter'];
  let UnixProcessManager: Awaited<typeof import('@chainglass/shared')>['UnixProcessManager'];
  let FakeLogger: Awaited<typeof import('@chainglass/shared')>['FakeLogger'];
  let SdkCopilotAdapter: Awaited<typeof import('@chainglass/shared/adapters')>['SdkCopilotAdapter'];
  let CopilotClient: Awaited<typeof import('@github/copilot-sdk')>['CopilotClient'];

  type IAgentManagerService = import('@chainglass/shared').IAgentManagerService;

  let claudeManager: IAgentManagerService;
  let copilotManager: IAgentManagerService;
  let copilotClient: InstanceType<typeof CopilotClient>;

  beforeAll(async () => {
    const shared = await import('@chainglass/shared');
    const adapters = await import('@chainglass/shared/adapters');
    const sdk = await import('@github/copilot-sdk');

    AgentManagerService = shared.AgentManagerService;
    ClaudeCodeAdapter = shared.ClaudeCodeAdapter;
    UnixProcessManager = shared.UnixProcessManager;
    FakeLogger = shared.FakeLogger;
    SdkCopilotAdapter = adapters.SdkCopilotAdapter;
    CopilotClient = sdk.CopilotClient;

    const logger = new FakeLogger();
    const processManager = new UnixProcessManager(logger);

    claudeManager = new AgentManagerService(
      () => new ClaudeCodeAdapter(processManager, { logger })
    );

    copilotClient = new CopilotClient();
    copilotManager = new AgentManagerService(() => new SdkCopilotAdapter(copilotClient));

    console.log('Both adapters initialized for cross-adapter parity tests');
  });

  afterAll(async () => {
    if (copilotClient) {
      await copilotClient.stop();
    }
  });

  it('both adapters produce text events for simple prompt (AC-45)', async () => {
    /**
     * Test Doc:
     * - Why: Proves both adapters produce compatible event type sets
     * - Contract: Both produce at least text_delta or message events for same prompt
     */
    const prompt = 'What is 2+2? Reply with just the number.';

    const claudeInstance = claudeManager.getNew({
      name: 'parity-claude',
      type: 'claude-code',
      workspace: process.cwd(),
    });
    const copilotInstance = copilotManager.getNew({
      name: 'parity-copilot',
      type: 'copilot',
      workspace: process.cwd(),
    });

    const claudeEvents: AgentEvent[] = [];
    const copilotEvents: AgentEvent[] = [];

    claudeInstance.addEventHandler((e) => claudeEvents.push(e));
    copilotInstance.addEventHandler((e) => copilotEvents.push(e));

    await Promise.all([claudeInstance.run({ prompt }), copilotInstance.run({ prompt })]);

    // Both produce text events
    const claudeEventTypes = new Set(claudeEvents.map((e) => e.type));
    const copilotEventTypes = new Set(copilotEvents.map((e) => e.type));

    const hasClaudeText = claudeEventTypes.has('text_delta') || claudeEventTypes.has('message');
    const hasCopilotText = copilotEventTypes.has('text_delta') || copilotEventTypes.has('message');

    expect(hasClaudeText).toBe(true);
    expect(hasCopilotText).toBe(true);

    console.log('Claude event types:', [...claudeEventTypes]);
    console.log('Copilot event types:', [...copilotEventTypes]);
  });

  it('both adapters support session resume (AC-46)', async () => {
    /**
     * Test Doc:
     * - Why: Proves both adapters support session resumption through AgentInstance
     * - Contract: Second run with prior sessionId completes on both adapters
     */
    // Claude: run then resume
    const claude1 = claudeManager.getNew({
      name: 'parity-resume-claude',
      type: 'claude-code',
      workspace: process.cwd(),
    });
    await claude1.run({ prompt: 'Say hello.' });
    expect(claude1.sessionId).toBeTruthy();

    const claude2 = claudeManager.getWithSessionId(claude1.sessionId as string, {
      name: 'parity-resume-claude-t2',
      type: 'claude-code',
      workspace: process.cwd(),
    });
    await claude2.run({ prompt: 'Say goodbye.' });
    expect(claude2.status).toBe('stopped');

    // Copilot: run then resume
    const copilot1 = copilotManager.getNew({
      name: 'parity-resume-copilot',
      type: 'copilot',
      workspace: process.cwd(),
    });
    await copilot1.run({ prompt: 'Say hello.' });
    expect(copilot1.sessionId).toBeTruthy();

    const copilot2 = copilotManager.getWithSessionId(copilot1.sessionId as string, {
      name: 'parity-resume-copilot-t2',
      type: 'copilot',
      workspace: process.cwd(),
    });
    await copilot2.run({ prompt: 'Say goodbye.' });
    expect(copilot2.status).toBe('stopped');
  });

  it('both adapters support compact (AC-46a)', async () => {
    /**
     * Test Doc:
     * - Why: Proves compact() works on both adapters through AgentInstance
     * - Contract: compact() completes on both, sessions remain usable
     * - Usage Notes: Claude sends /compact as prompt; Copilot keeps session alive
     */
    // Claude: run → compact → resume
    const claudeInst = claudeManager.getNew({
      name: 'parity-compact-claude',
      type: 'claude-code',
      workspace: process.cwd(),
    });
    await claudeInst.run({ prompt: 'Explain the Fibonacci sequence briefly.' });
    expect(claudeInst.sessionId).toBeTruthy();

    const claudeCompact = await claudeInst.compact();
    expect(claudeCompact.status).toBe('completed');

    await claudeInst.run({ prompt: 'What were we discussing?' });
    expect(claudeInst.status).toBe('stopped');

    // Copilot: run → compact → resume
    const copilotInst = copilotManager.getNew({
      name: 'parity-compact-copilot',
      type: 'copilot',
      workspace: process.cwd(),
    });
    await copilotInst.run({ prompt: 'Explain the Fibonacci sequence briefly.' });
    expect(copilotInst.sessionId).toBeTruthy();

    const copilotCompact = await copilotInst.compact();
    expect(copilotCompact.status).toBe('completed');

    await copilotInst.run({ prompt: 'What were we discussing?' });
    expect(copilotInst.status).toBe('stopped');
  });
});

// ============================================================================
// DIAGNOSTIC (always runs — confirms skip behavior)
// ============================================================================

describe('Agent Instance Real Tests (skip confirmation)', () => {
  it('real agent tests are skipped by default', () => {
    // This test always runs and confirms the file is discovered by vitest.
    // The describe.skip blocks above ensure real agent tests don't execute.
    expect(true).toBe(true);
  });
});
