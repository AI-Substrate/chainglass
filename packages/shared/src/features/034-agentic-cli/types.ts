/**
 * Plan 034: Agentic CLI — Supporting Types
 *
 * Type definitions for the redesigned AgentInstance and AgentManagerService.
 * These are instance-level types. For adapter-level types (AgentRunOptions with
 * sessionId, AgentResult, AgentEvent), see `../../interfaces/agent-types.js`.
 */

import type { IAgentAdapter } from '../../interfaces/agent-adapter.interface.js';
import type { AgentEvent, AgentResult } from '../../interfaces/agent-types.js';

// Re-export shared types consumed by the 034 interfaces
export type { AgentEvent, AgentResult };
export type { AgentEventHandler } from '../../interfaces/agent-types.js';

/** Supported agent runtime types. */
export type AgentType = 'claude-code' | 'copilot' | 'copilot-cli';

/** Three-state status model for AgentInstance. */
export type AgentInstanceStatus = 'working' | 'stopped' | 'error';

/**
 * Identity and settings for creating an AgentInstance.
 *
 * This is pure data (serializable). The adapter dependency is passed as a
 * separate constructor parameter — not part of the config.
 */
export interface AgentInstanceConfig {
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;
  readonly workspace: string;
  readonly sessionId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Parameters for creating a new agent via AgentManagerService.
 *
 * Unlike AgentInstanceConfig, this does not include `id` — the manager
 * generates IDs internally.
 */
export interface CreateAgentParams {
  readonly name: string;
  readonly type: AgentType;
  readonly workspace: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Instance-level run options.
 *
 * Unlike the adapter-level `AgentRunOptions` in `interfaces/agent-types.ts`,
 * this does NOT include `sessionId` (the instance owns it) and adds
 * `timeoutMs` for timeout enforcement (Discovery 09).
 */
export interface AgentRunOptions {
  readonly prompt: string;
  readonly cwd?: string;
  readonly onEvent?: (event: AgentEvent) => void;
  readonly timeoutMs?: number;
}

/**
 * Options for the compact operation.
 *
 * Added per DYK-P5#1: compact runs 30-120s with real agents and needs
 * the same timeout parity as run().
 */
export interface AgentCompactOptions {
  readonly timeoutMs?: number;
}

/** Filter criteria for querying agents from the manager. */
export interface AgentFilter {
  readonly type?: AgentType;
  readonly workspace?: string;
}

/** Factory function that creates an adapter for the given agent type. */
export type AdapterFactory = (type: AgentType) => IAgentAdapter;
