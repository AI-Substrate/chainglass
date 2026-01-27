/**
 * Event Storage Interface
 *
 * Defines the contract for persisting and retrieving agent events.
 * Events are stored as NDJSON files per session.
 *
 * Path: .chainglass/workspaces/<workspace-slug>/data/<agent-slug>/<session-id>/events.ndjson
 *
 * Per Plan 015 Phase 1: Event-sourced storage for session resumability.
 * Per DYK-01: Uses timestamp-based event IDs to avoid race conditions.
 * Per DYK-04: Malformed NDJSON lines are silently skipped.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */
import type { AgentStoredEvent } from '../schemas/agent-event.schema.js';

/**
 * A stored event with its generated ID.
 * The ID is assigned by the storage service during append().
 */
export type StoredEvent = AgentStoredEvent & {
  /** Unique event ID (timestamp-based: YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx) */
  id: string;
};

/**
 * Options for archiving a session.
 */
export interface ArchiveOptions {
  /** Delete the events after archiving (default: true) */
  deleteAfterArchive?: boolean;
}

/**
 * Event storage service interface.
 *
 * Implementations:
 * - EventStorageService: Real NDJSON file storage
 * - FakeEventStorage: In-memory implementation for testing
 *
 * Usage:
 * ```typescript
 * // Append a new event
 * const stored = await storage.append('session-123', {
 *   type: 'tool_call',
 *   timestamp: new Date().toISOString(),
 *   data: { toolName: 'Bash', input: { command: 'ls' }, toolCallId: 'toolu_123' }
 * });
 * console.log(stored.id); // "2026-01-27T12:00:00.000Z_a7b3c"
 *
 * // Get all events for a session
 * const events = await storage.getAll('session-123');
 *
 * // Get events since a specific ID (for incremental sync)
 * const newEvents = await storage.getSince('session-123', lastKnownId);
 *
 * // Archive old session
 * await storage.archive('session-123');
 * ```
 */
export interface IEventStorage {
  /**
   * Append an event to a session's event log.
   *
   * Creates the session directory and events.ndjson file if they don't exist.
   * Generates a timestamp-based event ID (YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx).
   *
   * @param sessionId The session identifier (must be valid: alphanumeric, hyphens, underscores)
   * @param event The event to append (without id - id is generated)
   * @returns The stored event with generated id
   * @throws Error if sessionId is invalid (contains path traversal characters)
   */
  append(sessionId: string, event: AgentStoredEvent): Promise<StoredEvent>;

  /**
   * Get all events for a session.
   *
   * Returns events in chronological order (oldest first).
   * Returns empty array if session doesn't exist or has no events.
   * Per DYK-04: Malformed NDJSON lines are silently skipped.
   *
   * @param sessionId The session identifier
   * @returns Array of stored events, ordered by timestamp
   */
  getAll(sessionId: string): Promise<StoredEvent[]>;

  /**
   * Get events since a specific event ID.
   *
   * Returns events that occurred AFTER the specified event ID.
   * Used for incremental sync after page refresh.
   * Per AC19: `GET /events?since=<id>` returns only events after the specified ID.
   *
   * @param sessionId The session identifier
   * @param sinceId The event ID to start from (exclusive - events after this ID)
   * @returns Array of events after the specified ID
   * @throws Error if sinceId is not found in the session
   */
  getSince(sessionId: string, sinceId: string): Promise<StoredEvent[]>;

  /**
   * Archive a session's events.
   *
   * Moves the session's events to the archived/ subdirectory.
   * Per AC20: Old/deleted sessions can be archived.
   *
   * @param sessionId The session identifier
   * @param options Archive options (deleteAfterArchive defaults to true)
   */
  archive(sessionId: string, options?: ArchiveOptions): Promise<void>;

  /**
   * Check if a session exists (has any events).
   *
   * @param sessionId The session identifier
   * @returns True if the session has events
   */
  exists(sessionId: string): Promise<boolean>;
}
