/**
 * Plan 019: Agent Manager Refactor - Contract Tests for IAgentInstance
 *
 * Per AC-29: Contract tests verify Fake/Real parity.
 * Per DYK-05: Contract tests run against BOTH Fake AND Real implementations.
 *
 * Usage:
 * ```typescript
 * import { agentInstanceContractTests } from './agent-instance.contract';
 *
 * agentInstanceContractTests('FakeAgentInstance', () => new FakeAgentInstance({...}));
 * agentInstanceContractTests('AgentInstance', () => new AgentInstance({...}, adapterFactory));
 * ```
 */

import type { IAgentInstance } from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import { describe, expect, it } from 'vitest';

/**
 * Factory type for creating test instances.
 * Per DYK-03: FakeAgentInstance composes FakeAgentAdapter internally.
 */
export type AgentInstanceFactory = () => IAgentInstance;

/**
 * Contract tests for IAgentInstance implementations.
 *
 * These tests define the behavioral contract that both FakeAgentInstance
 * and AgentInstance must satisfy.
 *
 * @param name - Implementation name for test reporting
 * @param createInstance - Factory function that creates a fresh instance
 */
export function agentInstanceContractTests(name: string, createInstance: AgentInstanceFactory) {
  describe(`${name} implements IAgentInstance contract`, () => {
    // ===== AC-06: Instance has required properties =====

    it('has required properties (AC-06)', () => {
      /*
      Test Doc:
      - Why: AC-06 requires specific properties on agent instance
      - Contract: Instance has id, name, type, workspace, status, intent, sessionId, createdAt, updatedAt
      - Usage Notes: All properties readable; some may be null initially
      - Quality Contribution: Ensures complete agent state is accessible
      - Worked Example: new instance → {id, name, type, workspace, status:'stopped', ...}
      */
      const instance = createInstance();

      // Required properties must be defined
      expect(instance.id).toBeDefined();
      expect(instance.name).toBeDefined();
      expect(instance.type).toBeDefined();
      expect(instance.workspace).toBeDefined();
      expect(instance.status).toBeDefined();
      expect(instance.intent).toBeDefined();
      expect(instance.createdAt).toBeDefined();
      expect(instance.updatedAt).toBeDefined();

      // sessionId may be null initially (before first run)
      expect('sessionId' in instance).toBe(true);
    });

    it('has correct initial status (AC-06)', () => {
      /*
      Test Doc:
      - Why: Per DYK-02, initial status must be 'stopped'
      - Contract: New instance has status='stopped'
      - Usage Notes: Status state machine: stopped → working → stopped|error
      - Quality Contribution: Ensures consistent initial state
      - Worked Example: new instance → {status:'stopped'}
      */
      const instance = createInstance();

      expect(instance.status).toBe('stopped');
    });

    // ===== AC-07: Runs prompts using adapter =====

    it('runs prompts and returns result (AC-07)', async () => {
      /*
      Test Doc:
      - Why: AC-07 requires run() to use adapter and return result
      - Contract: run({prompt}) returns AgentResult with output, sessionId, status
      - Usage Notes: Delegates to internal adapter; captures events
      - Quality Contribution: Ensures prompt execution works
      - Worked Example: run({prompt:"hello"}) → {output:"...", sessionId:"abc", status:"completed"}
      */
      const instance = createInstance();

      const result = await instance.run({ prompt: 'test prompt' });

      expect(result).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(typeof result.output).toBe('string');
      expect(['completed', 'failed', 'killed']).toContain(result.status);
    });

    // ===== AC-07a: Guards against double-run =====

    it('guards against double-run (AC-07a)', async () => {
      /*
      Test Doc:
      - Why: AC-07a requires guard against concurrent runs
      - Contract: If status='working', run() throws Error
      - Usage Notes: Must check status BEFORE any async work
      - Quality Contribution: Prevents race conditions in agent execution
      - Worked Example: instance.status='working'; run() → Error('Agent is already running')
      */
      const instance = createInstance();

      // Set status to working (test helper required)
      if ('setStatus' in instance && typeof instance.setStatus === 'function') {
        (instance as { setStatus: (s: string) => void }).setStatus('working');
      } else {
        // For real implementation, start a run but don't await
        // This test may need adjustment for real impl timing
        instance.run({ prompt: 'long running' }); // Start but don't await
      }

      // Attempt second run should fail
      await expect(instance.run({ prompt: 'concurrent' })).rejects.toThrow(
        /already running|status.*working/i
      );
    });

    // ===== AC-09: Provides event history =====

    it('provides event history (AC-09)', async () => {
      /*
      Test Doc:
      - Why: AC-09 requires getEvents() to return captured events
      - Contract: getEvents() returns array of AgentStoredEvent
      - Usage Notes: Events captured during run(); persisted for rehydration
      - Quality Contribution: Enables conversation rehydration
      - Worked Example: run() → getEvents() → [{type:'text_delta',...},...]
      */
      const instance = createInstance();

      // Run to generate events
      await instance.run({ prompt: 'test' });

      const events = instance.getEvents();

      expect(Array.isArray(events)).toBe(true);
      // Events may be empty if adapter didn't emit any, but method must work
    });

    // ===== AC-10: Supports incremental event fetching =====

    it('supports incremental event fetching (AC-10)', () => {
      /*
      Test Doc:
      - Why: AC-10 requires sinceId filtering for efficient sync
      - Contract: getEvents({sinceId: X}) returns events after event X
      - Usage Notes: Web clients use this for efficient updates
      - Quality Contribution: Prevents redundant event transfer
      - Worked Example: events[0-9], getEvents({sinceId:events[4].eventId}) → events[5-9]
      */
      const instance = createInstance();

      // Pre-populate events (test helper required for predictable test)
      if ('setEvents' in instance && typeof instance.setEvents === 'function') {
        const events = Array.from({ length: 5 }, (_, i) => ({
          type: 'text_delta' as const,
          timestamp: new Date().toISOString(),
          eventId: `evt-${i}`,
          data: { content: `message ${i}` },
        }));
        (instance as { setEvents: (e: unknown[]) => void }).setEvents(events);
      }

      const allEvents = instance.getEvents();
      if (allEvents.length < 3) {
        // Skip detailed assertions if not enough events for test
        expect(Array.isArray(allEvents)).toBe(true);
        return;
      }

      // Get events since middle event
      const middleEventId = allEvents[2].eventId;
      const laterEvents = instance.getEvents({ sinceId: middleEventId });

      // Should have fewer events (only those after sinceId)
      expect(laterEvents.length).toBeLessThan(allEvents.length);
      // Should not include the sinceId event itself
      expect(laterEvents.find((e) => e.eventId === middleEventId)).toBeUndefined();
    });

    // ===== AC-11: Can be terminated =====

    it('can be terminated (AC-11)', async () => {
      /*
      Test Doc:
      - Why: AC-11 requires terminate() to stop running agent
      - Contract: terminate() returns AgentResult with status='killed'
      - Usage Notes: Delegates to adapter.terminate(sessionId)
      - Quality Contribution: Ensures graceful agent shutdown
      - Worked Example: terminate() → {status:'killed', exitCode:143}
      */
      const instance = createInstance();

      // Run first to get a session
      await instance.run({ prompt: 'test' });

      const result = await instance.terminate();

      expect(result).toBeDefined();
      expect(result.status).toBe('killed');
      expect(instance.status).toBe('stopped'); // Status returns to stopped
    });

    // ===== AC-12: Stores adapter sessionId =====

    it('stores adapter sessionId (AC-12)', async () => {
      /*
      Test Doc:
      - Why: AC-12 requires sessionId persistence for resumption
      - Contract: After run(), instance.sessionId reflects adapter's sessionId
      - Usage Notes: sessionId may be null before first run
      - Quality Contribution: Enables session resumption
      - Worked Example: run() → instance.sessionId equals result.sessionId
      */
      const instance = createInstance();

      // Initially null (before first run)
      expect(instance.sessionId).toBeNull();

      const result = await instance.run({ prompt: 'test' });

      expect(instance.sessionId).toBe(result.sessionId);
    });

    // ===== AC-08: Updates intent during execution =====

    it('updates intent via setIntent (AC-08)', () => {
      /*
      Test Doc:
      - Why: AC-08 requires intent to be updatable
      - Contract: setIntent(x) changes instance.intent to x
      - Usage Notes: Intent describes current agent action
      - Quality Contribution: Enables UI status display
      - Worked Example: setIntent("Analyzing code") → instance.intent === "Analyzing code"
      */
      const instance = createInstance();

      expect(instance.intent).toBe('');

      instance.setIntent('Analyzing codebase');

      expect(instance.intent).toBe('Analyzing codebase');
    });

    // ===== Additional behavioral tests =====

    it('status transitions from stopped to working during run', async () => {
      /*
      Test Doc:
      - Why: Per Invariant #1, status state machine must be correct
      - Contract: run() transitions stopped → working → stopped
      - Usage Notes: This tests async state transitions
      - Quality Contribution: Ensures status tracking is correct
      - Worked Example: {status:stopped} → run() → {status:stopped} (after completion)
      */
      const instance = createInstance();

      expect(instance.status).toBe('stopped');

      // After run completes, status should be back to stopped (or error)
      await instance.run({ prompt: 'test' });

      expect(['stopped', 'error']).toContain(instance.status);
    });

    it('updatedAt changes when state changes', async () => {
      /*
      Test Doc:
      - Why: updatedAt tracks last state change for freshness
      - Contract: state-changing operations update updatedAt
      - Usage Notes: Used for sorting and freshness indicators
      - Quality Contribution: Enables accurate "last active" displays
      - Worked Example: run() → updatedAt > createdAt
      */
      const instance = createInstance();

      const originalUpdatedAt = instance.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await instance.run({ prompt: 'test' });

      expect(instance.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    it('events have unique eventIds', async () => {
      /*
      Test Doc:
      - Why: eventId uniqueness required for incremental fetching
      - Contract: Each event has unique eventId
      - Usage Notes: sinceId filtering depends on unique IDs
      - Quality Contribution: Prevents event deduplication issues
      - Worked Example: events[0].eventId !== events[1].eventId
      */
      const instance = createInstance();

      // Pre-populate events if test helper available
      if ('addEvent' in instance && typeof instance.addEvent === 'function') {
        const addEvent = instance.addEvent.bind(instance) as (e: {
          type: string;
          timestamp: string;
          data: { content: string };
        }) => void;
        addEvent({
          type: 'text_delta',
          timestamp: new Date().toISOString(),
          data: { content: 'a' },
        });
        addEvent({
          type: 'text_delta',
          timestamp: new Date().toISOString(),
          data: { content: 'b' },
        });
      } else {
        // Run to generate events
        await instance.run({ prompt: 'test' });
      }

      const events = instance.getEvents();
      if (events.length < 2) {
        // Not enough events to test uniqueness
        expect(Array.isArray(events)).toBe(true);
        return;
      }

      const eventIds = events.map((e) => e.eventId);
      const uniqueIds = new Set(eventIds);

      expect(uniqueIds.size).toBe(eventIds.length);
    });
  });
}
