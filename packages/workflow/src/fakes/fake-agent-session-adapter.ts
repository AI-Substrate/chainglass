/**
 * Fake agent session adapter for testing.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per Discovery 08: Uses three-part API pattern (state setup, inspection, error injection).
 * Per DYK-P3-05: Uses composite key `${worktreePath}|${id}` for data isolation.
 *
 * Follows the established FakeSampleAdapter pattern with:
 * - In-memory session storage (Map<compositeKey, AgentSession>)
 * - Call tracking arrays with spread operator getters
 * - reset() helper for test isolation
 * - Error injection for testing error paths
 *
 * Per DYK-P3-02: Adapter owns updatedAt - overwrites on every save.
 */

import { AgentSession } from '../entities/agent-session.js';
import { AgentSessionErrorCodes } from '../errors/agent-errors.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import type {
  AgentSessionRemoveResult,
  AgentSessionSaveResult,
  IAgentSessionAdapter,
} from '../interfaces/agent-session-adapter.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';

// ==================== Call Recording Types ====================

/**
 * Recorded load() call for test inspection.
 */
export interface AgentSessionLoadCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session ID */
  sessionId: string;
}

/**
 * Recorded save() call for test inspection.
 */
export interface AgentSessionSaveCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session being saved */
  session: AgentSession;
}

/**
 * Recorded list() call for test inspection.
 */
export interface AgentSessionListCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Timestamp of the call */
  timestamp: Date;
}

/**
 * Recorded remove() call for test inspection.
 */
export interface AgentSessionRemoveCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session ID */
  sessionId: string;
}

/**
 * Recorded exists() call for test inspection.
 */
export interface AgentSessionExistsCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Session ID */
  sessionId: string;
}

// ==================== Fake Implementation ====================

/**
 * Fake agent session adapter for testing.
 *
 * Implements IAgentSessionAdapter with in-memory storage and call tracking.
 * Use in unit tests to avoid filesystem I/O and control adapter behavior.
 *
 * Three-part API:
 * 1. State Setup: Add sessions via addSession() or save()
 * 2. State Inspection: Read calls via *Calls getters
 * 3. Error Injection: Set inject* flags to simulate errors
 *
 * Per DYK-P3-05: Uses composite key `${worktreePath}|${id}` for data isolation.
 *
 * @example
 * ```typescript
 * const adapter = new FakeAgentSessionAdapter();
 * const ctx = { worktreePath: '/path/to/worktree', ... };
 *
 * // State setup
 * adapter.addSession(ctx, AgentSession.create({ id: 'test', type: 'claude', status: 'active' }));
 *
 * // Use adapter
 * const sessions = await adapter.list(ctx);
 * expect(sessions).toHaveLength(1);
 *
 * // Inspect calls
 * expect(adapter.listCalls).toHaveLength(1);
 *
 * // Error injection
 * adapter.injectSaveError = { code: 'E092', message: 'Invalid data' };
 * const result = await adapter.save(ctx, session);
 * expect(result.ok).toBe(false);
 * ```
 */
export class FakeAgentSessionAdapter implements IAgentSessionAdapter {
  // ==================== In-Memory Storage ====================

  /**
   * In-memory session storage by composite key.
   * Per DYK-P3-05: Key format is `${worktreePath}|${id}`
   */
  private _sessions: Map<string, AgentSession> = new Map();

  // ==================== Error Injection ====================

  /**
   * Inject a save error. When set, save() will return this error.
   * Set to undefined to disable error injection.
   */
  injectSaveError?: { code: string; message: string };

  /**
   * Inject a remove error. When set, remove() will return this error.
   * Set to undefined to disable error injection.
   */
  injectRemoveError?: { code: string; message: string };

  /**
   * Inject a load error. When set, load() will throw an error.
   * Set to undefined to disable error injection.
   */
  injectLoadError?: { code: string; message: string };

  // ==================== Private Call Tracking ====================

  private _loadCalls: AgentSessionLoadCall[] = [];
  private _saveCalls: AgentSessionSaveCall[] = [];
  private _listCalls: AgentSessionListCall[] = [];
  private _removeCalls: AgentSessionRemoveCall[] = [];
  private _existsCalls: AgentSessionExistsCall[] = [];

  // ==================== Call Tracking Getters (immutable copies) ====================

  /**
   * Get all load() calls (returns a copy to prevent mutation).
   */
  get loadCalls(): AgentSessionLoadCall[] {
    return [...this._loadCalls];
  }

  /**
   * Get all save() calls (returns a copy to prevent mutation).
   */
  get saveCalls(): AgentSessionSaveCall[] {
    return [...this._saveCalls];
  }

  /**
   * Get all list() calls (returns a copy to prevent mutation).
   */
  get listCalls(): AgentSessionListCall[] {
    return [...this._listCalls];
  }

  /**
   * Get all remove() calls (returns a copy to prevent mutation).
   */
  get removeCalls(): AgentSessionRemoveCall[] {
    return [...this._removeCalls];
  }

  /**
   * Get all exists() calls (returns a copy to prevent mutation).
   */
  get existsCalls(): AgentSessionExistsCall[] {
    return [...this._existsCalls];
  }

  // ==================== Key Generation ====================

