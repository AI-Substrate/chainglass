/**
 * Git CLI wrappers for `_platform/git` — Plan 084 FX007.
 *
 * Server-only (uses `node:child_process.execFile`). Bodies populated in T003;
 * exports here keep the public surface (`index.ts`) compilable from T002
 * onward so TDD on `repo-url.ts` doesn't depend on T003 ordering.
 */

import type { RepoHost } from './repo-url';

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

export async function getRemoteUrl(_cwd: string): Promise<string | null> {
  throw new Error('getRemoteUrl: not implemented (T003)');
}

export async function getCurrentBranch(_cwd: string): Promise<string> {
  throw new Error('getCurrentBranch: not implemented (T003)');
}

export async function getDefaultBaseBranch(_cwd: string): Promise<string> {
  throw new Error('getDefaultBaseBranch: not implemented (T003)');
}

export async function getCurrentCommitSha(
  _cwd: string,
): Promise<string | null> {
  throw new Error('getCurrentCommitSha: not implemented (T003)');
}
