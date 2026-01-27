/**
 * Agent Performance Baseline Tests
 *
 * Per DYK-P5-05: Basic timing verification, document results.
 * Speed is not critical, but we want to catch obvious regressions.
 *
 * Test Doc:
 * - Why: Ensure transformer doesn't degrade with large event counts
 * - Contract: 1000 events should transform in reasonable time
 * - Usage Notes: Baseline for future optimization decisions
 * - Quality Contribution: Catches O(n²) or worse complexity bugs
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
 * Generate N tool call + result pairs
 */
function generateToolPairs(count: number): StoredEvent[] {
  const events: StoredEvent[] = [];
  const baseTime = new Date('2026-01-27T12:00:00.000Z').getTime();

  for (let i = 0; i < count; i++) {
    const callTime = baseTime + i * 2;
    const resultTime = callTime + 1;
    const toolCallId = `tc-${i.toString().padStart(5, '0')}`;

    events.push({
      id: `${new Date(callTime).toISOString()}_call_${i}`,
      type: 'tool_call',
      timestamp: new Date(callTime).toISOString(),
      data: {
        toolName: ['Bash', 'Read', 'Write', 'Search'][i % 4],
        input: `command-${i}`,
        toolCallId,
      },
    } as StoredEvent);

    events.push({
      id: `${new Date(resultTime).toISOString()}_result_${i}`,
      type: 'tool_result',
      timestamp: new Date(resultTime).toISOString(),
      data: {
        toolCallId,
        output: `output-${i}`.repeat(10), // Simulate realistic output
        isError: i % 10 === 0, // 10% error rate
      },
    } as StoredEvent);
  }

  return events;
}

/**
 * Generate N thinking events
 */
function generateThinkingEvents(count: number): StoredEvent[] {
  const events: StoredEvent[] = [];
  const baseTime = new Date('2026-01-27T12:00:00.000Z').getTime();

  for (let i = 0; i < count; i++) {
    events.push({
      id: `thinking-${i}`,
      type: 'thinking',
      timestamp: new Date(baseTime + i).toISOString(),
      data: {
        content: `Thinking content ${i}: `.repeat(20), // ~400 chars
        signature: i % 2 === 0 ? `sig-${i}` : undefined,
      },
    } as StoredEvent);
  }

  return events;
}

/**
 * Generate mixed events (realistic session pattern)
 */
function generateMixedEvents(count: number): StoredEvent[] {
  const events: StoredEvent[] = [];
  const baseTime = new Date('2026-01-27T12:00:00.000Z').getTime();
  let time = baseTime;

  for (let i = 0; i < count; i++) {
    const eventType = i % 5;

    if (eventType < 2) {
      // 40% thinking
      events.push({
        id: `evt-${i}`,
        type: 'thinking',
        timestamp: new Date(time++).toISOString(),
        data: { content: `Thought ${i}` },
      } as StoredEvent);
    } else if (eventType < 4) {
      // 40% tool call (no result for half)
      events.push({
        id: `evt-${i}`,
        type: 'tool_call',
        timestamp: new Date(time++).toISOString(),
        data: { toolName: 'Bash', input: `cmd-${i}`, toolCallId: `tc-${i}` },
      } as StoredEvent);
      if (eventType === 3) {
        events.push({
          id: `evt-${i}-result`,
          type: 'tool_result',
          timestamp: new Date(time++).toISOString(),
          data: { toolCallId: `tc-${i}`, output: `out-${i}`, isError: false },
        } as StoredEvent);
      }
    } else {
      // 20% tool call with error
      events.push({
        id: `evt-${i}`,
        type: 'tool_call',
        timestamp: new Date(time++).toISOString(),
        data: { toolName: 'Read', input: `file-${i}`, toolCallId: `tc-${i}` },
      } as StoredEvent);
      events.push({
        id: `evt-${i}-result`,
        type: 'tool_result',
        timestamp: new Date(time++).toISOString(),
        data: { toolCallId: `tc-${i}`, output: 'Error', isError: true },
      } as StoredEvent);
    }
  }

  return events;
}

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance Baseline', () => {
  describe('transformer throughput', () => {
    it('should transform 100 tool pairs in <50ms', () => {
      const events = generateToolPairs(100);

      const start = performance.now();
      const result = transformEventsToLogEntries(events);
      const elapsed = performance.now() - start;

      console.log(`100 tool pairs: ${elapsed.toFixed(2)}ms`);

      expect(result).toHaveLength(100);
      expect(elapsed).toBeLessThan(50);
    });

    it('should transform 1000 tool pairs in <500ms (AC19 equivalent)', () => {
      const events = generateToolPairs(1000);

      const start = performance.now();
      const result = transformEventsToLogEntries(events);
      const elapsed = performance.now() - start;

      console.log(`1000 tool pairs: ${elapsed.toFixed(2)}ms`);

      expect(result).toHaveLength(1000);
      expect(elapsed).toBeLessThan(500);
    });

    it('should transform 500 thinking events in <100ms', () => {
      const events = generateThinkingEvents(500);

      const start = performance.now();
      const result = transformEventsToLogEntries(events);
      const elapsed = performance.now() - start;

      console.log(`500 thinking events: ${elapsed.toFixed(2)}ms`);

      // With thinking consolidation, consecutive thinking events are merged
      // So 500 consecutive thinking events become 1 consolidated entry
      expect(result.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(100);
    });

    it('should transform 1000 mixed events in <300ms', () => {
      const events = generateMixedEvents(1000);

      const start = performance.now();
      const result = transformEventsToLogEntries(events);
      const elapsed = performance.now() - start;

      console.log(`1000 mixed events: ${elapsed.toFixed(2)}ms`);

      // Mixed events result in fewer entries due to merging
      expect(result.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe('memory efficiency', () => {
    it('should not grow memory linearly with duplicate data', () => {
      // Generate events with shared references
      const events = generateToolPairs(500);

      // Measure before
      const before = process.memoryUsage().heapUsed;

      // Transform
      const result = transformEventsToLogEntries(events);

      // Force GC if available (Node --expose-gc)
      if (global.gc) {
        global.gc();
      }

      const after = process.memoryUsage().heapUsed;
      const delta = (after - before) / 1024 / 1024; // MB

      console.log(`Memory delta for 500 pairs: ${delta.toFixed(2)}MB`);

      // Sanity check - should not use unreasonable memory
      expect(result).toHaveLength(500);
      expect(delta).toBeLessThan(50); // 50MB is generous
    });
  });

  describe('scaling characteristics', () => {
    it('should scale linearly (not quadratically)', () => {
      // Measure time for 100, 200, 400 events
      const times: number[] = [];

      for (const count of [100, 200, 400]) {
        const events = generateToolPairs(count);
        const start = performance.now();
        transformEventsToLogEntries(events);
        times.push(performance.now() - start);
      }

      console.log(
        `Scaling: 100=${times[0].toFixed(1)}ms, 200=${times[1].toFixed(1)}ms, 400=${times[2].toFixed(1)}ms`
      );

      // If linear, doubling input should ~double time
      // If quadratic, doubling input would 4x time
      // Allow 3x growth factor (accounts for overhead)
      const ratio1 = times[1] / times[0];
      const ratio2 = times[2] / times[1];

      // Both ratios should be less than 3 (linear-ish)
      expect(ratio1).toBeLessThan(3);
      expect(ratio2).toBeLessThan(3);
    });
  });
});
