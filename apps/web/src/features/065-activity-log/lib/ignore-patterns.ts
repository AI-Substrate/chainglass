/**
 * Ignore Patterns — tmux pane title noise filtering.
 *
 * Each source owns its own ignore list. The writer does NOT filter.
 * This module provides tmux-specific patterns.
 *
 * DYK-02: Lives in activity-log for now. May move to terminal domain
 * in Phase 2 when sidecar integrates.
 *
 * Plan 065: Worktree Activity Log
 */

import * as os from 'node:os';

/** Patterns to ignore when capturing tmux pane titles */
export const TMUX_PANE_TITLE_IGNORE: RegExp[] = [
  /\.localdomain$/, // e.g. "Mac.localdomain"
  /\.local$/, // e.g. "Jordans-MacBook-Pro.local"
  /^$/, // empty string
  /^-?(ba|z|fi)sh$/, // shell names: bash, zsh, fish, -bash, -zsh, -fish
  /^~?\//, // bare paths like ~/project or /usr/bin
];

const HOSTNAME_VARIANTS = new Set([os.hostname(), os.hostname().split('.')[0]]);

/** Returns true if the pane title should be filtered out (not written to activity log) */
export function shouldIgnorePaneTitle(title: string): boolean {
  if (HOSTNAME_VARIANTS.has(title)) return true;
  return TMUX_PANE_TITLE_IGNORE.some((pattern) => pattern.test(title));
}
