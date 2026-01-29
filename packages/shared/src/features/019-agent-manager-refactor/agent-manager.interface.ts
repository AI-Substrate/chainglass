/**
 * Plan 019: Agent Manager Refactor - Central Agent Registry Interface
 *
 * The AgentManagerService is the single source of truth for all agent state.
 * It creates, tracks, and provides access to agents across all workspaces.
 *
 * Per spec AC-01, AC-02, AC-03, AC-04.
 * Per Phase 3: AC-05 (persistence), DYK-12 (optional storage), DYK-13 (hydrate).
 */

import type { AgentType, IAgentInstance } from './agent-instance.interface.js';

/**
 * Parameters for creating a new agent.
 *
 * Per spec: Agents are created with a name, type, and workspace.
 */
export interface CreateAgentParams {
  /** Human-readable name for this agent */
  name: string;
  /** Agent type determines which adapter to use */
  type: AgentType;
  /** Workspace path this agent is associated with (absolute path or slug) */
  workspace: string;
}

/**
 * Filter criteria for listing agents.
 *
 * Per AC-03: Agents can be filtered by workspace.
 */
export interface AgentFilter {
  /** Filter to agents in this workspace only */
  workspace?: string;
}

/**
 * Central agent management interface.
 *
 * Per spec: Single source of truth for all agent state.
 * Returns agents regardless of which workspace/worktree they belong to.
 *
 * Implementations:
 * - AgentManagerService: Real implementation with in-memory registry
 * - FakeAgentManagerService: Test double with state setup helpers
 */
export interface IAgentManagerService {
  /**
   * Initialize the manager by loading persisted agents from storage.
   *
   * Per DYK-12: Only required when storage is provided.
   * Per DYK-13: Uses AgentInstance.hydrate() for each stored agent.
   * Per AC-05: Enables agents to survive process restart.
   *
   * @returns Promise resolving when initialization is complete
   */
  initialize(): Promise<void>;

  /**
   * Create a new agent instance.
   *
   * @param params - Agent creation parameters (name, type, workspace)
   * @returns The created agent instance with a unique ID
   *
   * Per AC-01: Creates agents with unique IDs
   * Per AC-23: Validates agent name/ID to prevent path traversal
   */
  createAgent(params: CreateAgentParams): IAgentInstance;

  /**
   * Get all agents, optionally filtered.
   *
   * @param filter - Optional filter criteria
   * @returns Array of agents matching filter (empty if none)
   *
   * Per AC-02: Returns all agents regardless of workspace (when no filter)
   * Per AC-03: Filters agents by workspace when filter.workspace provided
   */
  getAgents(filter?: AgentFilter): IAgentInstance[];

  /**
   * Get a specific agent by ID.
   *
   * @param agentId - Unique agent identifier
   * @returns The agent instance or null if not found
   *
   * Per AC-04: Returns null for unknown agent (graceful handling)
   * Per AC-24: Agent not found is not an error condition
   */
  getAgent(agentId: string): IAgentInstance | null;
}
