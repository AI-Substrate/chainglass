/**
 * Agent session adapter for per-worktree session storage.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per DYK-P3-01: Calls `super(fs, pathResolver)` in constructor; uses `this.fs` for I/O.
 * Per DYK-P3-02: Adapter owns updatedAt - overwrites on every save.
 * Per DYK-03 (Phase 3): Uses subfolder storage for atomic delete and future extensibility.
 *
 * Storage location: `<ctx.worktreePath>/.chainglass/data/agents/<id>/session.json`
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
   * Override getEntityPath to use subfolder storage.
   * Per DYK-03 (Phase 3): Sessions stored at `<domain>/<id>/session.json` for atomic delete.
   *
   * @param ctx - Workspace context
   * @param id - Session ID
   * @returns Path to session.json inside the session's directory
   */
  protected override getEntityPath(ctx: WorkspaceContext, id: string): string {
    return this.pathResolver.join(this.getDomainPath(ctx), id, 'session.json');
  }

  /**
   * Get the session directory path.
   * Used for atomic delete (removing entire folder).
   *
   * @param ctx - Workspace context
   * @param sessionId - Session ID
   * @returns Path to the session directory (without session.json)
   */
  protected getSessionDir(ctx: WorkspaceContext, sessionId: string): string {
    return this.pathResolver.join(this.getDomainPath(ctx), sessionId);
  }

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
   * Per DYK-03 (Phase 3): Creates session directory at `<domain>/<id>/`
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

    // Ensure domain directory exists (e.g., .chainglass/data/agents/)
    const structureResult = await this.ensureStructure(ctx);
    if (!structureResult.ok) {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: structureResult.errorMessage || 'Failed to create storage directory',
      };
    }

    // Ensure session directory exists (e.g., .chainglass/data/agents/<id>/)
    const sessionDir = this.getSessionDir(ctx, session.id);
    try {
      const dirExists = await this.fs.exists(sessionDir);
      if (!dirExists) {
        await this.fs.mkdir(sessionDir, { recursive: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: `Failed to create session directory: ${message}`,
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
   * Per DYK-03 (Phase 3): Looks for subdirectories with session.json inside.
   *
   * @param ctx - Workspace context (determines storage location)
   * @returns Array of all sessions (empty if none or directory doesn't exist)
   */
  async list(ctx: WorkspaceContext): Promise<AgentSession[]> {
    const files = await this.listSessionFiles(ctx);
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
   * List all session.json files in the domain directory.
   * Per DYK-03 (Phase 3): Sessions are stored in subdirectories.
   *
   * @param ctx - Workspace context
   * @returns Array of paths to session.json files
   */
  private async listSessionFiles(ctx: WorkspaceContext): Promise<string[]> {
    const domainPath = this.getDomainPath(ctx);
    const sessionFiles: string[] = [];

    try {
      const exists = await this.fs.exists(domainPath);
      if (!exists) {
        return [];
      }

      // List all entries in domain directory (session subdirectories)
      const entries = await this.fs.readDir(domainPath);

      for (const entry of entries) {
        // Each entry should be a session directory
        const sessionDir = this.pathResolver.join(domainPath, entry);
        const sessionFile = this.pathResolver.join(sessionDir, 'session.json');

        // Check if session.json exists in the subdirectory
        const fileExists = await this.fs.exists(sessionFile);
        if (fileExists) {
          sessionFiles.push(sessionFile);
        }
      }
    } catch {
      // Return empty array on any error
    }

    return sessionFiles;
  }

  /**
   * Remove a session from per-worktree storage.
   * Per DYK-03 (Phase 3): Deletes entire session directory for atomic delete.
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

    // Delete entire session directory (atomic delete)
    const sessionDir = this.getSessionDir(ctx, sessionId);
    try {
      const exists = await this.fs.exists(sessionDir);
      if (!exists) {
        return {
          ok: false,
          errorCode: AgentSessionErrorCodes.SESSION_NOT_FOUND,
          errorMessage: `Agent session '${sessionId}' not found`,
        };
      }

      // Remove directory and all contents
      await this.fs.rmdir(sessionDir, { recursive: true });
      return { ok: true };
    } catch {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.SESSION_NOT_FOUND,
        errorMessage: `Agent session '${sessionId}' not found`,
      };
    }
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
