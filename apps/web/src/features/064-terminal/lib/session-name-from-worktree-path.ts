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
 * Folders named `main` or `master` are prefixed with their parent folder (see
 * {@link SHARED_FOLDER_NAMES}).
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

/**
 * Worktree folder names many projects share. A bare `main` session would be one tmux session for
 * every project with a `<project>/main` worktree, so a second project silently attached to the
 * first one's agents (unimatrix/main showed unasphere/main's, 2026-11-09). These folders are
 * named after their parent instead: `/x/unasphere/main` → `unasphere-main`.
 */
const SHARED_FOLDER_NAMES = new Set(['main', 'master']);

export function sessionNameFromWorktreePath(worktreePath: string | null | undefined): string {
  if (!worktreePath) return '';
  const segments = worktreePath.split('/');
  const folder = segments.pop() ?? '';
  const parent = segments.pop();
  if (SHARED_FOLDER_NAMES.has(folder) && parent) {
    return sanitizeSessionName(`${parent}-${folder}`);
  }
  return sanitizeSessionName(folder);
}
