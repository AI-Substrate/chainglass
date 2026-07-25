/**
 * Shared worktree sort utilities.
 *
 * Sort order: starred first → numeric-prefix descending → non-numeric alphabetical.
 * Branch names like "066-wf-real-agents" sort by the leading number (066 > 064 > 063).
 * Branches without a numeric prefix (e.g. "main") sort after all numbered branches.
 */

/**
 * Extract leading numeric prefix from a branch name, or null if none.
 * "066-wf-real-agents" → 66, "main" → null
 */
function extractNumericPrefix(branch: string): number | null {
  const match = branch.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Compare two branch names: numeric-prefix descending, non-numeric last, fallback alphabetical.
 */
export function compareWorktreeBranches(a: string, b: string): number {
  const aNum = extractNumericPrefix(a);
  const bNum = extractNumericPrefix(b);
  if (aNum !== null && bNum !== null) return bNum - aNum;
  if (aNum !== null) return -1;
  if (bNum !== null) return 1;
  return a.localeCompare(b);
}

/**
 * Sort worktrees: starred first, then by compareWorktreeBranches.
 */
export function sortWorktrees<T extends { path: string; branch?: string | null }>(
  worktrees: T[],
  starredSet: Set<string>
): T[] {
  return [...worktrees].sort((a, b) => {
    const aStarred = starredSet.has(a.path);
    const bStarred = starredSet.has(b.path);
    if (aStarred !== bStarred) return aStarred ? -1 : 1;
    return compareWorktreeBranches(a.branch ?? '', b.branch ?? '');
  });
}

/** User-selectable sort fields for the workspace worktree list. */
export type WorktreeSortKey = 'name' | 'created' | 'updated';

/** Sort direction. */
export type WorktreeSortDir = 'asc' | 'desc';

/** Default sort: most recently updated first. */
export const DEFAULT_WORKTREE_SORT: WorktreeSortKey = 'updated';
export const DEFAULT_WORKTREE_DIR: WorktreeSortDir = 'desc';

/** Sensible default direction when a field is first selected. */
export function defaultDirForKey(key: WorktreeSortKey): WorktreeSortDir {
  // Dates read newest-first; names read A→Z.
  return key === 'name' ? 'asc' : 'desc';
}

/** Coerce arbitrary query values into a valid sort key. */
export function parseSortKey(value: string | string[] | undefined): WorktreeSortKey {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'name' || v === 'created' || v === 'updated' ? v : DEFAULT_WORKTREE_SORT;
}

/** Coerce arbitrary query values into a valid sort direction. */
export function parseSortDir(value: string | string[] | undefined): WorktreeSortDir {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'asc' || v === 'desc' ? v : DEFAULT_WORKTREE_DIR;
}

interface TimestampedWorktree {
  path: string;
  branch?: string | null;
  /** Epoch ms of creation, or null if unknown. */
  createdAt: number | null;
  /** Epoch ms of last update, or null if unknown. */
  updatedAt: number | null;
}

/**
 * Sort worktrees by a chosen field/direction, keeping starred worktrees pinned
 * to the top (preserving the existing star behaviour). Missing timestamps sort
 * last regardless of direction.
 */
export function sortWorktreesBy<T extends TimestampedWorktree>(
  worktrees: T[],
  starredSet: Set<string>,
  key: WorktreeSortKey,
  dir: WorktreeSortDir
): T[] {
  const factor = dir === 'asc' ? 1 : -1;

  const compareByKey = (a: T, b: T): number => {
    if (key === 'name') {
      return a.branch && b.branch
        ? a.branch.localeCompare(b.branch) * factor
        : compareWorktreeBranches(a.branch ?? '', b.branch ?? '') * factor;
    }
    const av = key === 'created' ? a.createdAt : a.updatedAt;
    const bv = key === 'created' ? b.createdAt : b.updatedAt;
    // Unknown timestamps always sink to the bottom.
    if (av === null && bv === null) return compareWorktreeBranches(a.branch ?? '', b.branch ?? '');
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * factor;
  };

  return [...worktrees].sort((a, b) => {
    const aStarred = starredSet.has(a.path);
    const bStarred = starredSet.has(b.path);
    if (aStarred !== bStarred) return aStarred ? -1 : 1;
    return compareByKey(a, b);
  });
}
