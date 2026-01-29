/**
 * Plan 019: Agent Manager Refactor - Contract Test Runner for IAgentNotifierService
 *
 * Runs contract tests against both Fake and Real implementations.
 * Per DYK-05: Contract tests ensure Fake/Real parity.
 * Per DYK-08: Both use FakeSSEBroadcaster for inspection.
 */

import { AgentNotifierService } from '@/features/019-agent-manager-refactor/agent-notifier.service';
import { FakeAgentNotifierService } from '@chainglass/shared/features/019-agent-manager-refactor/fake-agent-notifier.service';
import { agentNotifierContractTests } from './agent-notifier.contract.js';

// Run contract tests against FakeAgentNotifierService
agentNotifierContractTests(
  'FakeAgentNotifierService',
  (broadcaster) => new FakeAgentNotifierService(broadcaster)
);

// Run contract tests against real AgentNotifierService
agentNotifierContractTests(
  'AgentNotifierService',
  (broadcaster) => new AgentNotifierService(broadcaster)
);
