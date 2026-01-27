/**
 * Session Resumption Integration Test
 *
 * Verifies AC18: Page refresh reloads session events from server (no data loss)
 *
 * Test Doc:
 * - Why: Users expect session history to survive page refresh
 * - Contract: StoredEvents fetched from storage and rendered correctly
 * - Usage Notes: Tests the full flow from storage to UI transformation
 * - Quality Contribution: Catches storage/transformer/UI integration issues
 *
 * Part of Plan 015: Better Agents (Phase 5: Integration)
 */

import { transformEventsToLogEntries } from '@/lib/transformers/stored-event-to-log-entry';
import type { StoredEvent } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a realistic session event stream with mixed event types
 */
function createRealisticEventStream(): StoredEvent[] {
  const baseTime = new Date('2026-01-27T12:00:00.000Z');

  return [
    // Thinking event
    {
      id: '2026-01-27T12:00:00.000Z_00001',
      type: 'thinking',
      timestamp: new Date(baseTime.getTime()).toISOString(),
      data: {
        content: 'Let me analyze the user request...',
      },
    } as StoredEvent,
    // Tool call - ls
    {
      id: '2026-01-27T12:00:01.000Z_00002',
      type: 'tool_call',
      timestamp: new Date(baseTime.getTime() + 1000).toISOString(),
      data: {
        toolName: 'Bash',
        input: 'ls -la',
        toolCallId: 'tc-001',
      },
    } as StoredEvent,
    // Tool result - ls
    {
      id: '2026-01-27T12:00:02.000Z_00003',
      type: 'tool_result',
      timestamp: new Date(baseTime.getTime() + 2000).toISOString(),
      data: {
        toolCallId: 'tc-001',
        output:
          'total 16\ndrwxr-xr-x 4 user staff 128 Jan 27 12:00 .\ndrwxr-xr-x 3 user staff 96 Jan 27 11:00 ..\n-rw-r--r-- 1 user staff 1234 Jan 27 12:00 index.ts',
        isError: false,
      },
    } as StoredEvent,
    // Second thinking event
    {
      id: '2026-01-27T12:00:03.000Z_00004',
      type: 'thinking',
      timestamp: new Date(baseTime.getTime() + 3000).toISOString(),
      data: {
        content: 'I see the files, let me read index.ts...',
        signature: 'sig-abc123',
      },
    } as StoredEvent,
    // Tool call - read
    {
      id: '2026-01-27T12:00:04.000Z_00005',
      type: 'tool_call',
      timestamp: new Date(baseTime.getTime() + 4000).toISOString(),
      data: {
        toolName: 'Read',
        input: { path: 'index.ts', startLine: 1, endLine: 50 },
        toolCallId: 'tc-002',
      },
    } as StoredEvent,
    // Tool result - read
    {
      id: '2026-01-27T12:00:05.000Z_00006',
      type: 'tool_result',
      timestamp: new Date(baseTime.getTime() + 5000).toISOString(),
      data: {
        toolCallId: 'tc-002',
        output: 'export function main() {\n  console.log("Hello");\n}',
        isError: false,
      },
    } as StoredEvent,
  ];
}

/**
 * Create an event stream with an error result
 */
function createEventStreamWithError(): StoredEvent[] {
  return [
    {
      id: 'evt-001',
      type: 'tool_call',
      timestamp: '2026-01-27T12:00:00.000Z',
      data: {
        toolName: 'Bash',
        input: 'cat nonexistent.txt',
        toolCallId: 'tc-err-001',
      },
    } as StoredEvent,
    {
      id: 'evt-002',
      type: 'tool_result',
      timestamp: '2026-01-27T12:00:01.000Z',
      data: {
        toolCallId: 'tc-err-001',
        output: 'cat: nonexistent.txt: No such file or directory',
        isError: true,
      },
    } as StoredEvent,
  ];
}

// ============================================================================
// Session Resumption Tests
// ============================================================================

