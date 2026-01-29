/**
 * Plan 019: Agent Manager Refactor - Real Agent Manager Service
 *
 * Central registry for creating and tracking all agents across all workspaces.
 * This is the single source of truth for all agent state.
 *
 * Per spec AC-01, AC-02, AC-03, AC-04, AC-23, AC-24.
 * Per DYK-06: Receives notifier via DI and passes to AgentInstance.
 * Per DYK-12: Storage is optional; no storage = in-memory only (Phase 1/2 behavior).
 * Per DYK-13: Uses AgentInstance.hydrate() for restoration.
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
import type { IAgentStorageAdapter } from './agent-storage.interface.js';

/**
 * AgentManagerService is the central registry for all agents.
 *
 * Per spec: Returns agents regardless of which workspace/worktree they belong to.
 * Uses an in-memory Map<agentId, IAgentInstance> for agent storage.
 * Per DYK-06: Receives notifier via DI and passes to AgentInstance.
 * Per DYK-12: Storage is optional; no storage = in-memory only.
 *
 * Usage:
 * ```typescript
 * const adapterFactory = (type) => type === 'claude-code'
 *   ? new ClaudeCodeAdapter(pm)
 *   : new CopilotAdapter(client);
 * const notifier = container.resolve<IAgentNotifierService>(TOKENS.AGENT_NOTIFIER_SERVICE);
 *
 * // Without storage (in-memory only, Phase 1/2 behavior)
 * const manager = new AgentManagerService(adapterFactory, notifier);
 *
 * // With storage (persistent, Phase 3)
 * const storage = new AgentStorageAdapter(fs, path, basePath);
 * const manager = new AgentManagerService(adapterFactory, notifier, storage);
 * await manager.initialize(); // Load persisted agents
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
  private readonly _storage: IAgentStorageAdapter | null;
  private _initialized = false;

  /**
   * Create a new AgentManagerService.
   *
   * @param adapterFactory - Factory function that creates adapters based on type
   * @param notifier - Agent notifier for SSE broadcasting
   * @param storage - Optional storage adapter for persistence (per DYK-12)
   *
   * Per DYK-01: Receives adapterFactory, not concrete adapter.
   * Per DYK-06: Receives notifier via DI.
   * Per DYK-12: Storage is optional; no storage = in-memory only.
   */
  constructor(
    adapterFactory: AdapterFactory,
    notifier: IAgentNotifierService,
    storage?: IAgentStorageAdapter
  ) {
    this._adapterFactory = adapterFactory;
    this._notifier = notifier;
    this._storage = storage ?? null;
  }

  /**
   * Initialize the manager by loading persisted agents from storage.
   *
   * Per DYK-12: Only required when storage is provided.
   * Per DYK-13: Uses AgentInstance.hydrate() for each stored agent.
   * Per AC-05: Enables agents to survive process restart.
   *
   * @returns Promise resolving when initialization is complete
   */
  async initialize(): Promise<void> {
    // No-op if no storage or already initialized
    if (!this._storage || this._initialized) {
      this._initialized = true;
      return;
    }

    // Load all registered agents from storage
    const registryEntries = await this._storage.listAgents();

    for (const entry of registryEntries) {
      // Use AgentInstance.hydrate() to restore each agent
      const instance = await AgentInstance.hydrate(
        entry.id,
        this._storage,
        this._adapterFactory,
        this._notifier
      );

      if (instance) {
        this._agents.set(entry.id, instance);
      }
    }

    this._initialized = true;
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

    // Create the real AgentInstance with notifier and optional storage
    const instance = new AgentInstance(
      {
        id,
        name: params.name,
        type: params.type,
        workspace: params.workspace,
      },
      this._adapterFactory,
      this._notifier,
      this._storage ?? undefined
    );

    // Register in the map
    this._agents.set(id, instance);

    // Persist to storage if available (fire-and-forget, sync return for backwards compat)
    if (this._storage) {
      const createdAt = new Date().toISOString();
      // Note: We persist asynchronously but don't await. The agent is usable immediately.
      // Storage persistence happens in background. If it fails, agent exists in-memory only.
      this._persistNewAgent(id, params.workspace, createdAt, instance);
    }

    return instance;
  }

  /**
   * Persist a newly created agent to storage.
   * Called asynchronously from createAgent() to maintain sync return signature.
   */
  private async _persistNewAgent(
    id: string,
    workspace: string,
    createdAt: string,
    instance: IAgentInstance
  ): Promise<void> {
    if (!this._storage) return;

    try {
      // Register in the global registry
      await this._storage.registerAgent({ id, workspace, createdAt });

      // Save initial instance data
      await this._storage.saveInstance({
        id,
        name: instance.name,
        type: instance.type,
        workspace: instance.workspace,
        status: instance.status,
        intent: instance.intent,
        sessionId: instance.sessionId,
        createdAt,
        updatedAt: createdAt,
      });
    } catch (error) {
      // Log error but don't throw - agent exists in memory even if persistence fails
      console.error(`[AgentManagerService] Failed to persist agent ${id}:`, error);
    }
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
