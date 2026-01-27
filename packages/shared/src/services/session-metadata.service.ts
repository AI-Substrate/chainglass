/**
 * Session Metadata Service
 *
 * CRUD operations for session metadata.json files.
 * Stores metadata in: <baseDir>/<sessionId>/metadata.json
 *
 * Per Phase 3 workshop: notification-fetch pattern with server-side storage.
 * This service manages session identity, status, and configuration.
 * Event data is handled separately by EventStorageService.
 *
 * Storage Structure:
 * .chainglass/workspaces/default/sessions/
 *   sess-123/
 *     metadata.json     <- This service
 *     events.ndjson     <- EventStorageService
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 3)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { validateSessionId } from '../lib/validators/session-id-validator.js';
import {
  type SessionMetadata,
  type SessionMetadataCreate,
  SessionMetadataSchema,
  type SessionMetadataUpdate,
} from '../schemas/session-metadata.schema.js';

/**
 * Generates a session ID.
 * Format: sess-<timestamp>-<random>
 */
function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `sess-${timestamp}-${random}`;
}

/**
 * Interface for session metadata storage operations.
 */
export interface ISessionMetadataStorage {
  /** Create a new session with metadata */
  create(data: SessionMetadataCreate): Promise<SessionMetadata>;

  /** Get session metadata by ID */
  get(sessionId: string): Promise<SessionMetadata | null>;

  /** Update session metadata (partial update) */
  update(sessionId: string, data: SessionMetadataUpdate): Promise<SessionMetadata>;

  /** Delete session metadata (and optionally events) */
  delete(sessionId: string, deleteEvents?: boolean): Promise<void>;

  /** Check if session exists */
  exists(sessionId: string): Promise<boolean>;

  /** List all sessions (metadata only) */
  list(): Promise<SessionMetadata[]>;
}

/**
 * Session Metadata Service implementation.
 *
 * Uses Node.js fs/promises directly for file operations.
 * Validates all data against Zod schemas.
 *
 * Directory structure (same as EventStorageService):
 * ```
 * <baseDir>/
 *   <sessionId>/
 *     metadata.json
 *     events.ndjson
 * ```
 */
export class SessionMetadataService implements ISessionMetadataStorage {
  private readonly _baseDir: string;

  /**
   * Create a SessionMetadataService.
   *
   * @param baseDir Base directory for session storage
   *   Production: .chainglass/workspaces/default/sessions/
   *   Tests: Temp directory
   */
  constructor(baseDir: string) {
    this._baseDir = baseDir;
  }

  /**
   * Get the metadata file path for a session.
   */
  private _getMetadataPath(sessionId: string): string {
    return path.join(this._baseDir, sessionId, 'metadata.json');
  }

  async create(data: SessionMetadataCreate): Promise<SessionMetadata> {
    const sessionId = generateSessionId();
    const now = new Date().toISOString();

    const metadata: SessionMetadata = {
      id: sessionId,
      name: data.name,
      agentType: data.agentType,
      agentSessionId: data.agentSessionId,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
    };

    // Validate against schema
    SessionMetadataSchema.parse(metadata);

    const metadataPath = this._getMetadataPath(sessionId);
    const sessionDir = path.dirname(metadataPath);

    // Ensure session directory exists
    await fs.mkdir(sessionDir, { recursive: true });

    // Write metadata file
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    return metadata;
  }

  async get(sessionId: string): Promise<SessionMetadata | null> {
    validateSessionId(sessionId);

    const metadataPath = this._getMetadataPath(sessionId);

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const data = JSON.parse(content);
      return SessionMetadataSchema.parse(data);
    } catch (error: unknown) {
      // File doesn't exist - return null
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async update(sessionId: string, data: SessionMetadataUpdate): Promise<SessionMetadata> {
    validateSessionId(sessionId);

    const existing = await this.get(sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const updated: SessionMetadata = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    // Validate against schema
    SessionMetadataSchema.parse(updated);

    const metadataPath = this._getMetadataPath(sessionId);
    await fs.writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf-8');

    return updated;
  }

  async delete(sessionId: string, deleteEvents = false): Promise<void> {
    validateSessionId(sessionId);

    const metadataPath = this._getMetadataPath(sessionId);

    if (deleteEvents) {
      // Delete entire session directory (metadata + events)
      const sessionDir = path.dirname(metadataPath);
      await fs.rm(sessionDir, { recursive: true, force: true });
    } else {
      // Only delete metadata file
      await fs.unlink(metadataPath);
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    validateSessionId(sessionId);

    const metadataPath = this._getMetadataPath(sessionId);

    try {
      const stat = await fs.stat(metadataPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async list(): Promise<SessionMetadata[]> {
    const sessions: SessionMetadata[] = [];

    try {
      const entries = await fs.readdir(this._baseDir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip non-directories and archived folder
        if (!entry.isDirectory() || entry.name === 'archived') {
          continue;
        }

        const metadata = await this.get(entry.name);
        if (metadata) {
          sessions.push(metadata);
        }
      }
    } catch (error: unknown) {
      // Base directory doesn't exist - return empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    // Sort by createdAt descending (newest first)
    return sessions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}
