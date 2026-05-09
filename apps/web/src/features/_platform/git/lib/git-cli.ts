/**
 * Git CLI wrappers for `_platform/git` — Plan 084 FX007.
 *
 * Server-only — uses `node:child_process.execFile` so the `cwd` is passed via
 * the option object (never argv) and shell metacharacters in the worktree
 * path can't be exploited.
 *
 * `getCurrentBranch` and `getDefaultBaseBranch` were lifted from
 * `apps/web/src/features/071-pr-view/lib/git-branch-service.ts` (Plan 071) —
 * contracts preserved verbatim (`'HEAD'` for detached, `'main'` fallback).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RepoHost } from './repo-url';

const execFileAsync = promisify(execFile);

export interface RepoInfo {
  host: RepoHost;
  org: string | null;
  project: string | null;
  repo: string | null;
  currentBranch: string;
  defaultBranch: string;
  currentSha: string | null;
  isDetached: boolean;
}

/**
 * Read the `origin` remote URL.
 * Returns `null` if no remote is configured, git is not installed, or any
 * other git failure occurs.
 */
export async function getRemoteUrl(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['config', '--get', 'remote.origin.url'],
      { cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get the current branch name. Returns `'HEAD'` if in detached HEAD state.
 * Contract preserved from `pr-view`'s `git-branch-service.ts` (Plan 071).
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd },
    );
    return stdout.trim() || 'HEAD';
  } catch {
    return 'HEAD';
  }
}

/**
 * Auto-detect the default base branch from remote origin.
 * Parses `git symbolic-ref refs/remotes/origin/HEAD` to extract the branch
 * name. Falls back to `'main'` when origin/HEAD isn't set or git fails
 * (DYK-P4-04). Contract preserved from `pr-view`'s `git-branch-service.ts`.
 */
export async function getDefaultBaseBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['symbolic-ref', 'refs/remotes/origin/HEAD'],
      { cwd },
    );
    const ref = stdout.trim();
    const parts = ref.split('/');
    return parts[parts.length - 1] || 'main';
  } catch {
    return 'main';
  }
}

/**
 * Get the full 40-char SHA of the worktree's current commit.
 * Returns `null` on failure — zero-commit worktree, broken HEAD, git not
 * installed (Plan 084 finding 14).
 */
export async function getCurrentCommitSha(
  cwd: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd,
    });
    const sha = stdout.trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}
