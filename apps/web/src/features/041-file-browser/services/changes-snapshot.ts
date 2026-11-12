/**
 * Changes snapshot — the browser's git-derived state, read in one round trip.
 *
 * The browser used to send four server actions (changed files, diff stats, working changes,
 * recent files) for every batch of file changes; each action is its own POST and its own
 * request queue slot (nav-speed PRD item 6). One action now returns the parts asked for.
 *
 * - `tree`: changed files (tree filter) + diff stats (panel header). Always shown.
 * - `changes`: working changes + recent files. Only shown while the Changes panel is open.
 */

import { type ChangedFilesResult, getChangedFiles } from './changed-files';
import { type DiffStatsResult, getDiffStats } from './diff-stats';
import { type RecentFilesResult, getRecentFiles } from './recent-files';
import { type WorkingChangesResult, getWorkingChanges } from './working-changes';

export interface ChangesSnapshotParts {
  tree: boolean;
  changes: boolean;
}

export interface ChangesSnapshot {
  changedFiles?: ChangedFilesResult;
  diffStats?: DiffStatsResult;
  workingChanges?: WorkingChangesResult;
  recentFiles?: RecentFilesResult;
}

export async function getChangesSnapshot(
  worktreePath: string,
  parts: ChangesSnapshotParts
): Promise<ChangesSnapshot> {
  const [changedFiles, diffStats, workingChanges, recentFiles] = await Promise.all([
    parts.tree ? getChangedFiles(worktreePath) : undefined,
    parts.tree ? getDiffStats(worktreePath) : undefined,
    parts.changes ? getWorkingChanges(worktreePath) : undefined,
    parts.changes ? getRecentFiles(worktreePath) : undefined,
  ]);
  return { changedFiles, diffStats, workingChanges, recentFiles };
}
