/**
 * Test Doc
 * Why: FakeAgentInstance gains onRun callback for integration tests — Plan 037 Phase 2.
 * Contract: onRun is optional, called during run() with AgentRunOptions, awaited before returning.
 * Usage Notes: Set onRun via options or setOnRun(). Use to mutate graph state inside run().
 * Quality Contribution: Prevents regressions if FakeAgentInstance internals change.
 * Worked Example: onRun callback receives { prompt: '...' }, is awaited, result still returned.
 */

import {
  FakeAgentInstance,
  type FakeAgentInstanceOptions,
} from '@chainglass/shared/features/034-agentic-cli';
import type {
  AgentInstanceConfig,
  AgentRunOptions,
} from '@chainglass/shared/features/034-agentic-cli';
import { describe, expect, it } from 'vitest';

const makeConfig = (id = 'test-1'): AgentInstanceConfig => ({
  id,
  name: `Agent ${id}`,
  type: 'claude-code' as const,
  workspace: '/tmp/test',
});

describe('FakeAgentInstance onRun callback', () => {
  it('calls onRun with AgentRunOptions during run()', async () => {
    let receivedOptions: AgentRunOptions | null = null;
    const options: FakeAgentInstanceOptions = {
      onRun: async (opts) => {
        receivedOptions = opts;
      },
    };

    const agent = new FakeAgentInstance(makeConfig(), options);
    await agent.run({ prompt: 'do something' });

    expect(receivedOptions).not.toBeNull();
    expect(receivedOptions?.prompt).toBe('do something');
  });

  it('awaits onRun before returning result', async () => {
    const callOrder: string[] = [];
    const options: FakeAgentInstanceOptions = {
      onRun: async () => {
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('onRun');
      },
    };

    const agent = new FakeAgentInstance(makeConfig(), options);
    const result = await agent.run({ prompt: 'test' });
    callOrder.push('returned');

    expect(callOrder).toEqual(['onRun', 'returned']);
    expect(result.status).toBe('completed');
  });

  it('works without onRun (backward compatible)', async () => {
    const agent = new FakeAgentInstance(makeConfig());
    const result = await agent.run({ prompt: 'test' });
    expect(result.status).toBe('completed');
  });

  it('setOnRun replaces callback at runtime', async () => {
    const agent = new FakeAgentInstance(makeConfig());
    let called = false;
    agent.setOnRun(async () => {
      called = true;
    });
    await agent.run({ prompt: 'test' });
    expect(called).toBe(true);
  });
});
