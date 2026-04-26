/**
 * URL normalizer for harness CLI commands.
 *
 * Provides consistent URL construction from various input formats:
 *   1. Full URL (http...) → pass through
 *   2. Workspace-prefixed path (/workspaces/...) → prepend base
 *   3. Absolute path (/) → prepend base
 *   4. Bare path (browser?file=x.md) → prepend /workspaces/<slug>/
 *   5. Inject worktree query param if absent
 *
 * Also provides workspace auto-detection via HARNESS_WORKSPACE env
 * or fallback to the default harness test workspace.
 *
 * Plan 076 FX004-1 / Workshop 014 §URL Normalization.
 */

const DEFAULT_WORKSPACE = 'harness-test-workspace';
const DEFAULT_WORKTREE_PREFIX = '/app/scratch/';

export interface NormalizeUrlOptions {
  /** Workspace slug. Auto-detected if not provided. */
  workspace?: string;
  /** Worktree path inside the container. */
  worktree?: string;
  /** App port (default: 3000). */
  port?: number;
  /** App host (default: 127.0.0.1). */
  host?: string;
}

/**
 * Resolve the workspace slug from options, env, or fallback.
 */
export function resolveWorkspace(workspace?: string): string {
  if (workspace) return workspace;
  if (process.env.HARNESS_WORKSPACE) return process.env.HARNESS_WORKSPACE;
  return DEFAULT_WORKSPACE;
}

/**
 * Normalize a route path into a fully-qualified URL.
 *
 * Rules (applied in order):
 *   1. Starts with `http` → use as-is
 *   2. Starts with `/workspaces/` → prepend base URL
 *   3. Starts with `/` → prepend base URL
 *   4. Bare path → prepend `/workspaces/<slug>/`
 *   5. If `worktree` option set and `worktree` query param absent → inject it
 */
export function normalizeUrl(path: string, options: NormalizeUrlOptions = {}): string {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3000;
  const baseUrl = `http://${host}:${port}`;

  let url: string;

  // Rule 1: Full URL — pass through
  if (path.startsWith('http://') || path.startsWith('https://')) {
    url = path;
  }
  // Rule 2: Workspace-prefixed path
  else if (path.startsWith('/workspaces/')) {
    url = `${baseUrl}${path}`;
  }
  // Rule 3: Absolute path
  else if (path.startsWith('/')) {
    url = `${baseUrl}${path}`;
  }
  // Rule 4: Bare path — prepend workspace
  else {
    const workspace = resolveWorkspace(options.workspace);
    url = `${baseUrl}/workspaces/${workspace}/${path}`;
  }

  // Rule 5: Inject worktree if absent
  const worktree = options.worktree;
  if (worktree && !url.includes('worktree=')) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}worktree=${encodeURIComponent(worktree)}`;
  }

  return url;
}

/**
 * Resolve default worktree path from workspace slug.
 */
export function defaultWorktree(workspace: string): string {
  return `${DEFAULT_WORKTREE_PREFIX}${workspace}`;
}
