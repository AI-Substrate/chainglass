/**
 * Tests for StoredEvent to LogEntryProps Transformer
 *
 * Verifies DYK-P5-02: Dedicated transformer for StoredEvent → LogEntryProps conversion.
 *
 * Test Doc:
 * - Why: Critical integration layer between server events and UI rendering
 * - Contract: Each event type maps to correct LogEntryProps shape
 * - Usage Notes: Used by agents page to render session events
 * - Quality Contribution: Catches schema mismatches before runtime
 */

import {
  mergeToolEvents,
  storedEventToLogEntryProps,
  transformEventsToLogEntries,
} from '@/lib/transformers/stored-event-to-log-entry';
import type { StoredEvent } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';

// ============================================================================
// Test Fixtures
// ============================================================================

function createToolCallEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: 'evt-001',
    type: 'tool_call',
    timestamp: '2026-01-27T12:00:00.000Z',
    data: {
      toolName: 'Bash',
      input: 'ls -la',
      toolCallId: 'tc-001',
    },
    ...overrides,
  } as StoredEvent;
}

function createToolResultEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: 'evt-002',
    type: 'tool_result',
    timestamp: '2026-01-27T12:00:01.000Z',
    data: {
      toolCallId: 'tc-001',
      output: 'file1.txt\nfile2.txt',
      isError: false,
    },
    ...overrides,
  } as StoredEvent;
}

function createThinkingEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: 'evt-003',
    type: 'thinking',
    timestamp: '2026-01-27T12:00:02.000Z',
    data: {
      content: 'I am reasoning about this problem...',
      signature: 'sig-abc123',
    },
    ...overrides,
  } as StoredEvent;
}

function createMessageEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: 'evt-004',
    type: 'message',
    timestamp: '2026-01-27T12:00:03.000Z',
    data: {
      content: 'Here is my response to your question.',
      messageId: 'msg-001',
    },
    ...overrides,
  } as StoredEvent;
}

// ============================================================================
// storedEventToLogEntryProps Tests
// ============================================================================

describe('storedEventToLogEntryProps', () => {
  describe('tool_call events', () => {
    it('should convert tool_call to LogEntryProps with toolData', () => {
      const event = createToolCallEvent();
      const props = storedEventToLogEntryProps(event);

      expect(props.key).toBe('evt-001');
      expect(props.messageRole).toBe('assistant');
      expect(props.contentType).toBe('tool_call');
      expect(props.toolData).toBeDefined();
      expect(props.toolData?.toolName).toBe('Bash');
      expect(props.toolData?.input).toBe('ls -la');
      expect(props.toolData?.status).toBe('running');
      expect(props.toolData?.toolCallId).toBe('tc-001');
    });

    it('should handle object input by JSON stringifying', () => {
      const event = createToolCallEvent({
        data: {
          toolName: 'Read',
          input: { path: '/src/index.ts', maxLines: 100 },
          toolCallId: 'tc-002',
        },
      } as Partial<StoredEvent>);

      const props = storedEventToLogEntryProps(event);

      expect(props.toolData?.input).toContain('"path"');
      expect(props.toolData?.input).toContain('/src/index.ts');
    });
  });

  describe('tool_result events', () => {
    it('should convert tool_result to LogEntryProps with complete status', () => {
      const event = createToolResultEvent();
      const props = storedEventToLogEntryProps(event);

      expect(props.key).toBe('evt-002');
      expect(props.messageRole).toBe('assistant');
      expect(props.contentType).toBe('tool_result');
      expect(props.toolData).toBeDefined();
      expect(props.toolData?.output).toBe('file1.txt\nfile2.txt');
      expect(props.toolData?.status).toBe('complete');
      expect(props.toolData?.isError).toBe(false);
    });

    it('should set error status when isError is true', () => {
      const event = createToolResultEvent({
        data: {
          toolCallId: 'tc-001',
          output: 'Command failed: exit code 1',
          isError: true,
        },
      } as Partial<StoredEvent>);

      const props = storedEventToLogEntryProps(event);

      expect(props.toolData?.status).toBe('error');
      expect(props.toolData?.isError).toBe(true);
    });
  });

  describe('thinking events', () => {
    it('should convert thinking to LogEntryProps with thinkingData', () => {
      const event = createThinkingEvent();
      const props = storedEventToLogEntryProps(event);

      expect(props.key).toBe('evt-003');
      expect(props.messageRole).toBe('assistant');
      expect(props.contentType).toBe('thinking');
      expect(props.thinkingData).toBeDefined();
      expect(props.thinkingData?.content).toBe('I am reasoning about this problem...');
      expect(props.thinkingData?.signature).toBe('sig-abc123');
    });

    it('should handle thinking without signature', () => {
      const event = createThinkingEvent({
        data: {
          content: 'Reasoning without signature',
        },
      } as Partial<StoredEvent>);

      const props = storedEventToLogEntryProps(event);

      expect(props.thinkingData?.content).toBe('Reasoning without signature');
      expect(props.thinkingData?.signature).toBeUndefined();
    });
  });

  describe('message events', () => {
    it('should convert message to LogEntryProps with text content', () => {
      const event = createMessageEvent();
      const props = storedEventToLogEntryProps(event);

      expect(props.key).toBe('evt-004');
      expect(props.messageRole).toBe('assistant');
      expect(props.contentType).toBe('text');
      expect(props.content).toBe('Here is my response to your question.');
    });

    it('should handle message without messageId', () => {
      const event = createMessageEvent({
        data: {
          content: 'Response without message ID',
        },
      } as Partial<StoredEvent>);

      const props = storedEventToLogEntryProps(event);

      expect(props.content).toBe('Response without message ID');
      expect(props.contentType).toBe('text');
    });
  });

  describe('unknown event types', () => {
    it('should fallback to text for unknown types', () => {
      const event = {
        id: 'evt-unknown',
        type: 'future_event_type',
        timestamp: '2026-01-27T12:00:00.000Z',
        data: { content: 'Some future content' },
      } as unknown as StoredEvent;

      const props = storedEventToLogEntryProps(event);

      expect(props.contentType).toBe('text');
      expect(props.content).toBe('Some future content');
    });
  });
});

