/**
 * Plan 019: Agent Manager Refactor - Contract Test Runner for IAgentStorageAdapter
 *
 * Per DYK-05: Contract tests run against BOTH Fake AND Real implementations.
 * Per DYK-11: Real adapter lives in packages/shared for contract test parity.
 *
 * This file runs the contract tests against both implementations.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared/fakes';
import {
  AgentStorageAdapter,
  FakeAgentStorageAdapter,
} from '@chainglass/shared/features/019-agent-manager-refactor';
import { afterEach, beforeEach, describe } from 'vitest';
import { agentStorageContractTests } from './agent-storage.contract';

// Run contract tests against FakeAgentStorageAdapter
agentStorageContractTests('FakeAgentStorageAdapter', () => new FakeAgentStorageAdapter());

// Run contract tests against AgentStorageAdapter (Real)
describe('AgentStorageAdapter (Real) with FakeFileSystem', () => {
  let fakeFs: FakeFileSystem;
  let fakePath: FakePathResolver;
  const testBasePath = '/test/agents';

  beforeEach(() => {
    fakeFs = new FakeFileSystem();
    fakePath = new FakePathResolver();
  });

  afterEach(() => {
    fakeFs.reset();
  });

  agentStorageContractTests('AgentStorageAdapter', () => {
    return new AgentStorageAdapter(fakeFs, fakePath, testBasePath);
  });
});
