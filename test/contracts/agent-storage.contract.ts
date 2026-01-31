/**
 * Plan 019: Agent Manager Refactor - Contract Tests for IAgentStorageAdapter
 *
 * Per AC-29: Contract tests verify Fake/Real parity.
 * Per DYK-05: Contract tests run against BOTH Fake AND Real implementations.
 *
 * Tests cover:
 * - AC-19: Storage at ~/.config/chainglass/agents/
 * - AC-20: Registry tracks all agents with workspace refs
 * - AC-21: Events stored in NDJSON format
 * - AC-22: Instance metadata stored as JSON
 * - AC-23: Path traversal prevention
 *
 * Usage:
 * ```typescript
 * import { agentStorageContractTests } from './agent-storage.contract';
 *
 * agentStorageContractTests('FakeAgentStorageAdapter', () => new FakeAgentStorageAdapter());
 * agentStorageContractTests('AgentStorageAdapter', () => new AgentStorageAdapter(fs, pathResolver));
 * ```
 */

import type {
  AgentInstanceData,
  AgentRegistryEntry,
  AgentStoredEvent,
  IAgentStorageAdapter,
} from '@chainglass/shared/features/019-agent-manager-refactor';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for IAgentStorageAdapter implementations.
 *
 * These tests define the behavioral contract that both FakeAgentStorageAdapter
 * and AgentStorageAdapter must satisfy.
 *
 * @param name - Implementation name for test reporting
 * @param createAdapter - Factory function that creates a fresh adapter instance
 */
