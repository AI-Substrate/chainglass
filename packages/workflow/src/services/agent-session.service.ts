/**
 * AgentSessionService implementation for managing agent session operations.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per Discovery 06: Service depends on interface (IAgentSessionAdapter), never concrete adapter.
 * Per Discovery 18: Session ID uses timestamp + UUIDv4 short suffix for collision prevention.
 *
 * This service provides the business logic layer for agent session operations:
 * - createSession: Create a new session with generated ID
 * - getSession: Get a session by ID
 * - listSessions: Get all sessions in a workspace context
 * - deleteSession: Remove a session by ID
 * - updateSessionStatus: Update session status
 *
 * All methods require a WorkspaceContext to determine storage location.
 * Per ADR-0004: Uses constructor injection for testability.
 */

import { randomUUID } from 'node:crypto';

import { AgentSession } from '../entities/agent-session.js';
import type { AgentSessionInput } from '../entities/agent-session.js';
import { AgentSessionErrors } from '../errors/agent-errors.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import type { IAgentSessionAdapter } from '../interfaces/agent-session-adapter.interface.js';
import type {
  CreateSessionResult,
  DeleteSessionResult,
  IAgentSessionService,
  UpdateSessionStatusResult,
} from '../interfaces/agent-session-service.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';

/**
 * AgentSessionService implements agent session management.
 *
 * Per ADR-0004: Uses constructor injection for all dependencies.
 */
export class AgentSessionService implements IAgentSessionService {
  constructor(private readonly adapter: IAgentSessionAdapter) {}

  /**
   * Generate a unique session ID.
   *
   * Per Discovery 18: Uses timestamp + UUIDv4 short suffix.
   * Format: `<timestamp>-<uuid_first_8_chars>`
   * Example: `1738123456789-abc12345`
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const uuidSuffix = randomUUID().split('-')[0]; // First 8 chars of UUID
    return `${timestamp}-${uuidSuffix}`;
  }

  /**
   * Create a new agent session.
   *
   * Generates a unique session ID using timestamp + UUID suffix.
   */
  async createSession(
    ctx: WorkspaceContext,
    type: AgentSessionInput['type']
  ): Promise<CreateSessionResult> {
    // Generate unique session ID
    const sessionId = this.generateSessionId();

    // Create session entity
    const session = AgentSession.create({
      id: sessionId,
      type,
      status: 'active',
    });

    // Save to adapter
    const saveResult = await this.adapter.save(ctx, session);
    if (!saveResult.ok) {
      return {
        success: false,
        errors: [
          {
            code: saveResult.errorCode ?? 'E092',
            message: saveResult.errorMessage ?? 'Unknown error',
            action: 'Check the error message',
            path: `${ctx.worktreePath}/.chainglass/data/agents`,
          },
        ],
      };
    }

    return { success: true, session: saveResult.session, errors: [] };
  }

  /**
   * Get a session by ID.
   */
  async getSession(ctx: WorkspaceContext, sessionId: string): Promise<AgentSession | null> {
    try {
      return await this.adapter.load(ctx, sessionId);
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all sessions in a workspace context.
   * Returns sessions ordered by createdAt descending (newest first).
   */
  async listSessions(ctx: WorkspaceContext): Promise<AgentSession[]> {
    return this.adapter.list(ctx);
  }

  /**
   * Delete a session by ID.
   */
  async deleteSession(ctx: WorkspaceContext, sessionId: string): Promise<DeleteSessionResult> {
    const result = await this.adapter.remove(ctx, sessionId);

    if (!result.ok) {
      return {
        success: false,
        errors: [
          AgentSessionErrors.notFound(sessionId, `${ctx.worktreePath}/.chainglass/data/agents`),
        ],
      };
    }

    return { success: true, deletedId: sessionId, errors: [] };
  }

  /**
   * Update a session's status.
   */
  async updateSessionStatus(
    ctx: WorkspaceContext,
    sessionId: string,
    status: AgentSessionInput['status']
  ): Promise<UpdateSessionStatusResult> {
    // Load existing session
    const existingSession = await this.getSession(ctx, sessionId);
    if (!existingSession) {
      return {
        success: false,
        errors: [
          AgentSessionErrors.notFound(sessionId, `${ctx.worktreePath}/.chainglass/data/agents`),
        ],
      };
    }

    // Create updated session with new status
    const updatedSession = AgentSession.create({
      id: existingSession.id,
      type: existingSession.type,
      status,
      createdAt: existingSession.createdAt,
      // updatedAt will be set by adapter
    });

    // Save to adapter
    const saveResult = await this.adapter.save(ctx, updatedSession);
    if (!saveResult.ok) {
      return {
        success: false,
        errors: [
          {
            code: saveResult.errorCode ?? 'E092',
            message: saveResult.errorMessage ?? 'Unknown error',
            action: 'Check the error message',
            path: `${ctx.worktreePath}/.chainglass/data/agents`,
          },
        ],
      };
    }

    return { success: true, session: saveResult.session, errors: [] };
  }
}
