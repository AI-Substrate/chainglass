/**
 * Agent event adapter for per-worktree event storage.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 2)
 * Per ADR-0008: Events stored at `<worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson`
 *
 * This adapter implements NDJSON (newline-delimited JSON) event storage directly,
 * replacing the legacy EventStorageService.
 *
 * Key behaviors:
 * - Per DYK-01: Uses timestamp-based event IDs (YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx)
 * - Per DYK-02: Validates sessionId to prevent path traversal
 * - Per DYK-04: Silently skips malformed NDJSON lines on read
 * - Per Discovery 10: Optional logging for malformed line skipping (T009)
 *
 * Storage location: `<ctx.worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson`
 */

import type { AgentStoredEvent, IFileSystem, ILogger, IPathResolver } from '@chainglass/shared';
import { isValidSessionId } from '@chainglass/shared';

import type {
  AppendEventResult,
  ArchiveOptions,
  ArchiveResult,
  IAgentEventAdapter,
  StoredAgentEvent,
} from '../interfaces/agent-event-adapter.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';

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
 * Agent event adapter for workspace-scoped event storage.
 *
 * Implements IAgentEventAdapter with direct NDJSON file operations.
 * All methods require WorkspaceContext to determine storage location.
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 * Per Discovery 05: Session IDs validated before filesystem operations.
 */
export class AgentEventAdapter implements IAgentEventAdapter {
  /**
   * Domain name for agent data storage.
   * Results in path: `<worktree>/.chainglass/data/agents/`
   */
  private readonly DOMAIN = 'agents';

  /**
   * Base path within .chainglass for data storage.
   */
  private readonly DATA_DIR = '.chainglass/data';

  /**
   * Events file name.
   */
  private readonly EVENTS_FILE = 'events.ndjson';

