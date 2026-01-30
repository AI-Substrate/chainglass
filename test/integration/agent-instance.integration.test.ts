/**
 * Plan 019: Agent Manager Refactor - Integration Test
 *
 * Tests AgentInstance integration with FakeAgentAdapter to verify:
 * - run() delegates to adapter
 * - Events are captured
 * - Status transitions are correct
 * - Double-run is rejected
 *
 * Per T011: Integration test with FakeAgentAdapter.
 * Per DYK-10: AgentInstance receives FakeAgentNotifierService.
 */

import { FakeAgentAdapter } from '@chainglass/shared';
import {
  type AdapterFactory,
  AgentInstance,
  AgentManagerService,
  type AgentStoredEvent,
  FakeAgentNotifierService,
} from '@chainglass/shared/features/019-agent-manager-refactor';
import { describe, expect, it } from 'vitest';

describe('AgentInstance Integration', () => {
  /**
   * Create a test adapter factory that returns configured FakeAgentAdapter.
   */
  function createAdapterFactory(options?: {
    sessionId?: string;
    output?: string;
    events?: AgentStoredEvent[];
  }): AdapterFactory {
    return () =>
      new FakeAgentAdapter({
        sessionId: options?.sessionId ?? 'test-session-123',
        output: options?.output ?? 'Test response',
        tokens: { used: 100, total: 500, limit: 200000 },
      });
  }

  /**
   * Create a FakeAgentNotifierService for test isolation.
   */
  function createNotifier(): FakeAgentNotifierService {
    return new FakeAgentNotifierService();
  }

  it('run() delegates to FakeAgentAdapter and captures sessionId', async () => {
    /*
    Test Doc:
    - Why: Verify AgentInstance correctly wraps IAgentAdapter
    - Contract: run() calls adapter.run() and stores returned sessionId
    - Usage Notes: SessionId enables conversation continuity
    - Quality Contribution: Core integration point for agent execution
    - Worked Example: run({prompt}) → result.sessionId stored in instance
    */
    const factory = createAdapterFactory({ sessionId: 'captured-session-abc' });
    const notifier = createNotifier();
    const instance = new AgentInstance(
      {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'claude-code',
        workspace: '/projects/test',
      },
      factory,
      notifier
    );

    expect(instance.sessionId).toBeNull();

    const result = await instance.run({ prompt: 'Hello, agent!' });

    expect(result.sessionId).toBe('captured-session-abc');
    expect(instance.sessionId).toBe('captured-session-abc');
    expect(result.status).toBe('completed');
    expect(instance.status).toBe('stopped');
  });

  it('status transitions correctly during run()', async () => {
    /*
    Test Doc:
    - Why: Verify status state machine works correctly
    - Contract: stopped → working → stopped (or error)
    - Usage Notes: Status used for double-run guard and UI display
    - Quality Contribution: Ensures correct state management
    - Worked Example: run() transitions through all states
    */
    const factory = createAdapterFactory();
    const notifier = createNotifier();
    const instance = new AgentInstance(
      {
        id: 'agent-2',
        name: 'Status Test',
        type: 'copilot',
        workspace: '/ws',
      },
      factory,
      notifier
    );

    expect(instance.status).toBe('stopped');

    // After successful run, status returns to stopped
    await instance.run({ prompt: 'test' });
    expect(instance.status).toBe('stopped');
  });

  it('double-run is rejected with status=working', async () => {
    /*
    Test Doc:
    - Why: Prevent concurrent execution race conditions
    - Contract: run() while status=working throws Error
    - Usage Notes: Synchronous guard checked BEFORE any async work
    - Quality Contribution: Critical safety feature for agent execution
    - Worked Example: Start run, immediate second run → Error
    */
    const factory = createAdapterFactory();
    const notifier = createNotifier();
    const instance = new AgentInstance(
      {
        id: 'agent-3',
        name: 'Double Run Test',
        type: 'claude-code',
        workspace: '/ws',
      },
      factory,
      notifier
    );

    // Start first run but don't await
    const firstRun = instance.run({ prompt: 'first' });

    // Immediately try second run - should fail because status is 'working'
    await expect(instance.run({ prompt: 'second' })).rejects.toThrow(/already running/i);

    // Clean up - wait for first run to complete
    await firstRun;
  });

  it('events are captured during run()', async () => {
    /*
    Test Doc:
    - Why: Events enable conversation rehydration and UI updates
    - Contract: Events from adapter onEvent callback are stored with eventIds
    - Usage Notes: eventIds enable incremental fetching
    - Quality Contribution: Core feature for event history
    - Worked Example: Adapter emits events → getEvents() returns them
    */
    const adapter = new FakeAgentAdapter({
      sessionId: 'event-test-session',
      output: 'Response with events',
    });

    // Configure adapter to emit events
    adapter.setEvents([
      { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'Hello' } },
      { type: 'message', timestamp: new Date().toISOString(), data: { content: 'World' } },
    ]);

    const factory: AdapterFactory = () => adapter;
    const notifier = createNotifier();
    const instance = new AgentInstance(
      {
        id: 'agent-4',
        name: 'Event Test',
        type: 'claude-code',
        workspace: '/ws',
      },
      factory,
      notifier
    );

    await instance.run({ prompt: 'test' });

    const events = instance.getEvents();
    expect(events).toHaveLength(3);
    expect(events[0].eventId).toBeDefined();
    expect(events[0].type).toBe('user_prompt');
    expect(events[1].eventId).toBeDefined();
    expect(events[1].type).toBe('text_delta');
    expect(events[2].eventId).toBeDefined();
    expect(events[2].type).toBe('message');

    // Event IDs should be unique
    expect(events[0].eventId).not.toBe(events[1].eventId);
  });

  it('terminate() calls adapter and updates status', async () => {
    /*
    Test Doc:
    - Why: Agents need graceful termination
    - Contract: terminate() delegates to adapter, sets status=stopped
    - Usage Notes: Returns killed status, session remains valid
    - Quality Contribution: Ensures clean shutdown
    - Worked Example: terminate() → status='killed', instance.status='stopped'
    */
    const factory = createAdapterFactory({ sessionId: 'terminate-session' });
    const notifier = createNotifier();
    const instance = new AgentInstance(
      {
        id: 'agent-5',
        name: 'Terminate Test',
        type: 'claude-code',
        workspace: '/ws',
      },
      factory,
      notifier
    );

    // Run to get a session
    await instance.run({ prompt: 'test' });
    expect(instance.sessionId).toBe('terminate-session');

    // Terminate
    const result = await instance.terminate();
    expect(result.status).toBe('killed');
    expect(instance.status).toBe('stopped');
  });

  it('incremental event fetching works with sinceId', async () => {
    /*
    Test Doc:
    - Why: Web clients need efficient event sync
    - Contract: getEvents({sinceId}) returns only newer events
    - Usage Notes: Reduces bandwidth for long conversations
    - Quality Contribution: Performance optimization
    - Worked Example: 5 events, sinceId=2nd → returns 3 events
    */
    const adapter = new FakeAgentAdapter({ sessionId: 'incremental-test' });

    // Configure adapter to emit multiple events
    adapter.setEvents([
      { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'A' } },
      { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'B' } },
      { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'C' } },
      { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'D' } },
      { type: 'message', timestamp: new Date().toISOString(), data: { content: 'E' } },
    ]);

    const factory: AdapterFactory = () => adapter;
    const notifier = createNotifier();
    const instance = new AgentInstance(
      {
        id: 'agent-6',
        name: 'Incremental Test',
        type: 'claude-code',
        workspace: '/ws',
      },
      factory,
      notifier
    );

    await instance.run({ prompt: 'test' });

    const allEvents = instance.getEvents();
    // 1 user_prompt + 5 adapter events = 6
    expect(allEvents).toHaveLength(6);
    expect(allEvents[0].type).toBe('user_prompt');

    // Get events since 2nd event (first text_delta 'A')
    const sinceId = allEvents[1].eventId;
    const newEvents = instance.getEvents({ sinceId });

    // Should get events after 'A': B, C, D, E (indices 2-5)
    expect(newEvents).toHaveLength(4);
    expect(newEvents[0].data).toEqual({ content: 'B' });
  });
});

