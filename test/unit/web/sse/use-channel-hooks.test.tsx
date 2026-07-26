/**
 * useChannelEvents + useChannelCallback — Contract Tests
 *
 * Test Doc:
 * - Why: Consumer hooks for multiplexed SSE. Must accumulate (events)
 *   or fire-and-forget (callback) per channel, ignoring other channels.
 * - Contract: AC-17, AC-18, AC-19
 * - Usage Notes: Tests render hooks inside MultiplexedSSEProvider with
 *   FakeMultiplexedSSE. Each test verifies channel isolation + core behavior.
 * - Quality Contribution: Verifies independent arrays (Finding 06),
 *   maxMessages pruning, stable ref pattern, channel filtering.
 * - Worked Example: See each test for a complete scenario.
 *
 * Plan 072: SSE Multiplexing — Phase 2, T004 + T005
 */

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplexedSSEProvider } from '../../../../apps/web/src/lib/sse/multiplexed-sse-provider';
import { useChannelCallback } from '../../../../apps/web/src/lib/sse/use-channel-callback';
import { useChannelEvents } from '../../../../apps/web/src/lib/sse/use-channel-events';
import { createFakeMultiplexedSSEFactory } from '../../../../test/fakes';

describe('useChannelEvents', () => {
  let fake: ReturnType<typeof createFakeMultiplexedSSEFactory>;

  beforeEach(() => {
    fake = createFakeMultiplexedSSEFactory();
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

  it('accumulates messages for subscribed channel (AC-17)', () => {
    const { result } = renderHook(() => useChannelEvents('event-popper'), { wrapper });

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'question-asked', { id: 'q1' }));
    act(() => fake.simulateChannelMessage('event-popper', 'question-answered', { id: 'q1' }));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].type).toBe('question-asked');
    expect(result.current.messages[1].type).toBe('question-answered');
  });

  it('ignores events from other channels (AC-19)', () => {
    const { result } = renderHook(() => useChannelEvents('event-popper'), { wrapper });

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('file-changes', 'file-changed', { path: 'a.txt' }));
    act(() => fake.simulateChannelMessage('event-popper', 'question-asked', { id: 'q1' }));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].type).toBe('question-asked');
  });

  it('respects maxMessages pruning', () => {
    const { result } = renderHook(() => useChannelEvents('event-popper', { maxMessages: 2 }), {
      wrapper,
    });

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'msg1'));
    act(() => fake.simulateChannelMessage('event-popper', 'msg2'));
    act(() => fake.simulateChannelMessage('event-popper', 'msg3'));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].type).toBe('msg2');
    expect(result.current.messages[1].type).toBe('msg3');
  });

  it('does not prune when maxMessages is 0 (unlimited)', () => {
    const { result } = renderHook(() => useChannelEvents('event-popper', { maxMessages: 0 }), {
      wrapper,
    });

    act(() => fake.simulateOpen());
    for (let i = 0; i < 10; i++) {
      act(() => fake.simulateChannelMessage('event-popper', `msg${i}`));
    }

    expect(result.current.messages).toHaveLength(10);
  });

  it('counts every message received, including the ones pruning has since dropped', () => {
    /*
    Test Doc:
    - Why: pruning happens INSIDE this hook's state updater, so from the outside "5 arrived and 3 were
      trimmed" and "2 arrived" are the same observation — an array of length 2. A consumer holding an
      index cursor into that array is therefore permanently wrong once the cap is reached, with no way
      to detect it. `receivedCount` is the missing half: an absolute total that survives trimming, so a
      cursor can be expressed as "how many have I applied" rather than "how far into the array am I".
    - Contract: Plan 089 Phase 3 T002 (the retention-cursor fix); additive to AC-17.
    - Usage Notes: monotonic per subscriber, from mount. It counts arrivals, never survivors.
    - Quality Contribution: makes the trimming observable, which is what makes a durable cursor
      possible for any consumer, not only pij.
    - Worked Example: maxMessages 2, five events → messages.length 2, receivedCount 5.
    */
    const { result } = renderHook(() => useChannelEvents('event-popper', { maxMessages: 2 }), {
      wrapper,
    });

    act(() => fake.simulateOpen());
    for (let i = 1; i <= 5; i++) {
      act(() => fake.simulateChannelMessage('event-popper', `msg${i}`));
    }

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.receivedCount).toBe(5);
  });

  it('counts only the subscribed channel, and starts at zero', () => {
    const { result } = renderHook(() => useChannelEvents('event-popper'), { wrapper });

    expect(result.current.receivedCount).toBe(0);
    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('file-changes', 'file-changed', { path: 'a.txt' }));

    expect(result.current.receivedCount).toBe(0);
  });

  it('keeps the count monotonic across clearMessages — it counts arrivals, not survivors', () => {
    /*
    Test Doc:
    - Why: a counter that rewound on `clearMessages()` would be a second length, not a cursor basis. A
      consumer that clears deliberately wants everything before the clear to be behind it, and a
      monotonic count expresses exactly that ("applied = received") without a special case.
    - Contract: Plan 089 Phase 3 T002.
    - Usage Notes: the array empties; the count does not.
    - Quality Contribution: pins the one interaction between the two return values that could surprise.
    - Worked Example: 2 events, clear, 1 event → messages.length 1, receivedCount 3.
    */
    const { result } = renderHook(() => useChannelEvents('event-popper'), { wrapper });

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'msg1'));
    act(() => fake.simulateChannelMessage('event-popper', 'msg2'));
    act(() => result.current.clearMessages());
    act(() => fake.simulateChannelMessage('event-popper', 'msg3'));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.receivedCount).toBe(3);
  });

  it('clearMessages resets to empty', () => {
    const { result } = renderHook(() => useChannelEvents('event-popper'), { wrapper });

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'msg1'));
    expect(result.current.messages).toHaveLength(1);

    act(() => result.current.clearMessages());
    expect(result.current.messages).toHaveLength(0);
  });

  it('provides independent arrays per subscriber (Finding 06)', () => {
    const { result: result1 } = renderHook(() => useChannelEvents('event-popper'), { wrapper });

    // Create second wrapper with its own provider for isolation
    const fake2 = createFakeMultiplexedSSEFactory();
    function wrapper2({ children }: { children: ReactNode }) {
      return (
        <MultiplexedSSEProvider channels={['event-popper']} eventSourceFactory={fake2.factory}>
          {children}
        </MultiplexedSSEProvider>
      );
    }
    const { result: result2 } = renderHook(() => useChannelEvents('event-popper'), {
      wrapper: wrapper2,
    });

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'only-for-sub1'));

    // Sub1 has message, sub2 doesn't (different providers = independent)
    expect(result1.current.messages).toHaveLength(1);
    expect(result2.current.messages).toHaveLength(0);

    // Also verify arrays are distinct references
    expect(result1.current.messages).not.toBe(result2.current.messages);
  });

  it('exposes isConnected from provider', () => {
    const { result } = renderHook(() => useChannelEvents('event-popper'), { wrapper });

    expect(result.current.isConnected).toBe(false);
    act(() => fake.simulateOpen());
    expect(result.current.isConnected).toBe(true);
  });
});

