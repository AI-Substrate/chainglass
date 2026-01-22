import { ClaudeCodeAdapter, FakeAgentAdapter, FakeProcessManager } from '@chainglass/shared';
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
      const history = fakeProcessManager.getSpawnHistory();
      const processes = (fakeProcessManager as any)._processes as Map<number, any>;

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

// NOTE: CopilotAdapter tests will be added in Phase 4:
//
// agentAdapterContractTests('CopilotAdapter', () => new CopilotAdapter(...));
