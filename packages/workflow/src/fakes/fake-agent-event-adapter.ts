/**
 * Fake agent event adapter for testing.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 2)
 * Per Discovery 08: Uses three-part API pattern (state setup, inspection, error injection).
 *
 * Follows the established FakeAgentSessionAdapter pattern with:
 * - In-memory event storage (Map<compositeKey, StoredAgentEvent[]>)
 * - Call tracking arrays with spread operator getters
 * - reset() helper for test isolation
 * - Error injection for testing error paths
 *
 * Per DYK-P3-05: Uses composite key `${worktreePath}|${sessionId}` for data isolation.
 */

import type { AgentStoredEvent } from '@chainglass/shared';

import type {
  AppendEventResult,
  ArchiveOptions,
  ArchiveResult,
  IAgentEventAdapter,
  StoredAgentEvent,
} from '../interfaces/agent-event-adapter.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';

// ==================== Helper Functions ====================

/**
 * Generates a timestamp-based event ID.
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx
 */
function generateEventId(): string {
  const timestamp = new Date().toISOString();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return `${timestamp}_${randomSuffix}`;
}

// ==================== Call Recording Types ====================

/**
 * Recorded append() call for test inspection.
 */
export interface AgentEventAppendCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session ID */
  sessionId: string;
  /** Event being appended */
  event: AgentStoredEvent;
}

/**
 * Recorded getAll() call for test inspection.
 */
export interface AgentEventGetAllCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session ID */
  sessionId: string;
}

/**
 * Recorded getSince() call for test inspection.
 */
export interface AgentEventGetSinceCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session ID */
  sessionId: string;
  /** Since event ID */
  sinceId: string;
}

/**
 * Recorded archive() call for test inspection.
 */
export interface AgentEventArchiveCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session ID */
  sessionId: string;
  /** Archive options */
  options?: ArchiveOptions;
}

/**
 * Recorded exists() call for test inspection.
 */
export interface AgentEventExistsCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session ID */
  sessionId: string;
}

// ==================== Fake Implementation ====================

/**
 * Fake agent event adapter for testing.
 *
 * Implements IAgentEventAdapter with in-memory storage and call tracking.
 * Use in unit tests to avoid filesystem I/O and control adapter behavior.
 *
 * Three-part API:
 * 1. State Setup: Add events via addEvent() or append()
 * 2. State Inspection: Read calls via *Calls getters
 * 3. Error Injection: Set inject* flags to simulate errors
 *
 * @example
 * ```typescript
 * const adapter = new FakeAgentEventAdapter();
 * const ctx = { worktreePath: '/path/to/worktree', ... };
 *
 * // State setup
 * adapter.addEvent(ctx, 'session-1', { type: 'tool_call', ... });
 *
 * // Use adapter
 * const events = await adapter.getAll(ctx, 'session-1');
 * expect(events).toHaveLength(1);
 *
 * // Inspect calls
 * expect(adapter.getAllCalls).toHaveLength(1);
 *
 * // Error injection
 * adapter.injectAppendError = { message: 'Write failed' };
 * const result = await adapter.append(ctx, 'session-1', event);
 * expect(result.ok).toBe(false);
 * ```
 */
export class FakeAgentEventAdapter implements IAgentEventAdapter {
  // ==================== In-Memory Storage ====================

  /**
   * In-memory event storage by composite key.
   * Key format: `${worktreePath}|${sessionId}`
   */
  private _events: Map<string, StoredAgentEvent[]> = new Map();

  /**
   * Archived events by composite key.
   */
  private _archivedEvents: Map<string, StoredAgentEvent[]> = new Map();

  // ==================== Error Injection ====================

  /**
   * Inject an append error. When set, append() will return this error.
   * Set to undefined to disable error injection.
   */
  injectAppendError?: { message: string };

  /**
   * Inject an archive error. When set, archive() will return this error.
   * Set to undefined to disable error injection.
   */
  injectArchiveError?: { message: string };

  /**
   * Inject a getSince error. When set, getSince() will throw this error.
   * Set to undefined to disable error injection.
   */
  injectGetSinceError?: { message: string };

  // ==================== Private Call Tracking ====================

  private _appendCalls: AgentEventAppendCall[] = [];
  private _getAllCalls: AgentEventGetAllCall[] = [];
  private _getSinceCalls: AgentEventGetSinceCall[] = [];
  private _archiveCalls: AgentEventArchiveCall[] = [];
  private _existsCalls: AgentEventExistsCall[] = [];

  // ==================== Call Tracking Getters (immutable copies) ====================

  /**
   * Get all append() calls (returns a copy to prevent mutation).
   */
  get appendCalls(): AgentEventAppendCall[] {
    return [...this._appendCalls];
  }

  /**
   * Get all getAll() calls (returns a copy to prevent mutation).
   */
  get getAllCalls(): AgentEventGetAllCall[] {
    return [...this._getAllCalls];
  }

  /**
   * Get all getSince() calls (returns a copy to prevent mutation).
   */
  get getSinceCalls(): AgentEventGetSinceCall[] {
    return [...this._getSinceCalls];
  }

  /**
   * Get all archive() calls (returns a copy to prevent mutation).
   */
  get archiveCalls(): AgentEventArchiveCall[] {
    return [...this._archiveCalls];
  }

