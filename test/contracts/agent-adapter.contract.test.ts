import { FakeAgentAdapter } from '@chainglass/shared';
import { agentAdapterContractTests } from './agent-adapter.contract.js';

// Run contract tests for FakeAgentAdapter
agentAdapterContractTests('FakeAgentAdapter', () => new FakeAgentAdapter({
  sessionId: 'contract-test-session',
  output: 'Contract test output',
  tokens: { used: 100, total: 500, limit: 200000 },
}));

// NOTE: Real adapter tests will be added in Phase 2 (ClaudeCodeAdapter)
// and Phase 4 (CopilotAdapter):
//
// agentAdapterContractTests('ClaudeCodeAdapter', () => new ClaudeCodeAdapter(...));
// agentAdapterContractTests('CopilotAdapter', () => new CopilotAdapter(...));
