/**
 * Plan 084 T007 — one-shot resync state machine.
 *
 * Drives the `{type:'resync'}` send on each WebSocket lifecycle.
 *
 * - Status leaves 'connected' → re-arm (the next 'connected' will fire).
 * - Status becomes 'connected' AND ref is not yet armed → send and mark.
 *
 * Mitigates the tmux smallest-client geometry clamp (PL-03 / KF-04): when
 * a newly-attached client joins a session that previously had a smaller
 * client attached, tmux keeps the old window dimensions until something
 * forces a refresh. The resync message asks the server to call
 * `tmux refresh-client` for the current dimensions.
 *
 * Pure function — no React hooks, no side effects beyond `send(...)` and
 * `ref.current` mutation. Trivially testable.
 */

export interface ResyncStateRef {
  current: boolean;
}

/**
 * Accepts a `string` status (as delivered by the WebSocket protocol) rather
 * than the narrow `ConnectionStatus` union — matches the onStatus signature
 * in `useTerminalSocket`. Treats any value other than `'connected'` as
 * "leave connected" and re-arms the ref.
 */
export function applyResyncOnStatus(
  status: string,
  ref: ResyncStateRef,
  send: (msg: string) => void,
): void {
  if (status !== 'connected') {
    ref.current = false;
    return;
  }
  if (!ref.current) {
    ref.current = true;
    send(JSON.stringify({ type: 'resync' }));
  }
}
