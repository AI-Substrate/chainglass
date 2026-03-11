'use client';

/**
 * MultiplexedSSEProvider — Single-connection SSE multiplexer
 *
 * Creates exactly ONE EventSource to `/api/events/mux?channels=...` and
 * demultiplexes incoming events by `msg.channel` to per-channel subscribers.
 * Provides subscribe/unsubscribe via React context.
 *
 * Plan 072: SSE Multiplexing — Phase 2
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  EventSourceFactory,
  MultiplexedSSEContextValue,
  MultiplexedSSEMessage,
} from './types';

// Default factory using browser's native EventSource
const defaultEventSourceFactory: EventSourceFactory = (url, options) =>
  new EventSource(url, options);

const MultiplexedSSEContext = createContext<MultiplexedSSEContextValue | null>(null);

/**
 * Hook to access the multiplexed SSE context.
 * Must be called within a MultiplexedSSEProvider.
 */
export function useMultiplexedSSE(): MultiplexedSSEContextValue {
  const ctx = useContext(MultiplexedSSEContext);
  if (!ctx) {
    throw new Error('useMultiplexedSSE must be used within a MultiplexedSSEProvider');
  }
  return ctx;
}

interface MultiplexedSSEProviderProps {
  /** Channels to subscribe to */
  channels: string[];
  /** Override EventSource constructor for testing */
  eventSourceFactory?: EventSourceFactory;
  /** Maximum reconnection attempts before giving up (default: 15) */
  maxReconnectAttempts?: number;
  children: React.ReactNode;
}

export function MultiplexedSSEProvider({
  channels,
  eventSourceFactory = defaultEventSourceFactory,
  maxReconnectAttempts = 15,
  children,
}: MultiplexedSSEProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Subscriber registry: channel → Set<callback>
  const subscribersRef = useRef(new Map<string, Set<(e: MultiplexedSSEMessage) => void>>());

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Memoize URL by content (DYK #4: RSC boundary creates new array refs)
  const channelsKey = channels.join(',');
  const url = useMemo(() => `/api/events/mux?channels=${channelsKey}`, [channelsKey]);

  const connect = useCallback(() => {
    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = eventSourceFactory(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    es.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const msg: MultiplexedSSEMessage = JSON.parse(event.data);
        const channelSubs = subscribersRef.current.get(msg.channel ?? '');
        if (channelSubs) {
          // Snapshot subscribers before dispatch to avoid iterator invalidation
          // if a callback triggers synchronous unmount → unsubscribe (PL-01, DYK #1)
          const callbacks = Array.from(channelSubs);
          for (const cb of callbacks) {
            try {
              cb(msg);
            } catch (err) {
              console.warn('[MultiplexedSSE] Subscriber error:', err);
            }
          }
        }
      } catch {
        // Malformed JSON — silently ignore (heartbeat comments don't reach onmessage)
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      es.close();

      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        // True exponential backoff with jitter (DYK #3)
        // Prevents thundering herd when multiple tabs reconnect simultaneously
        const base = Math.min(2000 * 2 ** (reconnectAttemptsRef.current - 1), 15000);
        const jitter = Math.random() * 1000;
        const delay = base + jitter;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, delay);
      } else {
        setError(new Error('SSE connection failed after max reconnect attempts'));
      }
    };
  }, [url, eventSourceFactory, maxReconnectAttempts]);

  // Subscribe function — stable reference (empty deps)
  const subscribe = useCallback(
    (channel: string, callback: (e: MultiplexedSSEMessage) => void): (() => void) => {
      let subs = subscribersRef.current.get(channel);
      if (!subs) {
        subs = new Set();
        subscribersRef.current.set(channel, subs);
      }
      subs.add(callback);

      // Return unsubscribe function
      return () => {
        subs?.delete(callback);
        // Clean up empty Sets to prevent memory leak
        if (subs?.size === 0) {
          subscribersRef.current.delete(channel);
        }
      };
    },
    []
  );

  // Connect on mount, clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  const value = useMemo(() => ({ subscribe, isConnected, error }), [subscribe, isConnected, error]);

  return <MultiplexedSSEContext.Provider value={value}>{children}</MultiplexedSSEContext.Provider>;
}
