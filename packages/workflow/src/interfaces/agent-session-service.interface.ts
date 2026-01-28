/**
 * Agent Session Service interface.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per Discovery 06: Service depends on interface (IAgentSessionAdapter), never concrete adapter.
 *
 * This service provides the business logic layer for agent session operations:
 * - createSession: Create a new session with generated ID
 * - getSession: Get a session by ID
 * - listSessions: Get all sessions in a workspace context
 * - deleteSession: Remove a session by ID
 * - updateSessionStatus: Update session status
 *
 * All methods require a WorkspaceContext to determine storage location.
 */

import type { AgentSession, AgentSessionInput } from '../entities/agent-session.js';
import type { AgentSessionError } from '../errors/agent-errors.js';
import type { WorkspaceContext } from './workspace-context.interface.js';

/**
 * Result type for session creation operations.
 */
export interface CreateSessionResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The created session if successful */
  session?: AgentSession;
  /** Errors if operation failed */
  errors: AgentSessionError[];
}

/**
 * Result type for session deletion operations.
 */
export interface DeleteSessionResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The deleted session ID if successful */
  deletedId?: string;
  /** Errors if operation failed */
  errors: AgentSessionError[];
}

/**
 * Result type for session status update operations.
 */
export interface UpdateSessionStatusResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The updated session if successful */
  session?: AgentSession;
  /** Errors if operation failed */
  errors: AgentSessionError[];
}

/**
 * Service interface for agent session operations.
 *
 * Per ADR-0004: Uses constructor injection for testability.
 */
export interface IAgentSessionService {
  /**
   * Create a new agent session.
   *
   * Generates a unique session ID using timestamp + UUID suffix.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param type - Agent type ('claude' or 'copilot')
   * @returns CreateSessionResult with session if successful
   */
  createSession(
    ctx: WorkspaceContext,
    type: AgentSessionInput['type']
  ): Promise<CreateSessionResult>;

  /**
   * Get a session by ID.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID
   * @returns AgentSession if found, null if not found
   */
  getSession(ctx: WorkspaceContext, sessionId: string): Promise<AgentSession | null>;

  /**
   * List all sessions in a workspace context.
   * Returns sessions ordered by createdAt descending (newest first).
   *
   * @param ctx - Workspace context (determines storage location)
   * @returns Array of all sessions
   */
  listSessions(ctx: WorkspaceContext): Promise<AgentSession[]>;

  /**
   * Delete a session by ID.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID to delete
   * @returns DeleteSessionResult
   */
  deleteSession(ctx: WorkspaceContext, sessionId: string): Promise<DeleteSessionResult>;

  /**
   * Update a session's status.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID to update
   * @param status - New status
   * @returns UpdateSessionStatusResult
   */
  updateSessionStatus(
    ctx: WorkspaceContext,
    sessionId: string,
    status: AgentSessionInput['status']
  ): Promise<UpdateSessionStatusResult>;
}
