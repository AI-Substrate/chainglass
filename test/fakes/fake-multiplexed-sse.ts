/**
 * FakeMultiplexedSSE — Test double for MultiplexedSSEProvider
 *
 * Wraps FakeEventSource with channel-aware message simulation.
 * Provides a factory for injecting into MultiplexedSSEProvider's
 * `eventSourceFactory` prop, plus helpers for simulating per-channel events.
 *
 * Follows the createFakeEventSourceFactory() exemplar pattern.
 *
 * Plan 072: SSE Multiplexing — Phase 2
 *
 * @example
 * const fake = createFakeMultiplexedSSEFactory();
 * render(
 *   <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake.factory}>
 *     <TestConsumer />
 *   </MultiplexedSSEProvider>
 * );
 * act(() => {
 *   fake.simulateOpen();
 *   fake.simulateChannelMessage('event-popper', 'question-asked', { questionId: 'q1' });
 * });
 */

import { FakeEventSource } from './fake-event-source';

export function createFakeMultiplexedSSEFactory() {
  let instance: FakeEventSource | null = null;
  let instanceCount = 0;

  const factory = (url: string, options?: EventSourceInit): EventSource => {
    instance = new FakeEventSource(url, options);
    instanceCount++;
    return instance as unknown as EventSource;
  };

  return {
    /** EventSourceFactory to inject into MultiplexedSSEProvider */
    factory,

    /** The most recently created FakeEventSource instance */
    get instance() {
      return instance;
    },

    /** Number of EventSource instances created (useful for reconnect tests) */
    get instanceCount() {
      return instanceCount;
    },

    /**
     * Simulate a channel-specific event arriving on the multiplexed stream.
     * Produces a JSON message with { channel, type, ...data }.
     */
    simulateChannelMessage(channel: string, type: string, data: Record<string, unknown> = {}) {
      if (!instance) throw new Error('No EventSource created yet — mount the provider first');
      instance.simulateMessage(JSON.stringify({ channel, type, ...data }));
    },

    /** Simulate the EventSource connection opening successfully */
    simulateOpen() {
      if (!instance) throw new Error('No EventSource created yet — mount the provider first');
      instance.simulateOpen();
    },

    /** Simulate a connection error (triggers reconnection in provider) */
    simulateError() {
      if (!instance) throw new Error('No EventSource created yet — mount the provider first');
      instance.simulateError();
    },
  };
}
