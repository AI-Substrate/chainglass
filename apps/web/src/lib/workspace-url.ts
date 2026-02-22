/**
 * Workspace URL Kit — helpers for building workspace-scoped URLs.
 *
 * Domain: _platform/workspace-url
 * Plan: 041-file-browser Phase 2
 *
 * @example
 * workspaceHref('my-proj', '/browser', { worktree: '/path', file: 'README.md' })
 * → '/workspaces/my-proj/browser?worktree=%2Fpath&file=README.md'
 */

/**
 * Build a workspace-scoped URL with optional search params.
 *
 * Uses a flat options object (DYK-P2-03) — worktree is just another key,
 * sorted first in the output URL for readability. Omits params whose value
 * is empty string, false, undefined, or null.
 */
export function workspaceHref(
  slug: string,
  subPath: string,
  options?: Record<string, string | boolean | number | undefined | null>
): string {
  const base = `/workspaces/${encodeURIComponent(slug)}${subPath}`;

  if (!options) return base;

  const params = new URLSearchParams();

  // Worktree first for URL readability
  if (options.worktree !== undefined && options.worktree !== '' && options.worktree !== false) {
    params.set('worktree', String(options.worktree));
  }

  for (const [key, value] of Object.entries(options)) {
    if (key === 'worktree') continue;
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
