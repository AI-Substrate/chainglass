/**
 * Sanitize a raw string (typically a folder/branch name) into a valid tmux session name.
 *
 * tmux uses dots (.) as pane separators and colons (:) as window separators in target
 * syntax (e.g., session:window.pane). Characters outside [a-zA-Z0-9_-] are replaced
 * with hyphens, then collapsed and trimmed to avoid ugly names like "--foo--".
 *
 * Plan 064: Terminal Integration via tmux
 */

export function sanitizeSessionName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}
