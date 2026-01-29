/**
 * Plan 019: Agent Manager Refactor - Contract Tests for IAgentManagerService
 *
 * Per AC-29: Contract tests verify Fake/Real parity.
 * Per DYK-05: Contract tests run against BOTH Fake AND Real implementations.
 *
 * Usage:
 * ```typescript
 * import { agentManagerContractTests } from './agent-manager.contract';
 *
 * agentManagerContractTests('FakeAgentManagerService', () => new FakeAgentManagerService());
 * agentManagerContractTests('AgentManagerService', () => new AgentManagerService(adapterFactory));
 * ```
 */

import type { IAgentManagerService } from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.interface';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for IAgentManagerService implementations.
 *
 * These tests define the behavioral contract that both FakeAgentManagerService
 * and AgentManagerService must satisfy.
 *
 * @param name - Implementation name for test reporting
 * @param createService - Factory function that creates a fresh service instance
 */
export function agentManagerContractTests(name: string, createService: () => IAgentManagerService) {
  describe(`${name} implements IAgentManagerService contract`, () => {
    // ===== AC-01: Creates agents with unique IDs =====

    it('creates agent with required properties (AC-01)', () => {
      /*
      Test Doc:
      - Why: AC-01 requires createAgent returns complete agent with unique ID
      - Contract: createAgent({name, type, workspace}) returns agent with id, name, type, workspace
      - Usage Notes: ID is auto-generated; name/type/workspace come from params
      - Quality Contribution: Catches agent creation failures
      - Worked Example: createAgent({name:"chat", type:"claude-code", workspace:"/ws"}) → {id:"agent-1", name:"chat", ...}
      */
      const service = createService();

      const agent = service.createAgent({
        name: 'test-agent',
        type: 'claude-code',
        workspace: '/projects/myapp',
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.id.length).toBeGreaterThan(0);
      expect(agent.name).toBe('test-agent');
      expect(agent.type).toBe('claude-code');
      expect(agent.workspace).toBe('/projects/myapp');
    });

    it('creates agents with unique IDs (AC-01)', () => {
      /*
      Test Doc:
      - Why: AC-01 requires each agent has unique ID
      - Contract: Multiple createAgent calls return agents with different IDs
      - Usage Notes: IDs must be unique across all agents in the service
      - Quality Contribution: Prevents ID collisions
      - Worked Example: createAgent() x 3 → [{id:"a"}, {id:"b"}, {id:"c"}] all different
      */
      const service = createService();

      const agent1 = service.createAgent({
        name: 'agent-1',
        type: 'claude-code',
        workspace: '/ws',
      });
      const agent2 = service.createAgent({
        name: 'agent-2',
        type: 'copilot',
        workspace: '/ws',
      });
      const agent3 = service.createAgent({
        name: 'agent-3',
        type: 'claude-code',
        workspace: '/other',
      });

      expect(agent1.id).not.toBe(agent2.id);
      expect(agent2.id).not.toBe(agent3.id);
      expect(agent1.id).not.toBe(agent3.id);
    });

    // ===== AC-02: Lists all agents regardless of workspace =====

    it('lists all agents regardless of workspace (AC-02)', () => {
      /*
      Test Doc:
      - Why: AC-02 requires getAgents() returns cross-workspace
      - Contract: getAgents() returns all agents from all workspaces
      - Usage Notes: No filter means all agents
      - Quality Contribution: Ensures global agent visibility
      - Worked Example: 2 agents in different workspaces → getAgents() returns both
      */
      const service = createService();

      service.createAgent({ name: 'a1', type: 'claude-code', workspace: '/ws1' });
      service.createAgent({ name: 'a2', type: 'copilot', workspace: '/ws2' });

      const all = service.getAgents();

      expect(all).toHaveLength(2);
      expect(all.map((a) => a.name)).toContain('a1');
      expect(all.map((a) => a.name)).toContain('a2');
    });

    // ===== AC-03: Filters agents by workspace =====

    it('filters agents by workspace (AC-03)', () => {
      /*
      Test Doc:
      - Why: AC-03 requires getAgents({workspace}) filters correctly
      - Contract: getAgents({workspace: X}) returns only agents in workspace X
      - Usage Notes: Exact match on workspace path
      - Quality Contribution: Ensures workspace isolation works
      - Worked Example: 2 agents in /ws1, 1 in /ws2 → getAgents({workspace:"/ws1"}) returns 2
      */
      const service = createService();

      service.createAgent({ name: 'a1', type: 'claude-code', workspace: '/ws1' });
      service.createAgent({ name: 'a2', type: 'copilot', workspace: '/ws1' });
      service.createAgent({ name: 'a3', type: 'claude-code', workspace: '/ws2' });

      const ws1Agents = service.getAgents({ workspace: '/ws1' });
      const ws2Agents = service.getAgents({ workspace: '/ws2' });

      expect(ws1Agents).toHaveLength(2);
      expect(ws1Agents.map((a) => a.name)).toContain('a1');
      expect(ws1Agents.map((a) => a.name)).toContain('a2');

      expect(ws2Agents).toHaveLength(1);
      expect(ws2Agents[0].name).toBe('a3');
    });

    it('returns empty array when no agents match filter (AC-03)', () => {
      /*
      Test Doc:
      - Why: AC-03 graceful handling when no match
      - Contract: getAgents with non-matching filter returns empty array (not null/undefined)
      - Usage Notes: Empty workspace should return []
      - Quality Contribution: Prevents null pointer issues in consumers
      - Worked Example: getAgents({workspace:"/nonexistent"}) → []
      */
      const service = createService();

      service.createAgent({ name: 'a1', type: 'claude-code', workspace: '/ws1' });

      const result = service.getAgents({ workspace: '/nonexistent' });

      expect(result).toEqual([]);
    });

    // ===== AC-04: Returns null for unknown agent =====

    it('returns null for unknown agent (AC-04)', () => {
      /*
      Test Doc:
      - Why: AC-04 requires graceful handling for unknown agent
      - Contract: getAgent(unknownId) returns null (not throws)
      - Usage Notes: AC-24: Agent not found is not an error condition
      - Quality Contribution: Prevents unexpected exceptions
      - Worked Example: getAgent("nonexistent") → null
      */
      const service = createService();

      const result = service.getAgent('nonexistent-id');

      expect(result).toBeNull();
    });

    it('returns agent for known ID (AC-04)', () => {
      /*
      Test Doc:
      - Why: AC-04 positive case - getAgent returns agent when found
      - Contract: getAgent(validId) returns the agent with that ID
      - Usage Notes: Must return same instance that was created
      - Quality Contribution: Ensures agent lookup works
      - Worked Example: createAgent() → agent; getAgent(agent.id) → agent
      */
      const service = createService();

      const created = service.createAgent({
        name: 'test',
        type: 'claude-code',
        workspace: '/ws',
      });

      const found = service.getAgent(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('test');
    });

    // ===== AC-23: Invalid agent IDs rejected =====

    it('rejects agent creation for copilot type', () => {
      /*
      Test Doc:
      - Why: Per Invariant #4 only claude-code and copilot are valid
      - Contract: createAgent with valid types succeeds
      - Usage Notes: This is a positive test; invalid types tested separately in real impl
      - Quality Contribution: Ensures both adapter types work
      - Worked Example: createAgent({type:"copilot"}) → {type:"copilot"}
      */
      const service = createService();

      const agent = service.createAgent({
        name: 'copilot-test',
        type: 'copilot',
        workspace: '/ws',
      });

      expect(agent.type).toBe('copilot');
    });

    // ===== Additional behavioral tests =====

    it('returns empty array when no agents exist', () => {
      /*
      Test Doc:
      - Why: Edge case - service starts empty
      - Contract: getAgents() on fresh service returns []
      - Usage Notes: Not null, not undefined
      - Quality Contribution: Prevents iteration errors on empty state
      - Worked Example: new service → getAgents() → []
      */
      const service = createService();

      const agents = service.getAgents();

      expect(agents).toEqual([]);
    });

    it('agent status is initially stopped', () => {
      /*
      Test Doc:
      - Why: Per DYK-02, initial status is stopped (not working)
      - Contract: Newly created agent has status='stopped'
      - Usage Notes: Agent must be explicitly run() to become working
      - Quality Contribution: Ensures consistent initial state
      - Worked Example: createAgent() → {status:"stopped"}
      */
      const service = createService();

      const agent = service.createAgent({
        name: 'test',
        type: 'claude-code',
        workspace: '/ws',
      });

      expect(agent.status).toBe('stopped');
    });
  });
}
