/**
 * Diff Stats Service
 *
 * Returns aggregate diff statistics (files changed, insertions, deletions)
 * for a workspace using `git diff HEAD --shortstat`.
 *
 * Feature 1: File Change Statistics — Plan 049
 * DYK-01: Use HEAD to capture staged+unstaged changes
 * DYK-03: Fallback to `git diff --shortstat` if HEAD doesn't exist (new repo)
 * DYK-05: --shortstat gives single-line summary, simpler than --numstat
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DiffStats {
  files: number;
  insertions: number;
  deletions: number;
}

export type DiffStatsResult = { ok: true; stats: DiffStats } | { ok: false; error: 'not-git' };

/** Parse `git diff --shortstat` output into structured stats. */
export function parseShortstatOutput(output: string): DiffStats {
  const trimmed = output.trim();
  if (!trimmed) return { files: 0, insertions: 0, deletions: 0 };

  const filesMatch = trimmed.match(/(\d+) files? changed/);
  const insertionsMatch = trimmed.match(/(\d+) insertions?\(\+\)/);
  const deletionsMatch = trimmed.match(/(\d+) deletions?\(-\)/);

  return {
    files: filesMatch ? Number.parseInt(filesMatch[1], 10) : 0,
    insertions: insertionsMatch ? Number.parseInt(insertionsMatch[1], 10) : 0,
    deletions: deletionsMatch ? Number.parseInt(deletionsMatch[1], 10) : 0,
  };
}

export async function getDiffStats(worktreePath: string): Promise<DiffStatsResult> {
  try {
    // Try HEAD first (captures staged+unstaged)
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD', '--shortstat'], {
      cwd: worktreePath,
    });
    return { ok: true, stats: parseShortstatOutput(stdout) };
  } catch (headError: unknown) {
    // DYK-03: HEAD fails on repos with no commits (exit 128) — fallback to index diff
    // F003: Check exit code instead of locale-dependent error string
    const exitCode =
      headError && typeof headError === 'object' && 'code' in headError
        ? (headError as { code: number }).code
        : null;
    if (exitCode === 128) {
      try {
        const { stdout } = await execFileAsync('git', ['diff', '--shortstat'], {
          cwd: worktreePath,
        });
        return { ok: true, stats: parseShortstatOutput(stdout) };
      } catch {
        return { ok: false, error: 'not-git' };
      }
    }
    return { ok: false, error: 'not-git' };
  }
}
