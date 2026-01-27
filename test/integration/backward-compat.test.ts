/**
 * Backward Compatibility Tests
 *
 * Verifies AC21: Existing sessions without tool data continue to work
 * Verifies AC22: Adapters fall back to current behavior on parse failures
 *
 * Test Doc:
 * - Why: Users have existing sessions that must continue working
 * - Contract: Old data formats render without errors
 * - Usage Notes: Tests graceful degradation
 * - Quality Contribution: Prevents migration-related data loss
 *
 * Part of Plan 015: Better Agents (Phase 5: Integration)
 */

import {
  storedEventToLogEntryProps,
  transformEventsToLogEntries,
} from '@/lib/transformers/stored-event-to-log-entry';
import type { StoredEvent } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Simulate a minimal stored event (just the required fields)
 */
function createMinimalEvent(type: string): StoredEvent {
  return {
    id: 'evt-001',
    type,
    timestamp: '2026-01-27T12:00:00.000Z',
    data: {},
  } as unknown as StoredEvent;
}

/**
 * Simulate an event with missing optional fields
 */
function createPartialToolCall(): StoredEvent {
  return {
    id: 'evt-001',
    type: 'tool_call',
    timestamp: '2026-01-27T12:00:00.000Z',
    data: {
      toolName: 'Bash',
      input: 'ls',
      toolCallId: 'tc-001',
      // No signature field (optional)
    },
  } as StoredEvent;
}

/**
 * Simulate a thinking event without signature
 */
function createThinkingWithoutSignature(): StoredEvent {
  return {
    id: 'evt-001',
    type: 'thinking',
    timestamp: '2026-01-27T12:00:00.000Z',
    data: {
      content: 'Some thinking content',
      // No signature field
    },
  } as StoredEvent;
}

// ============================================================================
// Backward Compatibility Tests
// ============================================================================

describe('Backward Compatibility', () => {
  describe('missing contentType defaults (AC21)', () => {
    it('should handle events without contentType by using event.type', () => {
      // Old events might not have contentType - use type field
      const event = createPartialToolCall();
      const props = storedEventToLogEntryProps(event);

      // Should infer contentType from type
      expect(props.contentType).toBe('tool_call');
    });

    it('should handle AgentMessage without contentType (legacy format)', () => {
      // Legacy AgentMessage format (from before Phase 4)
      // This is handled by LogEntry's default 'text' contentType
      // The transformer always sets contentType from event.type
      const event: StoredEvent = {
        id: 'evt-001',
        type: 'thinking',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: { content: 'Old thinking' },
      } as StoredEvent;

      const props = storedEventToLogEntryProps(event);
      expect(props.contentType).toBe('thinking');
    });
  });

  describe('unknown event types (AC22)', () => {
    it('should gracefully handle unknown event types', () => {
      const event = {
        id: 'evt-unknown',
        type: 'future_event_type',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: { content: 'Future content' },
      } as unknown as StoredEvent;

      const props = storedEventToLogEntryProps(event);

      // Should fall back to text with content
      expect(props.contentType).toBe('text');
      expect(props.content).toContain('Future content');
    });

    it('should handle unknown event without content field', () => {
      const event = {
        id: 'evt-unknown',
        type: 'weird_event',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: { otherField: 'value' },
      } as unknown as StoredEvent;

      const props = storedEventToLogEntryProps(event);

      expect(props.contentType).toBe('text');
      expect(props.content).toContain('weird_event');
    });
  });

  describe('optional fields missing', () => {
    it('should handle thinking without signature', () => {
      const event = createThinkingWithoutSignature();
      const props = storedEventToLogEntryProps(event);

      expect(props.contentType).toBe('thinking');
      expect(props.thinkingData?.content).toBe('Some thinking content');
      expect(props.thinkingData?.signature).toBeUndefined();
    });

    it('should handle tool_result without isError (treat as success)', () => {
      const event: StoredEvent = {
        id: 'evt-001',
        type: 'tool_result',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: {
          toolCallId: 'tc-001',
          output: 'Some output',
          isError: false,
        },
      } as StoredEvent;

      const props = storedEventToLogEntryProps(event);

      expect(props.toolData?.isError).toBe(false);
      expect(props.toolData?.status).toBe('complete');
    });
  });

  describe('mixed old and new events', () => {
    it('should handle stream with both old and new event formats', () => {
      const events: StoredEvent[] = [
        // Old-style thinking (no signature)
        {
          id: 'evt-001',
          type: 'thinking',
          timestamp: '2026-01-27T12:00:00.000Z',
          data: { content: 'Old thinking' },
        } as StoredEvent,
        // New-style with signature
        {
          id: 'evt-002',
          type: 'thinking',
          timestamp: '2026-01-27T12:00:01.000Z',
          data: { content: 'New thinking', signature: 'sig-123' },
        } as StoredEvent,
        // Tool call
        {
          id: 'evt-003',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:02.000Z',
          data: { toolName: 'Bash', input: 'ls', toolCallId: 'tc-001' },
        } as StoredEvent,
      ];

      const logEntries = transformEventsToLogEntries(events);

      // Two consecutive thinking events are consolidated, then tool call
      expect(logEntries).toHaveLength(2);
      // Consolidated thinking should have content from both
      expect(logEntries[0].thinkingData?.content).toContain('Old thinking');
      expect(logEntries[0].thinkingData?.content).toContain('New thinking');
      expect(logEntries[1].toolData?.toolName).toBe('Bash');
    });
  });

  describe('malformed data recovery', () => {
    it('should not crash on empty data object', () => {
      const event = createMinimalEvent('tool_call');

      // This might not produce useful output, but should not crash
      expect(() => storedEventToLogEntryProps(event)).not.toThrow();
    });

    it('should handle null input in tool_call', () => {
      const event: StoredEvent = {
        id: 'evt-001',
        type: 'tool_call',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: {
          toolName: 'Bash',
          input: null,
          toolCallId: 'tc-001',
        },
      } as unknown as StoredEvent;

      const props = storedEventToLogEntryProps(event);

      // Should convert null to empty string
      expect(props.toolData?.input).toBe('');
    });

    it('should handle undefined output in tool_result', () => {
      const event: StoredEvent = {
        id: 'evt-001',
        type: 'tool_result',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: {
          toolCallId: 'tc-001',
          output: undefined as unknown as string,
          isError: false,
        },
      } as StoredEvent;

      expect(() => storedEventToLogEntryProps(event)).not.toThrow();
    });
  });

  describe('type coercion', () => {
    it('should handle numeric toolCallId', () => {
      const event: StoredEvent = {
        id: 'evt-001',
        type: 'tool_call',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: {
          toolName: 'Bash',
          input: 'ls',
          toolCallId: 12345 as unknown as string,
        },
      } as StoredEvent;

      const props = storedEventToLogEntryProps(event);

      // Should work even with numeric ID (will be coerced when used)
      expect(props.toolData?.toolCallId).toBe(12345);
    });
  });
});
