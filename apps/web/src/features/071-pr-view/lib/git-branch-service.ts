/**
 * Git Branch Service — branch info and merge-base resolution
 *
 * Provides getCurrentBranch, getDefaultBaseBranch, getMergeBase,
 * and getChangedFilesBranch for PR View's Branch comparison mode.
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
 * Get the current branch name.
 * Returns 'HEAD' if in detached HEAD state.
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    return stdout.trim() || 'HEAD';
  } catch {
    return 'HEAD';
  }
}

/**
 * Auto-detect the default base branch from remote origin.
 * Parses `git symbolic-ref refs/remotes/origin/HEAD` to extract the branch name.
 * Falls back to 'main' if no remote is configured or detection fails (DYK-P4-04).
 */
export async function getDefaultBaseBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd,
    });
    // Output: refs/remotes/origin/main → extract "main"
    const ref = stdout.trim();
    const parts = ref.split('/');
    return parts[parts.length - 1] || 'main';
  } catch {
    return 'main';
  }
}

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
