/**
 * Contract tests for IAgentEventAdapter implementations.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 2)
 * Per Critical Discovery 09: Same contract tests run against both FakeAgentEventAdapter
 * and AgentEventAdapter (real) to prevent fake drift.
 *
 * This file runs the contract test factory against:
 * 1. FakeAgentEventAdapter
 * 2. AgentEventAdapter (real)
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { AgentEventAdapter, FakeAgentEventAdapter } from '@chainglass/workflow';
import { afterEach, describe } from 'vitest';

import {
  type AgentEventAdapterTestContext,
  agentEventAdapterContractTests,
  createDefaultContext,
} from './agent-event-adapter.contract.js';

// ==================== FakeAgentEventAdapter Tests ====================

describe('FakeAgentEventAdapter', () => {
  const createFakeContext = (): AgentEventAdapterTestContext => {
    const adapter = new FakeAgentEventAdapter();
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
      name: 'FakeAgentEventAdapter',
    };
  };

  // Run contract tests
  agentEventAdapterContractTests(createFakeContext);
});

// ==================== AgentEventAdapter Tests (Real) ====================

describe('AgentEventAdapter', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;

  const createRealContext = (): AgentEventAdapterTestContext => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const adapter = new AgentEventAdapter(fs, pathResolver);

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
      name: 'AgentEventAdapter',
    };
  };

  afterEach(() => {
    fs?.reset();
  });

  // Run contract tests - SAME tests as FakeAgentEventAdapter
  agentEventAdapterContractTests(createRealContext);
});
