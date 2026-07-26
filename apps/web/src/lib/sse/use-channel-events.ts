/**
 * useChannelEvents — Message accumulation hook for multiplexed SSE
 *
 * Subscribes to a specific channel from the MultiplexedSSEProvider and
 * accumulates messages into an independent array. Each hook invocation
 * gets its own array (not shared) — compatible with index cursor patterns.
 *
 * An index cursor is only safe while nothing is trimmed, though: `maxMessages`
 * SLIDES, so past the cap the array stops growing and an index into it is
 * never behind again. `receivedCount` is the durable alternative — see its doc.
 *
 * Plan 072: SSE Multiplexing — Phase 2, T004
 * Plan 089: first-class pij — Phase 3, T002 (receivedCount, additive)
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMultiplexedSSE } from './multiplexed-sse-provider';
import type { MultiplexedSSEMessage } from './types';

export interface UseChannelEventsOptions {
  /** Maximum messages to retain (default: 1000, 0 = unlimited) */
  maxMessages?: number;
}

export interface UseChannelEventsReturn<T extends MultiplexedSSEMessage = MultiplexedSSEMessage> {
  /** Accumulated messages for the subscribed channel */
  messages: T[];
  /**
   * How many messages this subscriber has received on the channel since mount — **including** those
   * `maxMessages` has since trimmed away, and **not** reset by `clearMessages()`.
   *
   * Pruning happens inside this hook's state updater, so from the outside "five arrived and three
   * were trimmed" and "two arrived" are the same observation: an array of length two. A consumer
   * holding an index into `messages` is therefore permanently wrong once the cap is reached, with no
   * way to detect it. This is the missing half — an absolute total that trimming cannot move — so a
   * cursor can be expressed as "how many have I applied" rather than "how far into the array am I".
   *
   * It counts arrivals, never survivors. `clearMessages()` empties the array and leaves this alone,
   * which is what lets a consumer read the pair as "everything before now is behind me".
   */
  receivedCount: number;
  /** Whether the SSE connection is currently open */
  isConnected: boolean;
  /** Clear all accumulated messages */
  clearMessages: () => void;
}

/** The two values, updated together so a reader can never observe one without the other. */
interface ChannelBuffer<T> {
  messages: T[];
  receivedCount: number;
}

/**
 * Subscribe to events on a specific channel from the multiplexed SSE provider.
 * Returns accumulated messages for that channel.
 *
 * Each hook invocation maintains its own independent message array.
 * This is critical for index cursor patterns (Finding 06 — cursor compatibility).
 *
 * @param channel — SSE channel name (e.g. 'event-popper', 'file-changes')
 * @param options — { maxMessages: number } (default 1000, 0 = unlimited)
 */
export function useChannelEvents<T extends MultiplexedSSEMessage = MultiplexedSSEMessage>(
  channel: string,
  options?: UseChannelEventsOptions
): UseChannelEventsReturn<T> {
  const { subscribe, isConnected } = useMultiplexedSSE();
  const [buffer, setBuffer] = useState<ChannelBuffer<T>>(() => ({
    messages: [],
    receivedCount: 0,
  }));
  const maxMessages = options?.maxMessages ?? 1000;

  useEffect(() => {
    const unsubscribe = subscribe(channel, (event) => {
      setBuffer((prev) => {
        const next = [...prev.messages, event as T];
        return {
          messages: maxMessages > 0 && next.length > maxMessages ? next.slice(-maxMessages) : next,
          // Incremented in the same updater as the trim, because the whole point of the count is to
          // measure what the trim removed. Two separate states could be read a render apart.
          receivedCount: prev.receivedCount + 1,
        };
      });
    });
    return unsubscribe;
  }, [channel, subscribe, maxMessages]);

  const clearMessages = useCallback(
    () => setBuffer((prev) => ({ messages: [], receivedCount: prev.receivedCount })),
    []
  );

  return {
    messages: buffer.messages,
    receivedCount: buffer.receivedCount,
    isConnected,
    clearMessages,
  };
}
