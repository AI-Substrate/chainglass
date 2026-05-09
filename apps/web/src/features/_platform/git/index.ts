/**
 * **Browser-safe** public contract for `_platform/git` sub-domain.
 *
 * Plan 084 FX007. This barrel intentionally re-exports ONLY the pure
 * `repo-url.ts` module — no value-imports of `lib/git-cli.ts`, which would
 * pull `node:child_process` into the client bundle and fail Turbopack
 * chunking.
 *
 * - Client code (hooks / components / browser-client) imports from here.
 * - Server code (API routes / server actions) imports from `./index.server`
 *   (which re-exports both pure helpers and the CLI wrappers).
 */

export type { RepoHost, Remote, BuildOptions, RepoInfo } from './lib/repo-url';
export { parseRemote, buildFileUrl } from './lib/repo-url';
