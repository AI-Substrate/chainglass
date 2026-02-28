/**
 * File Filter Utilities
 *
 * Pure functions for file search: substring/glob matching, sorting, and
 * dot-path filtering. Used by useFileFilter hook.
 *
 * Feature 2: File Tree Quick Filter — Plan 049
 * Workshop 001: Substring default, glob via micromatch on *?{ detection
 */

export interface FilterableFile {
  path: string;
  mtime: number;
  modified: boolean;
  lastChanged: number | null;
}

/** Detect whether a query string contains glob characters. */
export function isGlobPattern(query: string): boolean {
  return /[*?{]/.test(query);
}

/**
 * Filter files by substring (default) or glob pattern.
 * Substring match is case-insensitive on the full relative path.
 * Glob matching uses micromatch (dynamic import).
 */
export function filterFiles<T extends FilterableFile>(
  files: T[],
  query: string
): T[] | Promise<T[]> {
  if (!query) return files;

  if (isGlobPattern(query)) {
    return filterByGlob(files, query);
  }

  const lower = query.toLowerCase();
  return files.filter((f) => f.path.toLowerCase().includes(lower));
}

async function filterByGlob<T extends FilterableFile>(files: T[], pattern: string): Promise<T[]> {
  const { default: micromatch } = await import('micromatch');
  const paths = files.map((f) => f.path);
  // Use basename mode only for simple patterns (no path separators)
  const useBasename = !pattern.includes('/');
  const matched = new Set(micromatch(paths, pattern, { basename: useBasename }));
  return files.filter((f) => matched.has(f.path));
}

/** Sort files by most recently changed (mtime desc). lastChanged overrides mtime. */
export function sortByRecent<T extends FilterableFile>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const aTime = a.lastChanged ?? a.mtime;
    const bTime = b.lastChanged ?? b.mtime;
    return bTime - aTime;
  });
}

/** Sort files alphabetically by path. */
export function sortAlpha<T extends FilterableFile>(files: T[], direction: 'asc' | 'desc'): T[] {
  return [...files].sort((a, b) => {
    const cmp = a.path.localeCompare(b.path);
    return direction === 'asc' ? cmp : -cmp;
  });
}

/** Filter out files with dot-prefixed path segments (.github, .env, etc). */
export function hideDotPaths<T extends FilterableFile>(files: T[]): T[] {
  return files.filter((f) => {
    const segments = f.path.split('/');
    return !segments.some((s) => s.startsWith('.'));
  });
}
