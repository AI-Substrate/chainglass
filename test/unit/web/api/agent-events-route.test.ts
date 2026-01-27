/**
 * Agent Events API Route Tests
 *
 * Tests for GET /api/agents/sessions/:sessionId/events
 * Per DYK-05: Uses FakeEventStorage via DI for API route tests.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

import { FakeEventStorage, type StoredEvent } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

// We're testing the route handler logic, not the actual Next.js routing
// Import the handler that will be created
import { createEventsRouteHandler } from '../../../../apps/web/app/api/agents/sessions/[sessionId]/events/route';

// Helper to create test events
const createStoredEvent = (
  type: 'tool_call' | 'tool_result' | 'thinking',
  id: string
): StoredEvent => {
  if (type === 'tool_call') {
    return {
      id,
      type: 'tool_call',
      timestamp: new Date().toISOString(),
      data: {
        toolName: 'Bash',
        input: { command: 'ls' },
        toolCallId: `toolu_${id}`,
      },
    };
  }
  if (type === 'tool_result') {
    return {
      id,
      type: 'tool_result',
      timestamp: new Date().toISOString(),
      data: {
        toolCallId: `toolu_${id}`,
        output: 'result',
        isError: false,
      },
    };
  }
  return {
    id,
    type: 'thinking',
    timestamp: new Date().toISOString(),
    data: {
      content: 'Thinking...',
    },
  };
};

describe('GET /api/agents/sessions/:sessionId/events', () => {
  let fakeStorage: FakeEventStorage;
  let handler: ReturnType<typeof createEventsRouteHandler>;

  beforeEach(() => {
    fakeStorage = new FakeEventStorage();
    handler = createEventsRouteHandler(fakeStorage);
  });

  describe('getAll behavior', () => {
    it('should return all events for a session', async () => {
      /*
      Test Doc:
      - Why: Core functionality - retrieve all session events
      - Contract: GET /events → JSON array of all events
      - Usage Notes: Called on page load to hydrate session
      - Quality Contribution: Ensures event retrieval works
      - Worked Example: Session with 3 events → returns all 3
      */
      fakeStorage.seedEvents('session-123', [
        createStoredEvent('tool_call', 'evt_001'),
        createStoredEvent('tool_result', 'evt_002'),
        createStoredEvent('thinking', 'evt_003'),
      ]);

      const response = await handler.GET('session-123', {});

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.events).toHaveLength(3);
      expect(data.events[0].id).toBe('evt_001');
      expect(data.events[2].id).toBe('evt_003');
    });

    it('should return empty array for session with no events', async () => {
      /*
      Test Doc:
      - Why: New sessions start empty (AC21)
      - Contract: Empty session → 200 with empty array
      - Usage Notes: Not a 404 - session exists but empty
      - Quality Contribution: Handles new sessions gracefully
      - Worked Example: GET /events for new session → { events: [] }
      */
      const response = await handler.GET('empty-session', {});

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.events).toEqual([]);
    });

    it('should return events in chronological order', async () => {
      /*
      Test Doc:
      - Why: UI needs events in order for replay
      - Contract: Events returned oldest-first
      - Usage Notes: Order matches append order
      - Quality Contribution: Ensures correct event sequence
      - Worked Example: Events appended 1,2,3 → returned 1,2,3
      */
      fakeStorage.seedEvents('session-123', [
        createStoredEvent('tool_call', 'evt_001'),
        createStoredEvent('tool_call', 'evt_002'),
        createStoredEvent('tool_call', 'evt_003'),
      ]);

      const response = await handler.GET('session-123', {});
      const data = await response.json();

      expect(data.events[0].id).toBe('evt_001');
      expect(data.events[1].id).toBe('evt_002');
      expect(data.events[2].id).toBe('evt_003');
    });
  });

  describe('getSince behavior (AC19)', () => {
    it('should return events after specified ID', async () => {
      /*
      Test Doc:
      - Why: Incremental sync after page refresh (AC19)
      - Contract: ?since=id → events after that ID
      - Usage Notes: sinceId is excluded from results
      - Quality Contribution: Core sync functionality
      - Worked Example: ?since=evt_001 → [evt_002, evt_003]
      */
      fakeStorage.seedEvents('session-123', [
        createStoredEvent('tool_call', 'evt_001'),
        createStoredEvent('tool_result', 'evt_002'),
        createStoredEvent('thinking', 'evt_003'),
      ]);

      const response = await handler.GET('session-123', { since: 'evt_001' });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.events).toHaveLength(2);
      expect(data.events[0].id).toBe('evt_002');
      expect(data.events[1].id).toBe('evt_003');
    });

    it('should return empty array when since is latest', async () => {
      /*
      Test Doc:
      - Why: Client is caught up - no new events
      - Contract: ?since=latestId → empty array
      - Usage Notes: Normal "no new events" case
      - Quality Contribution: Handles caught-up state
      - Worked Example: ?since=evt_003 (latest) → []
      */
      fakeStorage.seedEvents('session-123', [
        createStoredEvent('tool_call', 'evt_001'),
        createStoredEvent('tool_call', 'evt_002'),
        createStoredEvent('tool_call', 'evt_003'),
      ]);

      const response = await handler.GET('session-123', { since: 'evt_003' });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.events).toEqual([]);
    });

    it('should return 400 when since ID not found', async () => {
      /*
      Test Doc:
      - Why: Invalid sinceId indicates client/server mismatch
      - Contract: Unknown sinceId → 400 Bad Request
      - Usage Notes: Client should fetch all events and retry
      - Quality Contribution: Clear error handling
      - Worked Example: ?since=unknown → 400
      */
      fakeStorage.seedEvents('session-123', [createStoredEvent('tool_call', 'evt_001')]);

      const response = await handler.GET('session-123', { since: 'unknown-id' });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });
  });

  describe('error handling', () => {
    it('should return 400 for invalid session ID', async () => {
      /*
      Test Doc:
      - Why: Security - path traversal prevention (DYK-02)
      - Contract: Invalid sessionId → 400 Bad Request
      - Usage Notes: Validation happens in route handler
      - Quality Contribution: Security enforcement
      - Worked Example: sessionId='../hack' → 400
      */
      const response = await handler.GET('../hack', {});

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid');
    });

    it('should handle storage errors gracefully', async () => {
      /*
      Test Doc:
      - Why: Storage failures shouldn't crash server
      - Contract: Storage error → 500 Internal Server Error
      - Usage Notes: Logs error internally
      - Quality Contribution: Resilient error handling
      - Worked Example: Storage throws → 500
      */
      // Create a storage that throws
      const errorStorage = new FakeEventStorage();
      errorStorage.getAll = async () => {
        throw new Error('Storage failure');
      };
      const errorHandler = createEventsRouteHandler(errorStorage);

      const response = await errorHandler.GET('session-123', {});

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include metadata in response', async () => {
      /*
      Test Doc:
      - Why: Client needs count and sessionId for UI
      - Contract: Response includes { events, count, sessionId }
      - Usage Notes: Count is total, not just returned
      - Quality Contribution: Complete response structure
      - Worked Example: { events: [...], count: 3, sessionId: 'x' }
      */
      fakeStorage.seedEvents('session-123', [
        createStoredEvent('tool_call', 'evt_001'),
        createStoredEvent('tool_call', 'evt_002'),
      ]);

      const response = await handler.GET('session-123', {});
      const data = await response.json();

      expect(data.events).toHaveLength(2);
      expect(data.count).toBe(2);
      expect(data.sessionId).toBe('session-123');
    });
  });
});
