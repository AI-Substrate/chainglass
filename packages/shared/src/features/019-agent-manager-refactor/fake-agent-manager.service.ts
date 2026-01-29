/**
 * Plan 019: Agent Manager Refactor - Fake Agent Manager Service
 *
 * Test double for IAgentManagerService with state setup and inspection helpers.
 *
 * Per AC-26: Provides test helpers for state setup and error injection.
 * Per DYK-05: Used in contract tests alongside real implementation.
 */

import type { IAgentInstance } from './agent-instance.interface.js';
import type {
  AgentFilter,
  CreateAgentParams,
  IAgentManagerService,
} from './agent-manager.interface.js';
import { FakeAgentInstance } from './fake-agent-instance.js';

/**
 * FakeAgentManagerService is a test double that implements IAgentManagerService
 * with additional helpers for test setup and assertions.
 *
 * Usage:
 * ```typescript
 * const fake = new FakeAgentManagerService();
 *
 * // Pre-populate state
 * fake.addAgent(someInstance);
 *
 * // Use as IAgentManagerService
 * const agent = fake.createAgent({ name: 'test', type: 'claude-code', workspace: '/ws' });
 *
 * // Inspect created agents
 * expect(fake.getCreatedAgents()).toHaveLength(1);
 *
 * // Inject errors for error path testing
 * fake.setError('createAgent', new Error('Simulated failure'));
 * ```
 */
export class FakeAgentManagerService implements IAgentManagerService {
  private readonly _agents = new Map<string, IAgentInstance>();
  private readonly _createdAgents: IAgentInstance[] = [];
  private readonly _errors = new Map<string, Error>();
  private _idCounter = 0;

  // ===== IAgentManagerService Implementation =====

  /**
   * Initialize the manager.
   * Per DYK-12: No-op for fake - storage is optional.
   */
  async initialize(): Promise<void> {
    // No-op for fake implementation
    // Tests can pre-populate agents via addAgent() instead
  }

  createAgent(params: CreateAgentParams): IAgentInstance {
    // Check for injected error
    const error = this._errors.get('createAgent');
    if (error) {
      throw error;
    }

    // Generate unique ID
    const id = `agent-${++this._idCounter}`;

    // Create a FakeAgentInstance for consistent test behavior
    const instance = new FakeAgentInstance({
      id,
      name: params.name,
      type: params.type,
      workspace: params.workspace,
    });

    this._agents.set(id, instance);
    this._createdAgents.push(instance);

    return instance;
  }

  getAgents(filter?: AgentFilter): IAgentInstance[] {
    // Check for injected error
    const error = this._errors.get('getAgents');
    if (error) {
      throw error;
    }

    const all = Array.from(this._agents.values());

    if (filter?.workspace) {
      return all.filter((agent) => agent.workspace === filter.workspace);
    }

    return all;
  }

  getAgent(agentId: string): IAgentInstance | null {
    // Check for injected error
    const error = this._errors.get('getAgent');
    if (error) {
      throw error;
    }

    return this._agents.get(agentId) ?? null;
  }

  // ===== Test Helpers =====

  /**
   * Pre-populate an agent in the registry.
   * Useful for testing getAgent/getAgents without going through createAgent.
   *
   * @param instance - Agent instance to add
   */
  addAgent(instance: IAgentInstance): void {
    this._agents.set(instance.id, instance);
  }

  /**
   * Get all agents that were created via createAgent().
   * Useful for verifying creation behavior.
   *
   * @returns Array of agents created via createAgent (not addAgent)
   */
  getCreatedAgents(): IAgentInstance[] {
    return [...this._createdAgents];
  }

  /**
   * Inject an error to be thrown on next method call.
   * Useful for testing error paths.
   *
   * @param methodName - Method name to inject error for
   * @param error - Error to throw
   */
  setError(methodName: 'createAgent' | 'getAgents' | 'getAgent', error: Error): void {
    this._errors.set(methodName, error);
  }

  /**
   * Clear an injected error.
   *
   * @param methodName - Method name to clear error for
   */
  clearError(methodName: 'createAgent' | 'getAgents' | 'getAgent'): void {
    this._errors.delete(methodName);
  }

  /**
   * Clear all state. Useful for test isolation.
   */
  reset(): void {
    this._agents.clear();
    this._createdAgents.length = 0;
    this._errors.clear();
    this._idCounter = 0;
  }
}