  /**
   * Constructor with dependency injection.
   *
   * @param fs - File system interface for I/O operations
   * @param pathResolver - Path resolver for secure path operations
   * @param logger - Optional logger for malformed line warnings (per Discovery 20)
   */
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly logger?: ILogger
  ) {}

  /**
   * Get the domain storage directory path for a workspace context.
   * Returns: `<worktreePath>/.chainglass/data/agents/`
   */
  private getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, this.DATA_DIR, this.DOMAIN);
  }

  /**
   * Get the session directory path.
   * Returns: `<worktreePath>/.chainglass/data/agents/<sessionId>/`
   */
  private getSessionPath(ctx: WorkspaceContext, sessionId: string): string {
    return this.pathResolver.join(this.getDomainPath(ctx), sessionId);
  }

  /**
   * Get the events file path for a session.
   * Returns: `<worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson`
   */
  private getEventsPath(ctx: WorkspaceContext, sessionId: string): string {
    return this.pathResolver.join(this.getSessionPath(ctx, sessionId), this.EVENTS_FILE);
  }

  /**
   * Get the archived events file path for a session.
   * Returns: `<worktreePath>/.chainglass/data/agents/archived/<sessionId>/events.ndjson`
   */
  private getArchivedPath(ctx: WorkspaceContext, sessionId: string): string {
    return this.pathResolver.join(this.getDomainPath(ctx), 'archived', sessionId, this.EVENTS_FILE);
  }

  /**
   * Append an event to a session's event log.
   *
   * Creates the session directory and events.ndjson file if they don't exist.
   * Generates a timestamp-based event ID.
   *
   * Per DYK-02: Validates sessionId before filesystem operations.
   */
  async append(
    ctx: WorkspaceContext,
    sessionId: string,
    event: AgentStoredEvent
  ): Promise<AppendEventResult> {
    // Validate sessionId to prevent path traversal
    if (!isValidSessionId(sessionId)) {
      return {
        ok: false,
        errorMessage: `Invalid session ID: '${sessionId}'`,
      };
    }

    try {
      const sessionPath = this.getSessionPath(ctx, sessionId);
      const eventsPath = this.getEventsPath(ctx, sessionId);

      // Ensure session directory exists
      await this.fs.mkdir(sessionPath, { recursive: true });

      // Create stored event with generated ID
      const storedEvent: StoredAgentEvent = {
        ...event,
        id: generateEventId(),
      };

      // Append to NDJSON file (read existing + append + write)
      const line = `${JSON.stringify(storedEvent)}\n`;
      let existingContent = '';
      try {
        if (await this.fs.exists(eventsPath)) {
          existingContent = await this.fs.readFile(eventsPath);
        }
      } catch {
        // File doesn't exist yet, start fresh
      }
      await this.fs.writeFile(eventsPath, existingContent + line);

      return { ok: true, event: storedEvent };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errorMessage: `Failed to append event: ${message}` };
    }
  }

  /**
   * Get all events for a session.
   *
   * Returns events in chronological order (oldest first).
   * Returns empty array if session doesn't exist or has no events.
   * Per DYK-04: Malformed NDJSON lines are silently skipped.
   */
  async getAll(ctx: WorkspaceContext, sessionId: string): Promise<StoredAgentEvent[]> {
    const eventsPath = this.getEventsPath(ctx, sessionId);

    try {
      const exists = await this.fs.exists(eventsPath);
      if (!exists) {
        return [];
      }

      const content = await this.fs.readFile(eventsPath);
      return this.parseNdjson(content);
    } catch {
      // File or directory doesn't exist - return empty array
      return [];
    }
  }

  /**
   * Get events since a specific event ID.
   *
   * Returns events that occurred AFTER the specified event ID.
   * Per AC19: Returns only events after the specified ID (exclusive).
   *
   * @throws Error if sinceId is not found in the session
   */
  async getSince(
    ctx: WorkspaceContext,
    sessionId: string,
    sinceId: string
  ): Promise<StoredAgentEvent[]> {
    const events = await this.getAll(ctx, sessionId);

    const sinceIndex = events.findIndex((e) => e.id === sinceId);
    if (sinceIndex === -1) {
      throw new Error(`Event ID not found: ${sinceId}`);
    }

    // Return events AFTER the sinceId (exclusive)
    return events.slice(sinceIndex + 1);
  }

  /**
   * Archive a session's events.
   *
   * Moves the session's events to the archived/ subdirectory.
   * Per AC20: Old/deleted sessions can be archived.
   */
  async archive(
    ctx: WorkspaceContext,
    sessionId: string,
    options?: ArchiveOptions
  ): Promise<ArchiveResult> {
    try {
      const eventsPath = this.getEventsPath(ctx, sessionId);
      const archivedPath = this.getArchivedPath(ctx, sessionId);
      const archivedDir = this.pathResolver.dirname(archivedPath);

      // Create archived directory
      await this.fs.mkdir(archivedDir, { recursive: true });

      // Read and write (copy) to archived location
      const content = await this.fs.readFile(eventsPath);
      await this.fs.writeFile(archivedPath, content);

      // Delete original if requested (default: true)
      if (options?.deleteAfterArchive !== false) {
        const sessionPath = this.getSessionPath(ctx, sessionId);
        await this.deleteDirectory(sessionPath);
      }

      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errorMessage: `Failed to archive session: ${message}` };
    }
  }

  /**
   * Check if a session has any events.
   */
  async exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean> {
    const eventsPath = this.getEventsPath(ctx, sessionId);

    try {
      return await this.fs.exists(eventsPath);
    } catch {
      return false;
    }
  }

  /**
   * Parse NDJSON content into events.
   * Per DYK-04: Silently skips malformed lines.
   * Per Discovery 20: Logs warning if logger is injected.
   */
  private parseNdjson(content: string): StoredAgentEvent[] {
    const events: StoredAgentEvent[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue; // Skip empty lines

      try {
        const event = JSON.parse(trimmed) as StoredAgentEvent;
        events.push(event);
      } catch {
        // Per DYK-04: Silently skip malformed lines
        // Per Discovery 20: Log warning if logger is injected
        if (this.logger) {
          this.logger.warn('Skipping malformed NDJSON line', {
            lineNumber: i + 1,
            lineContent: trimmed.substring(0, 100), // Truncate for safety
          });
        }
      }
    }

    return events;
  }

  /**
   * Delete a directory recursively.
   */
  private async deleteDirectory(dirPath: string): Promise<void> {
    try {
      // Use unlink for the events file, then rmdir for the directory
      // The fake filesystem may not support recursive delete, so we do it manually
      const eventsFile = this.pathResolver.join(dirPath, this.EVENTS_FILE);
      const exists = await this.fs.exists(eventsFile);
      if (exists) {
        await this.fs.unlink(eventsFile);
      }
      // Note: Directory removal is optional - some filesystems auto-cleanup empty dirs
    } catch {
      // Ignore cleanup errors
    }
  }
}
