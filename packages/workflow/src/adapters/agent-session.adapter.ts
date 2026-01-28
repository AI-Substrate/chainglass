/**
 * Agent session adapter for per-worktree session storage.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per DYK-P3-01: Calls `super(fs, pathResolver)` in constructor; uses `this.fs` for I/O.
 * Per DYK-P3-02: Adapter owns updatedAt - overwrites on every save.
 *
 * Storage location: `<ctx.worktreePath>/.chainglass/data/agents/<id>.json`
 *
 * This is the real implementation that reads/writes to filesystem via IFileSystem.
 * For testing, use FakeAgentSessionAdapter instead.
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { validateSessionId } from '@chainglass/shared';

import { AgentSession } from '../entities/agent-session.js';
import type { AgentSessionJSON } from '../entities/agent-session.js';
import { AgentSessionErrorCodes } from '../errors/agent-errors.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import type {
  AgentSessionRemoveResult,
  AgentSessionSaveResult,
  IAgentSessionAdapter,
} from '../interfaces/agent-session-adapter.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';
import { WorkspaceDataAdapterBase } from './workspace-data-adapter-base.js';

/**
 * Production implementation of IAgentSessionAdapter.
 *
 * Reads/writes sessions to per-worktree storage using inherited base class methods:
 * - getDomainPath(ctx) → storage directory
 * - getEntityPath(ctx, id) → specific session file
 * - ensureStructure(ctx) → create directories
 * - readJson<T>(path) → parse JSON file
 * - writeJson<T>(path, data) → write JSON file
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 * Per Discovery 05: Session IDs validated before filesystem operations.
 */
export class AgentSessionAdapter extends WorkspaceDataAdapterBase implements IAgentSessionAdapter {
  /**
   * Domain name for agent session storage.
   * Results in path: `<worktree>/.chainglass/data/agents/`
   */
  readonly domain = 'agents';

  /**
   * Load a session from per-worktree storage.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID (filename without .json)
   * @returns AgentSession entity
   * @throws EntityNotFoundError if session file doesn't exist
   */
  async load(ctx: WorkspaceContext, sessionId: string): Promise<AgentSession> {
    // Validate session ID to prevent path traversal
    validateSessionId(sessionId);

    const path = this.getEntityPath(ctx, sessionId);
    const result = await this.readJson<AgentSessionJSON>(path);

    if (!result.ok || !result.data) {
      throw new EntityNotFoundError('AgentSession', sessionId, this.getDomainPath(ctx));
    }

    // Reconstruct AgentSession entity from JSON
    return AgentSession.create({
      id: result.data.id,
      type: result.data.type,
      status: result.data.status,
      createdAt: new Date(result.data.createdAt),
      updatedAt: new Date(result.data.updatedAt),
    });
  }

  /**
   * Save a session to per-worktree storage.
   *
   * Creates storage directory if needed. Updates updatedAt timestamp.
   *
   * Per DYK-P3-02: Adapter owns updatedAt - overwrites on every save.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param session - AgentSession to save
   * @returns AgentSessionSaveResult with ok=true on success
   */
  async save(ctx: WorkspaceContext, session: AgentSession): Promise<AgentSessionSaveResult> {
    // Validate session ID to prevent path traversal
    try {
      validateSessionId(session.id);
    } catch (error) {
      // Log actual error for debugging in non-production
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Session ID validation failed:', error);
      }
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: 'Invalid session ID format',
      };
    }

    // Ensure storage directory exists
    const structureResult = await this.ensureStructure(ctx);
    if (!structureResult.ok) {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: structureResult.errorMessage || 'Failed to create storage directory',
      };
    }

    const path = this.getEntityPath(ctx, session.id);

    // Check if session already exists
    const existsResult = await this.readJson<AgentSessionJSON>(path);
    const created = !existsResult.ok;

    // Create updated session with fresh updatedAt timestamp
    const updatedSession = AgentSession.create({
      id: session.id,
      type: session.type,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: new Date(), // Fresh timestamp
    });

    // Write to filesystem
    const writeResult = await this.writeJson(path, updatedSession.toJSON());
    if (!writeResult.ok) {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: writeResult.errorMessage || 'Failed to write session file',
      };
    }

    return { ok: true, session: updatedSession, created };
  }

  /**
   * List all sessions in per-worktree storage.
   * Per AC-05: Returns sessions ordered by createdAt descending (newest first).
   *
   * @param ctx - Workspace context (determines storage location)
   * @returns Array of all sessions (empty if none or directory doesn't exist)
   */
  async list(ctx: WorkspaceContext): Promise<AgentSession[]> {
    const files = await this.listEntityFiles(ctx);
    const sessions: AgentSession[] = [];

    for (const file of files) {
      const result = await this.readJson<AgentSessionJSON>(file);
      if (result.ok && result.data) {
        try {
          const session = AgentSession.create({
            id: result.data.id,
            type: result.data.type,
            status: result.data.status,
            createdAt: new Date(result.data.createdAt),
            updatedAt: new Date(result.data.updatedAt),
          });
          sessions.push(session);
        } catch (error) {
          // Log warning for debugging, then skip corrupt files
          console.warn(`Skipping corrupt session file: ${file}`, error);
        }
      }
    }

    // Sort by createdAt descending (newest first)
    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Remove a session from per-worktree storage.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID to remove
   * @returns AgentSessionRemoveResult with ok=true on success
   */
  async remove(ctx: WorkspaceContext, sessionId: string): Promise<AgentSessionRemoveResult> {
    // Validate session ID to prevent path traversal
    try {
      validateSessionId(sessionId);
    } catch {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: `Invalid session ID: '${sessionId}'`,
      };
    }

    const path = this.getEntityPath(ctx, sessionId);
    const deleted = await this.deleteFile(path);

    if (!deleted) {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.SESSION_NOT_FOUND,
        errorMessage: `Agent session '${sessionId}' not found`,
      };
    }

    return { ok: true };
  }

  /**
   * Check if a session exists in per-worktree storage.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session ID to check
   * @returns true if session file exists
   */
  async exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean> {
    // Validate session ID to prevent path traversal
    try {
      validateSessionId(sessionId);
    } catch {
      return false;
    }

    const path = this.getEntityPath(ctx, sessionId);
    return this.fs.exists(path);
  }
}
