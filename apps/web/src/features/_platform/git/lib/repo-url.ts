/**
 * Pure URL builder for `_platform/git`.
 *
 * Plan 084 FX007 — copy-repo-url. Parses GitHub and Azure DevOps remote URLs
 * (HTTPS or SSH form, with or without embedded credentials) into a
 * host-discriminated `Remote`, and constructs hosted-repo web URLs for any
 * file at any branch or commit.
 *
 * No Node imports — browser-safe. No I/O.
 */

export type RepoHost = 'github' | 'azure-devops' | 'unknown';

export interface Remote {
  host: RepoHost;
  org: string | null;
  project: string | null;
  repo: string | null;
}

export interface BuildOptions {
  ref: string;
  refType: 'branch' | 'commit';
  relativePath: string;
}

/**
 * Composite payload returned by `/api/workspaces/[slug]/repo-info`.
 *
 * Defined here (in the pure / browser-safe module) rather than alongside the
 * git CLI wrappers because client code (`use-clipboard.ts`,
 * `browser-client.tsx`, `file-tree.tsx`, `changes-view.tsx`) needs this type.
 * If it lived in `git-cli.ts` (server-only — `node:child_process`), the
 * Turbopack browser chunker would refuse to bundle the barrel.
 */
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

const GITHUB_HTTPS = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;
const GITHUB_SSH = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;
const ADO_HTTPS = /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?\/?$/;
const ADO_SSH = /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/;
const VISUALSTUDIO_LEGACY = /(^|\.)visualstudio\.com/;
const ANY_HTTPS_OR_SSH = /^(https?:\/\/[^/]+\/.|git@[^:]+:.)/;

const UNKNOWN_HOST: Remote = {
  host: 'unknown',
  org: null,
  project: null,
  repo: null,
};

function stripCredentials(url: string): string {
  // https://user:token@host/... -> https://host/...
  // The credential segment is everything between "://" and the first "@"
  // that precedes the host, but only when it looks like creds (no "/").
  return url.replace(/^(https?:\/\/)([^@/\s]+)@/, '$1');
}

export function parseRemote(rawUrl: string): Remote | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (trimmed === '') return null;

  const url = stripCredentials(trimmed);

  let m = url.match(GITHUB_HTTPS);
  if (m) return { host: 'github', org: m[1], project: null, repo: m[2] };

  m = url.match(GITHUB_SSH);
  if (m) return { host: 'github', org: m[1], project: null, repo: m[2] };

  m = url.match(ADO_HTTPS);
  if (m) {
    return {
      host: 'azure-devops',
      org: m[1],
      project: m[2],
      repo: m[3],
    };
  }

  m = url.match(ADO_SSH);
  if (m) {
    return {
      host: 'azure-devops',
      org: m[1],
      project: m[2],
      repo: m[3],
    };
  }

  // Legacy ADO tenants and any other recognizable URL form → unknown.
  if (VISUALSTUDIO_LEGACY.test(url)) return UNKNOWN_HOST;
  if (ANY_HTTPS_OR_SSH.test(url)) return UNKNOWN_HOST;

  return null;
}

/**
 * Encode a `/`-delimited string per-segment so slashes survive but other
 * special characters (`#`, `?`, `&`, …) get URL-encoded.
 */
function encodeSegments(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

export function buildFileUrl(remote: Remote, options: BuildOptions): string {
  const { ref, refType, relativePath } = options;
  const encodedRef = encodeSegments(ref);
  const encodedPath = encodeSegments(relativePath);

  if (remote.host === 'github') {
    return `https://github.com/${remote.org}/${remote.repo}/blob/${encodedRef}/${encodedPath}`;
  }
  if (remote.host === 'azure-devops') {
    const versionPrefix = refType === 'branch' ? 'GB' : 'GC';
    return `https://dev.azure.com/${remote.org}/${remote.project}/_git/${remote.repo}?path=/${encodedPath}&version=${versionPrefix}${encodedRef}`;
  }
  throw new Error(`buildFileUrl: cannot build URL for host '${remote.host}'`);
}
