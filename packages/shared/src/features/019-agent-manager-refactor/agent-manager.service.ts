/**
 * Plan 019: Agent Manager Refactor - Real Agent Manager Service
 *
 * Central registry for creating and tracking all agents across all workspaces.
 * This is the single source of truth for all agent state.
 *
 * Per spec AC-01, AC-02, AC-03, AC-04, AC-23, AC-24.
 * Per DYK-06: Receives notifier via DI and passes to AgentInstance.
 * Per Critical Finding 01: No central agent registry exists - this fixes it.
 */

import { assertValidAgentId, generateAgentId } from '../../utils/validate-agent-id.js';
import type { AdapterFactory, IAgentInstance } from './agent-instance.interface.js';
import { AgentInstance } from './agent-instance.js';
import type {
  AgentFilter,
  CreateAgentParams,
  IAgentManagerService,
} from './agent-manager.interface.js';
import type { IAgentNotifierService } from './agent-notifier.interface.js';

/**
 * AgentManagerService is the central registry for all agents.
 *
 * Per spec: Returns agents regardless of which workspace/worktree they belong to.
 * Uses an in-memory Map<agentId, IAgentInstance> for agent storage.
 * Per DYK-06: Receives notifier via DI and passes to AgentInstance.
 *
 * Usage:
 * ```typescript
 * const adapterFactory = (type) => type === 'claude-code'
 *   ? new ClaudeCodeAdapter(pm)
 *   : new CopilotAdapter(client);
 * const notifier = container.resolve<IAgentNotifierService>(TOKENS.AGENT_NOTIFIER_SERVICE);
 *
 * const manager = new AgentManagerService(adapterFactory, notifier);
 *
 * const agent = manager.createAgent({
 *   name: 'chat-assistant',
 *   type: 'claude-code',
 *   workspace: '/projects/myapp'
 * });
 *
 * const all = manager.getAgents();
 * const mine = manager.getAgents({ workspace: '/projects/myapp' });
 * ```
 */
export class AgentManagerService implements IAgentManagerService {
  private readonly _agents = new Map<string, IAgentInstance>();
  private readonly _adapterFactory: AdapterFactory;
  private readonly _notifier: IAgentNotifierService;

  /**
   * Create a new AgentManagerService.
   *
   * @param adapterFactory - Factory function that creates adapters based on type
   * @param notifier - Agent notifier for SSE broadcasting
   *
   * Per DYK-01: Receives adapterFactory, not concrete adapter.
   * Per DYK-06: Receives notifier via DI.
   */
  constructor(adapterFactory: AdapterFactory, notifier: IAgentNotifierService) {
    this._adapterFactory = adapterFactory;
    this._notifier = notifier;
  }

  /**
   * Create a new agent instance.
   *
   * @param params - Agent creation parameters (name, type, workspace)
   * @returns The created agent instance with a unique ID
   *
   * Per AC-01: Creates agents with unique IDs
   * Per AC-23: Validates agent ID to prevent path traversal
   */
  createAgent(params: CreateAgentParams): IAgentInstance {
    // Generate and validate unique ID
    const id = generateAgentId();
    assertValidAgentId(id);

    // Create the real AgentInstance with notifier
    const instance = new AgentInstance(
      {
        id,
        name: params.name,
        type: params.type,
        workspace: params.workspace,
      },
      this._adapterFactory,
      this._notifier
    );

    // Register in the map
    this._agents.set(id, instance);

    return instance;
  }

  /**
   * Get all agents, optionally filtered.
   *
   * @param filter - Optional filter criteria
   * @returns Array of agents matching filter (empty if none)
   *
   * Per AC-02: Returns all agents regardless of workspace (when no filter)
   * Per AC-03: Filters agents by workspace when filter.workspace provided
   */
  getAgents(filter?: AgentFilter): IAgentInstance[] {
    const all = Array.from(this._agents.values());

    if (filter?.workspace) {
      return all.filter((agent) => agent.workspace === filter.workspace);
    }

    return all;
  }

  /**
   * Get a specific agent by ID.
   *
   * @param agentId - Unique agent identifier
   * @returns The agent instance or null if not found
   *
   * Per AC-04: Returns null for unknown agent (graceful handling)
   * Per AC-24: Agent not found is not an error condition
   */
  getAgent(agentId: string): IAgentInstance | null {
    return this._agents.get(agentId) ?? null;
  }
}
