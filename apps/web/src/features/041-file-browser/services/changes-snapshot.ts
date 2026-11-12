/**
 * Changes snapshot — the browser's git-derived state, read in one round trip.
 *
 * The browser used to send four server actions (changed files, diff stats, working changes,
 * recent files) for every batch of file changes; each action is its own POST and its own
 * request queue slot (nav-speed PRD item 6). One action now returns the parts asked for.
 *
 * - `status`: changed files (tree filter), diff stats (panel header) and working changes
 *   (Changes list, explorer search badges, tab-title attention). Always in use.
 * - `recent`: recent committed files. Only shown while the Changes panel is open.
 */

import { type ChangedFilesResult, getChangedFiles } from './changed-files';
import { type DiffStatsResult, getDiffStats } from './diff-stats';
import { type RecentFilesResult, getRecentFiles } from './recent-files';
import { type WorkingChangesResult, getWorkingChanges } from './working-changes';

export interface ChangesSnapshotParts {
  status: boolean;
  recent: boolean;
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
    parts.status ? getChangedFiles(worktreePath) : undefined,
    parts.status ? getDiffStats(worktreePath) : undefined,
    parts.status ? getWorkingChanges(worktreePath) : undefined,
    parts.recent ? getRecentFiles(worktreePath) : undefined,
  ]);
  return { changedFiles, diffStats, workingChanges, recentFiles };
}
