/**
 * Public contract for `_platform/git` sub-domain.
 *
 * Plan 084 FX007 — cross-cutting git helpers + pure URL builder.
 *
 * - `repo-url.ts` is pure (browser-safe, no Node imports).
 * - `git-cli.ts` is server-only (uses `child_process.execFile`).
 *
 * Populated by T002 (`parseRemote`, `buildFileUrl`, types) and T003 (CLI
 * wrappers + `RepoInfo`).
 */

export type { RepoHost, Remote, BuildOptions } from './lib/repo-url';
export { parseRemote, buildFileUrl } from './lib/repo-url';

export type { RepoInfo } from './lib/git-cli';
export {
  getRemoteUrl,
  getCurrentBranch,
  getDefaultBaseBranch,
  getCurrentCommitSha,
} from './lib/git-cli';
