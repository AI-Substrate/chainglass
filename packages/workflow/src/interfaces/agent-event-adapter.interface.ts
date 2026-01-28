/**
 * Agent Event Adapter interface for workspace-scoped event storage.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 2)
 * Per ADR-0008: Events stored at `<worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson`
 *
 * This adapter handles event storage operations with WorkspaceContext for workspace isolation.
 * Events are stored as NDJSON (newline-delimited JSON) files per session.
 *
 * Implementations:
 * - AgentEventAdapter: Real NDJSON file storage using IFileSystem
 * - FakeAgentEventAdapter: In-memory implementation for testing
 *
 * Key behaviors:
 * - Per DYK-01: Uses timestamp-based event IDs (YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx)
 * - Per DYK-02: Validates sessionId to prevent path traversal
 * - Per DYK-04: Silently skips malformed NDJSON lines on read
 * - Per Discovery 10: Optional logging for malformed line skipping
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 */

import type { AgentStoredEvent } from '@chainglass/shared';

import type { WorkspaceContext } from './workspace-context.interface.js';

/**
 * A stored event with its generated ID.
 * The ID is assigned by the adapter during append().
 *
 * Note: Uses intersection type since AgentStoredEvent is a discriminated union.
 */
export type StoredAgentEvent = AgentStoredEvent & {
  /** Unique event ID (timestamp-based: YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx) */
  id: string;
};

/**
 * Options for archiving a session's events.
 */
export interface ArchiveOptions {
  /** Delete the events after archiving (default: true) */
  deleteAfterArchive?: boolean;
}

/**
 * Result type for append operation.
 */
export interface AppendEventResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** The stored event with generated ID (if successful) */
  event?: StoredAgentEvent;
  /** Error message if operation failed */
  errorMessage?: string;
}

/**
 * Result type for archive operation.
 */
export interface ArchiveResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Error message if operation failed */
  errorMessage?: string;
}

/**
 * Agent Event Adapter interface.
 *
 * All methods require a WorkspaceContext to determine storage location.
 * Data is stored in `<ctx.worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson`.
 *
 * Per spec:
 * - Data stored per-worktree for workspace isolation
 * - No caching - always fresh reads
 * - Session ID validated before filesystem operations
 */
export interface IAgentEventAdapter {
  /**
   * Append an event to a session's event log.
   *
   * Creates the session directory and events.ndjson file if they don't exist.
   * Generates a timestamp-based event ID (YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx).
   *
   * Per DYK-02: Validates sessionId before filesystem operations.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session identifier (must be valid: alphanumeric, hyphens, underscores)
   * @param event - Event to append (without id - id is generated)
   * @returns AppendEventResult with stored event or error
   */
  append(
    ctx: WorkspaceContext,
    sessionId: string,
    event: AgentStoredEvent
  ): Promise<AppendEventResult>;

  /**
   * Get all events for a session.
   *
   * Returns events in chronological order (oldest first).
   * Returns empty array if session doesn't exist or has no events.
   * Per DYK-04: Malformed NDJSON lines are silently skipped.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session identifier
   * @returns Array of stored events, ordered by timestamp
   */
  getAll(ctx: WorkspaceContext, sessionId: string): Promise<StoredAgentEvent[]>;

  /**
   * Get events since a specific event ID.
   *
   * Returns events that occurred AFTER the specified event ID.
   * Used for incremental sync after page refresh.
   * Per AC19: Returns only events after the specified ID (exclusive).
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session identifier
   * @param sinceId - Event ID to start from (exclusive - events after this ID)
   * @returns Array of events after the specified ID
   * @throws Error if sinceId is not found in the session
   */
  getSince(ctx: WorkspaceContext, sessionId: string, sinceId: string): Promise<StoredAgentEvent[]>;

  /**
   * Archive a session's events.
   *
   * Moves the session's events to the archived/ subdirectory.
   * Per AC20: Old/deleted sessions can be archived.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session identifier
   * @param options - Archive options (deleteAfterArchive defaults to true)
   * @returns ArchiveResult with success status or error
   */
  archive(
    ctx: WorkspaceContext,
    sessionId: string,
    options?: ArchiveOptions
  ): Promise<ArchiveResult>;

  /**
   * Check if a session has any events.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sessionId - Session identifier
   * @returns true if session has events
   */
  exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean>;
}
