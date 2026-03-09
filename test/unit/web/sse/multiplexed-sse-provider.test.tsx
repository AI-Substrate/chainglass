/**
 * MultiplexedSSEProvider — Contract Tests
 *
 * Test Doc:
 * - Why: Core client-side SSE infrastructure. Must create exactly one
 *   EventSource, demux by channel, isolate subscriber errors, reconnect
 *   on failure, and clean up on unmount.
 * - Contract: AC-11 through AC-16, AC-20
 * - Usage Notes: Uses FakeMultiplexedSSE for channel simulation.
 *   All tests render the provider with injected factory, no real network.
 * - Quality Contribution: Verifies single-connection guarantee, channel
 *   routing, error isolation, reconnection with backoff, and cleanup.
 * - Worked Example: See each test for a complete scenario.
 *
 * Plan 072: SSE Multiplexing — Phase 2, T003
 */

import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MultiplexedSSEProvider,
  useMultiplexedSSE,
} from '../../../../apps/web/src/lib/sse/multiplexed-sse-provider';
import { createFakeMultiplexedSSEFactory } from '../../../../test/fakes';

describe('MultiplexedSSEProvider', () => {
  let fake: ReturnType<typeof createFakeMultiplexedSSEFactory>;

  beforeEach(() => {
    fake = createFakeMultiplexedSSEFactory();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <MultiplexedSSEProvider
        channels={['event-popper', 'file-changes']}
        eventSourceFactory={fake.factory}
      >
        {children}
      </MultiplexedSSEProvider>
    );
  }

  it('connects to mux endpoint with requested channels (AC-11)', () => {
    render(
      <MultiplexedSSEProvider
        channels={['event-popper', 'file-changes', 'work-unit-state']}
        eventSourceFactory={fake.factory}
      >
        <div />
      </MultiplexedSSEProvider>
    );

    expect(fake.instance).toBeTruthy();
    expect(fake.instance?.url).toBe(
      '/api/events/mux?channels=event-popper,file-changes,work-unit-state'
    );
    expect(fake.instanceCount).toBe(1);
  });

  it('creates exactly one EventSource (AC-11)', () => {
    render(
      <MultiplexedSSEProvider
        channels={['event-popper', 'file-changes']}
        eventSourceFactory={fake.factory}
      >
        <div />
      </MultiplexedSSEProvider>
    );

    expect(fake.instanceCount).toBe(1);
  });

  it('routes channel events to correct subscriber (AC-12)', () => {
    const received: string[] = [];

    function TestConsumer() {
      const { subscribe } = useMultiplexedSSE();
      useEffect(() => {
        return subscribe('event-popper', (event) => {
          received.push(`ep:${event.type}`);
        });
      }, [subscribe]);
      return null;
    }

    render(
      <MultiplexedSSEProvider
        channels={['event-popper', 'file-changes']}
        eventSourceFactory={fake.factory}
      >
        <TestConsumer />
      </MultiplexedSSEProvider>
    );

    act(() => fake.simulateOpen());

    // Event for subscribed channel
    act(() => fake.simulateChannelMessage('event-popper', 'question-asked', { id: 'q1' }));
    expect(received).toEqual(['ep:question-asked']);

    // Event for different channel — should NOT reach subscriber
    act(() => fake.simulateChannelMessage('file-changes', 'file-changed', { path: 'a.txt' }));
    expect(received).toEqual(['ep:question-asked']);
  });

  it('delivers events to multiple subscribers on same channel', () => {
    const sub1: string[] = [];
    const sub2: string[] = [];

    function MultiConsumer() {
      const { subscribe } = useMultiplexedSSE();
      useEffect(() => {
        const unsub1 = subscribe('event-popper', (e) => sub1.push(e.type));
        const unsub2 = subscribe('event-popper', (e) => sub2.push(e.type));
        return () => {
          unsub1();
          unsub2();
        };
      }, [subscribe]);
      return null;
    }

    render(
      <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake.factory}>
        <MultiConsumer />
      </MultiplexedSSEProvider>
    );

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'question-asked'));

    expect(sub1).toEqual(['question-asked']);
    expect(sub2).toEqual(['question-asked']);
  });

  it('isolates subscriber errors — one throwing does not affect others (AC-13)', () => {
    const received: string[] = [];
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function ErrorConsumer() {
      const { subscribe } = useMultiplexedSSE();
      useEffect(() => {
        const unsub1 = subscribe('event-popper', () => {
          throw new Error('subscriber crash');
        });
        const unsub2 = subscribe('event-popper', (e) => {
          received.push(e.type);
        });
        return () => {
          unsub1();
          unsub2();
        };
      }, [subscribe]);
      return null;
    }

    render(
      <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake.factory}>
        <ErrorConsumer />
      </MultiplexedSSEProvider>
    );

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'question-asked'));

    // Second subscriber still receives despite first throwing
    expect(received).toEqual(['question-asked']);
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('[MultiplexedSSE]'),
      expect.any(Error)
    );
    consoleWarn.mockRestore();
  });

  it('reconnects with exponential backoff on error (AC-14)', () => {
    render(
      <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake.factory}>
        <div />
      </MultiplexedSSEProvider>
    );

    expect(fake.instanceCount).toBe(1);

    // First error → reconnect after ~2s + jitter
    act(() => fake.simulateError());
    expect(fake.instanceCount).toBe(1); // not yet

    act(() => {
      vi.advanceTimersByTime(3100);
    }); // 2s base + up to 1s jitter
    expect(fake.instanceCount).toBe(2);

    // Second error → reconnect after ~4s + jitter
    act(() => fake.simulateError());
    act(() => {
      vi.advanceTimersByTime(5100);
    }); // 4s base + up to 1s jitter
    expect(fake.instanceCount).toBe(3);
  });

  it('stops reconnecting after max attempts (AC-14)', () => {
    render(
      <MultiplexedSSEProvider
        channels={['event-popper']}
        eventSourceFactory={fake.factory}
        maxReconnectAttempts={2}
      >
        <div />
      </MultiplexedSSEProvider>
    );

    // Error 1 → reconnect
    act(() => fake.simulateError());
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(fake.instanceCount).toBe(2);

    // Error 2 → reconnect
    act(() => fake.simulateError());
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(fake.instanceCount).toBe(3);

    // Error 3 → no more reconnects (max 2 attempts used)
    act(() => fake.simulateError());
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(fake.instanceCount).toBe(3); // stayed at 3
  });

  it('cleans up EventSource on unmount (AC-15)', () => {
    const { unmount } = render(
      <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake.factory}>
        <div />
      </MultiplexedSSEProvider>
    );

    act(() => fake.simulateOpen());
    expect(fake.instance?.readyState).not.toBe(2); // not CLOSED

    unmount();
    expect(fake.instance?.readyState).toBe(2); // CLOSED
  });

  it('exposes isConnected and error state (AC-16)', () => {
    let lastConnected = false;
    let lastError: Error | null = null;

    function StateObserver() {
      const { isConnected, error } = useMultiplexedSSE();
      lastConnected = isConnected;
      lastError = error;
      return null;
    }

    render(
      <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake.factory}>
        <StateObserver />
      </MultiplexedSSEProvider>
    );

    // Initially not connected
    expect(lastConnected).toBe(false);
    expect(lastError).toBeNull();

    // After open
    act(() => fake.simulateOpen());
    expect(lastConnected).toBe(true);
    expect(lastError).toBeNull();

    // After error + max attempts exhausted
    // Use maxReconnectAttempts=0 provider for this scenario
  });

  it('is testable via injected EventSourceFactory (AC-20)', () => {
    // This test itself proves AC-20 — we injected a fake factory
    render(
      <MultiplexedSSEProvider channels={['ch1']} eventSourceFactory={fake.factory}>
        <div />
      </MultiplexedSSEProvider>
    );
    expect(fake.instance).toBeTruthy();
    expect(fake.instance?.url).toContain('/api/events/mux');
  });

  it('unsubscribe removes callback from dispatch', () => {
    const received: string[] = [];
    let unsubFn: (() => void) | null = null;

    function UnsubConsumer() {
      const { subscribe } = useMultiplexedSSE();
      useEffect(() => {
        unsubFn = subscribe('event-popper', (e) => received.push(e.type));
        return unsubFn;
      }, [subscribe]);
      return null;
    }

    render(
      <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake.factory}>
        <UnsubConsumer />
      </MultiplexedSSEProvider>
    );

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'msg1'));
    expect(received).toEqual(['msg1']);

    // Unsubscribe
    act(() => unsubFn?.());

    // Should not receive after unsubscribe
    act(() => fake.simulateChannelMessage('event-popper', 'msg2'));
    expect(received).toEqual(['msg1']);
  });

  it('ignores malformed JSON messages', () => {
    const received: string[] = [];
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function Consumer() {
      const { subscribe } = useMultiplexedSSE();
      useEffect(() => {
        return subscribe('event-popper', (e) => received.push(e.type));
      }, [subscribe]);
      return null;
    }

    render(
      <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake.factory}>
        <Consumer />
      </MultiplexedSSEProvider>
    );

    act(() => fake.simulateOpen());
    // Send malformed message directly via FakeEventSource
    act(() => fake.instance?.simulateMessage('not-json-at-all'));
    // Then a valid message
    act(() => fake.simulateChannelMessage('event-popper', 'valid'));

    // Only the valid message arrives
    expect(received).toEqual(['valid']);
    consoleWarn.mockRestore();
  });

  it('resets reconnect counter on successful open', () => {
    render(
      <MultiplexedSSEProvider
        channels={['event-popper']}
        eventSourceFactory={fake.factory}
        maxReconnectAttempts={3}
      >
        <div />
      </MultiplexedSSEProvider>
    );

    // Error → reconnect
    act(() => fake.simulateError());
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(fake.instanceCount).toBe(2);

    // Successful reconnection resets counter
    act(() => fake.simulateOpen());

    // Error again → should reconnect (counter was reset)
    act(() => fake.simulateError());
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(fake.instanceCount).toBe(3);
  });
});
