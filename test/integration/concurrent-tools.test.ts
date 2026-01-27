/**
 * Concurrent Tool Calls Integration Test
 *
 * Verifies that multiple tool calls render in correct timestamp order
 *
 * Test Doc:
 * - Why: Agents can execute multiple tools rapidly; order must be preserved
 * - Contract: Events sorted by timestamp when rendered
 * - Usage Notes: Tests mergeToolEvents ordering logic
 * - Quality Contribution: Catches race condition bugs in event processing
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
 * Create rapid concurrent tool calls (all within 100ms)
 */
function createConcurrentToolCalls(): StoredEvent[] {
  const baseTime = new Date('2026-01-27T12:00:00.000Z').getTime();

  return [
    // Tool 1 - starts first (t=0)
    {
      id: '2026-01-27T12:00:00.000Z_00001',
      type: 'tool_call',
      timestamp: new Date(baseTime).toISOString(),
      data: {
        toolName: 'Bash',
        input: 'ls -la',
        toolCallId: 'tc-001',
      },
    } as StoredEvent,
    // Tool 2 - starts 10ms later
    {
      id: '2026-01-27T12:00:00.010Z_00002',
      type: 'tool_call',
      timestamp: new Date(baseTime + 10).toISOString(),
      data: {
        toolName: 'Read',
        input: 'package.json',
        toolCallId: 'tc-002',
      },
    } as StoredEvent,
    // Tool 3 - starts 20ms later
    {
      id: '2026-01-27T12:00:00.020Z_00003',
      type: 'tool_call',
      timestamp: new Date(baseTime + 20).toISOString(),
      data: {
        toolName: 'Bash',
        input: 'git status',
        toolCallId: 'tc-003',
      },
    } as StoredEvent,
    // Results arrive out of order (tool 2 finishes first, then 3, then 1)
    {
      id: '2026-01-27T12:00:00.050Z_00004',
      type: 'tool_result',
      timestamp: new Date(baseTime + 50).toISOString(),
      data: {
        toolCallId: 'tc-002',
        output: '{"name": "chainglass"}',
        isError: false,
      },
    } as StoredEvent,
    {
      id: '2026-01-27T12:00:00.060Z_00005',
      type: 'tool_result',
      timestamp: new Date(baseTime + 60).toISOString(),
      data: {
        toolCallId: 'tc-003',
        output: 'On branch main',
        isError: false,
      },
    } as StoredEvent,
    {
      id: '2026-01-27T12:00:00.100Z_00006',
      type: 'tool_result',
      timestamp: new Date(baseTime + 100).toISOString(),
      data: {
        toolCallId: 'tc-001',
        output: 'total 8\nfile1.txt\nfile2.txt',
        isError: false,
      },
    } as StoredEvent,
  ];
}

/**
 * Create mixed events with interleaved thinking and tools
 */
function createInterleavedEvents(): StoredEvent[] {
  const baseTime = new Date('2026-01-27T12:00:00.000Z').getTime();

  return [
    // Thinking
    {
      id: 'evt-001',
      type: 'thinking',
      timestamp: new Date(baseTime).toISOString(),
      data: { content: 'First thought' },
    } as StoredEvent,
    // Tool call
    {
      id: 'evt-002',
      type: 'tool_call',
      timestamp: new Date(baseTime + 100).toISOString(),
      data: { toolName: 'Bash', input: 'cmd1', toolCallId: 'tc-001' },
    } as StoredEvent,
    // Another thinking
    {
      id: 'evt-003',
      type: 'thinking',
      timestamp: new Date(baseTime + 200).toISOString(),
      data: { content: 'Second thought' },
    } as StoredEvent,
    // Tool result for first call
    {
      id: 'evt-004',
      type: 'tool_result',
      timestamp: new Date(baseTime + 300).toISOString(),
      data: { toolCallId: 'tc-001', output: 'result1', isError: false },
    } as StoredEvent,
    // Third thinking
    {
      id: 'evt-005',
      type: 'thinking',
      timestamp: new Date(baseTime + 400).toISOString(),
      data: { content: 'Third thought' },
    } as StoredEvent,
  ];
}

// ============================================================================
// Concurrent Tools Tests
// ============================================================================

