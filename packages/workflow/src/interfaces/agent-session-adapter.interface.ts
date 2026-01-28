/**
 * Agent Session Adapter interface for workspace-scoped agent session storage.
 *
 * Per Plan 018: Agent Workspace Data Model Migration
 * Per Plan 014: Follows ISampleAdapter pattern (exemplar)
 *
 * This adapter handles CRUD operations for AgentSession entities stored in per-worktree storage.
 *
 * Storage location: `<worktree>/.chainglass/data/agents/<id>.json`
 *
 * Implementations:
 * - AgentSessionAdapter: Real implementation using IFileSystem
 * - FakeAgentSessionAdapter: Configurable implementation for testing
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 * Per spec Q7: Entities are pure data, adapters handle I/O.
 * Per DYK-P3-02: Adapter overwrites updatedAt on every save.
 */

import type { AgentSession } from '../entities/agent-session.js';
import type { WorkspaceContext } from './workspace-context.interface.js';

/**
 * Error codes for agent session operations (E090-E093).
 *
 * Per Discovery 07: Allocated E090-E093 for Agent domain errors.
 */
export type AgentSessionErrorCode =
  | 'E090' // Agent session not found
  | 'E091' // Agent session already exists
  | 'E092' // Invalid agent session data
  | 'E093'; // Agent event not found (reserved for Phase 2)

/**
 * Result type for agent session adapter save operations.
 */
export interface AgentSessionSaveResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** The saved session with updated timestamp */
  session?: AgentSession;
  /** Whether this was a new creation (true) or update (false) */
  created?: boolean;
  /** Error code if operation failed */
  errorCode?: AgentSessionErrorCode;
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Result type for agent session adapter remove operations.
 */
export interface AgentSessionRemoveResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Error code if operation failed */
  errorCode?: AgentSessionErrorCode;
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Adapter interface for agent session operations.
 *
 * All methods require a WorkspaceContext to determine the storage location.
 * Data is stored in `<ctx.worktreePath>/.chainglass/data/agents/`.
 *
 * Per spec:
 * - Data stored per-worktree for git isolation
 * - No caching - always fresh reads
 * - ensureStructure() creates directories on first write
 */
export interface IAgentSessionAdapter {
  /**
   * Load an agent session from storage by ID.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID (unique identifier)
   * @returns AgentSession if found
   * @throws EntityNotFoundError if session with ID not found
   */
  load(ctx: WorkspaceContext, sessionId: string): Promise<AgentSession>;

  /**
   * Save an agent session to storage.
   *
   * Creates the storage directory if needed. Updates the session's updatedAt timestamp.
   * If session with same ID exists, updates it; otherwise creates new.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param session - AgentSession to save
   * @returns AgentSessionSaveResult with ok=true on success, or error details
   */
  save(ctx: WorkspaceContext, session: AgentSession): Promise<AgentSessionSaveResult>;

  /**
   * List all agent sessions in the workspace context.
   *
   * Returns empty array if no sessions exist or storage directory doesn't exist.
   * Results are ordered by createdAt (newest first).
   *
   * @param ctx - Workspace context (determines storage location)
   * @returns Array of all agent sessions, ordered by createdAt descending
   */
  list(ctx: WorkspaceContext): Promise<AgentSession[]>;

  /**
   * Remove an agent session from storage by ID.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID to remove
   * @returns AgentSessionRemoveResult with ok=true on success, or error details
   */
  remove(ctx: WorkspaceContext, sessionId: string): Promise<AgentSessionRemoveResult>;

  /**
   * Check if an agent session with the given ID exists.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID to check
   * @returns true if session exists, false otherwise
   */
  exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean>;
}
