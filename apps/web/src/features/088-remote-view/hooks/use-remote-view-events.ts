'use client';

/**
 * useRemoteViewEvents — the client push half of the remote-view SSE surface (T006, AC-8).
 *
 * Subscribes the `remote-view` SSE channel (domain value IS the channel id — no
 * mapping table) and turns an `attached` envelope into a single `onAttached(rv)`
 * call. browser-client wires that to `setParams({ view: 'remote', rv })`, so when an
 * AGENT attaches a window (via CLI / MCP / SDK) an already-open browser is pushed
 * onto the live session. A user-initiated attach is idempotent — that client is
 * already on `view=remote` with the same `rv`, so the echo is a no-op.
 *
 * `detached` / `daemon-state` envelopes are intentionally NOT navigation: they are
 * lifecycle signals other surfaces (GlobalState T007, the viewport) consume. Only
 * `attached` switches the content area.
 *
 * Plan 088 Phase 5 — T006.
 */

import { useChannelEvents } from '@/lib/sse';
import { useEffect } from 'react';

/** A `remote-view` SSE envelope as accumulated by `useChannelEvents`. */
interface RemoteViewSSEMessage {
  /** Event type within the channel — `'attached' | 'detached' | 'daemon-state'`. */
  type?: string;
  /** Session id (present on `attached`/`detached`). */
  sessionId?: string;
  [key: string]: unknown;
}

export interface UseRemoteViewEventsOptions {
  /** Push the content area onto a freshly-attached session (e.g. `(rv) => setParams({view:'remote', rv})`). */
  onAttached: (sessionId: string) => void;
  /** Suppress pushes without unsubscribing (default true). */
  enabled?: boolean;
}

/**
 * Listen for remote-view `attached` events and push the open client onto the
 * session. Drains processed messages each pass (mirrors the workflow SSE hook), so
 * a given attach fires `onAttached` exactly once.
 */
export function useRemoteViewEvents({
  onAttached,
  enabled = true,
}: UseRemoteViewEventsOptions): void {
  const { messages, clearMessages } = useChannelEvents<RemoteViewSSEMessage>('remote-view', {
    maxMessages: 50,
  });

  useEffect(() => {
    if (messages.length === 0) return;
    if (!enabled) {
      clearMessages(); // drop queued events so they don't fire on re-enable
      return;
    }
    for (const m of messages) {
      if (m.type === 'attached' && typeof m.sessionId === 'string') {
        onAttached(m.sessionId);
      }
    }
    clearMessages();
  }, [messages, enabled, onAttached, clearMessages]);
}
