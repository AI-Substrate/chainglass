/**
 * Agent Session Store
 *
 * Manages agent session persistence in localStorage with Zod validation.
 * Implements two-pass hydration (CF-02) and message pruning (HF-06).
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 1: Foundation)
 */
import { type AgentSession, SessionsDataSchema } from '../schemas/agent-session.schema';

/** localStorage key for sessions data */
const STORAGE_KEY = 'agent-sessions';

/** Maximum messages per session before pruning (per DYK #5: constant, not configurable) */
const MAX_MESSAGES_PER_SESSION = 1000;

/**
 * AgentSessionStore manages session persistence in localStorage.
 *
 * Features:
 * - Two-pass hydration: JSON.parse → Zod validate → hydrate (CF-02)
 * - Message pruning at 1000 messages per session (HF-06)
 * - Graceful handling of corrupted data
 *
 * @example
 * const store = new AgentSessionStore(localStorage);
 * store.saveSession({ id: '123', name: 'My Session', ... });
 * const session = store.getSession('123');
 */
export class AgentSessionStore {
  private sessions: Map<string, AgentSession> = new Map();
  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
    this.hydrate();
  }

  /**
   * Two-pass hydration from localStorage (CF-02).
   * 1. Get raw JSON string from localStorage
   * 2. Parse JSON (may fail for corrupted data)
   * 3. Validate with Zod schema (may fail for invalid structure)
   * 4. Hydrate internal state
   *
   * On any failure, logs a warning and uses empty state.
   */
  private hydrate(): void {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) {
      // No data - start with empty state
      return;
    }

    // Pass 1: Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[AgentSessionStore] Corrupted JSON in localStorage, starting fresh');
      return;
    }

    // Pass 2: Validate with Zod
    const result = SessionsDataSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(
        '[AgentSessionStore] Invalid session data in localStorage, starting fresh',
        result.error.issues
      );
      return;
    }

    // Hydrate state
    this.sessions = new Map(Object.entries(result.data));
  }

  /**
   * Persist current state to localStorage.
   * Wraps in try/catch for quota errors (simple handling per YAGNI).
   */
  private persist(): void {
    const data = Object.fromEntries(this.sessions);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[AgentSessionStore] Failed to persist sessions', error);
      // Simple degradation - continue without persistence
      // Server-side storage is future work if this becomes a real issue
    }
  }

  /**
   * Prune messages if they exceed the limit (HF-06).
   * Keeps newest messages, removes oldest.
   */
  private pruneMessages(session: AgentSession): AgentSession {
    if (session.messages.length <= MAX_MESSAGES_PER_SESSION) {
      return session;
    }

    // Keep newest messages (slice from the end)
    const pruned = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    return { ...session, messages: pruned };
  }

  /**
   * Save a session to storage.
   * If session exists, it will be updated (upsert).
   * Messages are pruned if they exceed 1000.
   */
  saveSession(session: AgentSession): void {
    const prunedSession = this.pruneMessages(session);
    this.sessions.set(prunedSession.id, prunedSession);
    this.persist();
  }

  /**
   * Get a session by ID.
   * Returns null if session doesn't exist.
   */
  getSession(id: string): AgentSession | null {
    return this.sessions.get(id) ?? null;
  }

  /**
   * Get all sessions as an array.
   * Returns empty array if no sessions exist.
   */
  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Delete a session by ID.
   * No-op if session doesn't exist.
   */
  deleteSession(id: string): void {
    this.sessions.delete(id);
    this.persist();
  }
}
