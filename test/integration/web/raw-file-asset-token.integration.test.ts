/**
 * Plan 084 FX011 — raw-file route asset-token integration tests.
 *
 * Proves the end-to-end token flow: mint a real token via the mint
 * endpoint, then fetch the raw-file route with `?_at=<token>` (no
 * cookie, no Auth.js session) and verify the file streams back.
 *
 * Constitution P4 — no `vi.mock`. Real fs in temp cwd, real HMAC, real
 * route handlers. The only mock is `auth()` for the no-token branch —
 * but the test cases exercising the token path bypass `auth()` entirely.
 *
 * Critical regression — under `DISABLE_GITHUB_OAUTH=true` the `auth()`
 * wrapper returns a fake passing session, so the route's three-branch
 * auth logic MUST reject invalid tokens explicitly rather than fall
 * through to `auth()`. This file exercises that regression at the
 * integration boundary.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _resetSigningSecretCacheForTests,
  activeSigningSecret,
  ensureBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as mintPOST } from '../../../apps/web/app/api/bootstrap/asset-token/route';
import { GET as rawGET } from '../../../apps/web/app/api/workspaces/[slug]/files/raw/route';
import { _resetForTests as _resetBootstrapCache } from '../../../apps/web/src/lib/bootstrap-code';

function mintReq(worktree: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/bootstrap/asset-token', {
    method: 'POST',
    body: JSON.stringify({ worktree }),
    headers: { 'content-type': 'application/json' },
  });
}

function rawReq(query: Record<string, string>, slug = 'test-ws'): NextRequest {
  const url = new URL(`http://localhost:3000/api/workspaces/${slug}/files/raw`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET' });
}

function rawCtx(slug = 'test-ws'): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

describe('FX011 raw-file route asset-token integration', () => {
  let cwd: string;
  let workspaceRoot: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;
  let originalDisableGithub: string | undefined;
  let originalDisableAuth: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    originalDisableGithub = process.env.DISABLE_GITHUB_OAUTH;
    originalDisableAuth = process.env.DISABLE_AUTH;
    // biome-ignore lint/performance/noDelete: tests need to truly unset
    delete process.env.AUTH_SECRET;
    // biome-ignore lint/performance/noDelete: tests need to truly unset
    delete process.env.DISABLE_GITHUB_OAUTH;
    // biome-ignore lint/performance/noDelete: tests need to truly unset — local shells often have DISABLE_AUTH=true
    delete process.env.DISABLE_AUTH;

    cwd = mkdtempSync(join(tmpdir(), 'fx011-int-'));
    // Need a workspace marker for findWorkspaceRoot() to resolve cwd.
    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - "."\n');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    ensureBootstrapCode(cwd);

    // Create a real file the raw route can stream.
    workspaceRoot = mkdtempSync(join(tmpdir(), 'fx011-wt-'));
    writeFileSync(join(workspaceRoot, 'hello.txt'), 'hello world', 'utf-8');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) {
      // biome-ignore lint/performance/noDelete: tests need to truly unset
      delete process.env.AUTH_SECRET;
    } else process.env.AUTH_SECRET = originalAuthSecret;
    if (originalDisableGithub === undefined) {
      // biome-ignore lint/performance/noDelete: tests need to truly unset
      delete process.env.DISABLE_GITHUB_OAUTH;
    } else process.env.DISABLE_GITHUB_OAUTH = originalDisableGithub;
    if (originalDisableAuth === undefined) {
      // biome-ignore lint/performance/noDelete: tests need to truly unset
      delete process.env.DISABLE_AUTH;
    } else process.env.DISABLE_AUTH = originalDisableAuth;
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('mints a token via real endpoint, fetches raw-file with token (no cookie) → 200 + bytes', async () => {
    // Mint
    const mintRes = await mintPOST(mintReq(workspaceRoot));
    expect(mintRes.status).toBe(200);
    const { token } = (await mintRes.json()) as { token: string };
    expect(token).toBeTruthy();

    // Fetch raw with token (no cookie, no Auth.js session)
    const rawRes = await rawGET(
      rawReq({ worktree: workspaceRoot, file: 'hello.txt', _at: token }),
      rawCtx()
    );
    expect(rawRes.status).toBe(200);
    const text = await rawRes.text();
    expect(text).toBe('hello world');
  });

  it('mangled token (1-char flip) → 401 explicit (no fallthrough)', async () => {
    const mintRes = await mintPOST(mintReq(workspaceRoot));
    const { token } = (await mintRes.json()) as { token: string };
    const mangled = `${token.slice(0, -1)}${token.slice(-1) === 'A' ? 'B' : 'A'}`;

    const rawRes = await rawGET(
      rawReq({ worktree: workspaceRoot, file: 'hello.txt', _at: mangled }),
      rawCtx()
    );
    expect(rawRes.status).toBe(401);
  });

  it('CRITICAL: under DISABLE_GITHUB_OAUTH=true, mangled token still rejects (no fake-session bypass)', async () => {
    // This is the load-bearing regression-lock from FX011 validation.
    // auth() returns a fake passing session when OAuth is disabled —
    // the route's three-branch logic must therefore NOT fall back to
    // auth() on invalid token.
    process.env.DISABLE_GITHUB_OAUTH = 'true';

    const mintRes = await mintPOST(mintReq(workspaceRoot));
    const { token } = (await mintRes.json()) as { token: string };
    const mangled = `${token.slice(0, -1)}${token.slice(-1) === 'A' ? 'B' : 'A'}`;

    const rawRes = await rawGET(
      rawReq({ worktree: workspaceRoot, file: 'hello.txt', _at: mangled }),
      rawCtx()
    );
    expect(rawRes.status).toBe(401);
  });

  it('wrong-worktree token → 401', async () => {
    const otherWt = mkdtempSync(join(tmpdir(), 'fx011-other-'));
    try {
      const mintRes = await mintPOST(mintReq(otherWt));
      const { token } = (await mintRes.json()) as { token: string };
      const rawRes = await rawGET(
        rawReq({ worktree: workspaceRoot, file: 'hello.txt', _at: token }),
        rawCtx()
      );
      expect(rawRes.status).toBe(401);
    } finally {
      rmSync(otherWt, { recursive: true, force: true });
    }
  });

  it('query-param order invariance: ?_at=X&worktree=W&file=F same result as reversed order', async () => {
    const mintRes = await mintPOST(mintReq(workspaceRoot));
    const { token } = (await mintRes.json()) as { token: string };

    // Order A
    const url1 = new URL('http://localhost:3000/api/workspaces/test-ws/files/raw');
    url1.searchParams.set('_at', token);
    url1.searchParams.set('worktree', workspaceRoot);
    url1.searchParams.set('file', 'hello.txt');
    const res1 = await rawGET(new NextRequest(url1.toString()), rawCtx());

    // Order B
    const url2 = new URL('http://localhost:3000/api/workspaces/test-ws/files/raw');
    url2.searchParams.set('file', 'hello.txt');
    url2.searchParams.set('_at', token);
    url2.searchParams.set('worktree', workspaceRoot);
    const res2 = await rawGET(new NextRequest(url2.toString()), rawCtx());

    expect(res1.status).toBe(res2.status);
    expect(res1.status).toBe(200);
  });

  it('expired token → 401', async () => {
    // Forge an expired token under the real key.
    const { createHmac } = await import('node:crypto');
    const key = activeSigningSecret(cwd);
    const expSecs = Math.floor(Date.now() / 1000) - 60;
    const hmac = createHmac('sha256', key)
      .update(`asset:${workspaceRoot}:${expSecs}`, 'utf-8')
      .digest('base64url');
    const expired = `${expSecs}.${hmac}`;

    const rawRes = await rawGET(
      rawReq({ worktree: workspaceRoot, file: 'hello.txt', _at: expired }),
      rawCtx()
    );
    expect(rawRes.status).toBe(401);
  });

  // NOTE: "no _at param → handler calls auth() → 401" is NOT exercised here.
  // `auth()` requires a real Next.js request scope (`async headers()` storage)
  // that vitest can't provide outside of a running dev server. The no-cookie
  // branch is covered upstream by `proxy.test.ts` (`bootstrapCookieStage`
  // returns `cookie-missing-api` 401 BEFORE the handler runs). Defense-in-
  // depth is the only thing this would prove, and Next.js makes it
  // structurally untestable here.
});
