import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAgentAdapter } from '../../../../packages/shared/src/fakes/fake-agent-adapter.js';
import type { IAgentManagerService } from '../../../../packages/shared/src/features/034-agentic-cli/agent-manager-service.interface.js';
import { AgentManagerService } from '../../../../packages/shared/src/features/034-agentic-cli/agent-manager-service.js';
import { FakeAgentManagerService } from '../../../../packages/shared/src/features/034-agentic-cli/fakes/fake-agent-manager-service.js';

const defaultParams = {
  name: 'contract-agent',
  type: 'claude-code' as const,
  workspace: '/tmp/contract',
};

function agentManagerContractTests(name: string, factory: () => IAgentManagerService) {
  describe(`IAgentManagerService contract: ${name}`, () => {
    let manager: IAgentManagerService;

    beforeEach(() => {
      manager = factory();
    });

    it('getNew creates instance with null sessionId', () => {
      const instance = manager.getNew(defaultParams);
      expect(instance.sessionId).toBeNull();
    });

    it('getNew sets name, type, workspace', () => {
      const instance = manager.getNew(defaultParams);
      expect(instance.name).toBe('contract-agent');
      expect(instance.type).toBe('claude-code');
      expect(instance.workspace).toBe('/tmp/contract');
    });

    it('getWithSessionId pre-sets sessionId', () => {
      const instance = manager.getWithSessionId('ses-contract', defaultParams);
      expect(instance.sessionId).toBe('ses-contract');
    });

    it('getWithSessionId same session returns same object', () => {
      const a = manager.getWithSessionId('ses-same', defaultParams);
      const b = manager.getWithSessionId('ses-same', defaultParams);
      expect(a).toBe(b); // === equality
    });

    it('getWithSessionId different session returns different object', () => {
      const a = manager.getWithSessionId('ses-a', defaultParams);
      const b = manager.getWithSessionId('ses-b', defaultParams);
      expect(a).not.toBe(b);
    });

    it('getAgent returns instance by ID', () => {
      const instance = manager.getNew(defaultParams);
      expect(manager.getAgent(instance.id)).toBe(instance);
    });

    it('getAgent returns null for unknown ID', () => {
      expect(manager.getAgent('nonexistent')).toBeNull();
    });

    it('getAgents returns all agents', () => {
      manager.getNew(defaultParams);
      manager.getNew(defaultParams);
      expect(manager.getAgents()).toHaveLength(2);
    });

    it('getAgents with type filter', () => {
      manager.getNew({ ...defaultParams, type: 'claude-code' });
      manager.getNew({ ...defaultParams, type: 'copilot' });
      const filtered = manager.getAgents({ type: 'copilot' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.type).toBe('copilot');
    });

    it('terminateAgent removes from registry', async () => {
      const instance = manager.getNew(defaultParams);
      const result = await manager.terminateAgent(instance.id);
      expect(result).toBe(true);
      expect(manager.getAgent(instance.id)).toBeNull();
    });

    it('terminateAgent returns false for unknown ID', async () => {
      expect(await manager.terminateAgent('nonexistent')).toBe(false);
    });

    it('initialize resolves', async () => {
      await expect(manager.initialize()).resolves.toBeUndefined();
    });
  });
}

// Run against real AgentManagerService
agentManagerContractTests('AgentManagerService (real)', () => {
  return new AgentManagerService(
    () => new FakeAgentAdapter({ sessionId: 'contract-ses', status: 'completed' })
  );
});

// Run against FakeAgentManagerService
agentManagerContractTests('FakeAgentManagerService', () => {
  return new FakeAgentManagerService();
});