describe('Concurrent Tool Calls', () => {
  describe('ordering preservation', () => {
    it('should maintain tool call order regardless of result order', () => {
      const events = createConcurrentToolCalls();
      const logEntries = transformEventsToLogEntries(events);

      // Should have 3 tool calls (results merged)
      expect(logEntries).toHaveLength(3);

      // Order should be by tool_call timestamp (ls first, Read second, git third)
      expect(logEntries[0].toolData?.toolName).toBe('Bash');
      expect(logEntries[0].toolData?.input).toBe('ls -la');
      expect(logEntries[1].toolData?.toolName).toBe('Read');
      expect(logEntries[2].toolData?.toolName).toBe('Bash');
      expect(logEntries[2].toolData?.input).toBe('git status');
    });

    it('should merge results into correct tool calls', () => {
      const events = createConcurrentToolCalls();
      const logEntries = transformEventsToLogEntries(events);

      // First tool (ls) should have its result
      expect(logEntries[0].toolData?.output).toContain('file1.txt');
      expect(logEntries[0].toolData?.status).toBe('complete');

      // Second tool (Read package.json) should have its result
      expect(logEntries[1].toolData?.output).toContain('chainglass');
      expect(logEntries[1].toolData?.status).toBe('complete');

      // Third tool (git status) should have its result
      expect(logEntries[2].toolData?.output).toContain('main');
      expect(logEntries[2].toolData?.status).toBe('complete');
    });
  });

  describe('interleaved event types', () => {
    it('should handle thinking events between tool calls', () => {
      const events = createInterleavedEvents();
      const logEntries = transformEventsToLogEntries(events);

      // After thinking consolidation: thinking events that become consecutive
      // after tool result merging get consolidated.
      // Events: thinking1, tool_call, thinking2, tool_result, thinking3
      // After merge: thinking1, tool_call+result, thinking2+thinking3
      // Result: 3 entries (1 thinking + 1 tool + 1 consolidated thinking)
      expect(logEntries).toHaveLength(3);

      // Verify interleaved order is preserved
      expect(logEntries[0].contentType).toBe('thinking');
      expect(logEntries[0].thinkingData?.content).toBe('First thought');

      expect(logEntries[1].contentType).toBe('tool_call');
      expect(logEntries[1].toolData?.toolName).toBe('Bash');

      // Second and third thoughts are consolidated
      expect(logEntries[2].contentType).toBe('thinking');
      expect(logEntries[2].thinkingData?.content).toContain('Second thought');
      expect(logEntries[2].thinkingData?.content).toContain('Third thought');
    });

    it('should merge tool result even when thinking events are interleaved', () => {
      const events = createInterleavedEvents();
      const logEntries = transformEventsToLogEntries(events);

      const toolEntry = logEntries.find((e) => e.contentType === 'tool_call');
      expect(toolEntry?.toolData?.output).toBe('result1');
      expect(toolEntry?.toolData?.status).toBe('complete');
    });
  });

  describe('rapid sequential events', () => {
    it('should handle events with same second but different milliseconds', () => {
      const events: StoredEvent[] = [
        {
          id: '2026-01-27T12:00:00.001Z_00001',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:00.001Z',
          data: { toolName: 'Tool1', input: 'a', toolCallId: 'tc-1' },
        } as StoredEvent,
        {
          id: '2026-01-27T12:00:00.002Z_00002',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:00.002Z',
          data: { toolName: 'Tool2', input: 'b', toolCallId: 'tc-2' },
        } as StoredEvent,
        {
          id: '2026-01-27T12:00:00.003Z_00003',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:00.003Z',
          data: { toolName: 'Tool3', input: 'c', toolCallId: 'tc-3' },
        } as StoredEvent,
      ];

      const logEntries = transformEventsToLogEntries(events);

      expect(logEntries).toHaveLength(3);
      expect(logEntries[0].toolData?.toolName).toBe('Tool1');
      expect(logEntries[1].toolData?.toolName).toBe('Tool2');
      expect(logEntries[2].toolData?.toolName).toBe('Tool3');
    });
  });

  describe('partial completion states', () => {
    it('should show mix of running and complete tools', () => {
      const events: StoredEvent[] = [
        // Tool 1 - complete
        {
          id: 'evt-001',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:00.000Z',
          data: { toolName: 'Bash', input: 'ls', toolCallId: 'tc-1' },
        } as StoredEvent,
        {
          id: 'evt-002',
          type: 'tool_result',
          timestamp: '2026-01-27T12:00:01.000Z',
          data: { toolCallId: 'tc-1', output: 'done', isError: false },
        } as StoredEvent,
        // Tool 2 - still running
        {
          id: 'evt-003',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:02.000Z',
          data: { toolName: 'Bash', input: 'npm install', toolCallId: 'tc-2' },
        } as StoredEvent,
        // Tool 3 - complete with error
        {
          id: 'evt-004',
          type: 'tool_call',
          timestamp: '2026-01-27T12:00:03.000Z',
          data: { toolName: 'Bash', input: 'cat missing', toolCallId: 'tc-3' },
        } as StoredEvent,
        {
          id: 'evt-005',
          type: 'tool_result',
          timestamp: '2026-01-27T12:00:04.000Z',
          data: { toolCallId: 'tc-3', output: 'not found', isError: true },
        } as StoredEvent,
      ];

      const logEntries = transformEventsToLogEntries(events);

      expect(logEntries).toHaveLength(3);
      expect(logEntries[0].toolData?.status).toBe('complete');
      expect(logEntries[1].toolData?.status).toBe('running'); // No result yet
      expect(logEntries[2].toolData?.status).toBe('error');
    });
  });
});
