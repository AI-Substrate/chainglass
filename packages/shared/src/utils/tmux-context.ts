import { execSync } from 'node:child_process';

/**
 * Plan 067: Event Popper Infrastructure
 *
 * Shared tmux detection utility. Any CLI command can call these
 * to automatically include tmux context in event metadata.
 *
 * Detects: session name, window index, pane ID.
 * Returns undefined when not running inside tmux.
 */

export interface TmuxContext {
  session: string;
  window: string;
  pane: string | undefined;
}

/**
 * Detect the current tmux session/window/pane context.
 * Returns undefined if not running inside tmux.
 *
 * Safe to call from any CLI command or Node.js process.
 * Uses $TMUX env var for detection and `tmux display-message` for session/window.
 */
export function detectTmuxContext(): TmuxContext | undefined {
  if (!process.env.TMUX) {
    return undefined;
  }

  try {
    return {
      session: execSync('tmux display-message -p "#S"', {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim(),
      window: execSync('tmux display-message -p "#I"', {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim(),
      pane: process.env.TMUX_PANE ?? undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Wrap tmux context into the meta bag shape expected by EventPopperRequest.
 * Returns undefined if not in tmux (safe to spread into meta).
 *
 * @example
 * const meta = { ...getTmuxMeta() };
 */
export function getTmuxMeta(): { tmux: TmuxContext } | undefined {
  const ctx = detectTmuxContext();
  return ctx ? { tmux: ctx } : undefined;
}