  /**
   * Generate composite key for storage.
   * Per DYK-P3-05: Format is `${worktreePath}|${id}`
   */
  private getKey(ctx: WorkspaceContext, sessionId: string): string {
    return `${ctx.worktreePath}|${sessionId}`;
  }

  /**
   * Check if a key belongs to a given context.
   */
  private keyBelongsToContext(key: string, ctx: WorkspaceContext): boolean {
    return key.startsWith(`${ctx.worktreePath}|`);
  }

  // ==================== State Setup Helpers ====================

  /**
   * Add a session directly to the in-memory storage.
   * Use for test setup without going through save().
   *
   * @param ctx - Workspace context
   * @param session - Session to add
   */
  addSession(ctx: WorkspaceContext, session: AgentSession): void {
    const key = this.getKey(ctx, session.id);
    this._sessions.set(key, session);
  }

  /**
   * Get all sessions directly from in-memory storage for a context.
   * Use for test assertions without going through list().
   */
  getSessions(ctx: WorkspaceContext): AgentSession[] {
    const sessions: AgentSession[] = [];
    for (const [key, session] of this._sessions) {
      if (this.keyBelongsToContext(key, ctx)) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  // ==================== Test Helpers ====================

  /**
   * Reset all state (storage, call tracking, error injection).
   * Call in beforeEach for test isolation.
   */
  reset(): void {
    // Clear storage
    this._sessions.clear();

    // Clear error injection
    this.injectSaveError = undefined;
    this.injectRemoveError = undefined;
    this.injectLoadError = undefined;

    // Clear call tracking
    this._loadCalls = [];
    this._saveCalls = [];
    this._listCalls = [];
    this._removeCalls = [];
    this._existsCalls = [];
  }

  // ==================== IAgentSessionAdapter Implementation ====================

  /**
   * Load a session from in-memory storage.
   *
   * @param ctx - Workspace context
   * @param sessionId - Session ID
   * @returns AgentSession if found
   * @throws EntityNotFoundError if session not in storage
   */
  async load(ctx: WorkspaceContext, sessionId: string): Promise<AgentSession> {
    this._loadCalls.push({ ctx, sessionId });

    // Check for injected error
    if (this.injectLoadError) {
      throw new Error(this.injectLoadError.message);
    }

    const key = this.getKey(ctx, sessionId);
    const session = this._sessions.get(key);
    if (!session) {
      throw new EntityNotFoundError(
        'AgentSession',
        sessionId,
        `${ctx.worktreePath}/.chainglass/data/agents (fake)`
      );
    }

    return session;
  }

  /**
   * Save a session to in-memory storage.
   *
   * Per DYK-P3-02: Overwrites updatedAt with current timestamp.
   *
   * @param ctx - Workspace context
   * @param session - Session to save
   * @returns AgentSessionSaveResult with ok=true on success
   */
  async save(ctx: WorkspaceContext, session: AgentSession): Promise<AgentSessionSaveResult> {
    this._saveCalls.push({ ctx, session });

    // Check for injected error
    if (this.injectSaveError) {
      return {
        ok: false,
        errorCode: this.injectSaveError.code as AgentSessionSaveResult['errorCode'],
        errorMessage: this.injectSaveError.message,
      };
    }

    const key = this.getKey(ctx, session.id);
    const exists = this._sessions.has(key);

    // Per DYK-P3-02: Adapter owns updatedAt - create new session with fresh timestamp
    const updatedSession = AgentSession.create({
      id: session.id,
      type: session.type,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: new Date(), // Fresh timestamp
    });

    this._sessions.set(key, updatedSession);
    return { ok: true, session: updatedSession, created: !exists };
  }

  /**
   * List all sessions from in-memory storage for a context.
   * Per AC-05: Returns sessions ordered by createdAt descending (newest first).
   *
   * @param ctx - Workspace context
   * @returns Array of all sessions in the context, ordered by createdAt DESC
   */
  async list(ctx: WorkspaceContext): Promise<AgentSession[]> {
    this._listCalls.push({ ctx, timestamp: new Date() });

    const sessions = this.getSessions(ctx);

    // Sort by createdAt descending (newest first)
    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Remove a session from in-memory storage.
   *
   * @param ctx - Workspace context
   * @param sessionId - Session ID to remove
   * @returns AgentSessionRemoveResult with ok=true on success
   */
  async remove(ctx: WorkspaceContext, sessionId: string): Promise<AgentSessionRemoveResult> {
    this._removeCalls.push({ ctx, sessionId });

    // Check for injected error
    if (this.injectRemoveError) {
      return {
        ok: false,
        errorCode: this.injectRemoveError.code as AgentSessionRemoveResult['errorCode'],
        errorMessage: this.injectRemoveError.message,
      };
    }

    const key = this.getKey(ctx, sessionId);

    // Check if session exists
    if (!this._sessions.has(key)) {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.SESSION_NOT_FOUND,
        errorMessage: `Agent session '${sessionId}' not found`,
      };
    }

    // Remove session
    this._sessions.delete(key);
    return { ok: true };
  }

  /**
   * Check if a session exists in in-memory storage.
   *
   * @param ctx - Workspace context
   * @param sessionId - Session ID to check
   * @returns true if session exists
   */
  async exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean> {
    this._existsCalls.push({ ctx, sessionId });

    const key = this.getKey(ctx, sessionId);
    return this._sessions.has(key);
  }
}
