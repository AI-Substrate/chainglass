/**
 * **Server-only** public contract for `_platform/git` sub-domain.
 *
 * Plan 084 FX007. Use this barrel from API routes and server actions —
 * it re-exports the pure URL builder + types AND the git CLI wrappers
 * (which import `node:child_process` and would break a client bundle).
 *
 * Client code MUST import from `./index` (the browser-safe barrel) instead.
 */

export type { RepoHost, Remote, BuildOptions, RepoInfo } from './lib/repo-url';
export { parseRemote, buildFileUrl } from './lib/repo-url';
export {
  getRemoteUrl,
  getCurrentBranch,
  getDefaultBaseBranch,
  getCurrentCommitSha,
} from './lib/git-cli';
