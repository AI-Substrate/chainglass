/**
 * Git Branch Service — PR-view-specific git ops (merge-base, branch diff).
 *
 * `getCurrentBranch` and `getDefaultBaseBranch` were lifted to
 * `_platform/git` in Plan 084 FX007 — import them from there.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BranchChangedFile, DiffFileStatus } from '../types';

const execFileAsync = promisify(execFile);

const NAME_STATUS_MAP: Record<string, DiffFileStatus> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
};

/**
 * Get the merge-base SHA between the current branch and a base branch.
 * Returns null if merge-base cannot be determined (e.g., no common ancestor).
 */
export async function getMergeBase(cwd: string, baseBranch: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['merge-base', baseBranch, 'HEAD'], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get files changed between current branch and a base ref.
 * Uses `git diff <base>...HEAD --name-status` for Branch mode.
 * Returns array of {path, status} entries.
 */
export async function getChangedFilesBranch(
  cwd: string,
  baseRef: string
): Promise<BranchChangedFile[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', `${baseRef}...HEAD`, '--name-status'], {
      cwd,
    });
    return parseNameStatus(stdout);
  } catch {
    return [];
  }
}

/** Parse git diff --name-status output into BranchChangedFile[] */
export function parseNameStatus(output: string): BranchChangedFile[] {
  const files: BranchChangedFile[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const statusChar = parts[0].charAt(0);
    const status = NAME_STATUS_MAP[statusChar] ?? 'modified';
    // For renames (R100\tsrc/old.ts\tsrc/new.ts), use the new path
    const filePath = parts.length >= 3 ? parts[2] : parts[1];
    files.push({ path: filePath, status });
  }
  return files;
}
