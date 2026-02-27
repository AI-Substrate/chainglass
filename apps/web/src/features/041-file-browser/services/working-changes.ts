/**
 * Working Changes Service
 *
 * Parses `git status --porcelain=v1 --ignore-submodules` output into typed ChangedFile[].
 * Each file has a status (modified/added/deleted/untracked/renamed) and area (staged/unstaged/untracked).
 *
 * Phase 2: Git Services — Plan 043
 * DYK-P2-01: --ignore-submodules eliminates submodule noise. MM emits two entries.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
  area: 'staged' | 'unstaged' | 'untracked';
}

export type WorkingChangesResult =
  | { ok: true; files: ChangedFile[] }
  | { ok: false; error: 'not-git' };

const STATUS_MAP: Record<string, ChangedFile['status']> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
};

/** Parse git status --porcelain=v1 output into ChangedFile[] */
export function parsePorcelainOutput(output: string): ChangedFile[] {
  const lines = output.split('\n').filter(Boolean);
  const results: ChangedFile[] = [];

  for (const line of lines) {
    if (line.length < 4) continue;

    const x = line[0]; // staged status
    const y = line[1]; // unstaged status
    let filePath = line.slice(3);

    // Handle untracked
    if (x === '?' && y === '?') {
      results.push({ path: filePath, status: 'untracked', area: 'untracked' });
      continue;
    }

    // Handle renames: "R  old -> new"
    if (x === 'R' || y === 'R') {
      const arrowIdx = filePath.indexOf(' -> ');
      if (arrowIdx !== -1) {
        filePath = filePath.slice(arrowIdx + 4);
      }
    }

    // Staged change (X is not space)
    if (x !== ' ' && x !== '?' && STATUS_MAP[x]) {
      results.push({
        path: filePath,
        status: STATUS_MAP[x],
        area: 'staged',
      });
    }

    // Unstaged change (Y is not space)
    if (y !== ' ' && y !== '?' && STATUS_MAP[y]) {
      results.push({
        path: filePath,
        status: STATUS_MAP[y],
        area: 'unstaged',
      });
    }
  }

  return results;
}

export async function getWorkingChanges(worktreePath: string): Promise<WorkingChangesResult> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain=v1', '--ignore-submodules', '-uall'],
      { cwd: worktreePath }
    );
    return { ok: true, files: parsePorcelainOutput(stdout) };
  } catch {
    return { ok: false, error: 'not-git' };
  }
}
