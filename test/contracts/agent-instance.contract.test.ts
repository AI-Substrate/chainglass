/**
 * Plan 019: Agent Manager Refactor - Contract Test Runner for IAgentInstance
 *
 * Runs contract tests against both Fake and Real implementations.
 * Per DYK-05: Contract tests ensure Fake/Real parity.
 * Per DYK-10: Both implementations receive FakeAgentNotifierService.
 */

import { FakeAgentAdapter } from '@chainglass/shared';
import { AgentInstance } from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance';
import type { AdapterFactory } from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import { FakeAgentInstance } from '@chainglass/shared/features/019-agent-manager-refactor/fake-agent-instance';
import { FakeAgentNotifierService } from '@chainglass/shared/features/019-agent-manager-refactor/fake-agent-notifier.service';
import { agentInstanceContractTests } from './agent-instance.contract.js';

// Run contract tests against FakeAgentInstance
agentInstanceContractTests(
  'FakeAgentInstance',
  () =>
    new FakeAgentInstance({
      id: 'test-agent-1',
      name: 'Test Agent',
      type: 'claude-code',
      workspace: '/projects/test',
      notifier: new FakeAgentNotifierService(),
    })
);

// Run contract tests against real AgentInstance with FakeAdapterFactory and FakeNotifier
agentInstanceContractTests('AgentInstance', () => {
  const adapterFactory: AdapterFactory = () =>
    new FakeAgentAdapter({
      sessionId: 'test-session',
      output: 'Test output',
    });
  const notifier = new FakeAgentNotifierService();
  return new AgentInstance(
    {
      id: 'test-agent-1',
      name: 'Test Agent',
      type: 'claude-code',
      workspace: '/projects/test',
    },
    adapterFactory,
    notifier
  );
});
