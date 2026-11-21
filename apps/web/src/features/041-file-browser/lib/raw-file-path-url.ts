/**
 * Path-style raw-file URLs: `/api/workspaces/<slug>/files/raw/<worktree-key>/<file path>`.
 *
 * The query-style form (`files/raw?worktree=…&file=…`) cannot serve a multi-file HTML page:
 * a relative reference like `data.js` resolves against `/files/`, not the page's folder. With
 * the path in the URL, the browser resolves siblings (and `../` within the worktree) itself.
 *
 * The worktree key is the worktree's absolute path, UTF-8, base64url-encoded into one segment.
 * Isomorphic (browser + Node 20): uses TextEncoder/btoa/atob only.
 */

export function encodeWorktreeKey(worktree: string): string {
  const bytes = new TextEncoder().encode(worktree);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns null when the key is not valid base64url. */
export function decodeWorktreeKey(key: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return null;
  try {
    const padded = key.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function rawFilePathUrl(slug: string, worktree: string, filePath: string): string {
  const encodedPath = filePath
    .split('/')
    .filter((part) => part.length > 0)
    .map(encodeURIComponent)
    .join('/');
  return `/api/workspaces/${encodeURIComponent(slug)}/files/raw/${encodeWorktreeKey(worktree)}/${encodedPath}`;
}

/**
 * Path-style URL for a query-style raw-file URL, or null when it lacks worktree/file.
 * Keeps any other query params except the asset token (`_at`), which only the query-style
 * route honours.
 */
export function toRawFilePathUrl(queryStyleUrl: string, origin: string): string | null {
  try {
    const url = new URL(queryStyleUrl, origin);
    const match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/files\/raw$/);
    const worktree = url.searchParams.get('worktree');
    const file = url.searchParams.get('file');
    if (!match || !worktree || !file) return null;
    const rest = new URLSearchParams(url.searchParams);
    for (const key of ['worktree', 'file', '_at']) rest.delete(key);
    const query = rest.toString();
    return `${rawFilePathUrl(decodeURIComponent(match[1]), worktree, file)}${query ? `?${query}` : ''}`;
  } catch {
    return null;
  }
}
