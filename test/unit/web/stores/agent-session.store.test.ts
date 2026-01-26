/**
 * Agent Session Store Tests
 *
 * TDD RED phase tests for AgentSessionStore with localStorage persistence.
 * Per dossier T006: Tests cover save/load roundtrip, two-pass hydration,
 * message pruning at 1000, corrupted JSON recovery, CRUD operations.
 *
 * Per DYK #4: Uses direct instantiation of FakeLocalStorage in beforeEach().
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentSession } from '../../../../apps/web/src/lib/schemas/agent-session.schema';
// Import from store file that doesn't exist yet - this SHOULD fail in RED phase
import { AgentSessionStore } from '../../../../apps/web/src/lib/stores/agent-session.store';
import { FakeLocalStorage } from '../../../fakes/fake-local-storage';

describe('AgentSessionStore', () => {
  // Per DYK #4: Direct instantiation in beforeEach, not via DI container
  let storage: FakeLocalStorage;
  let store: AgentSessionStore;

  // Helper to create valid session
  const createTestSession = (overrides?: Partial<AgentSession>): AgentSession => ({
    id: `session-${Date.now()}`,
    name: 'Test Session',
    agentType: 'claude-code',
    status: 'idle',
    messages: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ...overrides,
  });

  // Helper to create message
  const createMessage = (content: string) => ({
    role: 'user' as const,
    content,
    timestamp: Date.now(),
  });

  beforeEach(() => {
    // Per DYK #4: Direct instantiation of fakes
    storage = new FakeLocalStorage();
    store = new AgentSessionStore(storage);
  });

  describe('Save and Load', () => {
    it('should save and load session roundtrip', () => {
      /*
      Test Doc:
      - Why: Core persistence - sessions must survive page refresh
      - Contract: saveSession() stores to localStorage, getSession() retrieves it
      - Usage Notes: Sessions are keyed by id in the sessions map
      - Quality Contribution: Validates basic persistence works
      - Worked Example: saveSession(session) → getSession(id) returns same session
      */
      const session = createTestSession({ id: 'test-123' });

      store.saveSession(session);
      const loaded = store.getSession('test-123');

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('test-123');
      expect(loaded?.name).toBe('Test Session');
      expect(loaded?.agentType).toBe('claude-code');
    });

    it('should return null for non-existent session', () => {
      /*
      Test Doc:
      - Why: Graceful handling of missing sessions
      - Contract: getSession(unknownId) returns null, not undefined or throw
      - Usage Notes: Always check for null before using session
      - Quality Contribution: Prevents undefined access errors
      - Worked Example: getSession('nonexistent') → null
      */
      const result = store.getSession('nonexistent');

      expect(result).toBeNull();
    });

    it('should return empty state for new browser', () => {
      /*
      Test Doc:
      - Why: First-run experience - no localStorage data exists
      - Contract: getAllSessions() returns empty array when nothing saved
      - Usage Notes: UI should show "no sessions" state
      - Quality Contribution: Validates clean slate behavior
      - Worked Example: New browser → getAllSessions() returns []
      */
      const sessions = store.getAllSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('Two-Pass Hydration (CF-02)', () => {
    it('should use two-pass hydration: JSON parse then Zod validate', () => {
      /*
      Test Doc:
      - Why: Per CF-02 - validates data before using to prevent corrupted state
      - Contract: Store constructor: getItem → JSON.parse → safeParse → hydrate
      - Usage Notes: Invalid data is rejected, not silently accepted
      - Quality Contribution: Prevents corrupted localStorage from breaking app
      - Worked Example: localStorage has valid JSON → Zod validates → state hydrated
      */
      const session = createTestSession({ id: 'hydration-test' });

      // Pre-populate storage with valid JSON
      storage.setItem('agent-sessions', JSON.stringify({ 'hydration-test': session }));

      // Create new store instance (triggers hydration)
      const newStore = new AgentSessionStore(storage);
      const loaded = newStore.getSession('hydration-test');

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('hydration-test');
    });

    it('should handle corrupted JSON gracefully', () => {
      /*
      Test Doc:
      - Why: Corrupted localStorage shouldn't crash the app
      - Contract: Invalid JSON → safeParse fails → use empty state, log warning
      - Usage Notes: User data is lost, but app remains functional
      - Quality Contribution: Resilience to data corruption
      - Worked Example: localStorage has "not valid json{" → returns empty sessions
      */
      // Pre-populate with invalid JSON
      storage.setItem('agent-sessions', 'not valid json{');

      // Create new store - should not throw
      const newStore = new AgentSessionStore(storage);
      const sessions = newStore.getAllSessions();

      expect(sessions).toEqual([]);
    });

    it('should handle invalid session data gracefully', () => {
      /*
      Test Doc:
      - Why: Valid JSON but invalid schema should be rejected
      - Contract: { id: 123 } (wrong type) → Zod fails → use empty state
      - Usage Notes: Partial data loss is better than runtime errors
      - Quality Contribution: Validates Zod catches schema violations
      - Worked Example: { "bad": { id: 123 } } → empty state
      */
      // Pre-populate with valid JSON but invalid session data
      storage.setItem('agent-sessions', JSON.stringify({ bad: { id: 123, status: 'invalid' } }));

      // Create new store - should not throw
      const newStore = new AgentSessionStore(storage);
      const sessions = newStore.getAllSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('Message Pruning (HF-06)', () => {
    it('should prune messages when exceeding 1000', () => {
      /*
      Test Doc:
      - Why: Per HF-06 - prevents localStorage quota exhaustion
      - Contract: Messages over 1000 limit are pruned (oldest removed first)
      - Usage Notes: Pruning happens on save, not on load
      - Quality Contribution: Validates quota prevention mechanism
      - Worked Example: Session with 1100 messages → saved with 1000 messages
      */
      const session = createTestSession({ id: 'prune-test' });

      // Add 1100 messages
      session.messages = Array.from({ length: 1100 }, (_, i) => createMessage(`Message ${i}`));

      store.saveSession(session);
      const loaded = store.getSession('prune-test');

      expect(loaded?.messages.length).toBe(1000);
      // Should keep newest messages (prune oldest)
      expect(loaded?.messages[0].content).toBe('Message 100');
      expect(loaded?.messages[999].content).toBe('Message 1099');
    });

    it('should not prune messages at or below 1000', () => {
      /*
      Test Doc:
      - Why: Normal sessions shouldn't be affected by pruning
      - Contract: Messages at or below 1000 are preserved unchanged
      - Usage Notes: Pruning is a safety net, not a regular operation
      - Quality Contribution: Validates normal case isn't affected
      - Worked Example: Session with 500 messages → saved with 500 messages
      */
      const session = createTestSession({ id: 'no-prune-test' });
      session.messages = Array.from({ length: 500 }, (_, i) => createMessage(`Message ${i}`));

      store.saveSession(session);
      const loaded = store.getSession('no-prune-test');

      expect(loaded?.messages.length).toBe(500);
    });
  });

  describe('CRUD Operations', () => {
    it('should get all sessions', () => {
      /*
      Test Doc:
      - Why: Session list UI needs all sessions
      - Contract: getAllSessions() returns array of all saved sessions
      - Usage Notes: Returns empty array if none, not null
      - Quality Contribution: Validates list retrieval
      - Worked Example: 3 sessions saved → getAllSessions() returns 3 sessions
      */
      store.saveSession(createTestSession({ id: 's1', name: 'Session 1' }));
      store.saveSession(createTestSession({ id: 's2', name: 'Session 2' }));
      store.saveSession(createTestSession({ id: 's3', name: 'Session 3' }));

      const sessions = store.getAllSessions();

      expect(sessions.length).toBe(3);
      expect(sessions.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3']);
    });

    it('should update existing session', () => {
      /*
      Test Doc:
      - Why: Sessions change status, get new messages, etc.
      - Contract: saveSession with existing id updates the session
      - Usage Notes: This is an upsert operation
      - Quality Contribution: Validates update path
      - Worked Example: Save session, change status, save again → status updated
      */
      const session = createTestSession({ id: 'update-test', status: 'idle' });
      store.saveSession(session);

      session.status = 'running';
      session.lastActiveAt = Date.now();
      store.saveSession(session);

      const loaded = store.getSession('update-test');
      expect(loaded?.status).toBe('running');
    });

    it('should delete session', () => {
      /*
      Test Doc:
      - Why: Users can delete sessions to clean up
      - Contract: deleteSession(id) removes session from storage
      - Usage Notes: No-op if session doesn't exist
      - Quality Contribution: Validates deletion
      - Worked Example: Delete session → getSession returns null
      */
      const session = createTestSession({ id: 'delete-test' });
      store.saveSession(session);

      expect(store.getSession('delete-test')).toBeDefined();

      store.deleteSession('delete-test');

      expect(store.getSession('delete-test')).toBeNull();
    });

    it('should persist changes to localStorage', () => {
      /*
      Test Doc:
      - Why: Changes must survive store instance recreation
      - Contract: Changes written to localStorage are readable by new store instance
      - Usage Notes: This simulates page refresh
      - Quality Contribution: Validates persistence across instances
      - Worked Example: Save session → new store instance → session exists
      */
      const session = createTestSession({ id: 'persist-test' });
      store.saveSession(session);

      // Create new store instance (simulates page refresh)
      const newStore = new AgentSessionStore(storage);
      const loaded = newStore.getSession('persist-test');

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('persist-test');
    });
  });
});
