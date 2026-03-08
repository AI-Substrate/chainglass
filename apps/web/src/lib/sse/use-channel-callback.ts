/**
 * useChannelCallback — Fire-and-forget callback hook for multiplexed SSE
 *
 * Subscribes to a specific channel and fires a callback for each event.
 * No message accumulation — ideal for notification-fetch patterns where
 * the callback triggers a refetch or side effect.
 *
 * Uses stable ref pattern: the callback can change between renders without
 * triggering re-subscription.
 *
 * Plan 072: SSE Multiplexing — Phase 2, T005
 */

'use client';

import { useEffect, useRef } from 'react';
import { useMultiplexedSSE } from './multiplexed-sse-provider';
import type { MultiplexedSSEMessage } from './types';

export interface UseChannelCallbackReturn {
  /** Whether the SSE connection is currently open */
  isConnected: boolean;
}

/**
 * Subscribe to events on a channel with a callback.
 * Fires callback for each event — no message accumulation.
 *
 * The callback reference is tracked via useRef, so changing the callback
 * between renders does NOT cause re-subscription.
 *
 * @param channel — SSE channel name (e.g. 'event-popper', 'file-changes')
 * @param callback — fired for each event on the channel
 */
export function useChannelCallback(
  channel: string,
  callback: (event: MultiplexedSSEMessage) => void
): UseChannelCallbackReturn {
  const { subscribe, isConnected } = useMultiplexedSSE();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return subscribe(channel, (event) => callbackRef.current(event));
  }, [channel, subscribe]);

  return { isConnected };
}
