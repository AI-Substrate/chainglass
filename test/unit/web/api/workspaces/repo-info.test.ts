/**
 * Repo Info Route — Unit Tests (lightweight)
 *
 * Why: The route is the seam between auth + bootstrap-cookie + workspace
 *   service + git CLI helpers. Plan 084 findings 01/02/11/12/14 each map to
 *   an explicit test below — drift in any layer regresses one of them.
 * Contract: GET → 401 (no session OR bad bootstrap-cookie),
 *   400 (missing/traversal/unknown-worktree/missing-workspace),
 *   200 (RepoInfo shape, no raw `remoteUrl`).
 * Usage Notes: `auth`, `getBootstrapCodeAndKey`, `verifyCookieValue`, the
 *   workspace DI container, and the four git-cli wrappers are all mocked
 *   so the route can be exercised without spinning up a real workspace.
 * Quality Contribution: Locks the 7 explicit error-path contracts the
 *   downstream client (browser-client.tsx in T007) relies on.
 * Worked Example:
 *   GET /api/workspaces/ws/repo-info?worktree=/wt
 *   with valid session + cookie + closed-set worktree
 *   → 200 { host: 'github', org: 'o', project: null, repo: 'r',
 *           currentBranch: 'main', defaultBranch: 'main',
 *           currentSha: '<40-char>', isDetached: false }
 *
 * Plan 084 FX007. Findings: 01, 02, 11, 12, 14.
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  getBootstrapCodeAndKeyMock,
  verifyCookieValueMock,
  getInfoMock,
  containerResolveMock,
  getContainerMock,
  getRemoteUrlMock,
  getCurrentBranchMock,
  getDefaultBaseBranchMock,
  getCurrentCommitShaMock,
} = vi.hoisted(() => {
  const getInfoMock = vi.fn();
  const containerResolveMock = vi.fn(() => ({ getInfo: getInfoMock }));
  const getContainerMock = vi.fn(() => ({ resolve: containerResolveMock }));
  return {
    authMock: vi.fn(),
    getBootstrapCodeAndKeyMock: vi.fn(),
    verifyCookieValueMock: vi.fn(),
    getInfoMock,
    containerResolveMock,
    getContainerMock,
    getRemoteUrlMock: vi.fn(),
    getCurrentBranchMock: vi.fn(),
    getDefaultBaseBranchMock: vi.fn(),
    getCurrentCommitShaMock: vi.fn(),
  };
});

vi.mock('@/auth', () => ({ auth: authMock }));

vi.mock('@/lib/bootstrap-code', () => ({
  getBootstrapCodeAndKey: getBootstrapCodeAndKeyMock,
}));

vi.mock('@chainglass/shared/auth-bootstrap-code', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    BOOTSTRAP_COOKIE_NAME: 'cg.bootstrap',
    verifyCookieValue: verifyCookieValueMock,
  };
});

vi.mock('@/lib/bootstrap-singleton', () => ({
  getContainer: getContainerMock,
}));

vi.mock('@/features/_platform/git/index.server', () => ({
  getRemoteUrl: getRemoteUrlMock,
  getCurrentBranch: getCurrentBranchMock,
  getDefaultBaseBranch: getDefaultBaseBranchMock,
  getCurrentCommitSha: getCurrentCommitShaMock,
  parseRemote: (url: string | null) => {
    if (!url) return null;
    if (url.includes('github.com')) {
      return { host: 'github', org: 'o', project: null, repo: 'r' };
    }
    return { host: 'unknown', org: null, project: null, repo: null };
  },
}));

import { GET } from '@/../app/api/workspaces/[slug]/repo-info/route';

const URL_BASE = 'http://localhost:3000/api/workspaces/ws/repo-info';
const WT_PATH = '/Users/u/wt';
const validParams = Promise.resolve({ slug: 'ws' });

function reqWithCookie(
  url = `${URL_BASE}?worktree=${encodeURIComponent(WT_PATH)}`,
  cookie = 'cg.bootstrap=ok',
): NextRequest {
  return new NextRequest(url, { headers: { cookie } });
}

beforeEach(() => {
  authMock.mockReset();
  getBootstrapCodeAndKeyMock.mockReset();
  verifyCookieValueMock.mockReset();
  getInfoMock.mockReset();
  getRemoteUrlMock.mockReset();
  getCurrentBranchMock.mockReset();
  getDefaultBaseBranchMock.mockReset();
  getCurrentCommitShaMock.mockReset();

  // Defaults for the happy path; individual tests override what they need.
  authMock.mockResolvedValue({ user: { name: 'u' } });
  getBootstrapCodeAndKeyMock.mockResolvedValue({
    code: 'ABCD-EFGH-JKMN',
    key: Buffer.from('key'),
  });
  verifyCookieValueMock.mockReturnValue(true);
  getInfoMock.mockResolvedValue({
    slug: 'ws',
    name: 'ws',
    path: '/Users/u/wt',
    createdAt: new Date(),
    hasGit: true,
    worktrees: [
      {
        path: WT_PATH,
        head: 'a'.repeat(40),
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ],
  });
  getRemoteUrlMock.mockResolvedValue('https://github.com/o/r.git');
  getCurrentBranchMock.mockResolvedValue('main');
  getDefaultBaseBranchMock.mockResolvedValue('main');
  getCurrentCommitShaMock.mockResolvedValue('a'.repeat(40));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/workspaces/[slug]/repo-info', () => {
  it('401: missing NextAuth session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(reqWithCookie(), { params: validParams });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('401: missing/invalid bootstrap cookie (independent verify)', async () => {
    verifyCookieValueMock.mockReturnValue(false);
    const res = await GET(reqWithCookie(), { params: validParams });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'bootstrap-cookie-required' });
  });

  it('400: missing worktree query param', async () => {
    const res = await GET(reqWithCookie(URL_BASE), {
      params: validParams,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing worktree parameter' });
  });

  it("400: traversal attempt — worktree contains '..'", async () => {
    const url = `${URL_BASE}?worktree=${encodeURIComponent('/etc/../passwd')}`;
    const res = await GET(reqWithCookie(url), { params: validParams });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid worktree path' });
  });

  it('400: worktree not in the workspace closed set', async () => {
    const url = `${URL_BASE}?worktree=${encodeURIComponent('/some/other/wt')}`;
    const res = await GET(reqWithCookie(url), { params: validParams });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Worktree not in workspace' });
  });

  it('400: unknown workspace slug (getInfo returns null)', async () => {
    getInfoMock.mockResolvedValue(null);
    const res = await GET(reqWithCookie(), { params: validParams });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Workspace not found' });
  });

  it('200: happy path — RepoInfo shape, no raw remoteUrl in body', async () => {
    const res = await GET(reqWithCookie(), { params: validParams });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      host: 'github',
      org: 'o',
      project: null,
      repo: 'r',
      currentBranch: 'main',
      defaultBranch: 'main',
      currentSha: 'a'.repeat(40),
      isDetached: false,
    });
    expect(body).not.toHaveProperty('remoteUrl');
    expect(JSON.stringify(body)).not.toContain('github.com'); // no leaked raw URL fragment
  });

  it("200: host:'unknown' when no remote is configured", async () => {
    getRemoteUrlMock.mockResolvedValue(null);
    const res = await GET(reqWithCookie(), { params: validParams });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      host: 'unknown',
      org: null,
      project: null,
      repo: null,
      currentBranch: 'main',
      defaultBranch: 'main',
      currentSha: 'a'.repeat(40),
      isDetached: false,
    });
  });
});
