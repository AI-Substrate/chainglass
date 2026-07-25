/**
 * Server-side worktree timestamp enrichment.
 *
 * Worktrees carry no timestamps of their own, so we derive them on demand for
 * the workspace detail page's sort controls:
 *   - updatedAt: committer date of the worktree's HEAD commit (what "last
 *     update" means for a branch).
 *   - createdAt: filesystem birth time of the worktree directory (a good proxy
 *     for when the worktree was added), falling back to ctime.
 *
 * Both are best-effort: anything that can't be resolved comes back as null and
 * sorts last.
 */

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface WorktreeTimestamps {
  /** Epoch ms of last commit on HEAD, or null if unavailable. */
  updatedAt: number | null;
  /** Epoch ms the worktree directory was created, or null if unavailable. */
  createdAt: number | null;
}

async function lastCommitMs(path: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', path, 'log', '-1', '--format=%ct'], {
      timeout: 5000,
    });
    const seconds = Number.parseInt(stdout.trim(), 10);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  } catch {
    return null;
  }
}

async function dirCreatedMs(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    // birthtimeMs is 0 on filesystems that don't record it; fall back to ctime.
    return s.birthtimeMs > 0 ? s.birthtimeMs : s.ctimeMs || null;
  } catch {
    return null;
  }
}

/**
 * Resolve timestamps for a set of worktree paths, keyed by path. Runs all
 * lookups in parallel.
 */
export async function getWorktreeTimestamps(
  paths: string[]
): Promise<Map<string, WorktreeTimestamps>> {
  const entries = await Promise.all(
    paths.map(async (path): Promise<[string, WorktreeTimestamps]> => {
      const [updatedAt, createdAt] = await Promise.all([lastCommitMs(path), dirCreatedMs(path)]);
      return [path, { updatedAt, createdAt }];
    })
  );
  return new Map(entries);
}
