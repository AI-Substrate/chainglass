/**
 * Contract tests for IAgentSessionAdapter implementations.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per Critical Discovery 09: Same contract tests run against both FakeAgentSessionAdapter
 * and AgentSessionAdapter (real) to prevent fake drift.
 *
 * This file runs the contract test factory against:
 * 1. FakeAgentSessionAdapter (T008)
 * 2. AgentSessionAdapter (T011)
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { AgentSessionAdapter, FakeAgentSessionAdapter } from '@chainglass/workflow';
import { afterEach, describe } from 'vitest';

import {
  type AgentSessionAdapterTestContext,
  agentSessionAdapterContractTests,
  createDefaultContext,
} from './agent-session-adapter.contract.js';

// ==================== FakeAgentSessionAdapter Tests ====================

describe('FakeAgentSessionAdapter', () => {
  const createFakeContext = (): AgentSessionAdapterTestContext => {
    const adapter = new FakeAgentSessionAdapter();
    return {
      adapter,
      ctx: createDefaultContext(),
      createContext: createDefaultContext,
      setup: async () => {
        // Adapter already created fresh for each context
      },
      cleanup: async () => {
        adapter.reset();
      },
      name: 'FakeAgentSessionAdapter',
    };
  };

  // Run contract tests
  agentSessionAdapterContractTests(createFakeContext);
});

// ==================== AgentSessionAdapter Tests (Real) ====================

describe('AgentSessionAdapter', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;

  const createRealContext = (): AgentSessionAdapterTestContext => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const adapter = new AgentSessionAdapter(fs, pathResolver);

    return {
      adapter,
      ctx: createDefaultContext(),
      createContext: createDefaultContext,
      setup: async () => {
        // FakeFileSystem starts empty - no setup needed
      },
      cleanup: async () => {
        fs.reset();
      },
      name: 'AgentSessionAdapter',
    };
  };

  afterEach(() => {
    fs?.reset();
  });

  // Run contract tests - SAME tests as FakeAgentSessionAdapter
  agentSessionAdapterContractTests(createRealContext);
});
