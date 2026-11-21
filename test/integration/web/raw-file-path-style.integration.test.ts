/**
 * Path-style raw-file route: GET /api/workspaces/[slug]/files/raw/[worktreeKey]/[...path].
 *
 * Proves a multi-file HTML page opened directly in a tab can load its siblings by relative URL,
 * and that the path-style form keeps the query-style route's checks (traversal blocked) and
 * drops the asset token (only the query-style route honours `_at`).
 *
 * Real fs, real route handlers, no mocks. `auth()` needs a Next request scope vitest cannot
 * provide, so these run with DISABLE_GITHUB_OAUTH=true (auth() returns a session); the
 * no-cookie case is the proxy's job and is covered by proxy.test.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET as pathGET } from '../../../apps/web/app/api/workspaces/[slug]/files/raw/[worktreeKey]/[...path]/route';
import {
  decodeWorktreeKey,
  encodeWorktreeKey,
  rawFilePathUrl,
  toRawFilePathUrl,
} from '../../../apps/web/src/features/041-file-browser/lib/raw-file-path-url';
import { makeTmpDir, removeTmpDir } from '../../helpers/tmpdir';

const ORIGIN = 'http://localhost:3000';

/** Fetch a path-style URL the way Next would route it: split into params. */
async function fetchPathStyle(urlPath: string, headers: Record<string, string> = {}) {
  const url = new URL(urlPath, ORIGIN);
  const match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/files\/raw\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`not a path-style URL: ${urlPath}`);
  const [, slug, worktreeKey, rest] = match;
  const path = rest.split('/').map(decodeURIComponent);
  return pathGET(new NextRequest(url, { method: 'GET', headers }), {
    params: Promise.resolve({ slug: decodeURIComponent(slug), worktreeKey, path }),
  });
}

describe('raw-file path-style route', () => {
  let worktree: string;
  let originalDisableGithub: string | undefined;

  beforeEach(() => {
    originalDisableGithub = process.env.DISABLE_GITHUB_OAUTH;
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    worktree = makeTmpDir('raw-path-style');
    mkdirSync(join(worktree, 'scratch', 'fleet map', 'img'), { recursive: true });
    writeFileSync(join(worktree, 'scratch', 'fleet map', 'index.html'), '<script src="data.js">');
    writeFileSync(join(worktree, 'scratch', 'fleet map', 'data.js'), 'window.DATA = [1, 2, 3];');
    writeFileSync(join(worktree, 'scratch', 'fleet map', 'img', 'a.txt'), 'nested');
  });

  afterEach(() => {
    if (originalDisableGithub === undefined) {
      // biome-ignore lint/performance/noDelete: tests need to truly unset
      delete process.env.DISABLE_GITHUB_OAUTH;
    } else process.env.DISABLE_GITHUB_OAUTH = originalDisableGithub;
    removeTmpDir(worktree);
  });

  it('a relative reference from the page resolves to its sibling and streams it', async () => {
    const page = rawFilePathUrl('test-ws', worktree, 'scratch/fleet map/index.html');
    const pageRes = await fetchPathStyle(page);
    expect(pageRes.status).toBe(200);
    expect(pageRes.headers.get('content-type')).toContain('text/html');

    // Exactly what the browser does with <script src="data.js">.
    const sibling = new URL('data.js', new URL(page, ORIGIN)).pathname;
    const siblingRes = await fetchPathStyle(sibling);
    expect(siblingRes.status).toBe(200);
    expect(await siblingRes.text()).toBe('window.DATA = [1, 2, 3];');

    const nested = new URL('img/a.txt', new URL(page, ORIGIN)).pathname;
    expect(await (await fetchPathStyle(nested)).text()).toBe('nested');
  });

  it('blocks traversal out of the worktree', async () => {
    const key = encodeWorktreeKey(worktree);
    const res = await pathGET(new NextRequest(`${ORIGIN}/x`), {
      params: Promise.resolve({ slug: 'test-ws', worktreeKey: key, path: ['..', 'etc', 'passwd'] }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a worktree key that is not base64url', async () => {
    const res = await pathGET(new NextRequest(`${ORIGIN}/x`), {
      params: Promise.resolve({ slug: 'test-ws', worktreeKey: 'not*valid', path: ['a'] }),
    });
    expect(res.status).toBe(400);
  });

  it('passes Range through', async () => {
    const res = await fetchPathStyle(
      rawFilePathUrl('test-ws', worktree, 'scratch/fleet map/data.js'),
      { range: 'bytes=0-5' }
    );
    expect(res.status).toBe(206);
    expect(await res.text()).toBe('window');
  });

  it('drops the asset token: a bogus _at does not trigger the token branch', async () => {
    const url = `${rawFilePathUrl('test-ws', worktree, 'scratch/fleet map/data.js')}?_at=bogus`;
    expect((await fetchPathStyle(url)).status).toBe(200);
  });
});

describe('raw-file path URL helpers', () => {
  it('round-trips worktree paths, including non-ASCII', () => {
    for (const p of ['/Users/j/osk/osk_central', '/tmp/a b/ü-日本']) {
      expect(decodeWorktreeKey(encodeWorktreeKey(p))).toBe(p);
    }
    expect(encodeWorktreeKey('/Users/j/osk')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('converts a query-style URL, keeping other params and dropping _at', () => {
    const q = `/api/workspaces/osk/files/raw?worktree=${encodeURIComponent('/w t')}&file=${encodeURIComponent('a/b c.html')}&download=true&_at=x`;
    expect(toRawFilePathUrl(q, ORIGIN)).toBe(
      `/api/workspaces/osk/files/raw/${encodeWorktreeKey('/w t')}/a/b%20c.html?download=true`
    );
  });

  it('returns null for URLs it cannot convert', () => {
    expect(toRawFilePathUrl('/api/workspaces/osk/files/raw?worktree=/w', ORIGIN)).toBeNull();
    expect(toRawFilePathUrl('/somewhere/else?worktree=/w&file=a', ORIGIN)).toBeNull();
  });
});
