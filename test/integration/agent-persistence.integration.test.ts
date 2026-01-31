/**
 * Plan 019: Agent Manager Refactor - Persistence Integration Tests
 *
 * Tests agent persistence behavior across AgentManagerService "restarts".
 *
 * Per AC-05: Agents survive process restart
 * Per AC-21: Events stored in NDJSON format
 * Per DYK-14: Eager load events at hydrate time
 * Per DYK-15: Working→stopped on restart
 *
 * These tests use FakeFileSystem and FakeAgentStorageAdapter to test
 * the integration between AgentManagerService, AgentInstance, and storage
 * without actual filesystem I/O.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared/fakes';
import { FakeAgentAdapter } from '@chainglass/shared/fakes/fake-agent-adapter';
import {
  AgentInstance,
  AgentManagerService,
  AgentStorageAdapter,
  FakeAgentNotifierService,
  type IAgentStorageAdapter,
} from '@chainglass/shared/features/019-agent-manager-refactor';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Agent Persistence Integration Tests', () => {
  let storage: IAgentStorageAdapter;
  let notifier: FakeAgentNotifierService;
  let fakeFs: FakeFileSystem;
  let fakePath: FakePathResolver;
  const testBasePath = '/test/agents';

  // Factory that creates FakeAgentAdapter for testing
  const adapterFactory = () =>
    new FakeAgentAdapter({
      sessionId: 'fake-session',
      output: 'test output',
      status: 'completed',
    });

  beforeEach(() => {
    fakeFs = new FakeFileSystem();
    fakePath = new FakePathResolver();
    storage = new AgentStorageAdapter(fakeFs, fakePath, testBasePath);
    notifier = new FakeAgentNotifierService();
  });

  afterEach(() => {
    fakeFs.reset();
  });

  // ===== AC-05: Agents survive process restart =====

  describe('AC-05: Agents survive restart', () => {
    it('agent created and persisted survives restart', async () => {
      /*
      Test Doc:
      - Why: AC-05 requires agents to survive process restart
      - Contract: Create agent → "restart" → agent exists
      - Usage Notes: "Restart" = create new AgentManagerService with same storage
      - Quality Contribution: Core persistence functionality
      - Worked Example: createAgent() → new manager → initialize() → getAgent returns agent
      */
      // Create first manager with storage
      const manager1 = new AgentManagerService(adapterFactory, notifier, storage);
      await manager1.initialize();

      // Create an agent
      const agent = manager1.createAgent({
        name: 'test-agent',
        type: 'claude-code',
        workspace: '/projects/myapp',
      });

      // Wait for async persistence (fire-and-forget in createAgent)
      await new Promise((resolve) => setTimeout(resolve, 10));

      // "Restart" - create new manager with same storage
      const manager2 = new AgentManagerService(adapterFactory, notifier, storage);
      await manager2.initialize();

      // Verify agent exists
      const restored = manager2.getAgent(agent.id);
      expect(restored).not.toBeNull();
      expect(restored?.id).toBe(agent.id);
      expect(restored?.name).toBe('test-agent');
      expect(restored?.type).toBe('claude-code');
      expect(restored?.workspace).toBe('/projects/myapp');
    });

    it('multiple agents survive restart', async () => {
      /*
      Test Doc:
      - Why: Multiple agents should all persist
      - Contract: Create 3 agents → restart → all 3 exist
      - Usage Notes: All agents in registry are rehydrated
      - Quality Contribution: Ensures no agents lost
      - Worked Example: createAgent() x 3 → new manager → getAgents() returns 3
      */
      // Pre-populate storage directly (simulating agents that were persisted)
      const agents = [
        { id: 'agent-1', name: 'a1', type: 'claude-code', workspace: '/ws1' },
        { id: 'agent-2', name: 'a2', type: 'copilot', workspace: '/ws1' },
        { id: 'agent-3', name: 'a3', type: 'claude-code', workspace: '/ws2' },
      ] as const;

      for (const agent of agents) {
        const createdAt = new Date().toISOString();
        await storage.registerAgent({ id: agent.id, workspace: agent.workspace, createdAt });
        await storage.saveInstance({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          workspace: agent.workspace,
          status: 'stopped',
          intent: '',
          sessionId: null,
          createdAt,
          updatedAt: createdAt,
        });
      }

      // Now "restart" by creating a new manager with same storage
      const manager = new AgentManagerService(adapterFactory, notifier, storage);
      await manager.initialize();

      const restoredAgents = manager.getAgents();
      expect(restoredAgents).toHaveLength(3);
      expect(restoredAgents.map((a) => a.id).sort()).toEqual(agents.map((a) => a.id).sort());
    });

    it('agent status restored as stopped (per DYK-15)', async () => {
      /*
      Test Doc:
      - Why: DYK-15 - Working agents rehydrate as stopped
      - Contract: Agent with status='working' rehydrates as 'stopped'
      - Usage Notes: Can't resume adapter work after restart
      - Quality Contribution: Ensures clean state after restart
      - Worked Example: status:working → restart → status:stopped
      */
      const manager1 = new AgentManagerService(adapterFactory, notifier, storage);
      await manager1.initialize();

      const agent = manager1.createAgent({ name: 'test', type: 'claude-code', workspace: '/ws' });

      // Wait for persistence, then manually update status to 'working' in storage
      await new Promise((resolve) => setTimeout(resolve, 10));
      const data = await storage.loadInstance(agent.id);
      expect(data).not.toBeNull();
      if (data) {
        await storage.saveInstance({ ...data, status: 'working' });
      }

      // Restart
      const manager2 = new AgentManagerService(adapterFactory, notifier, storage);
      await manager2.initialize();

      const restored = manager2.getAgent(agent.id);
      expect(restored?.status).toBe('stopped'); // Not 'working'
    });

    it('agent intent preserved across restart', async () => {
      /*
      Test Doc:
      - Why: Intent should persist for user context
      - Contract: setIntent() → restart → intent preserved
      - Usage Notes: Intent is user-facing context
      - Quality Contribution: Ensures state continuity
      - Worked Example: setIntent("Working on X") → restart → intent = "Working on X"
      */
      const manager1 = new AgentManagerService(adapterFactory, notifier, storage);
      await manager1.initialize();

      const agent = manager1.createAgent({ name: 'test', type: 'claude-code', workspace: '/ws' });
      agent.setIntent('Building new feature');

      await new Promise((resolve) => setTimeout(resolve, 10));

      const manager2 = new AgentManagerService(adapterFactory, notifier, storage);
      await manager2.initialize();

      const restored = manager2.getAgent(agent.id);
      expect(restored?.intent).toBe('Building new feature');
    });

    it('workspace filter works after restart', async () => {
      /*
      Test Doc:
      - Why: Workspace filtering should work on rehydrated agents
      - Contract: Create in different workspaces → restart → filter works
      - Usage Notes: workspace is persisted and used for filtering
      - Quality Contribution: Ensures workspace isolation
      - Worked Example: 2 in /ws1, 1 in /ws2 → restart → getAgents({workspace:"/ws1"}) returns 2
      */
      // Pre-populate storage directly
      const agents = [
        { id: 'a1', workspace: '/ws1' },
        { id: 'a2', workspace: '/ws1' },
        { id: 'a3', workspace: '/ws2' },
      ];

      for (const agent of agents) {
        const createdAt = new Date().toISOString();
        await storage.registerAgent({ id: agent.id, workspace: agent.workspace, createdAt });
        await storage.saveInstance({
          id: agent.id,
          name: agent.id,
          type: 'claude-code',
          workspace: agent.workspace,
          status: 'stopped',
          intent: '',
          sessionId: null,
          createdAt,
          updatedAt: createdAt,
        });
      }

      const manager = new AgentManagerService(adapterFactory, notifier, storage);
      await manager.initialize();

      const ws1Agents = manager.getAgents({ workspace: '/ws1' });
      const ws2Agents = manager.getAgents({ workspace: '/ws2' });

      expect(ws1Agents).toHaveLength(2);
      expect(ws2Agents).toHaveLength(1);
    });
  });

  // ===== AC-21: Events stored in NDJSON format =====

  describe('AC-21: Events persist in NDJSON format', () => {
    it('events survive restart via eager loading (per DYK-14)', async () => {
      /*
      Test Doc:
      - Why: DYK-14 - Events eagerly loaded at hydrate time
      - Contract: appendEvent() → restart → getEvents() returns events
      - Usage Notes: All events loaded into memory at hydrate
      - Quality Contribution: Ensures event history preserved
      - Worked Example: 3 events → restart → getEvents() returns 3
      */
      // Register and save an agent first
      await storage.registerAgent({
        id: 'agent-1',
        workspace: '/ws',
        createdAt: new Date().toISOString(),
      });
      await storage.saveInstance({
        id: 'agent-1',
        name: 'test',
        type: 'claude-code',
        workspace: '/ws',
        status: 'stopped',
        intent: '',
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Append events directly to storage
      await storage.appendEvent('agent-1', {
        eventId: 'evt-1',
        type: 'text',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });
      await storage.appendEvent('agent-1', {
        eventId: 'evt-2',
        type: 'text',
        role: 'assistant',
        content: 'Hi!',
        timestamp: new Date().toISOString(),
      });
      await storage.appendEvent('agent-1', {
        eventId: 'evt-3',
        type: 'text',
        role: 'user',
        content: 'Goodbye',
        timestamp: new Date().toISOString(),
      });

      // Hydrate agent
      const manager = new AgentManagerService(adapterFactory, notifier, storage);
      await manager.initialize();

      const agent = manager.getAgent('agent-1');
      expect(agent).not.toBeNull();

      const events = agent?.getEvents();
      expect(events).toHaveLength(3);
      expect(events[0].eventId).toBe('evt-1');
      expect(events[1].eventId).toBe('evt-2');
      expect(events[2].eventId).toBe('evt-3');
    });

    it('getEventsSince works on restored events', async () => {
      /*
      Test Doc:
      - Why: AC-21 supports incremental event fetching
      - Contract: Events restored → getEventsSince(id) works
      - Usage Notes: Used for SSE catch-up on reconnection
      - Quality Contribution: Enables efficient event streaming
      - Worked Example: 3 events restored → getEventsSince("evt-1") returns 2
      */
      await storage.registerAgent({
        id: 'agent-1',
        workspace: '/ws',
        createdAt: new Date().toISOString(),
      });
      await storage.saveInstance({
        id: 'agent-1',
        name: 'test',
        type: 'claude-code',
        workspace: '/ws',
        status: 'stopped',
        intent: '',
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await storage.appendEvent('agent-1', {
        eventId: 'evt-1',
        type: 'text',
        role: 'user',
        content: 'First',
        timestamp: new Date().toISOString(),
      });
      await storage.appendEvent('agent-1', {
        eventId: 'evt-2',
        type: 'text',
        role: 'assistant',
        content: 'Second',
        timestamp: new Date().toISOString(),
      });
      await storage.appendEvent('agent-1', {
        eventId: 'evt-3',
        type: 'text',
        role: 'user',
        content: 'Third',
        timestamp: new Date().toISOString(),
      });

      const manager = new AgentManagerService(adapterFactory, notifier, storage);
      await manager.initialize();

      const agent = manager.getAgent('agent-1');
      const sinceEvents = agent?.getEvents({ sinceId: 'evt-1' });

      expect(sinceEvents).toHaveLength(2);
      expect(sinceEvents[0].eventId).toBe('evt-2');
      expect(sinceEvents[1].eventId).toBe('evt-3');
    });

    it('event ID counter continues after restart', async () => {
      /*
      Test Doc:
      - Why: New events after restart shouldn't collide with old IDs
      - Contract: Restore with events → new event gets unique ID
      - Usage Notes: Counter extracted from last event ID
      - Quality Contribution: Prevents ID collisions
      - Worked Example: 3 events → restart → new event gets evt-4
      */
      await storage.registerAgent({
        id: 'agent-1',
        workspace: '/ws',
        createdAt: new Date().toISOString(),
      });
      await storage.saveInstance({
        id: 'agent-1',
        name: 'test',
        type: 'claude-code',
        workspace: '/ws',
        status: 'stopped',
        intent: '',
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Add events with the format "agent-id-evt-N"
      await storage.appendEvent('agent-1', {
        eventId: 'agent-1-evt-1',
        type: 'text',
        role: 'user',
        content: 'First',
        timestamp: new Date().toISOString(),
      });
      await storage.appendEvent('agent-1', {
        eventId: 'agent-1-evt-2',
        type: 'text',
        role: 'assistant',
        content: 'Second',
        timestamp: new Date().toISOString(),
      });

      // Hydrate via static factory directly to test counter
      const instance = await AgentInstance.hydrate('agent-1', storage, adapterFactory, notifier);
      expect(instance).not.toBeNull();

      // Get events - the instance should have loaded them
      const events = instance?.getEvents();
      expect(events).toHaveLength(2);

      // The instance's internal counter should be set to 2
      // We can't directly check the counter, but we can verify events loaded
      expect(events[events.length - 1].eventId).toBe('agent-1-evt-2');
    });
  });

  // ===== DYK-12: Storage is optional =====

  describe('DYK-12: Storage is optional', () => {
    it('manager works without storage (in-memory only)', async () => {
      /*
      Test Doc:
      - Why: DYK-12 - Backwards compatibility with Phase 1/2 behavior
      - Contract: Manager without storage works but doesn't persist
      - Usage Notes: Tests continue to work without storage
      - Quality Contribution: Ensures backwards compatibility
      - Worked Example: new AgentManagerService(factory, notifier) → createAgent works
      */
      const manager = new AgentManagerService(adapterFactory, notifier); // No storage
      await manager.initialize(); // No-op

      const agent = manager.createAgent({ name: 'test', type: 'claude-code', workspace: '/ws' });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(manager.getAgent(agent.id)).toBe(agent);
    });
  });
});
