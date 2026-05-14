/**
 * Recent Feed path filtering — shared between the server seed loader
 * (`services/recent-feed-items.ts`) and the client live-merge reducer
 * (`components/recent-feed/hooks/use-recent-feed-state.ts`).
 *
 * Lives in `lib/` (no `'use client'` directive, no React imports) so it can
 * be imported from both server and client modules. Previously co-located in
 * the reducer hook file, which made the server import flow fail under Next's
 * server/client boundary check at runtime.
 */

/**
 * Build-artifact non-dot folders the feed never wants to surface. Dot-files
 * and dot-folders (anything starting with `.`) are filtered separately by
 * `isFilteredPath` — that catches `.next`, `.turbo`, `.cache`, `.git`,
 * `.fs2`, `.chainglass`, `.env*`, etc. without needing an exhaustive list.
 *
 * Keep this list narrow — gitignore-aware filtering (real `.gitignore`
 * parsing) is a future enhancement.
 */
const BUILD_ARTIFACT_PREFIXES: readonly string[] = [
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
];

/** Generated artifacts identified by extension only. Useful for cache files. */
const FILTERED_EXTENSIONS: ReadonlySet<string> = new Set(['pickle', 'pkl', 'pyc', 'pyo']);

/** Matches `.tmp.<ext>` or trailing `.tmp` in a single path segment. */
const TMP_FILE_RE = /\.tmp\.|\.tmp$/i;

/**
 * Returns true when the path should be ignored entirely.
 *
 * Filters:
 *   1. Any segment beginning with `.` — covers `.git`, `.next`, `.turbo`,
 *      `.cache`, `.fs2`, `.chainglass`, `.env`, `.DS_Store`, etc.
 *   2. Build-artifact prefixes (node_modules / dist / build / coverage)
 *      whether at root or nested (`apps/web/node_modules/foo`).
 *   3. Generated cache extensions (.pickle / .pkl / .pyc / .pyo) since the
 *      feed is for human-readable change review, not bytecode noise.
 *   4. Temp files: any segment containing `.tmp.` or ending in `.tmp`
 *      (e.g., `state.tmp.json`, `data.tmp`).
 */
export function isFilteredPath(path: string): boolean {
  // Rule 1 — any dot-prefixed segment.
  if (path.split('/').some((seg) => seg.startsWith('.'))) return true;

  // Rule 2 — build-artifact non-dot folders.
  for (const prefix of BUILD_ARTIFACT_PREFIXES) {
    if (path === prefix.slice(0, -1)) return true;
    if (path.startsWith(prefix)) return true;
    if (path.includes(`/${prefix}`)) return true;
  }

  // Rule 3 — generated extensions.
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx > -1) {
    const ext = path.slice(dotIdx + 1).toLowerCase();
    if (FILTERED_EXTENSIONS.has(ext)) return true;
  }

  // Rule 4 — temp files (.tmp.<ext> or trailing .tmp).
  if (path.split('/').some((seg) => TMP_FILE_RE.test(seg))) return true;

  return false;
}
