/**
 * Event Storage Contract Tests
 *
 * Per DYK-05 and Constitution Principle 3.3:
 * Contract tests verify FakeEventStorage ↔ EventStorageService parity.
 * Both implementations must pass the same test suite.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type AgentStoredEvent,
  EventStorageService,
  FakeEventStorage,
  type IEventStorage,
} from '@chainglass/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Helper to create test events
const createToolCallEvent = (toolName = 'Bash'): AgentStoredEvent => ({
  type: 'tool_call',
  timestamp: new Date().toISOString(),
  data: {
    toolName,
    input: { command: 'ls -la' },
    toolCallId: `toolu_${Math.random().toString(36).substring(7)}`,
  },
});

/**
 * Contract test suite for IEventStorage implementations.
 * Run this suite against any IEventStorage to verify contract compliance.
 */
function eventStorageContractTests(
  name: string,
  createStorage: () => Promise<{ storage: IEventStorage; cleanup: () => Promise<void> }>
) {
  describe(`${name} implements IEventStorage contract`, () => {
    let storage: IEventStorage;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await createStorage();
      storage = result.storage;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    describe('append()', () => {
      it('should return stored event with generated ID', async () => {
        /*
        Test Doc:
        - Why: Contract specifies append returns StoredEvent with ID
        - Contract: append(sessionId, event) → StoredEvent with id field
        - Usage Notes: ID format is timestamp-based
        - Quality Contribution: Verifies both implementations generate IDs
        - Worked Example: append('s1', event) → { ...event, id: 'YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx' }
        */
        const event = createToolCallEvent();
        const stored = await storage.append('session-1', event);

        expect(stored.id).toBeDefined();
        expect(stored.id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-z0-9]+$/);
        expect(stored.type).toBe(event.type);
        expect(stored.data).toEqual(event.data);
      });

      it('should reject invalid session IDs', async () => {
        /*
        Test Doc:
        - Why: Contract specifies path traversal prevention
        - Contract: Invalid sessionId throws error
        - Usage Notes: Both implementations use validateSessionId()
        - Quality Contribution: Verifies security in both implementations
        - Worked Example: append('../hack', event) → throws
        */
        const event = createToolCallEvent();

        await expect(storage.append('../hack', event)).rejects.toThrow();
        await expect(storage.append('session/path', event)).rejects.toThrow();
      });
    });

    describe('getAll()', () => {
      it('should return empty array for non-existent session', async () => {
        /*
        Test Doc:
        - Why: Contract specifies graceful handling of missing sessions
        - Contract: Non-existent session → []
        - Usage Notes: Don't throw for missing data
        - Quality Contribution: Verifies consistent behavior
        - Worked Example: getAll('missing') → []
        */
        const events = await storage.getAll('non-existent');
        expect(events).toEqual([]);
      });

      it('should return events in order they were appended', async () => {
        /*
        Test Doc:
        - Why: Contract specifies chronological ordering
        - Contract: Events returned in append order
        - Usage Notes: First appended = first in array
        - Quality Contribution: Verifies ordering consistency
        - Worked Example: append(e1), append(e2) → getAll returns [e1, e2]
        */
        const e1 = await storage.append('session-1', createToolCallEvent('Tool1'));
        const e2 = await storage.append('session-1', createToolCallEvent('Tool2'));

        const events = await storage.getAll('session-1');

        expect(events).toHaveLength(2);
        expect(events[0].id).toBe(e1.id);
        expect(events[1].id).toBe(e2.id);
      });
    });

    describe('getSince()', () => {
      it('should return events after specified ID', async () => {
        /*
        Test Doc:
        - Why: Contract specifies incremental sync behavior
        - Contract: getSince(sinceId) returns events AFTER sinceId
        - Usage Notes: sinceId is exclusive (not included)
        - Quality Contribution: Verifies sync logic
        - Worked Example: [e1, e2, e3].getSince(e1.id) → [e2, e3]
        */
        const e1 = await storage.append('session-1', createToolCallEvent('Tool1'));
        const e2 = await storage.append('session-1', createToolCallEvent('Tool2'));
        const e3 = await storage.append('session-1', createToolCallEvent('Tool3'));

        const events = await storage.getSince('session-1', e1.id);

        expect(events).toHaveLength(2);
        expect(events[0].id).toBe(e2.id);
        expect(events[1].id).toBe(e3.id);
      });

      it('should throw when sinceId not found', async () => {
        /*
        Test Doc:
        - Why: Contract specifies error on missing ID
        - Contract: Unknown sinceId → throws
        - Usage Notes: Client should fetch all and retry
        - Quality Contribution: Verifies error handling consistency
        - Worked Example: getSince('s1', 'unknown') → throws
        */
        await storage.append('session-1', createToolCallEvent());

        await expect(storage.getSince('session-1', 'unknown-id')).rejects.toThrow();
      });
    });

    describe('exists()', () => {
      it('should return false for non-existent session', async () => {
        /*
        Test Doc:
        - Why: Contract specifies existence check
        - Contract: Non-existent session → false
        - Usage Notes: Check before expensive operations
        - Quality Contribution: Verifies existence check
        - Worked Example: exists('missing') → false
        */
        const result = await storage.exists('non-existent');
        expect(result).toBe(false);
      });

      it('should return true after appending event', async () => {
        /*
        Test Doc:
        - Why: Contract specifies existence after append
        - Contract: append() → exists() returns true
        - Usage Notes: At least one event present
        - Quality Contribution: Verifies state tracking
        - Worked Example: append('s1', event) → exists('s1') → true
        */
        await storage.append('session-1', createToolCallEvent());
        const result = await storage.exists('session-1');
        expect(result).toBe(true);
      });
    });
  });
}

// Run contract tests against both implementations

// FakeEventStorage
eventStorageContractTests('FakeEventStorage', async () => {
  const storage = new FakeEventStorage();
  return {
    storage,
    cleanup: async () => {
      storage.reset();
    },
  };
});

// EventStorageService (real filesystem)
eventStorageContractTests('EventStorageService', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-storage-contract-'));
  const storage = new EventStorageService(tempDir);
  return {
    storage,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
});
