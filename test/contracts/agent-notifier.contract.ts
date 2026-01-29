/**
 * Plan 019: Agent Manager Refactor - Contract Tests for IAgentNotifierService
 *
 * Defines behavior contracts that BOTH Fake and Real implementations must satisfy.
 * Per DYK-05: Contract tests ensure Fake/Real parity.
 * Per DYK-08: Both implementations receive ISSEBroadcaster for testing.
 *
 * These tests verify:
 * - AC-14: Events include agentId for filtering
 * - AC-15: Status changes are broadcast
 * - AC-16: Intent changes are broadcast
 * - AC-17: Agent events are broadcast
 */

import type { AgentStoredEvent } from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import type { IAgentNotifierService } from '@chainglass/shared/features/019-agent-manager-refactor/agent-notifier.interface';
import type {
  AgentEventSSEEvent,
  AgentIntentSSEEvent,
  AgentStatusSSEEvent,
} from '@chainglass/shared/features/019-agent-manager-refactor/agent-notifier.interface';
import {
  FakeSSEBroadcaster,
  type RecordedBroadcast,
} from '@chainglass/shared/features/019-agent-manager-refactor/fake-sse-broadcaster';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Factory function type for creating notifier implementations.
 * Takes a FakeSSEBroadcaster to enable inspection of broadcasts.
 */
export type NotifierFactory = (broadcaster: FakeSSEBroadcaster) => IAgentNotifierService;

/**
 * Contract tests for IAgentNotifierService.
 *
 * Run these against both Fake and Real implementations by calling
 * agentNotifierContractTests() with different factories.
 *
 * @param name - Implementation name for test descriptions
 * @param factory - Factory function that creates the implementation with a FakeSSEBroadcaster
 */
export function agentNotifierContractTests(name: string, factory: NotifierFactory): void {
  describe(`IAgentNotifierService Contract: ${name}`, () => {
    let broadcaster: FakeSSEBroadcaster;
    let notifier: IAgentNotifierService;

    beforeEach(() => {
      broadcaster = new FakeSSEBroadcaster();
      notifier = factory(broadcaster);
    });

    describe('broadcastStatus', () => {
      it('should broadcast status to agents channel', () => {
        notifier.broadcastStatus('agent-1', 'working');

        const broadcasts = broadcaster.getBroadcasts();
        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0]?.channel).toBe('agents');
      });

      it('should use agent_status event type', () => {
        notifier.broadcastStatus('agent-1', 'stopped');

        const broadcast = broadcaster.getLastBroadcast();
        expect(broadcast?.eventType).toBe('agent_status');
      });

      it('should include agentId for filtering (AC-14)', () => {
        notifier.broadcastStatus('agent-xyz', 'working');

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentStatusSSEEvent;
        expect(data.agentId).toBe('agent-xyz');
      });

      it('should include status value (AC-15)', () => {
        notifier.broadcastStatus('agent-1', 'error');

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentStatusSSEEvent;
        expect(data.status).toBe('error');
      });

      it('should include timestamp', () => {
        notifier.broadcastStatus('agent-1', 'working');

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentStatusSSEEvent;
        expect(data.timestamp).toBeDefined();
        expect(typeof data.timestamp).toBe('string');
      });

      it('should include event type in data', () => {
        notifier.broadcastStatus('agent-1', 'working');

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentStatusSSEEvent;
        expect(data.type).toBe('agent_status');
      });
    });

    describe('broadcastIntent', () => {
      it('should broadcast intent to agents channel', () => {
        notifier.broadcastIntent('agent-1', 'Analyzing code...');

        const broadcasts = broadcaster.getBroadcasts();
        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0]?.channel).toBe('agents');
      });

      it('should use agent_intent event type', () => {
        notifier.broadcastIntent('agent-1', 'Processing request');

        const broadcast = broadcaster.getLastBroadcast();
        expect(broadcast?.eventType).toBe('agent_intent');
      });

      it('should include agentId for filtering (AC-14)', () => {
        notifier.broadcastIntent('agent-abc', 'Thinking...');

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentIntentSSEEvent;
        expect(data.agentId).toBe('agent-abc');
      });

      it('should include intent value (AC-16)', () => {
        notifier.broadcastIntent('agent-1', 'Building application');

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentIntentSSEEvent;
        expect(data.intent).toBe('Building application');
      });

      it('should include timestamp', () => {
        notifier.broadcastIntent('agent-1', 'Working...');

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentIntentSSEEvent;
        expect(data.timestamp).toBeDefined();
      });

      it('should include event type in data', () => {
        notifier.broadcastIntent('agent-1', 'Working...');

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentIntentSSEEvent;
        expect(data.type).toBe('agent_intent');
      });
    });

    describe('broadcastEvent', () => {
      const sampleEvent: AgentStoredEvent = {
        eventId: 'evt-123',
        type: 'text_delta',
        content: 'Hello, world!',
      };

      it('should broadcast event to agents channel', () => {
        notifier.broadcastEvent('agent-1', sampleEvent);

        const broadcasts = broadcaster.getBroadcasts();
        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0]?.channel).toBe('agents');
      });

      it('should use agent_event event type', () => {
        notifier.broadcastEvent('agent-1', sampleEvent);

        const broadcast = broadcaster.getLastBroadcast();
        expect(broadcast?.eventType).toBe('agent_event');
      });

      it('should include agentId for filtering (AC-14)', () => {
        notifier.broadcastEvent('agent-def', sampleEvent);

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentEventSSEEvent;
        expect(data.agentId).toBe('agent-def');
      });

      it('should include the stored event (AC-17)', () => {
        notifier.broadcastEvent('agent-1', sampleEvent);

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentEventSSEEvent;
        expect(data.event).toEqual(sampleEvent);
      });

      it('should include timestamp', () => {
        notifier.broadcastEvent('agent-1', sampleEvent);

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentEventSSEEvent;
        expect(data.timestamp).toBeDefined();
      });

      it('should include event type in data', () => {
        notifier.broadcastEvent('agent-1', sampleEvent);

        const broadcast = broadcaster.getLastBroadcast();
        const data = broadcast?.data as AgentEventSSEEvent;
        expect(data.type).toBe('agent_event');
      });
    });

    describe('multiple broadcasts', () => {
      it('should track all broadcasts in order', () => {
        notifier.broadcastStatus('agent-1', 'working');
        notifier.broadcastIntent('agent-1', 'Analyzing...');
        notifier.broadcastStatus('agent-1', 'stopped');

        const broadcasts = broadcaster.getBroadcasts();
        expect(broadcasts).toHaveLength(3);
        expect(broadcasts[0]?.eventType).toBe('agent_status');
        expect(broadcasts[1]?.eventType).toBe('agent_intent');
        expect(broadcasts[2]?.eventType).toBe('agent_status');
      });

      it('should handle multiple agents (concurrent support)', () => {
        notifier.broadcastStatus('agent-1', 'working');
        notifier.broadcastStatus('agent-2', 'working');

        const broadcasts = broadcaster.getBroadcasts();
        expect(broadcasts).toHaveLength(2);

        const data1 = broadcasts[0]?.data as AgentStatusSSEEvent;
        const data2 = broadcasts[1]?.data as AgentStatusSSEEvent;
        expect(data1.agentId).toBe('agent-1');
        expect(data2.agentId).toBe('agent-2');
      });
    });
  });
}
