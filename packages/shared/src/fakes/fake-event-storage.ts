import type {
  ArchiveOptions,
  IEventStorage,
  StoredEvent,
} from '../interfaces/event-storage.interface.js';
/**
 * Fake Event Storage
 *
 * In-memory implementation of IEventStorage for testing.
 * Follows the same pattern as FakeAgentAdapter - captures all operations
 * and provides assertion helpers.
 *
 * Per DYK-05: Used in API route tests via DI injection.
 * Per DYK-01: Uses timestamp-based event IDs.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */
import type { AgentStoredEvent } from '../schemas/agent-event.schema.js';

/**
 * Options for configuring FakeEventStorage behavior.
 */
export interface FakeEventStorageOptions {
  /**
   * Initial events to seed the storage with.
   * Map of sessionId -> array of events
   */
  initialEvents?: Map<string, StoredEvent[]>;

  /**
   * Whether getSince() should throw when sinceId is not found.
   * Default: true (follows real implementation behavior)
   */
  throwOnMissingSinceId?: boolean;
}

/**
 * Generates a timestamp-based event ID.
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx
 */
function generateEventId(): string {
  const timestamp = new Date().toISOString();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return `${timestamp}_${randomSuffix}`;
}

/**
 * FakeEventStorage is a test double for IEventStorage that stores events
 * in memory and provides assertion helpers for testing.
 *
 * Usage:
 * ```typescript
 * const fake = new FakeEventStorage();
 *
 * await fake.append('session-1', {
 *   type: 'tool_call',
 *   timestamp: new Date().toISOString(),
 *   data: { toolName: 'Bash', input: {}, toolCallId: 't1' }
 * });
 *
 * fake.assertEventStored('session-1', 'tool_call');
 * const events = fake.getStoredEvents('session-1');
 * expect(events).toHaveLength(1);
 * ```
 */
export class FakeEventStorage implements IEventStorage {
  private _events: Map<string, StoredEvent[]> = new Map();
  private _archivedSessions: Set<string> = new Set();
  private _throwOnMissingSinceId: boolean;

  constructor(options: FakeEventStorageOptions = {}) {
    if (options.initialEvents) {
      this._events = new Map(options.initialEvents);
    }
    this._throwOnMissingSinceId = options.throwOnMissingSinceId ?? true;
  }

  async append(sessionId: string, event: AgentStoredEvent): Promise<StoredEvent> {
    // Validate sessionId (basic path traversal check)
    if (sessionId.includes('/') || sessionId.includes('..') || sessionId.includes('\\')) {
      throw new Error(`Invalid sessionId: ${sessionId}`);
    }

    const storedEvent: StoredEvent = {
      ...event,
      id: generateEventId(),
    };

    const sessionEvents = this._events.get(sessionId) ?? [];
    sessionEvents.push(storedEvent);
    this._events.set(sessionId, sessionEvents);

    return storedEvent;
  }

  async getAll(sessionId: string): Promise<StoredEvent[]> {
    return [...(this._events.get(sessionId) ?? [])];
  }

  async getSince(sessionId: string, sinceId: string): Promise<StoredEvent[]> {
    const events = this._events.get(sessionId) ?? [];

    const sinceIndex = events.findIndex((e) => e.id === sinceId);
    if (sinceIndex === -1) {
      if (this._throwOnMissingSinceId) {
        throw new Error(`Event ID not found: ${sinceId}`);
      }
      // If not throwing, return all events (forgiving behavior)
      return [...events];
    }

    // Return events AFTER the sinceId
    return events.slice(sinceIndex + 1);
  }

  async archive(sessionId: string, _options?: ArchiveOptions): Promise<void> {
    this._archivedSessions.add(sessionId);
    // By default, archive removes the events (deleteAfterArchive defaults to true)
    if (_options?.deleteAfterArchive !== false) {
      this._events.delete(sessionId);
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    const events = this._events.get(sessionId);
    return events !== undefined && events.length > 0;
  }

  // ============================================
  // Test helper methods
  // ============================================

  /**
   * Get all stored events for a session.
   * Direct access for test assertions.
   */
  getStoredEvents(sessionId: string): StoredEvent[] {
    return [...(this._events.get(sessionId) ?? [])];
  }

  /**
   * Get all session IDs that have been archived.
   */
  getArchivedSessions(): string[] {
    return [...this._archivedSessions];
  }

  /**
   * Assert that an event of the given type was stored for the session.
   *
   * @throws Error if no matching event found
   */
  assertEventStored(sessionId: string, eventType: string): void {
    const events = this._events.get(sessionId) ?? [];
    const match = events.some((e) => e.type === eventType);

    if (!match) {
      const types = events.map((e) => e.type).join(', ') || '(no events)';
      throw new Error(
        `Expected event of type "${eventType}" for session "${sessionId}"\n` +
          `Actual event types: ${types}`
      );
    }
  }

  /**
   * Assert that a specific event ID exists in the session.
   *
   * @throws Error if event ID not found
   */
  assertEventIdExists(sessionId: string, eventId: string): void {
    const events = this._events.get(sessionId) ?? [];
    const match = events.some((e) => e.id === eventId);

    if (!match) {
      const ids = events.map((e) => e.id).join(', ') || '(no events)';
      throw new Error(
        `Expected event ID "${eventId}" for session "${sessionId}"\n` + `Actual event IDs: ${ids}`
      );
    }
  }

  /**
   * Assert that a session was archived.
   *
   * @throws Error if session was not archived
   */
  assertSessionArchived(sessionId: string): void {
    if (!this._archivedSessions.has(sessionId)) {
      const archived = [...this._archivedSessions].join(', ') || '(none)';
      throw new Error(
        `Expected session "${sessionId}" to be archived\n` + `Archived sessions: ${archived}`
      );
    }
  }

  /**
   * Seed events for testing.
   * Useful for setting up test scenarios.
   */
  seedEvents(sessionId: string, events: StoredEvent[]): void {
    this._events.set(sessionId, [...events]);
  }

  /**
   * Clear all stored events and archived sessions.
   * Useful for test isolation.
   */
  reset(): void {
    this._events.clear();
    this._archivedSessions.clear();
  }

  /**
   * Get total event count across all sessions.
   */
  getTotalEventCount(): number {
    let count = 0;
    for (const events of this._events.values()) {
      count += events.length;
    }
    return count;
  }
}