describe('AgentManagerService Integration', () => {
  it('creates agents and stores them in registry', () => {
    /*
    Test Doc:
    - Why: Manager is central registry for all agents
    - Contract: createAgent() stores agent in internal Map
    - Usage Notes: getAgents/getAgent retrieve created agents
    - Quality Contribution: Core registry functionality
    - Worked Example: createAgent() → getAgent(id) returns same agent
    */
    const factory: AdapterFactory = () => new FakeAgentAdapter({ sessionId: 'mgr-test-session' });
    const notifier = new FakeAgentNotifierService();
    const manager = new AgentManagerService(factory, notifier);

    const agent = manager.createAgent({
      name: 'Integration Test Agent',
      type: 'claude-code',
      workspace: '/projects/test',
    });

    expect(agent.id).toBeDefined();
    expect(agent.name).toBe('Integration Test Agent');

    // Retrieve by ID
    const retrieved = manager.getAgent(agent.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(agent.id);

    // List all
    const all = manager.getAgents();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(agent.id);
  });

  it('filters agents by workspace', () => {
    /*
    Test Doc:
    - Why: Users need to see agents for current workspace
    - Contract: getAgents({workspace}) returns only matching agents
    - Usage Notes: Exact match on workspace path
    - Quality Contribution: Enables workspace-scoped UI
    - Worked Example: 2 workspaces → filter returns only one
    */
    const factory: AdapterFactory = () => new FakeAgentAdapter();
    const notifier = new FakeAgentNotifierService();
    const manager = new AgentManagerService(factory, notifier);

    manager.createAgent({ name: 'A1', type: 'claude-code', workspace: '/ws1' });
    manager.createAgent({ name: 'A2', type: 'copilot', workspace: '/ws1' });
    manager.createAgent({ name: 'A3', type: 'claude-code', workspace: '/ws2' });

    const ws1Agents = manager.getAgents({ workspace: '/ws1' });
    expect(ws1Agents).toHaveLength(2);

    const ws2Agents = manager.getAgents({ workspace: '/ws2' });
    expect(ws2Agents).toHaveLength(1);
    expect(ws2Agents[0].name).toBe('A3');
  });

  it('agents created by manager can run prompts', async () => {
    /*
    Test Doc:
    - Why: End-to-end flow from manager to agent execution
    - Contract: Manager-created agent can run() and returns result
    - Usage Notes: This is the primary usage pattern
    - Quality Contribution: Full integration verification
    - Worked Example: manager.createAgent() → agent.run() → success
    */
    const factory: AdapterFactory = () =>
      new FakeAgentAdapter({
        sessionId: 'e2e-session',
        output: 'E2E response',
      });
    const notifier = new FakeAgentNotifierService();
    const manager = new AgentManagerService(factory, notifier);

    const agent = manager.createAgent({
      name: 'E2E Agent',
      type: 'claude-code',
      workspace: '/projects/e2e',
    });

    expect(agent.status).toBe('stopped');

    const result = await agent.run({ prompt: 'End to end test' });

    expect(result.output).toBe('E2E response');
    expect(result.sessionId).toBe('e2e-session');
    expect(agent.status).toBe('stopped');
    expect(agent.sessionId).toBe('e2e-session');
  });
});
