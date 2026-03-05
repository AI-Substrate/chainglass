/**
 * Plan 019: Agent Manager Refactor - Agent Instance Interface
 *
 * AgentInstance is the self-contained representation of a running agent.
 * It wraps IAgentAdapter, manages status transitions, intent, and event history.
 *
 * Per spec AC-06, AC-07, AC-07a, AC-08, AC-09, AC-10, AC-11, AC-12.
 * Per DYK-01: Receives adapterFactory, not concrete adapter.
 * Per DYK-02: Status is 'working'|'stopped'|'error' (3 states).
 */

import type { AgentEvent, AgentResult, IAgentAdapter } from '../../interfaces/index.js';

/**
 * Agent type determines which adapter to use.
 *
 * Per Invariant #4: These three types are supported.
 */
export type AgentType = 'claude-code' | 'copilot' | 'copilot-cli';

/**
 * Agent instance status values.
 *
 * Per DYK-02/Invariant #1: Status state machine is:
 * stopped → working → stopped|error
 *
 * 3 states only - 'question' was removed as there's no trigger mechanism.
 */
export type AgentInstanceStatus = 'working' | 'stopped' | 'error';

/**
 * Factory function type for creating adapters.
 *
 * Per DYK-01/Invariant #5: AgentInstance receives a factory function
 * that creates adapters based on type. This enables:
 * - Injecting FakeAgentAdapter for tests
 * - Future agent types without changing AgentInstance
 */
export type AdapterFactory = (type: AgentType, config?: AdapterFactoryConfig) => IAgentAdapter;

/** Optional configuration passed to adapter factory during agent creation. */
export interface AdapterFactoryConfig {
  /** tmux target for copilot-cli (e.g. "studio:1.0") */
  tmuxTarget?: string;
  /** Default session ID for copilot-cli */
  defaultSessionId?: string;
}

/**
 * Options for running a prompt on an agent.
 */
export interface AgentRunOptions {
  /** The prompt to execute */
  prompt: string;
  /** Working directory for the agent (optional) */
  cwd?: string;
}

/**
 * Options for incremental event fetching.
 *
 * Per AC-10: Supports fetching events since a specific event ID.
 */
export interface GetEventsOptions {
  /** Fetch events after this event ID */
  sinceId?: string;
}

/**
 * Agent event with unique ID for incremental fetching.
 *
 * Uses intersection type per PL-14: AgentStoredEvent union type pattern.
 * AgentEvent is a discriminated union, so we use intersection to add eventId.
 */
export type AgentStoredEvent = AgentEvent & {
  /** Unique event identifier for incremental fetching */
  eventId: string;
};

/**
 * Agent instance interface - self-contained agent representation.
 *
 * Per spec: Wraps IAgentAdapter, manages status, intent, and events.
 *
 * Implementations:
 * - AgentInstance: Real implementation
 * - FakeAgentInstance: Test double with state setup helpers
 */
export interface IAgentInstance {
  // ===== Properties (AC-06) =====

  /** Unique agent identifier */
  readonly id: string;
  /** Human-readable agent name */
  readonly name: string;
  /** Agent type (determines adapter) */
  readonly type: AgentType;
  /** Workspace path this agent is associated with */
  readonly workspace: string;
  /** Current status (per DYK-02: working|stopped|error) */
  readonly status: AgentInstanceStatus;
  /** Current intent/action being performed */
  readonly intent: string;
  /** Adapter session ID (per AC-12) */
  readonly sessionId: string | null;
  /** Timestamp when agent was created */
  readonly createdAt: Date;
  /** Timestamp when agent was last updated */
  readonly updatedAt: Date;

  // ===== Methods =====

  /**
   * Run a prompt on this agent.
   *
   * @param options - Run options including prompt and optional cwd
   * @returns Promise resolving to AgentResult
   * @throws Error if agent is already running (AC-07a double-run guard)
   *
   * Per AC-07: Uses IAgentAdapter for execution
   * Per AC-07a: Guards against double-run
   * Per AC-08: Updates intent during execution
   */
  run(options: AgentRunOptions): Promise<AgentResult>;

  /**
   * Terminate the running agent.
   *
   * @returns Promise resolving to AgentResult with status='killed'
   *
   * Per AC-11: Can be terminated
   */
  terminate(): Promise<AgentResult>;

  /**
   * Get event history for this agent.
   *
   * @param options - Optional filter for incremental fetching
   * @returns Array of events (all or since sinceId)
   *
   * Per AC-09: Provides event history
   * Per AC-10: Supports incremental event fetching
   */
  getEvents(options?: GetEventsOptions): AgentStoredEvent[];

  /**
   * Update the agent's intent.
   *
   * @param intent - New intent string
   *
   * Per AC-08: Intent can be updated during execution
   */
  setIntent(intent: string): void;
}
