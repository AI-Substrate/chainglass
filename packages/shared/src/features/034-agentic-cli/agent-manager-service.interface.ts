/**
 * Plan 034: Agentic CLI — IAgentManagerService Interface
 *
 * Central registry for agent instances. Provides two creation paths
 * (`getNew` / `getWithSessionId`) and a session index with a
 * same-instance guarantee.
 *
 * Constructor constraint: implementations accept only an `AdapterFactory`
 * — no notifier, no storage (AC-21).
 *
 * @see Workshop 02: Unified AgentInstance / AgentManagerService Design
 */

import type { IAgentInstance } from './agent-instance.interface.js';
import type { AgentFilter, CreateAgentParams } from './types.js';

export interface IAgentManagerService {
  /** Create a fresh agent with no prior session. */
  getNew(params: CreateAgentParams): IAgentInstance;

  /**
   * Get or create an agent that continues an existing session.
   *
   * **Same-instance guarantee (MUST):** Implementations MUST return the
   * same object reference (`===` equality) for repeated calls with the
   * same `sessionId`. This ensures multiple consumers (UI, CLI, orchestrator)
   * share one in-memory instance — event handlers, status, and metadata
   * remain cohesive.
   *
   * If no instance exists for this session, a new one is created with the
   * session ID pre-set so the next `run()` resumes from that session.
   */
  getWithSessionId(sessionId: string, params: CreateAgentParams): IAgentInstance;

  /** Get a specific agent by ID. Returns `null` if not found. */
  getAgent(agentId: string): IAgentInstance | null;

  /** Get all agents, optionally filtered by type or workspace. */
  getAgents(filter?: AgentFilter): IAgentInstance[];

  /**
   * Terminate and remove an agent from the registry.
   * Cleans up both the agents map and the session index.
   */
  terminateAgent(agentId: string): Promise<boolean>;

  /**
   * Initialize the manager. No-op in the base implementation.
   * Subclasses or wrappers may load persisted state.
   */
  initialize(): Promise<void>;
}