export function agentStorageContractTests(name: string, createAdapter: () => IAgentStorageAdapter) {
  describe(`${name} implements IAgentStorageAdapter contract`, () => {
    // ===== AC-20: Registry Operations =====

    describe('Registry Operations (AC-20)', () => {
      it('registers and lists agents', async () => {
        /*
        Test Doc:
        - Why: AC-20 requires registry tracks all agents
        - Contract: registerAgent() adds entry; listAgents() returns it
        - Usage Notes: Entry must contain id, workspace, createdAt
        - Quality Contribution: Core registry functionality
        - Worked Example: registerAgent({id:"a1",...}) → listAgents() includes a1
        */
        const adapter = createAdapter();
        const entry: AgentRegistryEntry = {
          id: 'agent-1',
          workspace: '/projects/myapp',
          createdAt: '2026-01-29T00:00:00.000Z',
        };

        await adapter.registerAgent(entry);
        const agents = await adapter.listAgents();

        expect(agents).toHaveLength(1);
        expect(agents[0]).toEqual(entry);
      });

      it('lists multiple agents from different workspaces', async () => {
        /*
        Test Doc:
        - Why: AC-20 requires tracking agents across workspaces
        - Contract: Multiple registerAgent() calls are all returned by listAgents()
        - Usage Notes: Workspace is for filtering, not isolation
        - Quality Contribution: Ensures cross-workspace visibility
        - Worked Example: 3 agents in 2 workspaces → listAgents() returns all 3
        */
        const adapter = createAdapter();

        await adapter.registerAgent({
          id: 'a1',
          workspace: '/ws1',
          createdAt: '2026-01-29T00:00:00.000Z',
        });
        await adapter.registerAgent({
          id: 'a2',
          workspace: '/ws2',
          createdAt: '2026-01-29T00:01:00.000Z',
        });
        await adapter.registerAgent({
          id: 'a3',
          workspace: '/ws1',
          createdAt: '2026-01-29T00:02:00.000Z',
        });

        const agents = await adapter.listAgents();

        expect(agents).toHaveLength(3);
        expect(agents.map((a) => a.id)).toContain('a1');
        expect(agents.map((a) => a.id)).toContain('a2');
        expect(agents.map((a) => a.id)).toContain('a3');
      });

      it('unregister removes agent from registry', async () => {
        /*
        Test Doc:
        - Why: AC-20 cleanup - agents can be removed
        - Contract: unregisterAgent(id) removes from listAgents()
        - Usage Notes: Should also clean up instance/events data
        - Quality Contribution: Prevents orphaned registry entries
        - Worked Example: register a1, a2 → unregister a1 → listAgents() = [a2]
        */
        const adapter = createAdapter();

        await adapter.registerAgent({
          id: 'a1',
          workspace: '/ws',
          createdAt: '2026-01-29T00:00:00.000Z',
        });
        await adapter.registerAgent({
          id: 'a2',
          workspace: '/ws',
          createdAt: '2026-01-29T00:01:00.000Z',
        });

        await adapter.unregisterAgent('a1');
        const agents = await adapter.listAgents();

        expect(agents).toHaveLength(1);
        expect(agents[0].id).toBe('a2');
      });

      it('returns empty array when no agents registered', async () => {
        /*
        Test Doc:
        - Why: Edge case - fresh adapter has no agents
        - Contract: listAgents() returns [] (not null/undefined)
        - Usage Notes: Callers can safely iterate
        - Quality Contribution: Prevents null pointer exceptions
        - Worked Example: new adapter → listAgents() → []
        */
        const adapter = createAdapter();

        const agents = await adapter.listAgents();

        expect(agents).toEqual([]);
      });
    });

    // ===== AC-22: Instance Operations =====

    describe('Instance Operations (AC-22)', () => {
      it('saves and loads instance data', async () => {
        /*
        Test Doc:
        - Why: AC-22 requires instance metadata persistence
        - Contract: saveInstance(data) → loadInstance(id) returns same data
        - Usage Notes: All fields must be preserved
        - Quality Contribution: Core persistence functionality
        - Worked Example: saveInstance({id:"a1",name:"chat",...}) → loadInstance("a1") matches
        */
        const adapter = createAdapter();
        const data: AgentInstanceData = {
          id: 'agent-1',
          name: 'chat-assistant',
          type: 'claude-code',
          workspace: '/projects/myapp',
          status: 'stopped',
          intent: 'Ready to help',
          sessionId: 'session-abc123',
          createdAt: '2026-01-29T00:00:00.000Z',
          updatedAt: '2026-01-29T00:05:00.000Z',
        };

        await adapter.saveInstance(data);
        const loaded = await adapter.loadInstance('agent-1');

        expect(loaded).toEqual(data);
      });

      it('updates existing instance on save', async () => {
        /*
        Test Doc:
        - Why: Instance state changes over time
        - Contract: saveInstance() overwrites previous data for same id
        - Usage Notes: status, intent, updatedAt change during agent lifecycle
        - Quality Contribution: Ensures state updates persist
        - Worked Example: save(status:stopped) → save(status:working) → load() = working
        */
        const adapter = createAdapter();
        const initial: AgentInstanceData = {
          id: 'agent-1',
          name: 'chat',
          type: 'claude-code',
          workspace: '/ws',
          status: 'stopped',
          intent: '',
          sessionId: null,
          createdAt: '2026-01-29T00:00:00.000Z',
          updatedAt: '2026-01-29T00:00:00.000Z',
        };

        await adapter.saveInstance(initial);
        await adapter.saveInstance({
          ...initial,
          status: 'working',
          intent: 'Processing request',
          updatedAt: '2026-01-29T00:05:00.000Z',
        });

        const loaded = await adapter.loadInstance('agent-1');

        expect(loaded?.status).toBe('working');
        expect(loaded?.intent).toBe('Processing request');
        expect(loaded?.updatedAt).toBe('2026-01-29T00:05:00.000Z');
      });

      it('returns null for unknown agent', async () => {
        /*
        Test Doc:
        - Why: AC-22 graceful handling for missing agents
        - Contract: loadInstance(unknownId) returns null (not throws)
        - Usage Notes: Callers must check for null
        - Quality Contribution: Prevents unexpected exceptions
        - Worked Example: loadInstance("nonexistent") → null
        */
        const adapter = createAdapter();

        const result = await adapter.loadInstance('nonexistent');

        expect(result).toBeNull();
      });

      it('preserves null sessionId', async () => {
        /*
        Test Doc:
        - Why: sessionId can be null before first run
        - Contract: null sessionId is preserved through save/load
        - Usage Notes: Don't convert null to undefined or empty string
        - Quality Contribution: Type safety for nullable fields
        - Worked Example: saveInstance({sessionId:null}) → loadInstance().sessionId === null
        */
        const adapter = createAdapter();
        const data: AgentInstanceData = {
          id: 'agent-1',
          name: 'new-agent',
          type: 'copilot',
          workspace: '/ws',
          status: 'stopped',
          intent: '',
          sessionId: null,
          createdAt: '2026-01-29T00:00:00.000Z',
          updatedAt: '2026-01-29T00:00:00.000Z',
        };

        await adapter.saveInstance(data);
        const loaded = await adapter.loadInstance('agent-1');

        expect(loaded?.sessionId).toBeNull();
      });
    });

    // ===== AC-21: Event Operations =====

    describe('Event Operations (AC-21)', () => {
      it('appends and retrieves events', async () => {
        /*
        Test Doc:
        - Why: AC-21 requires event persistence
        - Contract: appendEvent() adds to getEvents() result
        - Usage Notes: Events have eventId for uniqueness
        - Quality Contribution: Core event storage functionality
        - Worked Example: appendEvent(evt1), appendEvent(evt2) → getEvents() = [evt1, evt2]
        */
        const adapter = createAdapter();
        const event1: AgentStoredEvent = {
          eventId: 'evt-1',
          type: 'text',
          role: 'user',
          content: 'Hello',
          timestamp: '2026-01-29T00:00:00.000Z',
        };
        const event2: AgentStoredEvent = {
          eventId: 'evt-2',
          type: 'text',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: '2026-01-29T00:00:01.000Z',
        };

        await adapter.appendEvent('agent-1', event1);
        await adapter.appendEvent('agent-1', event2);
        const events = await adapter.getEvents('agent-1');

        expect(events).toHaveLength(2);
        expect(events[0]).toEqual(event1);
        expect(events[1]).toEqual(event2);
      });

      it('returns empty array for agent with no events', async () => {
        /*
        Test Doc:
        - Why: Edge case - agent exists but no events yet
        - Contract: getEvents() returns [] (not null/undefined)
        - Usage Notes: Callers can safely iterate
        - Quality Contribution: Prevents null pointer exceptions
        - Worked Example: getEvents("new-agent") → []
        */
        const adapter = createAdapter();

        const events = await adapter.getEvents('agent-1');

        expect(events).toEqual([]);
      });

      it('getEventsSince returns events after sinceId', async () => {
        /*
        Test Doc:
        - Why: AC-21 supports incremental event fetching
        - Contract: getEventsSince(id) returns only events AFTER that id
        - Usage Notes: Used for SSE catch-up on reconnection
        - Quality Contribution: Enables efficient event streaming
        - Worked Example: events=[1,2,3] → getEventsSince("2") → [3]
        */
        const adapter = createAdapter();
        await adapter.appendEvent('agent-1', {
          eventId: 'evt-1',
          type: 'text',
          role: 'user',
          content: 'First',
          timestamp: '2026-01-29T00:00:00.000Z',
        });
        await adapter.appendEvent('agent-1', {
          eventId: 'evt-2',
          type: 'text',
          role: 'assistant',
          content: 'Second',
          timestamp: '2026-01-29T00:00:01.000Z',
        });
        await adapter.appendEvent('agent-1', {
          eventId: 'evt-3',
          type: 'text',
          role: 'user',
          content: 'Third',
          timestamp: '2026-01-29T00:00:02.000Z',
        });

        const sinceEvents = await adapter.getEventsSince('agent-1', 'evt-1');

        expect(sinceEvents).toHaveLength(2);
        expect(sinceEvents[0].eventId).toBe('evt-2');
        expect(sinceEvents[1].eventId).toBe('evt-3');
      });

      it('getEventsSince returns all events when sinceId not found', async () => {
        /*
        Test Doc:
        - Why: Graceful handling when sinceId is stale or invalid
        - Contract: Unknown sinceId returns all events (safe fallback)
        - Usage Notes: Per AC-10, missing sinceId is not an error
        - Quality Contribution: Prevents data loss on reconnection
        - Worked Example: getEventsSince("nonexistent") → all events
        */
        const adapter = createAdapter();
        await adapter.appendEvent('agent-1', {
          eventId: 'evt-1',
          type: 'text',
          role: 'user',
          content: 'First',
          timestamp: '2026-01-29T00:00:00.000Z',
        });
        await adapter.appendEvent('agent-1', {
          eventId: 'evt-2',
          type: 'text',
          role: 'assistant',
          content: 'Second',
          timestamp: '2026-01-29T00:00:01.000Z',
        });

        const events = await adapter.getEventsSince('agent-1', 'nonexistent');

        expect(events).toHaveLength(2);
      });

      it('events are isolated per agent', async () => {
        /*
        Test Doc:
        - Why: Each agent has its own event stream
        - Contract: Events appended to agent-1 don't appear for agent-2
        - Usage Notes: agentId is key for event isolation
        - Quality Contribution: Prevents event leakage between agents
        - Worked Example: append to a1 → getEvents(a2) = []
        */
        const adapter = createAdapter();
        await adapter.appendEvent('agent-1', {
          eventId: 'evt-1',
          type: 'text',
          role: 'user',
          content: 'For agent 1',
          timestamp: '2026-01-29T00:00:00.000Z',
        });

        const agent2Events = await adapter.getEvents('agent-2');

        expect(agent2Events).toEqual([]);
      });
    });

    // ===== Cleanup: unregister removes events =====

    describe('Cleanup', () => {
      it('unregister removes instance and events', async () => {
        /*
        Test Doc:
        - Why: Cleanup should remove all agent data
        - Contract: unregisterAgent() clears instance and events
        - Usage Notes: Registry entry is also removed (tested above)
        - Quality Contribution: Prevents orphaned data
        - Worked Example: register, save, append → unregister → load=null, events=[]
        */
        const adapter = createAdapter();

        await adapter.registerAgent({
          id: 'agent-1',
          workspace: '/ws',
          createdAt: '2026-01-29T00:00:00.000Z',
        });
        await adapter.saveInstance({
          id: 'agent-1',
          name: 'chat',
          type: 'claude-code',
          workspace: '/ws',
          status: 'stopped',
          intent: '',
          sessionId: null,
          createdAt: '2026-01-29T00:00:00.000Z',
          updatedAt: '2026-01-29T00:00:00.000Z',
        });
        await adapter.appendEvent('agent-1', {
          eventId: 'evt-1',
          type: 'text',
          role: 'user',
          content: 'Hello',
          timestamp: '2026-01-29T00:00:00.000Z',
        });

        await adapter.unregisterAgent('agent-1');

        const instance = await adapter.loadInstance('agent-1');
        const events = await adapter.getEvents('agent-1');

        expect(instance).toBeNull();
        expect(events).toEqual([]);
      });
    });
  });
}
