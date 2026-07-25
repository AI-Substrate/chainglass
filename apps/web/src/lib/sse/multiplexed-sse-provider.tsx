'use client';

/**
 * MultiplexedSSEProvider — One SSE connection per BROWSER
 *
 * A single elected leader tab holds the one EventSource to
 * `/api/events/mux?channels=...` and fans every message out to follower tabs over a
 * BroadcastChannel; followers open ZERO sockets. Election uses the Web Locks API —
 * the leader holds the lock for as long as it leads, and the browser releases it on
 * tab close/crash/navigate. That is why there is no heartbeat, no TTL, no
 * stale-leader detection and no polling anywhere in this file.
 *
 * Why per-browser and not per-tab: Chrome allows 6 sockets per origin browser-wide,
 * so one permanently-held SSE per tab exhausts the pool at 6 tabs and every request
 * in every tab queues (measured: 5 tabs → /api/health 200 in 6ms; 6 tabs → blocked).
 *
 * If Web Locks or BroadcastChannel are unavailable (SSR, older browsers), this tab
 * opens its own EventSource — exactly the previous behaviour. Detection is
 * feature-based, never UA-based.
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

/**
 * Minimal structural subset of the Web Locks API this provider depends on.
 * Structural (not `LockManager`) so tests can inject a plain object.
 */
export type SSELockManager = {
  request(
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<unknown>
  ): Promise<unknown>;
};

/** Minimal structural subset of BroadcastChannel used for cross-tab fanout. */
export type SSEBroadcastChannel = {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

/** Creates the cross-tab fanout channel. Injectable for tests. */
export type SSEBroadcastFactory = (name: string) => SSEBroadcastChannel;

/**
 * Provider-internal coordination messages. These are consumed by the provider and
 * must NEVER reach channel subscribers.
 */
type ControlMessage =
  | { __control: 'status'; isConnected: boolean; error: string | null }
  | { __control: 'hello' };

function isControlMessage(value: unknown): value is ControlMessage {
  return typeof value === 'object' && value !== null && '__control' in value;
}

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
  /** Override the Web Locks manager for testing (default: navigator.locks) */
  lockManager?: SSELockManager;
  /** Override the BroadcastChannel constructor for testing */
  broadcastFactory?: SSEBroadcastFactory;
  children: React.ReactNode;
}

