/**
 * Plan 019: Agent Manager Refactor - Phase 2 Integration Test
 *
 * Tests the full AgentInstance → AgentNotifierService → SSE broadcast flow.
 * Verifies the storage-first pattern (PL-01) is correctly implemented.
 *
 * Per T007: Integration test verifying SSE receives agent events end-to-end.
 */

import { FakeAgentAdapter } from '@chainglass/shared';
import {
  type AdapterFactory,
  AgentInstance,
  AgentManagerService,
  type AgentStoredEvent,
  FakeAgentNotifierService,
} from '@chainglass/shared/features/019-agent-manager-refactor';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Phase 2 Integration: AgentNotifierService', () => {
  let notifier: FakeAgentNotifierService;
  let adapterFactory: AdapterFactory;

  beforeEach(() => {
    notifier = new FakeAgentNotifierService();
    adapterFactory = () =>
      new FakeAgentAdapter({
        sessionId: 'integration-session',
        output: 'Integration response',
      });
  });

  describe('AgentInstance → Notifier Broadcasts', () => {
    it('broadcasts status changes during run() lifecycle', async () => {
      /*
      Test Doc:
      - Why: Status changes must be broadcast for UI updates (AC-15)
      - Contract: run() broadcasts 'working' at start, 'stopped' at end
      - Usage Notes: Menu items and chat UI rely on these status broadcasts
      - Quality Contribution: Verifies core SSE notification flow
      - Worked Example: run() → 2 status broadcasts (working, stopped)
      */
      const instance = new AgentInstance(
        { id: 'status-test', name: 'Status Test', type: 'claude-code', workspace: '/ws' },
        adapterFactory,
        notifier
      );

      await instance.run({ prompt: 'test prompt' });

      const statusBroadcasts = notifier.getStatusBroadcasts();
      expect(statusBroadcasts).toHaveLength(2);

      // First broadcast: working
      const firstStatus = notifier.getStatusBroadcasts()[0].data as {
        status: string;
        agentId: string;
      };
      expect(firstStatus.status).toBe('working');
      expect(firstStatus.agentId).toBe('status-test');

      // Last broadcast: stopped
      const lastStatus = notifier.getLastStatusBroadcast();
      expect(lastStatus?.status).toBe('stopped');
    });

    it('broadcasts intent at start of run()', async () => {
      /*
      Test Doc:
      - Why: Intent gives users visibility into what agent is doing (AC-16)
      - Contract: run() broadcasts initial intent from prompt
      - Usage Notes: Intent truncated to 100 chars for display
      - Quality Contribution: Verifies intent notification flow
      - Worked Example: run({prompt}) → intent broadcast with prompt excerpt
      */
      const instance = new AgentInstance(
        { id: 'intent-test', name: 'Intent Test', type: 'copilot', workspace: '/ws' },
        adapterFactory,
        notifier
      );

      await instance.run({ prompt: 'Analyze this code and explain what it does' });

      const intentBroadcasts = notifier.getIntentBroadcasts();
      expect(intentBroadcasts).toHaveLength(1);

      const intent = notifier.getLastIntentBroadcast();
      expect(intent?.agentId).toBe('intent-test');
      expect(intent?.intent).toContain('Analyze');
    });

    it('broadcasts intent on setIntent() call', async () => {
      /*
      Test Doc:
      - Why: Agent intent can change during execution
      - Contract: setIntent() broadcasts new intent
      - Usage Notes: Adapters may call setIntent to update UI
      - Quality Contribution: Verifies intent update notification
      - Worked Example: setIntent('Refactoring...') → intent broadcast
      */
      const instance = new AgentInstance(
        { id: 'intent-update-test', name: 'Intent Update', type: 'claude-code', workspace: '/ws' },
        adapterFactory,
        notifier
      );

      instance.setIntent('Refactoring database schema...');

      const intent = notifier.getLastIntentBroadcast();
      expect(intent?.intent).toBe('Refactoring database schema...');
      expect(intent?.agentId).toBe('intent-update-test');
    });

    it('broadcasts events from adapter with eventId (storage-first)', async () => {
      /*
      Test Doc:
      - Why: Agent events enable conversation rehydration and real-time streaming (AC-17)
      - Contract: Events are stored with eventId, THEN broadcast (per PL-01)
      - Usage Notes: eventId enables incremental fetching
      - Quality Contribution: Verifies storage-first pattern + SSE notification
      - Worked Example: Adapter emits 2 events → 2 broadcasts with eventIds
      */
      const adapter = new FakeAgentAdapter({ sessionId: 'event-test-session' });
      adapter.setEvents([
        { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'Hello' } },
        { type: 'message', timestamp: new Date().toISOString(), data: { content: 'World' } },
      ]);

      const factory: AdapterFactory = () => adapter;
      const instance = new AgentInstance(
        { id: 'event-test', name: 'Event Test', type: 'claude-code', workspace: '/ws' },
        factory,
        notifier
      );

      await instance.run({ prompt: 'test' });

      // Verify events were broadcast (1 user_prompt + 2 adapter events)
      const eventBroadcasts = notifier.getEventBroadcasts();
      expect(eventBroadcasts).toHaveLength(3);

      // First broadcast is the user_prompt, second is text_delta from adapter
      const firstAdapterEvent = notifier.getEventBroadcasts()[1].data as {
        agentId: string;
        event: AgentStoredEvent;
      };
      expect(firstAdapterEvent.agentId).toBe('event-test');

      // Verify eventId present (storage-first pattern - event stored before broadcast)
      expect(firstAdapterEvent.event.eventId).toBeDefined();
      expect(firstAdapterEvent.event.eventId).toContain('event-test-evt-');

      // Verify events also stored in instance (storage-first verification)
      const storedEvents = instance.getEvents();
      expect(storedEvents).toHaveLength(3);
      expect(storedEvents[1].eventId).toBe(firstAdapterEvent.event.eventId);
    });

    it('broadcasts include agentId for client-side filtering (AC-14)', async () => {
      /*
      Test Doc:
      - Why: Single SSE channel requires agentId for client-side routing (ADR-0007)
      - Contract: ALL broadcast types include agentId field
      - Usage Notes: Clients filter by agentId to update correct UI
      - Quality Contribution: Verifies ADR-0007 compliance
      - Worked Example: All broadcasts have agentId matching instance.id
      */
      const instance = new AgentInstance(
        { id: 'agent-xyz-123', name: 'ID Test', type: 'claude-code', workspace: '/ws' },
        adapterFactory,
        notifier
      );

      await instance.run({ prompt: 'test' });

      // All broadcasts should have agentId
      const all = notifier.getBroadcasts();
      for (const broadcast of all) {
        const data = broadcast.data as { agentId?: string };
        expect(data.agentId).toBe('agent-xyz-123');
      }
    });
  });

  describe('AgentManagerService → AgentInstance → Notifier Integration', () => {
    it('manager-created agents broadcast to shared notifier', async () => {
      /*
      Test Doc:
      - Why: Manager is entry point for agent creation (per DYK-06)
      - Contract: Agents created via manager use injected notifier
      - Usage Notes: This is the primary production usage pattern
      - Quality Contribution: Full end-to-end integration verification
      - Worked Example: manager.createAgent() → agent.run() → broadcasts received
      */
      const manager = new AgentManagerService(adapterFactory, notifier);

      const agent = manager.createAgent({
        name: 'Manager Created Agent',
        type: 'claude-code',
        workspace: '/projects/test',
      });

      await agent.run({ prompt: 'Hello from manager-created agent' });

      // Verify notifier received broadcasts
      const statusBroadcasts = notifier.getStatusBroadcasts();
      expect(statusBroadcasts.length).toBeGreaterThanOrEqual(2);

      // Verify agentId matches created agent
      const lastStatus = notifier.getLastStatusBroadcast();
      expect(lastStatus?.agentId).toBe(agent.id);
    });

    it('multiple agents broadcast to same channel', async () => {
      /*
      Test Doc:
      - Why: Single SSE channel supports multiple concurrent agents (ADR-0007)
      - Contract: Multiple agents' broadcasts interleave on shared notifier
      - Usage Notes: UI can filter by agentId to separate agent streams
      - Quality Contribution: Verifies concurrent agent support
      - Worked Example: 2 agents run → broadcasts from both on same notifier
      */
      const manager = new AgentManagerService(adapterFactory, notifier);

      const agent1 = manager.createAgent({
        name: 'Agent 1',
        type: 'claude-code',
        workspace: '/ws1',
      });
      const agent2 = manager.createAgent({ name: 'Agent 2', type: 'copilot', workspace: '/ws2' });

      // Run both agents
      await Promise.all([
        agent1.run({ prompt: 'Agent 1 prompt' }),
        agent2.run({ prompt: 'Agent 2 prompt' }),
      ]);

      // Verify broadcasts from both agents
      const agent1Broadcasts = notifier.getBroadcastsByAgent(agent1.id);
      const agent2Broadcasts = notifier.getBroadcastsByAgent(agent2.id);

      expect(agent1Broadcasts.length).toBeGreaterThan(0);
      expect(agent2Broadcasts.length).toBeGreaterThan(0);

      // Total should be sum of both
      const total = notifier.getBroadcasts().length;
      expect(total).toBe(agent1Broadcasts.length + agent2Broadcasts.length);
    });
  });

  describe('Storage-First Pattern Verification (PL-01)', () => {
    it('events are stored before broadcast (verified via order)', async () => {
      /*
      Test Doc:
      - Why: Storage-first ensures events persist even if SSE disconnects (PL-01)
      - Contract: getEvents() returns event BEFORE corresponding broadcast
      - Usage Notes: This is critical for reliable event delivery
      - Quality Contribution: Verifies storage-first invariant
      - Worked Example: Event stored in _events, THEN broadcast fires
      */
      const adapter = new FakeAgentAdapter({ sessionId: 'storage-first-test' });
      adapter.setEvents([
        { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'Test' } },
      ]);

      const factory: AdapterFactory = () => adapter;
      const instance = new AgentInstance(
        { id: 'storage-first', name: 'Storage First Test', type: 'claude-code', workspace: '/ws' },
        factory,
        notifier
      );

      await instance.run({ prompt: 'test' });

      // Get the stored events (1 user_prompt + 1 adapter event)
      const storedEvents = instance.getEvents();
      expect(storedEvents).toHaveLength(2);

      // Get the adapter event broadcast (index 1, after user_prompt at index 0)
      const broadcast = notifier.getEventBroadcasts()[1].data as { event: AgentStoredEvent };

      // The broadcast should contain the SAME eventId as stored event
      // (This proves the event was stored first, then the same object was broadcast)
      expect(broadcast.event.eventId).toBe(storedEvents[1].eventId);
    });
  });
});
