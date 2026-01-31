/**
 * Plan 019: Agent Manager Refactor - Storage Adapter Interface
 *
 * Defines the contract for persistent agent storage at ~/.config/chainglass/agents/.
 *
 * Per spec AC-19: Storage at ~/.config/chainglass/agents/
 * Per spec AC-20: Registry tracks all agents with workspace refs
 * Per spec AC-21: Events stored in NDJSON format
 * Per spec AC-22: Instance metadata stored as JSON
 * Per spec AC-23: Path traversal prevention
 * Per DYK-11: Real adapter lives in packages/shared for contract test parity
 *
 * Storage structure:
 * ```
 * ~/.config/chainglass/agents/
 * ├── registry.json                    # {"agents":{"abc123":{"workspace":"/project"}}}
 * ├── abc123/
 * │   ├── instance.json               # {"id":"abc123","name":"chat","status":"stopped",...}
 * │   └── events.ndjson               # {"eventId":"...","type":"text","content":"Hello"}\n
 * ```
 */

import type { AgentStoredEvent } from './agent-instance.interface.js';

/**
 * Registry entry for a single agent.
 * Stored in registry.json mapping agentId -> entry.
 */
export interface AgentRegistryEntry {
  /** Unique agent identifier */
  id: string;
  /** Workspace path this agent belongs to */
  workspace: string;
  /** When the agent was created */
  createdAt: string; // ISO 8601 timestamp
}

/**
 * Complete instance data for persistence.
 * Stored in <agentId>/instance.json.
 */
export interface AgentInstanceData {
  /** Unique agent identifier */
  id: string;
  /** Human-readable agent name */
  name: string;
  /** Agent type (claude-code | copilot) */
  type: string;
  /** Workspace path this agent belongs to */
  workspace: string;
  /** Current status */
  status: string;
  /** Current intent description */
  intent: string;
  /** Adapter session ID (for resumption) */
  sessionId: string | null;
  /** When the agent was created */
  createdAt: string; // ISO 8601 timestamp
  /** When the agent was last updated */
  updatedAt: string; // ISO 8601 timestamp
}

/**
 * Storage adapter interface for agent persistence.
 *
 * Implementations:
 * - FakeAgentStorageAdapter: In-memory for testing
 * - AgentStorageAdapter: Real filesystem at ~/.config/chainglass/agents/
 *
 * All methods are async to support filesystem operations.
 * All agentId parameters must pass validateAgentId() before use.
 */
export interface IAgentStorageAdapter {
  // ===== Registry Operations (AC-20) =====

  /**
   * Register an agent in the global registry.
   *
   * @param entry - Registry entry with id, workspace, createdAt
   */
  registerAgent(entry: AgentRegistryEntry): Promise<void>;

  /**
   * Remove an agent from the global registry.
   *
   * @param agentId - Agent ID to unregister
   */
  unregisterAgent(agentId: string): Promise<void>;

  /**
   * List all registered agents.
   *
   * @returns Array of registry entries (may be empty)
   */
  listAgents(): Promise<AgentRegistryEntry[]>;

  // ===== Instance Operations (AC-22) =====

  /**
   * Save agent instance metadata.
   * Creates agent directory if needed.
   *
   * @param data - Complete instance data to persist
   */
  saveInstance(data: AgentInstanceData): Promise<void>;

  /**
   * Load agent instance metadata.
   *
   * @param agentId - Agent ID to load
   * @returns Instance data or null if not found
   */
  loadInstance(agentId: string): Promise<AgentInstanceData | null>;

  // ===== Event Operations (AC-21) =====

  /**
   * Append an event to agent's event log.
   * Uses NDJSON format (one JSON object per line).
   *
   * @param agentId - Agent ID
   * @param event - Event to append (must have eventId)
   */
  appendEvent(agentId: string, event: AgentStoredEvent): Promise<void>;

  /**
   * Get all events for an agent.
   *
   * @param agentId - Agent ID
   * @returns Array of events in chronological order (may be empty)
   */
  getEvents(agentId: string): Promise<AgentStoredEvent[]>;

  /**
   * Get events after a specific event ID.
   * Used for incremental SSE catch-up.
   *
   * @param agentId - Agent ID
   * @param sinceId - Return events AFTER this eventId
   * @returns Array of events after sinceId (may be empty)
   */
  getEventsSince(agentId: string, sinceId: string): Promise<AgentStoredEvent[]>;
}