export function MultiplexedSSEProvider({
  channels,
  eventSourceFactory = defaultEventSourceFactory,
  maxReconnectAttempts = 15,
  lockManager,
  broadcastFactory,
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

  // Cross-tab coordination state
  const broadcastRef = useRef<SSEBroadcastChannel | null>(null);
  const isLeaderRef = useRef(false);
  // Mirrors the status state so the leader can answer a follower's `hello`
  // without a stale closure.
  const statusRef = useRef<{ isConnected: boolean; error: Error | null }>({
    isConnected: false,
    error: null,
  });

  // Memoize URL by content (DYK #4: RSC boundary creates new array refs)
  const channelsKey = channels.join(',');
  const url = useMemo(() => `/api/events/mux?channels=${channelsKey}`, [channelsKey]);

  // Feature-detect cross-tab coordination. Both APIs are required: with only one of
  // them we cannot elect a leader AND fan out, so we stay on the per-tab path.
  const coordination = useMemo(() => {
    const locks =
      lockManager ??
      (typeof navigator !== 'undefined'
        ? (navigator as Navigator & { locks?: SSELockManager }).locks
        : undefined);
    const makeChannel: SSEBroadcastFactory | undefined =
      broadcastFactory ??
      (typeof BroadcastChannel !== 'undefined'
        ? (name: string) => new BroadcastChannel(name) as unknown as SSEBroadcastChannel
        : undefined);
    return locks && makeChannel ? { locks, makeChannel } : null;
  }, [lockManager, broadcastFactory]);

  /**
   * The single fan-out path to channel subscribers, shared by the leader (from its
   * EventSource) and every follower (from the BroadcastChannel).
   *
   * Snapshots subscribers before dispatch to avoid iterator invalidation if a
   * callback triggers synchronous unmount → unsubscribe (PL-01, DYK #1).
   */
  const dispatch = useCallback((msg: MultiplexedSSEMessage) => {
    // Control messages are provider-internal and never reach subscribers.
    if (isControlMessage(msg)) return;

    const channelSubs = subscribersRef.current.get(msg.channel ?? '');
    if (!channelSubs) return;

    const callbacks = Array.from(channelSubs);
    for (const cb of callbacks) {
      try {
        cb(msg);
      } catch (err) {
        console.warn('[MultiplexedSSE] Subscriber error:', err);
      }
    }
  }, []);

  /** Leader-only: publish current connection status to followers. */
  const broadcastStatus = useCallback(() => {
    if (!isLeaderRef.current) return;
    const { isConnected: connected, error: err } = statusRef.current;
    broadcastRef.current?.postMessage({
      __control: 'status',
      isConnected: connected,
      error: err ? err.message : null,
    } satisfies ControlMessage);
  }, []);

  /** Update local status, and (when leading) tell the followers about it. */
  const applyStatus = useCallback(
    (connected: boolean, err: Error | null, broadcast: boolean) => {
      statusRef.current = { isConnected: connected, error: err };
      setIsConnected(connected);
      setError(err);
      if (broadcast) broadcastStatus();
    },
    [broadcastStatus]
  );

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
      applyStatus(true, null, true);
      reconnectAttemptsRef.current = 0;
    };

    es.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const msg: MultiplexedSSEMessage = JSON.parse(event.data);
        // Leader does both: dispatch locally and fan out to follower tabs.
        dispatch(msg);
        broadcastRef.current?.postMessage(msg);
      } catch {
        // Malformed JSON — silently ignore (heartbeat comments don't reach onmessage)
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      applyStatus(false, statusRef.current.error, true);
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
        applyStatus(false, new Error('SSE connection failed after max reconnect attempts'), true);
      }
    };
  }, [url, eventSourceFactory, maxReconnectAttempts, dispatch, applyStatus]);

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

  const teardownSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
  }, []);

  // Elect a leader on mount, release the lock on unmount.
  useEffect(() => {
    mountedRef.current = true;
    isLeaderRef.current = false;

    // Fallback path — no cross-tab coordination available. This tab opens its own
    // EventSource, exactly as before leader election existed.
    if (!coordination) {
      connect();
      return () => {
        mountedRef.current = false;
        teardownSocket();
      };
    }

    const bc = coordination.makeChannel(`chainglass-sse:${channelsKey}`);
    broadcastRef.current = bc;

    bc.onmessage = (event: { data: unknown }) => {
      if (!mountedRef.current) return;
      const data = event.data;

      if (isControlMessage(data)) {
        if (data.__control === 'status') {
          // Only followers take status from the wire; the leader owns its own.
          if (!isLeaderRef.current) {
            applyStatus(data.isConnected, data.error ? new Error(data.error) : null, false);
          }
        } else if (data.__control === 'hello' && isLeaderRef.current) {
          // A tab just mounted and wants the current status.
          broadcastStatus();
        }
        return;
      }

      // Followers dispatch what the leader fanned out. (BroadcastChannel does not
      // echo to the sender, so the leader never sees its own data messages.)
      if (!isLeaderRef.current) dispatch(data as MultiplexedSSEMessage);
    };

    // Ask whoever is already leading for the current status.
    bc.postMessage({ __control: 'hello' } satisfies ControlMessage);

    const abort = new AbortController();
    // Generation token for THIS effect run. `mountedRef` is shared across runs on the
    // same component instance, so StrictMode's setup #2 sets it back to true — and a
    // grant that lands after run #1's own cleanup would sail past it, take the lock and
    // stash `release` in a closure the live cleanup cannot reach. That is a dead leader
    // the browser can never reclaim, and by design there is no heartbeat or TTL to
    // recover from it. Aborting does not cover this: per the Web Locks spec a signal
    // only removes a request from the queue, and the abort/grant race is inherent.
    let disposed = false;
    // The lock is held until this resolves. Resolving on unmount hands leadership
    // over immediately; if the tab dies instead, the browser releases it for us.
    let release: (() => void) | undefined;

    coordination.locks
      .request(`chainglass-sse-leader:${channelsKey}`, { signal: abort.signal }, () => {
        // Resolving immediately hands a stale grant straight to the next queued tab.
        if (disposed || !mountedRef.current) return Promise.resolve();
        isLeaderRef.current = true;
        try {
          // Promotion: drop any status inherited from the previous leader before
          // this tab's own connection reports in.
          applyStatus(false, null, true);
          connect();
        } catch (err) {
          // We hold the lock but cannot use it. The browser releases the lock when
          // this rejects and promotes another tab — so keeping `isLeaderRef` would
          // leave a PHANTOM leader: no socket, no lock, yet `!isLeaderRef.current`
          // above is false, so it silently drops every status update and every data
          // message for the life of the tab, and answers other tabs' `hello` with a
          // status it has no connection to back. Stand down to a plain follower.
          // The whole body is guarded, not just connect(): `broadcastStatus()` can
          // throw too (postMessage on a closed channel is an InvalidStateError), and
          // it runs after the assignment above — the same phantom, one line earlier.
          isLeaderRef.current = false;
          teardownSocket();
          applyStatus(false, err instanceof Error ? err : new Error(String(err)), false);
          return Promise.reject(err);
        }
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {
        // AbortError when we unmount while still queued for the lock, and the
        // stand-down above, which has already surfaced its error — both expected.
      });

    return () => {
      disposed = true;
      mountedRef.current = false;
      // Drop out of the lock queue if we never led...
      abort.abort();
      // ...or release the lock if we did, so a follower is promoted at once.
      release?.();
      isLeaderRef.current = false;
      teardownSocket();
      bc.onmessage = null;
      bc.close();
      broadcastRef.current = null;
    };
  }, [connect, coordination, channelsKey, dispatch, applyStatus, broadcastStatus, teardownSocket]);

  const value = useMemo(() => ({ subscribe, isConnected, error }), [subscribe, isConnected, error]);

  return <MultiplexedSSEContext.Provider value={value}>{children}</MultiplexedSSEContext.Provider>;
}
