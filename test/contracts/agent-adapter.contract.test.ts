import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ClaudeCodeAdapter,
  CopilotCLIAdapter,
  FakeAgentAdapter,
  FakeCopilotClient,
  FakeProcessManager,
  SdkCopilotAdapter,
} from '@chainglass/shared';
import { agentAdapterContractTests } from './agent-adapter.contract.js';

// Run contract tests for FakeAgentAdapter
agentAdapterContractTests(
  'FakeAgentAdapter',
  () =>
    new FakeAgentAdapter({
      sessionId: 'contract-test-session',
      output: 'Contract test output',
      tokens: { used: 100, total: 500, limit: 200000 },
    })
);

// Run contract tests for ClaudeCodeAdapter (Phase 2)
// Per DYK-10: Wire ClaudeCodeAdapter + FakeProcessManager to contract tests
agentAdapterContractTests('ClaudeCodeAdapter', () => {
  // Create a FakeProcessManager that will respond to spawns
  const fakeProcessManager = new FakeProcessManager();

  // Pre-configure process responses for each contract test
  // Contract tests call run(), compact(), terminate() - need to handle each
  const sampleOutput = [
    '{"type":"message","session_id":"contract-test-session"}',
    '{"type":"assistant","content":[{"type":"text","text":"Contract test output"}]}',
    '{"type":"result","result":"Done","usage":{"input_tokens":100,"output_tokens":400},"context_window":200000}',
  ].join('\n');

  // Schedule process exits for multiple calls (contract tests make several run() calls)
  // Use a polling approach to set up processes as they're spawned
  const setupNextProcess = (): void => {
    const checkAndSetup = (): void => {
      // biome-ignore lint/suspicious/noExplicitAny: Accessing internal state for test setup
      const processes = (fakeProcessManager as any)._processes as Map<
        number,
        { running: boolean; output: string }
      >;

      // For each spawned process that hasn't been configured, configure it
      for (const [pid, state] of processes) {
        if (state.running && !state.output) {
          state.output = sampleOutput;
          fakeProcessManager.exitProcess(pid, 0);
        }
      }
    };

    // Continuously check for new processes
    const interval = setInterval(checkAndSetup, 1);

    // Clean up after a reasonable time (contract tests should finish quickly)
    setTimeout(() => clearInterval(interval), 5000);
  };

  setupNextProcess();

  return new ClaudeCodeAdapter(fakeProcessManager);
});

// Phase 4: Removed old CopilotAdapter contract tests (polling-based adapter deleted)
// SdkCopilotAdapter is now the only Copilot implementation

// Run contract tests for SdkCopilotAdapter (Phase 2)
// Per DYK-03: Factory setup creates adapter with FakeCopilotClient
// Expected: run() tests PASS, compact/terminate tests FAIL (Phase 3 stubs)
agentAdapterContractTests('SdkCopilotAdapter', () => {
  // Create FakeCopilotClient with appropriate events for contract tests
  const fakeClient = new FakeCopilotClient({
    events: [
      {
        type: 'assistant.message',
        data: { content: 'Contract test output', messageId: 'contract-msg-001' },
      },
      { type: 'session.idle', data: {} },
    ],
  });

  return new SdkCopilotAdapter(fakeClient);
});

// Run contract tests for CopilotCLIAdapter (Plan 057)
// Uses temp events.jsonl file and injectable sendKeys to simulate CLI interaction
agentAdapterContractTests('CopilotCLIAdapter', () => {
  const sessionId = `contract-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sessionStateDir = path.join(os.tmpdir(), '.copilot-contract-test', 'session-state');
  const sessionDir = path.join(sessionStateDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const eventsPath = path.join(sessionDir, 'events.jsonl');
  fs.writeFileSync(eventsPath, '');

  // When sendKeys is called, track what was sent. When sendEnter fires, produce events.
  let lastText = '';
  const sendKeys = (_target: string, text: string): void => {
    lastText = text;
  };

  const sendEnter = (_target: string): void => {
    setTimeout(() => {
      if (lastText === '/compact') {
        // compact produces compaction events, not turn events
        const events = [
          JSON.stringify({
            type: 'session.compaction_start',
            data: {},
            timestamp: new Date().toISOString(),
            id: `evt-${Date.now()}`,
          }),
          JSON.stringify({
            type: 'session.compaction_complete',
            data: { success: true },
            timestamp: new Date().toISOString(),
            id: `evt-${Date.now() + 1}`,
          }),
        ];
        fs.appendFileSync(eventsPath, `${events.join('\n')}\n`);
      } else {
        // Regular prompt produces message + turn_end
        const events = [
          JSON.stringify({
            type: 'assistant.message',
            data: { content: 'Contract test output', messageId: 'contract-msg' },
            timestamp: new Date().toISOString(),
            id: `evt-${Date.now()}`,
          }),
          JSON.stringify({
            type: 'assistant.turn_end',
            data: { turnId: '0' },
            timestamp: new Date().toISOString(),
            id: `evt-${Date.now() + 1}`,
          }),
        ];
        fs.appendFileSync(eventsPath, `${events.join('\n')}\n`);
      }
      lastText = '';
    }, 50);
  };

  // Clean up temp dir after a delay (contract tests finish quickly)
  setTimeout(() => {
    fs.rmSync(path.join(os.tmpdir(), '.copilot-contract-test'), { recursive: true, force: true });
  }, 10000);

  return new CopilotCLIAdapter({
    sendKeys,
    sendEnter,
    sessionStateDir,
    tmuxTarget: 'contract:0.0',
    pollIntervalMs: 25,
    timeoutMs: 5000,
    defaultSessionId: sessionId,
  });
});
