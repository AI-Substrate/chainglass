/**
 * Changed Files Service
 *
 * Returns list of git-modified file paths for a workspace.
 * Uses `git diff --name-only` with workspace cwd.
 *
 * Phase 4: File Browser — Plan 041
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ChangedFilesResult = { ok: true; files: string[] } | { ok: false; error: 'not-git' };

export async function getChangedFiles(worktreePath: string): Promise<ChangedFilesResult> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only'], {
      cwd: worktreePath,
    });

    const files = stdout.trim().split('\n').filter(Boolean);
    return { ok: true, files };
  } catch {
    return { ok: false, error: 'not-git' };
  }
}
