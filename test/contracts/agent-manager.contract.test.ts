/**
 * Plan 019: Agent Manager Refactor - Contract Test Runner for IAgentManagerService
 *
 * Runs contract tests against both Fake and Real implementations.
 * Per DYK-05: Contract tests ensure Fake/Real parity.
 * Per DYK-06: AgentManagerService receives notifier via DI.
 */

import { FakeAgentAdapter } from '@chainglass/shared';
import type { AdapterFactory } from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import { AgentManagerService } from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.service';
import { FakeAgentManagerService } from '@chainglass/shared/features/019-agent-manager-refactor/fake-agent-manager.service';
import { FakeAgentNotifierService } from '@chainglass/shared/features/019-agent-manager-refactor/fake-agent-notifier.service';
import { agentManagerContractTests } from './agent-manager.contract.js';

// Run contract tests against FakeAgentManagerService
agentManagerContractTests('FakeAgentManagerService', () => new FakeAgentManagerService());

// Run contract tests against real AgentManagerService with FakeAdapterFactory and FakeNotifier
agentManagerContractTests('AgentManagerService', () => {
  const adapterFactory: AdapterFactory = () =>
    new FakeAgentAdapter({
      sessionId: 'test-session',
      output: 'Test output',
    });
  const notifier = new FakeAgentNotifierService();
  return new AgentManagerService(adapterFactory, notifier);
});