describe('useChannelCallback', () => {
  let fake: ReturnType<typeof createFakeMultiplexedSSEFactory>;

  beforeEach(() => {
    fake = createFakeMultiplexedSSEFactory();
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

  it('fires callback per event (AC-18)', () => {
    const received: string[] = [];

    renderHook(
      () => useChannelCallback('event-popper', (event) => received.push(event.type ?? '')),
      {
        wrapper,
      }
    );

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'question-asked'));
    act(() => fake.simulateChannelMessage('event-popper', 'question-answered'));

    expect(received).toEqual(['question-asked', 'question-answered']);
  });

  it('ignores events from other channels (AC-19)', () => {
    const received: string[] = [];

    renderHook(
      () => useChannelCallback('event-popper', (event) => received.push(event.type ?? '')),
      {
        wrapper,
      }
    );

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('file-changes', 'file-changed'));
    act(() => fake.simulateChannelMessage('event-popper', 'question-asked'));

    expect(received).toEqual(['question-asked']);
  });

  it('uses stable ref pattern — no re-subscribe on callback change', () => {
    const received: string[] = [];
    let callbackVersion = 1;

    const { rerender } = renderHook(
      () =>
        useChannelCallback('event-popper', (event) =>
          received.push(`v${callbackVersion}:${event.type}`)
        ),
      { wrapper }
    );

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('event-popper', 'msg1'));
    expect(received).toEqual(['v1:msg1']);

    // Change callback version and rerender
    callbackVersion = 2;
    rerender();

    // New callback should fire with updated closure
    act(() => fake.simulateChannelMessage('event-popper', 'msg2'));
    expect(received).toEqual(['v1:msg1', 'v2:msg2']);
  });

  it('exposes isConnected from provider', () => {
    const { result } = renderHook(() => useChannelCallback('event-popper', () => {}), { wrapper });

    expect(result.current.isConnected).toBe(false);
    act(() => fake.simulateOpen());
    expect(result.current.isConnected).toBe(true);
  });
});
