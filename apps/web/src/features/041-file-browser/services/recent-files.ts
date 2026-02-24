/**
 * Recent Files Service
 *
 * Returns deduplicated list of recently changed files from git log.
 * Uses `git log --name-only --no-merges --pretty=format: --diff-filter=AMCR`.
 *
 * Phase 2: Git Services — Plan 043
 * DYK-P2-03: Scan more commits than limit to get enough unique files. --no-merges for cleaner output.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type RecentFilesResult = { ok: true; files: string[] } | { ok: false; error: 'not-git' };

/** Parse git log --name-only output into deduplicated file list */
export function parseGitLogOutput(output: string, limit: number): string[] {
  const lines = output.split('\n').filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    result.push(line);
    if (result.length >= limit) break;
  }

  return result;
}

export async function getRecentFiles(worktreePath: string, limit = 20): Promise<RecentFilesResult> {
  try {
    // Scan 3x the limit in commits to get enough unique files
    const { stdout } = await execFileAsync(
      'git',
      [
        'log',
        '--name-only',
        '--no-merges',
        '--pretty=format:',
        '--diff-filter=AMCR',
        `-n`,
        String(limit * 3),
      ],
      { cwd: worktreePath }
    );
    return { ok: true, files: parseGitLogOutput(stdout, limit) };
  } catch {
    return { ok: false, error: 'not-git' };
  }
}
