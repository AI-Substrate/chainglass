/**
 * Resolve which tmux session the inline split pane (FX012 Mode B) should
 * attach to when the user toggles split ON.
 *
 * The bug this fixes (FX013): `handleSplitToggleChange` recomputed the inline
 * session from `termSelectedSession ?? sessionNameFromWorktreePath(...)`,
 * ignoring the session the floating overlay was *actually displaying*. When
 * `termSelectedSession` was unset, `useTerminalSessions` auto-pick fell
 * through to `enriched[0]` — the first stable-sorted session — so split
 * attached to the wrong (first) session and the user had to re-pick manually.
 *
 * The fix honours the FX012 principle (the singleton tracks the live overlay
 * state): if the float is **open** and showing a session, that is the session
 * the user is looking at — carry it (with its paired cwd) into split. Only
 * when the float is closed (split toggled from a cold state, never opened) do
 * we fall back to the worktree-derived name — preserving the original
 * worktree-attach behaviour and avoiding the provider's workspace-default
 * session (often the main repo) that `overlay.sessionName` may hold before
 * the float has ever been opened.
 */

export interface SplitSessionOverlayState {
  /** Whether the floating overlay is currently open (the user is looking at it). */
  isOpen: boolean;
  /** The session the overlay is live on, or null. */
  sessionName: string | null;
  /** The cwd the overlay's session is rooted in, or null. */
  cwd: string | null;
}

export interface SplitSessionResult {
  sessionName: string;
  cwd: string;
}

/**
 * @param overlay        live overlay state from `useTerminalOverlay()`
 * @param fallbackName   worktree-derived session name (used when the float is closed)
 * @param fallbackCwd    worktree path (used when the float is closed or its cwd is unset)
 */
export function resolveSplitSession(
  overlay: SplitSessionOverlayState,
  fallbackName: string,
  fallbackCwd: string
): SplitSessionResult {
  // Carry the float's live session only when it's actually open with a
  // session — that's the one the user is viewing. `cwd` is paired with the
  // session; fall back only if it's somehow unset.
  if (overlay.isOpen && overlay.sessionName) {
    return { sessionName: overlay.sessionName, cwd: overlay.cwd || fallbackCwd };
  }
  return { sessionName: fallbackName, cwd: fallbackCwd };
}
