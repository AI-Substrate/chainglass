import { describe, expect, it } from 'vitest';

import { parseEventsJsonlLine } from '@chainglass/shared';

/**
 * Unit tests for EventsJsonlParser — pure function that translates
 * a single events.jsonl line into an AgentEvent.
 *
 * TDD: Written FIRST (RED), implementation follows (GREEN).
 *
 * events.jsonl format per line:
 * {"type":"<event_type>","data":{...},"timestamp":"...","id":"..."}
 */

describe('parseEventsJsonlLine', () => {
  it('should parse assistant.message into AgentEvent message', () => {
    const line = JSON.stringify({
      type: 'assistant.message',
      data: { content: 'Hello world', messageId: 'msg-001' },
      timestamp: '2026-02-28T01:00:00.000Z',
      id: 'evt-001',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('message');
    expect(event?.timestamp).toBe('2026-02-28T01:00:00.000Z');
    if (event?.type === 'message') {
      expect(event?.data.content).toBe('Hello world');
      expect(event?.data.messageId).toBe('msg-001');
    }
  });

  it('should parse assistant.message_delta into AgentEvent text_delta', () => {
    const line = JSON.stringify({
      type: 'assistant.message_delta',
      data: { content: 'partial text', messageId: 'msg-002' },
      timestamp: '2026-02-28T01:00:01.000Z',
      id: 'evt-002',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('text_delta');
    if (event?.type === 'text_delta') {
      expect(event?.data.content).toBe('partial text');
    }
  });

  it('should parse tool.execution_start into AgentEvent tool_call', () => {
    const line = JSON.stringify({
      type: 'tool.execution_start',
      data: {
        name: 'Bash',
        input: { command: 'ls -la' },
        id: 'tool-call-001',
      },
      timestamp: '2026-02-28T01:00:02.000Z',
      id: 'evt-003',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('tool_call');
    if (event?.type === 'tool_call') {
      expect(event?.data.toolName).toBe('Bash');
      expect(event?.data.toolCallId).toBe('tool-call-001');
      expect(event?.data.input).toEqual({ command: 'ls -la' });
    }
  });

  it('should parse tool.execution_complete into AgentEvent tool_result', () => {
    const line = JSON.stringify({
      type: 'tool.execution_complete',
      data: {
        id: 'tool-call-001',
        output: 'total 42\ndrwxr-xr-x ...',
        isError: false,
      },
      timestamp: '2026-02-28T01:00:03.000Z',
      id: 'evt-004',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('tool_result');
    if (event?.type === 'tool_result') {
      expect(event?.data.toolCallId).toBe('tool-call-001');
      expect(event?.data.output).toBe('total 42\ndrwxr-xr-x ...');
      expect(event?.data.isError).toBe(false);
    }
  });

  it('should parse assistant.reasoning into AgentEvent thinking', () => {
    const line = JSON.stringify({
      type: 'assistant.reasoning',
      data: { content: 'Let me think about this...' },
      timestamp: '2026-02-28T01:00:04.000Z',
      id: 'evt-005',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('thinking');
    if (event?.type === 'thinking') {
      expect(event?.data.content).toBe('Let me think about this...');
    }
  });

  it('should parse assistant.usage into AgentEvent usage', () => {
    const line = JSON.stringify({
      type: 'assistant.usage',
      data: {
        inputTokens: 1500,
        outputTokens: 800,
        totalTokens: 2300,
        tokenLimit: 200000,
      },
      timestamp: '2026-02-28T01:00:05.000Z',
      id: 'evt-006',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('usage');
    if (event?.type === 'usage') {
      expect(event?.data.inputTokens).toBe(1500);
      expect(event?.data.outputTokens).toBe(800);
      expect(event?.data.totalTokens).toBe(2300);
      expect(event?.data.tokenLimit).toBe(200000);
    }
  });

  it('should parse session.idle into AgentEvent session_idle', () => {
    const line = JSON.stringify({
      type: 'session.idle',
      data: { sessionId: 'abc-123' },
      timestamp: '2026-02-28T01:00:06.000Z',
      id: 'evt-007',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('session_idle');
    if (event?.type === 'session_idle') {
      expect(event?.data.sessionId).toBe('abc-123');
    }
  });

  it('should parse session.start into AgentEvent session_start', () => {
    const line = JSON.stringify({
      type: 'session.start',
      data: { sessionId: 'abc-123' },
      timestamp: '2026-02-28T01:00:07.000Z',
      id: 'evt-008',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('session_start');
  });

  it('should parse session.error into AgentEvent session_error', () => {
    const line = JSON.stringify({
      type: 'session.error',
      data: { errorType: 'rate_limit', message: 'Too many requests' },
      timestamp: '2026-02-28T01:00:08.000Z',
      id: 'evt-009',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('session_error');
    if (event?.type === 'session_error') {
      expect(event?.data.errorType).toBe('rate_limit');
      expect(event?.data.message).toBe('Too many requests');
    }
  });

  it('should parse user.message into AgentEvent user_prompt', () => {
    const line = JSON.stringify({
      type: 'user.message',
      data: { content: 'Fix the bug in auth.ts' },
      timestamp: '2026-02-28T01:00:09.000Z',
      id: 'evt-010',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('user_prompt');
    if (event?.type === 'user_prompt') {
      expect(event?.data.content).toBe('Fix the bug in auth.ts');
    }
  });

  it('should map unknown event types to raw event', () => {
    const line = JSON.stringify({
      type: 'some.future.event',
      data: { foo: 'bar' },
      timestamp: '2026-02-28T01:00:10.000Z',
      id: 'evt-011',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('raw');
    if (event?.type === 'raw') {
      expect(event?.data.provider).toBe('copilot');
      expect(event?.data.originalType).toBe('some.future.event');
      expect(event?.data.originalData).toEqual({ foo: 'bar' });
    }
  });

  it('should return null for malformed JSON (PL-07)', () => {
    const event = parseEventsJsonlLine('not valid json {{{');
    expect(event).toBeNull();
  });

  it('should return null for empty lines', () => {
    expect(parseEventsJsonlLine('')).toBeNull();
    expect(parseEventsJsonlLine('   ')).toBeNull();
  });

  it('should return null for lines missing type field', () => {
    const line = JSON.stringify({
      data: { content: 'no type' },
      timestamp: '2026-02-28T01:00:00.000Z',
    });

    const event = parseEventsJsonlLine(line);
    expect(event).toBeNull();
  });

  it('should preserve eventId from source', () => {
    const line = JSON.stringify({
      type: 'session.idle',
      data: {},
      timestamp: '2026-02-28T01:00:00.000Z',
      id: 'original-event-id',
    });

    const event = parseEventsJsonlLine(line);

    expect(event).not.toBeNull();
    expect(event?.eventId).toBe('original-event-id');
  });
});
