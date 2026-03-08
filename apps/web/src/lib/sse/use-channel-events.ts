/**
 * useChannelEvents — Message accumulation hook for multiplexed SSE
 *
 * Subscribes to a specific channel from the MultiplexedSSEProvider and
 * accumulates messages into an independent array. Each hook invocation
 * gets its own array (not shared) — compatible with index cursor patterns.
 *
 * Plan 072: SSE Multiplexing — Phase 2, T004
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
  /** Whether the SSE connection is currently open */
  isConnected: boolean;
  /** Clear all accumulated messages */
  clearMessages: () => void;
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
  const [messages, setMessages] = useState<T[]>([]);
  const maxMessages = options?.maxMessages ?? 1000;

  useEffect(() => {
    const unsubscribe = subscribe(channel, (event) => {
      setMessages((prev) => {
        const next = [...prev, event as T];
        if (maxMessages > 0 && next.length > maxMessages) {
          return next.slice(-maxMessages);
        }
        return next;
      });
    });
    return unsubscribe;
  }, [channel, subscribe, maxMessages]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isConnected, clearMessages };
}