  /**
   * Get all exists() calls (returns a copy to prevent mutation).
   */
  get existsCalls(): AgentEventExistsCall[] {
    return [...this._existsCalls];
  }

  // ==================== Key Generation ====================

  /**
   * Generate composite key for storage.
   * Format: `${worktreePath}|${sessionId}`
   */
  private getKey(ctx: WorkspaceContext, sessionId: string): string {
    return `${ctx.worktreePath}|${sessionId}`;
  }

  // ==================== State Setup Helpers ====================

  /**
   * Add an event directly to the in-memory storage.
   * Use for test setup without going through append().
   *
   * @param ctx - Workspace context
   * @param sessionId - Session ID
   * @param event - Event to add (id will be generated if not provided)
   */
  addEvent(ctx: WorkspaceContext, sessionId: string, event: AgentStoredEvent): void {
    const key = this.getKey(ctx, sessionId);
    const events = this._events.get(key) || [];
    const storedEvent: StoredAgentEvent = {
      ...event,
      id: (event as StoredAgentEvent).id || generateEventId(),
    };
    events.push(storedEvent);
    this._events.set(key, events);
  }

  /**
   * Get all events directly from in-memory storage.
   * Use for test assertions without going through getAll().
   */
  getEvents(ctx: WorkspaceContext, sessionId: string): StoredAgentEvent[] {
    const key = this.getKey(ctx, sessionId);
    return this._events.get(key) || [];
  }

  /**
   * Get archived events directly from in-memory storage.
   * Use for test assertions.
   */
  getArchivedEvents(ctx: WorkspaceContext, sessionId: string): StoredAgentEvent[] {
    const key = this.getKey(ctx, sessionId);
    return this._archivedEvents.get(key) || [];
  }

  // ==================== Test Helpers ====================

  /**
   * Reset all state (storage, call tracking, error injection).
   * Call in beforeEach for test isolation.
   */
  reset(): void {
    // Clear storage
    this._events.clear();
    this._archivedEvents.clear();

    // Clear error injection
    this.injectAppendError = undefined;
    this.injectArchiveError = undefined;
    this.injectGetSinceError = undefined;

    // Clear call tracking
    this._appendCalls = [];
    this._getAllCalls = [];
    this._getSinceCalls = [];
    this._archiveCalls = [];
    this._existsCalls = [];
  }

  // ==================== IAgentEventAdapter Implementation ====================

  /**
   * Append an event to in-memory storage.
   */
  async append(
    ctx: WorkspaceContext,
    sessionId: string,
    event: AgentStoredEvent
  ): Promise<AppendEventResult> {
    this._appendCalls.push({ ctx, sessionId, event });

    // Check for injected error
    if (this.injectAppendError) {
      return {
        ok: false,
        errorMessage: this.injectAppendError.message,
      };
    }

    const key = this.getKey(ctx, sessionId);
    const events = this._events.get(key) || [];
    const storedEvent: StoredAgentEvent = {
      ...event,
      id: generateEventId(),
    };
    events.push(storedEvent);
    this._events.set(key, events);

    return { ok: true, event: storedEvent };
  }

  /**
   * Get all events from in-memory storage.
   */
  async getAll(ctx: WorkspaceContext, sessionId: string): Promise<StoredAgentEvent[]> {
    this._getAllCalls.push({ ctx, sessionId });

    const key = this.getKey(ctx, sessionId);
    return this._events.get(key) || [];
  }

  /**
   * Get events since a specific event ID.
   */
  async getSince(
    ctx: WorkspaceContext,
    sessionId: string,
    sinceId: string
  ): Promise<StoredAgentEvent[]> {
    this._getSinceCalls.push({ ctx, sessionId, sinceId });

    // Check for injected error
    if (this.injectGetSinceError) {
      throw new Error(this.injectGetSinceError.message);
    }

    const events = await this.getAll(ctx, sessionId);
    const sinceIndex = events.findIndex((e) => e.id === sinceId);

    if (sinceIndex === -1) {
      throw new Error(`Event ID not found: ${sinceId}`);
    }

    return events.slice(sinceIndex + 1);
  }

  /**
   * Archive events to archived storage.
   */
  async archive(
    ctx: WorkspaceContext,
    sessionId: string,
    options?: ArchiveOptions
  ): Promise<ArchiveResult> {
    this._archiveCalls.push({ ctx, sessionId, options });

    // Check for injected error
    if (this.injectArchiveError) {
      return {
        ok: false,
        errorMessage: this.injectArchiveError.message,
      };
    }

    const key = this.getKey(ctx, sessionId);
    const events = this._events.get(key) || [];

    // Copy to archived
    this._archivedEvents.set(key, [...events]);

    // Delete original if requested (default: true)
    if (options?.deleteAfterArchive !== false) {
      this._events.delete(key);
    }

    return { ok: true };
  }

  /**
   * Check if session has events in in-memory storage.
   */
  async exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean> {
    this._existsCalls.push({ ctx, sessionId });

    const key = this.getKey(ctx, sessionId);
    const events = this._events.get(key);
    return events !== undefined && events.length > 0;
  }
}