describe('Session Resumption', () => {
  describe('transformer integration with realistic events', () => {
    it('should transform all events from a realistic session', () => {
      /**
       * Simulates: Page loads → fetches events from storage → transforms to UI
       * This is what happens on page refresh (AC18)
       */
      const events = createRealisticEventStream();
      const logEntries = transformEventsToLogEntries(events);

      // Should have: 2 thinking + 2 merged tool calls = 4 entries
      // (tool_result merged into tool_call, not displayed separately)
      expect(logEntries).toHaveLength(4);
    });

    it('should merge tool_call and tool_result correctly', () => {
      const events = createRealisticEventStream();
      const logEntries = transformEventsToLogEntries(events);

      // Find the Bash tool call
      const bashEntry = logEntries.find((e) => e.toolData?.toolName === 'Bash');
      expect(bashEntry).toBeDefined();
      expect(bashEntry?.toolData?.status).toBe('complete');
      expect(bashEntry?.toolData?.output).toContain('index.ts');
    });

    it('should preserve thinking events with signatures', () => {
      const events = createRealisticEventStream();
      const logEntries = transformEventsToLogEntries(events);

      // Find thinking entry with signature
      const thinkingWithSig = logEntries.find(
        (e) => e.contentType === 'thinking' && e.thinkingData?.signature
      );
      expect(thinkingWithSig).toBeDefined();
      expect(thinkingWithSig?.thinkingData?.signature).toBe('sig-abc123');
    });

    it('should preserve event ordering', () => {
      const events = createRealisticEventStream();
      const logEntries = transformEventsToLogEntries(events);

      // First entry should be thinking
      expect(logEntries[0].contentType).toBe('thinking');
      // Second should be Bash tool call
      expect(logEntries[1].toolData?.toolName).toBe('Bash');
      // Third should be thinking
      expect(logEntries[2].contentType).toBe('thinking');
      // Fourth should be Read tool call
      expect(logEntries[3].toolData?.toolName).toBe('Read');
    });
  });

  describe('error handling in resumed sessions', () => {
    it('should mark errored tool calls correctly', () => {
      const events = createEventStreamWithError();
      const logEntries = transformEventsToLogEntries(events);

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].toolData?.status).toBe('error');
      expect(logEntries[0].toolData?.isError).toBe(true);
      expect(logEntries[0].toolData?.output).toContain('No such file or directory');
    });
  });

  describe('edge cases', () => {
    it('should handle empty event array', () => {
      const logEntries = transformEventsToLogEntries([]);
      expect(logEntries).toEqual([]);
    });

    it('should handle tool_call without corresponding result (in-progress)', () => {
      const events: StoredEvent[] = [
        {
          id: 'evt-001',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:00.000Z',
          data: {
            toolName: 'Bash',
            input: 'npm install',
            toolCallId: 'tc-pending',
          },
        } as StoredEvent,
      ];

      const logEntries = transformEventsToLogEntries(events);

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].toolData?.status).toBe('running');
      expect(logEntries[0].toolData?.output).toBeUndefined();
    });

    it('should handle orphaned tool_result (no matching call)', () => {
      // This shouldn't happen in practice, but the transformer should be robust
      const events: StoredEvent[] = [
        {
          id: 'evt-001',
          type: 'tool_result',
          timestamp: '2026-01-27T12:00:00.000Z',
          data: {
            toolCallId: 'tc-orphan',
            output: 'Orphaned result',
            isError: false,
          },
        } as StoredEvent,
      ];

      const logEntries = transformEventsToLogEntries(events);

      // Orphaned results are skipped (no tool_call to merge into)
      expect(logEntries).toHaveLength(0);
    });

    it('should handle object input in tool_call', () => {
      const events: StoredEvent[] = [
        {
          id: 'evt-001',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:00.000Z',
          data: {
            toolName: 'Read',
            input: { path: 'src/index.ts', lines: [1, 50] },
            toolCallId: 'tc-obj',
          },
        } as StoredEvent,
      ];

      const logEntries = transformEventsToLogEntries(events);

      expect(logEntries[0].toolData?.input).toContain('"path"');
      expect(logEntries[0].toolData?.input).toContain('src/index.ts');
    });
  });

  describe('key generation for React rendering', () => {
    it('should generate unique keys from event IDs', () => {
      const events = createRealisticEventStream();
      const logEntries = transformEventsToLogEntries(events);

      const keys = logEntries.map((e) => e.key);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('should use event ID as key', () => {
      const events: StoredEvent[] = [
        {
          id: 'custom-event-id-123',
          type: 'thinking',
          timestamp: '2026-01-27T12:00:00.000Z',
          data: { content: 'Test' },
        } as StoredEvent,
      ];

      const logEntries = transformEventsToLogEntries(events);

      expect(logEntries[0].key).toBe('custom-event-id-123');
    });
  });
});
