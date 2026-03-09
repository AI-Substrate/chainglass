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
