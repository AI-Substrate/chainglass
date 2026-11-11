'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { TerminalWindow } from '../types';

/** How often the window strip asks the sidecar for the session's windows. */
export const WINDOWS_POLL_MS = 2_000;
/**
 * A request still unanswered after this is treated as lost and asked again. The sidecar answers
 * every `windows` frame it receives (its tmux calls time out at 3 s), but a frame sent while the
 * socket was closing, or before the sidecar listened, is dropped without a reply.
 */
export const WINDOWS_REPLY_TIMEOUT_MS = 10_000;

/**
 * Poll the sidecar for the terminal session's window list while `enabled`: at once, then every
 * {@link WINDOWS_POLL_MS}. Single-flight: no request goes out while the previous one is
 * unanswered (up to {@link WINDOWS_REPLY_TIMEOUT_MS}), so a slow tmux never piles requests up
 * behind itself. A hidden browser tab sends none and asks again the moment it is shown.
 *
 * Each start or stop (a new session, a reconnect, the terminal hidden) first blanks the strip
 * through `onWindowsChange([])` and forgets an answer the old socket never delivered. Returns the
 * callback to run when a `windows` reply arrives.
 */
export function useWindowsPoll(
  enabled: boolean,
  send: (data: string) => void,
  onWindowsChange?: (windows: TerminalWindow[]) => void
): () => void {
  /** When the unanswered request went out, or null when none is outstanding. */
  const pendingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    onWindowsChange?.([]);
    pendingSinceRef.current = null;
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      const since = pendingSinceRef.current;
      if (since !== null && Date.now() - since < WINDOWS_REPLY_TIMEOUT_MS) return;
      pendingSinceRef.current = Date.now();
      send(JSON.stringify({ type: 'windows' }));
    };
    refresh();
    const timer = setInterval(refresh, WINDOWS_POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, send, onWindowsChange]);

  return useCallback(() => {
    pendingSinceRef.current = null;
  }, []);
}
