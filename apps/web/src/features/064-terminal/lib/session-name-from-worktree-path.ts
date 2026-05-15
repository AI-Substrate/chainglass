/**
 * Derive the canonical tmux session name from a workspace/worktree path.
 *
 * The chainglass WS sidecar creates tmux sessions with
 * `tmux new-session -A -s <basename>` where `<basename>` is the worktree
 * folder's basename — see
 * `apps/web/src/features/064-terminal/server/tmux-session-manager.ts`.
 * This helper is the inverse derivation: given the path, return the name
 * a session would have been created under.
 *
 * Returns `''` for empty input or paths whose basename resolves to empty
 * (e.g. trailing-slash paths — `/foo/'.split('/').pop()` is `''`). Callers
 * that need null-vs-empty distinction should append `|| null` at the call
 * site (see `useTerminalOverlay`).
 *
 * Plan FX006: introduced as the shared derivation helper consumed by
 * `useTerminalSessions` (auto-pick) and `useTerminalOverlay`
 * (toggle-from-URL). Eliminates the duplication that allowed FX005's
 * branch-match auto-pick to ship while the overlay's correct
 * worktree-folder-match logic was already present in the same domain.
 */

import { sanitizeSessionName } from './sanitize-session-name';

export function sessionNameFromWorktreePath(worktreePath: string | null | undefined): string {
  if (!worktreePath) return '';
  return sanitizeSessionName(worktreePath.split('/').pop() ?? '');
}
