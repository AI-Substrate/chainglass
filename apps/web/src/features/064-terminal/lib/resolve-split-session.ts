/**
 * Resolve which tmux session the inline split pane (FX012 Mode B) should
 * attach to when the user toggles split ON.
 *
 * Background — the singleton's session is `overlay.sessionName`/`cwd` (the
 * provider holds them; `TerminalInner` reconnects whenever `sessionName`
 * changes). So calling `setSessionContext(wrongName)` actively yanks the live
 * terminal onto the wrong session. The job here is to compute the *right*
 * name/cwd so split preserves what the user is looking at.
 *
 * FX013 (first attempt) preferred `overlay.sessionName` only when the float
 * was OPEN, else fell back to `termSelectedSession` — which auto-picks the
 * FIRST session when no worktree match exists. That reintroduced the original
 * bug whenever the float had been opened-then-closed (overlay state and the
 * parked xterm both persist, but `isOpen` is false), so split reconnected to
 * the first session.
 *
 * FX015 fix — two cases, and `termSelectedSession` is no longer consulted:
 *
 *  1. Preserve the singleton's current session when EITHER the float is open
 *     (the user is looking at it) OR that session belongs to THIS worktree
 *     (the float was opened here earlier and since closed). "Belongs to this
 *     worktree" is decided by deriving the canonical session name from
 *     `overlay.cwd` and matching it to the one derived from `worktreePath` —
 *     robust to path-format differences (trailing slash, etc.).
 *
 *  2. Otherwise (cold start, or the overlay still points at the provider's
 *     workspace-default — often the main repo, a DIFFERENT cwd) attach to this
 *     worktree's canonical session — identical to how the floating overlay
 *     opens (`toggleTerminal` → `sessionNameFromWorktreePath`). The sidecar
 *     creates it on first connect if it doesn't exist yet. We never inherit a
 *     cross-worktree default or an auto-picked "first" session.
 */

import { sessionNameFromWorktreePath } from './session-name-from-worktree-path';

export interface SplitSessionOverlayState {
  /** Whether the floating overlay is currently open (the user is looking at it). */
  isOpen: boolean;
  /** The session the singleton is currently on (persists after the float closes). */
  sessionName: string | null;
  /** The cwd that session is rooted in (persists after the float closes). */
  cwd: string | null;
}

export interface SplitSessionResult {
  sessionName: string;
  cwd: string;
}

/**
 * @param overlay       live overlay state from `useTerminalOverlay()`
 * @param worktreePath  absolute path of the worktree being split in (the
 *                      `?worktree=` the browser page is showing)
 */
export function resolveSplitSession(
  overlay: SplitSessionOverlayState,
  worktreePath: string
): SplitSessionResult {
  const worktreeName = sessionNameFromWorktreePath(worktreePath);

  // Does the singleton's current session belong to THIS worktree? Compare by
  // derived canonical name so path-format differences don't cause a mismatch.
  const overlayOnThisWorktree =
    overlay.cwd != null &&
    worktreeName !== '' &&
    sessionNameFromWorktreePath(overlay.cwd) === worktreeName;

  // Case 1 — preserve the live session the user is viewing / owns here.
  if (overlay.sessionName && (overlay.isOpen || overlayOnThisWorktree)) {
    return { sessionName: overlay.sessionName, cwd: overlay.cwd ?? worktreePath };
  }

  // Case 2 — this worktree's canonical session (matches toggleTerminal). Last
  // resort if the path yields no name: keep whatever the overlay had.
  return {
    sessionName: worktreeName || overlay.sessionName || '',
    cwd: worktreePath,
  };
}
