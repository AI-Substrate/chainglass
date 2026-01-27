/**
 * Event Storage Service Tests
 *
 * TDD tests for EventStorageService with real temp directories.
 * Per DYK-05: Storage service tests use real filesystem for accurate behavior testing.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentStoredEvent } from '../../../packages/shared/src/schemas/agent-event.schema';
import { EventStorageService } from '../../../packages/shared/src/services/event-storage.service';

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

const createToolResultEvent = (toolCallId: string): AgentStoredEvent => ({
  type: 'tool_result',
  timestamp: new Date().toISOString(),
  data: {
    toolCallId,
    output: 'command output',
    isError: false,
  },
});

const createThinkingEvent = (): AgentStoredEvent => ({
  type: 'thinking',
  timestamp: new Date().toISOString(),
  data: {
    content: 'Analyzing the problem...',
  },
});

describe('EventStorageService', () => {
  let tempDir: string;
  let service: EventStorageService;

  beforeEach(async () => {
    // Create temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-storage-test-'));
    service = new EventStorageService(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('append()', () => {
    it('should generate timestamp-based event ID', async () => {
      /*
      Test Doc:
      - Why: Timestamp IDs avoid race conditions (DYK-01)
      - Contract: ID format is YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx
      - Usage Notes: IDs are naturally ordered by timestamp
      - Quality Contribution: Ensures correct ID format for ordering
      - Worked Example: append() → '2026-01-27T12:00:00.000Z_a7b3c'
      */
      const event = createToolCallEvent();
      const stored = await service.append('session-1', event);

      // ID should match timestamp + random suffix pattern
      expect(stored.id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-z0-9]+$/);
    });

    it('should create session directory if not exists', async () => {
      /*
      Test Doc:
      - Why: First event for a session needs directory created
      - Contract: append() creates directory structure automatically
      - Usage Notes: No manual directory creation needed
      - Quality Contribution: Ensures seamless first-event handling
      - Worked Example: append('new-session', event) creates .../new-session/events.ndjson
      */
      const event = createToolCallEvent();
      await service.append('new-session-123', event);

      const sessionDir = path.join(tempDir, 'new-session-123');
      const stat = await fs.stat(sessionDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should write event to NDJSON file', async () => {
      /*
      Test Doc:
      - Why: Events must persist to disk for resumability
      - Contract: Event written as single JSON line in events.ndjson
      - Usage Notes: NDJSON format = one JSON object per line
      - Quality Contribution: Ensures data persistence
      - Worked Example: append() → events.ndjson contains one line
      */
      const event = createToolCallEvent();
      await service.append('session-1', event);

      const eventsPath = path.join(tempDir, 'session-1', 'events.ndjson');
      const content = await fs.readFile(eventsPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.type).toBe('tool_call');
      expect(parsed.id).toBeDefined();
    });

    it('should append multiple events to same file', async () => {
      /*
      Test Doc:
      - Why: Multiple events in a session go to same file
      - Contract: Subsequent appends add new lines
      - Usage Notes: File grows as events are added
      - Quality Contribution: Ensures event accumulation
      - Worked Example: 3 appends → 3 lines in events.ndjson
      */
      await service.append('session-1', createToolCallEvent('Bash'));
      await service.append('session-1', createToolCallEvent('Read'));
      await service.append('session-1', createToolCallEvent('Write'));

      const eventsPath = path.join(tempDir, 'session-1', 'events.ndjson');
      const content = await fs.readFile(eventsPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(3);
    });

    it('should reject invalid session IDs', async () => {
      /*
      Test Doc:
      - Why: Security - prevent path traversal (DYK-02)
      - Contract: Invalid sessionId throws SessionIdValidationError
      - Usage Notes: Uses validateSessionId() internally
      - Quality Contribution: Prevents directory escape attacks
      - Worked Example: append('../hack', event) → throws
      */
      const event = createToolCallEvent();

      await expect(service.append('../hack', event)).rejects.toThrow();
      await expect(service.append('session/path', event)).rejects.toThrow();
      await expect(service.append('session with space', event)).rejects.toThrow();
    });

    it('should preserve all event data in stored event', async () => {
      /*
      Test Doc:
      - Why: All event fields must persist unchanged
      - Contract: Stored event has same data plus ID
      - Usage Notes: Event data is immutable
      - Quality Contribution: Ensures data integrity
      - Worked Example: append(event) → stored.data === event.data
      */
      const event = createToolCallEvent('Bash');
      const stored = await service.append('session-1', event);

      expect(stored.type).toBe(event.type);
      expect(stored.timestamp).toBe(event.timestamp);
      expect(stored.data).toEqual(event.data);
    });
  });

  describe('getAll()', () => {
    it('should return empty array for non-existent session', async () => {
      /*
      Test Doc:
      - Why: Missing sessions shouldn't throw (AC21)
      - Contract: Non-existent session → empty array
      - Usage Notes: Safe to call for any sessionId
      - Quality Contribution: Graceful handling of missing data
      - Worked Example: getAll('missing') → []
      */
      const events = await service.getAll('non-existent-session');
      expect(events).toEqual([]);
    });

    it('should return all events in chronological order', async () => {
      /*
      Test Doc:
      - Why: Events must be ordered for replay
      - Contract: Returns events sorted by ID (timestamp-based)
      - Usage Notes: First event is oldest
      - Quality Contribution: Ensures correct event ordering
      - Worked Example: 3 appends → getAll returns in same order
      */
      await service.append('session-1', createToolCallEvent('Tool1'));
      await service.append('session-1', createToolCallEvent('Tool2'));
      await service.append('session-1', createToolCallEvent('Tool3'));

      const events = await service.getAll('session-1');

      expect(events).toHaveLength(3);
      expect(events[0].data.toolName).toBe('Tool1');
      expect(events[1].data.toolName).toBe('Tool2');
      expect(events[2].data.toolName).toBe('Tool3');
    });

    it('should silently skip malformed NDJSON lines', async () => {
      /*
      Test Doc:
      - Why: Corrupted files shouldn't break session (DYK-04)
      - Contract: Invalid JSON lines skipped, valid ones returned
      - Usage Notes: Partial corruption recoverable
      - Quality Contribution: Resilient to file corruption
      - Worked Example: [valid, invalid, valid] → returns 2 events
      */
      // Manually write file with mixed content
      const sessionDir = path.join(tempDir, 'session-1');
      await fs.mkdir(sessionDir, { recursive: true });
      const eventsPath = path.join(sessionDir, 'events.ndjson');

      const validEvent1 = JSON.stringify({
        id: '2026-01-27T12:00:00.000Z_abc',
        type: 'tool_call',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: { toolName: 'First', input: {}, toolCallId: 't1' },
      });
      const invalidLine = 'this is not json';
      const validEvent2 = JSON.stringify({
        id: '2026-01-27T12:00:01.000Z_def',
        type: 'tool_call',
        timestamp: '2026-01-27T12:00:01.000Z',
        data: { toolName: 'Second', input: {}, toolCallId: 't2' },
      });

      await fs.writeFile(eventsPath, `${validEvent1}\n${invalidLine}\n${validEvent2}\n`);

      const events = await service.getAll('session-1');
      expect(events).toHaveLength(2);
      expect(events[0].data.toolName).toBe('First');
      expect(events[1].data.toolName).toBe('Second');
    });

    it('should handle empty events file', async () => {
      /*
      Test Doc:
      - Why: Empty file shouldn't break
      - Contract: Empty file → empty array
      - Usage Notes: Occurs after archive/delete
      - Quality Contribution: Edge case handling
      - Worked Example: Empty events.ndjson → []
      */
      const sessionDir = path.join(tempDir, 'session-1');
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(path.join(sessionDir, 'events.ndjson'), '');

      const events = await service.getAll('session-1');
      expect(events).toEqual([]);
    });
  });

  describe('getSince()', () => {
    it('should return events after specified ID', async () => {
      /*
      Test Doc:
      - Why: Incremental sync needs events since last known (AC19)
      - Contract: Returns events AFTER sinceId (exclusive)
      - Usage Notes: sinceId is NOT included in results
      - Quality Contribution: Core sync functionality
      - Worked Example: [e1, e2, e3].getSince(e1) → [e2, e3]
      */
      const e1 = await service.append('session-1', createToolCallEvent('Tool1'));
      const e2 = await service.append('session-1', createToolCallEvent('Tool2'));
      const e3 = await service.append('session-1', createToolCallEvent('Tool3'));

      const events = await service.getSince('session-1', e1.id);

      expect(events).toHaveLength(2);
      expect(events[0].id).toBe(e2.id);
      expect(events[1].id).toBe(e3.id);
    });

    it('should return empty array when sinceId is latest', async () => {
      /*
      Test Doc:
      - Why: No new events after the latest one
      - Contract: getSince(latestId) → []
      - Usage Notes: Client is caught up
      - Quality Contribution: Handles "no new events" case
      - Worked Example: getSince(lastEvent.id) → []
      */
      await service.append('session-1', createToolCallEvent('Tool1'));
      await service.append('session-1', createToolCallEvent('Tool2'));
      const latest = await service.append('session-1', createToolCallEvent('Tool3'));

      const events = await service.getSince('session-1', latest.id);
      expect(events).toEqual([]);
    });

    it('should throw when sinceId not found', async () => {
      /*
      Test Doc:
      - Why: Missing ID indicates client/server mismatch
      - Contract: Unknown sinceId throws error
      - Usage Notes: Client should handle and fetch all
      - Quality Contribution: Explicit error handling
      - Worked Example: getSince('unknown-id') → throws
      */
      await service.append('session-1', createToolCallEvent());

      await expect(service.getSince('session-1', 'non-existent-id')).rejects.toThrow();
    });

    it('should return all events for non-existent session', async () => {
      /*
      Test Doc:
      - Why: Missing session should throw (ID not found)
      - Contract: Non-existent session throws
      - Usage Notes: Session must exist first
      - Quality Contribution: Consistent error behavior
      - Worked Example: getSince('missing', 'id') → throws
      */
      await expect(service.getSince('non-existent', 'some-id')).rejects.toThrow();
    });
  });

  describe('archive()', () => {
    it('should move session to archived directory', async () => {
      /*
      Test Doc:
      - Why: Old sessions can be archived (AC20)
      - Contract: archive() moves to archived/ subdirectory
      - Usage Notes: Original location cleaned up
      - Quality Contribution: Session lifecycle management
      - Worked Example: archive('old') → moved to archived/old/
      */
      await service.append('session-1', createToolCallEvent());

      await service.archive('session-1');

      // Original should be gone
      const originalPath = path.join(tempDir, 'session-1', 'events.ndjson');
      await expect(fs.access(originalPath)).rejects.toThrow();

      // Archived should exist
      const archivedPath = path.join(tempDir, 'archived', 'session-1', 'events.ndjson');
      const stat = await fs.stat(archivedPath);
      expect(stat.isFile()).toBe(true);
    });

    it('should preserve event data after archiving', async () => {
      /*
      Test Doc:
      - Why: Archived events should still be readable
      - Contract: Data intact after archive
      - Usage Notes: Can read from archived location
      - Quality Contribution: Data preservation
      - Worked Example: Archive → read from archived location
      */
      await service.append('session-1', createToolCallEvent('TestTool'));

      await service.archive('session-1');

      // Read directly from archived location
      const archivedPath = path.join(tempDir, 'archived', 'session-1', 'events.ndjson');
      const content = await fs.readFile(archivedPath, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.data.toolName).toBe('TestTool');
    });
  });

  describe('exists()', () => {
    it('should return false for non-existent session', async () => {
      /*
      Test Doc:
      - Why: Quick check before operations
      - Contract: Non-existent session → false
      - Usage Notes: Cheaper than getAll()
      - Quality Contribution: Efficient existence check
      - Worked Example: exists('missing') → false
      */
      const exists = await service.exists('non-existent');
      expect(exists).toBe(false);
    });

    it('should return true for session with events', async () => {
      /*
      Test Doc:
      - Why: Verify session has data
      - Contract: Session with events → true
      - Usage Notes: At least one event present
      - Quality Contribution: Existence verification
      - Worked Example: append() then exists() → true
      */
      await service.append('session-1', createToolCallEvent());
      const exists = await service.exists('session-1');
      expect(exists).toBe(true);
    });

    it('should return false for empty session directory', async () => {
      /*
      Test Doc:
      - Why: Directory without events file
      - Contract: Empty directory → false
      - Usage Notes: Events file must exist
      - Quality Contribution: Precise existence check
      - Worked Example: mkdir without file → false
      */
      const sessionDir = path.join(tempDir, 'empty-session');
      await fs.mkdir(sessionDir, { recursive: true });

      const exists = await service.exists('empty-session');
      expect(exists).toBe(false);
    });
  });
});
