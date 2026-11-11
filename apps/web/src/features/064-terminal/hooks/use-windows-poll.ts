'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { TerminalWindow } from '../types';

/** How often the window strip asks the sidecar for the session's windows. */
export const WINDOWS_POLL_MS = 2_000;

/**
 * Poll the sidecar for the terminal session's window list while `enabled`: at once, then every
 * {@link WINDOWS_POLL_MS}. Single-flight: no request goes out while the previous one is
 * unanswered, so a slow tmux never piles requests up behind itself. A hidden browser tab sends
 * none and asks again the moment it is shown.
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
  const pendingRef = useRef(false);

  useEffect(() => {
    onWindowsChange?.([]);
    pendingRef.current = false;
    if (!enabled) return;
    const refresh = () => {
      if (pendingRef.current || document.visibilityState === 'hidden') return;
      pendingRef.current = true;
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
    pendingRef.current = false;
  }, []);
}
