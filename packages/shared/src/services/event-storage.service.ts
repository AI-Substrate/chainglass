/**
 * Event Storage Service
 *
 * NDJSON-based event storage for agent sessions.
 * Stores events in: <baseDir>/<sessionId>/events.ndjson
 *
 * Per DYK-01: Uses timestamp-based event IDs to avoid race conditions.
 * Per DYK-02: Validates sessionId to prevent path traversal.
 * Per DYK-04: Silently skips malformed NDJSON lines on read.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ArchiveOptions,
  IEventStorage,
  StoredEvent,
} from '../interfaces/event-storage.interface.js';
import { validateSessionId } from '../lib/validators/session-id-validator.js';
import type { AgentStoredEvent } from '../schemas/agent-event.schema.js';

/**
 * Generates a timestamp-based event ID.
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx
 *
 * Per DYK-01: Timestamp-based IDs avoid race conditions and are naturally ordered.
 */
function generateEventId(): string {
  const timestamp = new Date().toISOString();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return `${timestamp}_${randomSuffix}`;
}

/**
 * Event Storage Service implementation.
 *
 * Uses Node.js fs/promises directly for file operations.
 * Events are stored as NDJSON (newline-delimited JSON) files.
 *
 * Directory structure:
 * ```
 * <baseDir>/
 *   <sessionId>/
 *     events.ndjson
 *   archived/
 *     <sessionId>/
 *       events.ndjson
 * ```
 */
export class EventStorageService implements IEventStorage {
  private readonly _baseDir: string;

  /**
   * Create an EventStorageService.
   *
   * @param baseDir Base directory for event storage
   *   Production: .chainglass/workspaces/default/data/
   *   Tests: Temp directory
   */
  constructor(baseDir: string) {
    this._baseDir = baseDir;
  }

  /**
   * Get the events file path for a session.
   */
  private _getEventsPath(sessionId: string): string {
    return path.join(this._baseDir, sessionId, 'events.ndjson');
  }

  /**
   * Get the archived events file path for a session.
   */
  private _getArchivedPath(sessionId: string): string {
    return path.join(this._baseDir, 'archived', sessionId, 'events.ndjson');
  }

  async append(sessionId: string, event: AgentStoredEvent): Promise<StoredEvent> {
    // Validate sessionId to prevent path traversal (DYK-02)
    validateSessionId(sessionId);

    const eventsPath = this._getEventsPath(sessionId);
    const sessionDir = path.dirname(eventsPath);

    // Ensure session directory exists
    await fs.mkdir(sessionDir, { recursive: true });

    // Create stored event with generated ID
    const storedEvent: StoredEvent = {
      ...event,
      id: generateEventId(),
    };

    // Append to NDJSON file
    const line = `${JSON.stringify(storedEvent)}\n`;
    await fs.appendFile(eventsPath, line, 'utf-8');

    return storedEvent;
  }

  async getAll(sessionId: string): Promise<StoredEvent[]> {
    const eventsPath = this._getEventsPath(sessionId);

    try {
      const content = await fs.readFile(eventsPath, 'utf-8');
      return this._parseNdjson(content);
    } catch (error: unknown) {
      // File or directory doesn't exist - return empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async getSince(sessionId: string, sinceId: string): Promise<StoredEvent[]> {
    const events = await this.getAll(sessionId);

    const sinceIndex = events.findIndex((e) => e.id === sinceId);
    if (sinceIndex === -1) {
      throw new Error(`Event ID not found: ${sinceId}`);
    }

    // Return events AFTER the sinceId (exclusive)
    return events.slice(sinceIndex + 1);
  }

  async archive(sessionId: string, options?: ArchiveOptions): Promise<void> {
    const eventsPath = this._getEventsPath(sessionId);
    const archivedPath = this._getArchivedPath(sessionId);
    const archivedDir = path.dirname(archivedPath);

    // Create archived directory
    await fs.mkdir(archivedDir, { recursive: true });

    // Copy to archived location
    await fs.copyFile(eventsPath, archivedPath);

    // Delete original if requested (default: true)
    if (options?.deleteAfterArchive !== false) {
      const sessionDir = path.dirname(eventsPath);
      await fs.rm(sessionDir, { recursive: true, force: true });
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    const eventsPath = this._getEventsPath(sessionId);

    try {
      const stat = await fs.stat(eventsPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Parse NDJSON content into events.
   * Per DYK-04: Silently skips malformed lines.
   */
  private _parseNdjson(content: string): StoredEvent[] {
    const events: StoredEvent[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue; // Skip empty lines

      try {
        const event = JSON.parse(trimmed) as StoredEvent;
        events.push(event);
      } catch {
        // Per DYK-04: Silently skip malformed lines
        // In production, we could log this, but for now we just skip
      }
    }

    return events;
  }
}
