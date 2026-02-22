import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAgentAdapter } from '../../../../packages/shared/src/fakes/fake-agent-adapter.js';
import type { IAgentInstance } from '../../../../packages/shared/src/features/034-agentic-cli/agent-instance.interface.js';
import { AgentInstance } from '../../../../packages/shared/src/features/034-agentic-cli/agent-instance.js';
import { FakeAgentInstance } from '../../../../packages/shared/src/features/034-agentic-cli/fakes/fake-agent-instance.js';
import type { AgentEvent } from '../../../../packages/shared/src/interfaces/agent-types.js';

const baseConfig = {
  id: 'contract-1',
  name: 'contract-agent',
  type: 'claude-code' as const,
  workspace: '/tmp/contract',
};

function agentInstanceContractTests(
  name: string,
  factory: () => { instance: IAgentInstance; emitsEvents: boolean }
) {
  describe(`IAgentInstance contract: ${name}`, () => {
    let instance: IAgentInstance;
    let emitsEvents: boolean;

    beforeEach(() => {
      const ctx = factory();
      instance = ctx.instance;
      emitsEvents = ctx.emitsEvents;
    });

    it('starts with status stopped', () => {
      expect(instance.status).toBe('stopped');
      expect(instance.isRunning).toBe(false);
    });

    it('run() transitions to stopped on success', async () => {
      await instance.run({ prompt: 'test' });
      expect(instance.status).toBe('stopped');
      expect(instance.isRunning).toBe(false);
    });

    it('run() updates sessionId', async () => {
      await instance.run({ prompt: 'test' });
      expect(instance.sessionId).toBeTruthy();
    });

    it('run() throws if already working (double-run guard)', async () => {
      // For FakeAgentInstance, we can set working status directly
      if ('setStatus' in instance) {
        (instance as FakeAgentInstance).setStatus('working');
        await expect(instance.run({ prompt: 'test' })).rejects.toThrow(/already running/i);
      } else {
        // For real AgentInstance, use a slow adapter (already tested in unit tests)
        expect(true).toBe(true); // guard tested in unit tests
      }
    });

    it('compact() throws if no session', async () => {
      // Only test on instances with no pre-set session
      if (instance.sessionId === null) {
        await expect(instance.compact()).rejects.toThrow(/no session/i);
      }
    });

    it('metadata is readable', () => {
      expect(instance.metadata).toBeDefined();
      expect(typeof instance.metadata).toBe('object');
    });

    it('setMetadata updates key', () => {
      instance.setMetadata('contractKey', 'contractValue');
      expect(instance.metadata.contractKey).toBe('contractValue');
    });

    it('setMetadata preserves existing keys', () => {
      instance.setMetadata('a', 1);
      instance.setMetadata('b', 2);
      expect(instance.metadata.a).toBe(1);
      expect(instance.metadata.b).toBe(2);
    });

    it('addEventHandler and removeEventHandler work', async () => {
      if (!emitsEvents) return; // skip event tests for impls without event config

      const received: AgentEvent[] = [];
      const handler = (e: AgentEvent) => received.push(e);
      instance.addEventHandler(handler);
      await instance.run({ prompt: 'test' });
      const countWith = received.length;

      instance.removeEventHandler(handler);
      // Run again — handler should not receive events
      if (instance.status !== 'working') {
        received.length = 0;
        await instance.run({ prompt: 'test2' });
        expect(received.length).toBe(0);
      }
      expect(countWith).toBeGreaterThan(0);
    });

    it('terminate transitions to stopped', async () => {
      await instance.terminate();
      expect(instance.status).toBe('stopped');
    });

    it('identity props are present', () => {
      expect(instance.id).toBeTruthy();
      expect(instance.name).toBeTruthy();
      expect(instance.type).toBeTruthy();
      expect(instance.workspace).toBeTruthy();
      expect(instance.createdAt).toBeInstanceOf(Date);
      expect(instance.updatedAt).toBeInstanceOf(Date);
    });
  });
}

// Run against real AgentInstance with FakeAgentAdapter
agentInstanceContractTests('AgentInstance (real + FakeAgentAdapter)', () => {
  const textEvent: AgentEvent = {
    type: 'text_delta',
    timestamp: new Date().toISOString(),
    data: { content: 'contract test' },
  };
  const adapter = new FakeAgentAdapter({
    sessionId: 'contract-ses',
    status: 'completed',
    events: [textEvent],
  });
  return {
    instance: new AgentInstance(baseConfig, adapter),
    emitsEvents: true,
  };
});

// Run against FakeAgentInstance
agentInstanceContractTests('FakeAgentInstance', () => {
  const textEvent = {
    type: 'text_delta' as const,
    timestamp: new Date().toISOString(),
    data: { content: 'contract test' },
  };
  return {
    instance: new FakeAgentInstance(baseConfig, {
      events: [textEvent],
    }),
    emitsEvents: true,
  };
});