// ============================================================================
// mergeToolEvents Tests
// ============================================================================

describe('mergeToolEvents', () => {
  it('should merge tool_result into corresponding tool_call', () => {
    const events: StoredEvent[] = [
      createToolCallEvent({ id: 'evt-001' }),
      createToolResultEvent({ id: 'evt-002' }),
    ];

    const result = mergeToolEvents(events);

    // Should only have 1 entry (tool_result merged into tool_call)
    expect(result).toHaveLength(1);
    expect(result[0].contentType).toBe('tool_call');
    expect(result[0].toolData?.status).toBe('complete');
    expect(result[0].toolData?.output).toBe('file1.txt\nfile2.txt');
  });

  it('should keep tool_call as running if no result yet', () => {
    const events: StoredEvent[] = [createToolCallEvent()];

    const result = mergeToolEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].toolData?.status).toBe('running');
    expect(result[0].toolData?.output).toBeUndefined();
  });

  it('should handle multiple tool calls with results', () => {
    const events: StoredEvent[] = [
      createToolCallEvent({
        id: 'evt-001',
        data: { toolName: 'Bash', input: 'ls', toolCallId: 'tc-001' },
      } as Partial<StoredEvent>),
      createToolCallEvent({
        id: 'evt-002',
        data: { toolName: 'Read', input: 'file.txt', toolCallId: 'tc-002' },
      } as Partial<StoredEvent>),
      createToolResultEvent({
        id: 'evt-003',
        data: { toolCallId: 'tc-001', output: 'ls output', isError: false },
      } as Partial<StoredEvent>),
      createToolResultEvent({
        id: 'evt-004',
        data: { toolCallId: 'tc-002', output: 'file contents', isError: false },
      } as Partial<StoredEvent>),
    ];

    const result = mergeToolEvents(events);

    expect(result).toHaveLength(2);
    expect(result[0].toolData?.toolName).toBe('Bash');
    expect(result[0].toolData?.output).toBe('ls output');
    expect(result[1].toolData?.toolName).toBe('Read');
    expect(result[1].toolData?.output).toBe('file contents');
  });

  it('should preserve thinking events unchanged', () => {
    const events: StoredEvent[] = [
      createThinkingEvent(),
      createToolCallEvent(),
      createToolResultEvent(),
    ];

    const result = mergeToolEvents(events);

    expect(result).toHaveLength(2); // thinking + merged tool
    expect(result[0].contentType).toBe('thinking');
    expect(result[1].contentType).toBe('tool_call');
  });

  it('should mark merged error results correctly', () => {
    const events: StoredEvent[] = [
      createToolCallEvent(),
      createToolResultEvent({
        data: { toolCallId: 'tc-001', output: 'Error!', isError: true },
      } as Partial<StoredEvent>),
    ];

    const result = mergeToolEvents(events);

    expect(result[0].toolData?.status).toBe('error');
    expect(result[0].toolData?.isError).toBe(true);
  });

  it('should preserve message events in order', () => {
    const events: StoredEvent[] = [
      createToolCallEvent({ id: 'evt-001' }),
      createToolResultEvent({ id: 'evt-002' }),
      createMessageEvent({ id: 'evt-003' }),
    ];

    const result = mergeToolEvents(events);

    expect(result).toHaveLength(2); // merged tool + message
    expect(result[0].contentType).toBe('tool_call');
    expect(result[1].contentType).toBe('text');
    expect(result[1].content).toBe('Here is my response to your question.');
  });
});

// ============================================================================
// transformEventsToLogEntries Tests
// ============================================================================

describe('transformEventsToLogEntries', () => {
  it('should transform and merge a typical event stream', () => {
    const events: StoredEvent[] = [
      createThinkingEvent({ id: 'evt-001' }),
      createToolCallEvent({ id: 'evt-002' }),
      createToolResultEvent({ id: 'evt-003' }),
    ];

    const result = transformEventsToLogEntries(events);

    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('evt-001');
    expect(result[0].contentType).toBe('thinking');
    expect(result[1].key).toBe('evt-002');
    expect(result[1].contentType).toBe('tool_call');
    expect(result[1].toolData?.status).toBe('complete');
  });

  it('should handle empty event array', () => {
    const result = transformEventsToLogEntries([]);
    expect(result).toEqual([]);
  });

  it('should transform a stream with message events', () => {
    const events: StoredEvent[] = [
      createThinkingEvent({ id: 'evt-001' }),
      createToolCallEvent({ id: 'evt-002' }),
      createToolResultEvent({ id: 'evt-003' }),
      createMessageEvent({ id: 'evt-004' }),
    ];

    const result = transformEventsToLogEntries(events);

    expect(result).toHaveLength(3); // thinking + merged tool + message
    expect(result[0].contentType).toBe('thinking');
    expect(result[1].contentType).toBe('tool_call');
    expect(result[2].contentType).toBe('text');
    expect(result[2].content).toBe('Here is my response to your question.');
  });
});
