/**
 * Plan 084 FX011 — unit tests for `POST /api/bootstrap/asset-token`.
 *
 * Constitution P3 (TDD) + P4 (no vi.mock — real NextRequest, real route
 * handler, real fs in temp cwd, real HMAC). Mirrors the verify-route test
 * pattern at `test/unit/web/api/bootstrap/verify.test.ts`.
 *
 * Cookie-missing 401 is enforced by the proxy layer (NOT this route handler),
 * so it's covered in the integration envmatrix test, not here.
 */
import {
  _resetSigningSecretCacheForTests,
  ensureBootstrapCode,
  verifyAssetToken,
} from '@chainglass/shared/auth-bootstrap-code';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mkTempCwd } from '../../../shared/auth-bootstrap-code/test-fixtures';

import { POST } from '../../../../../apps/web/app/api/bootstrap/asset-token/route';
import { _resetForTests as _resetBootstrapCache } from '../../../../../apps/web/src/lib/bootstrap-code';

const URL = 'http://localhost:3000/api/bootstrap/asset-token';

function reqWithBody(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/bootstrap/asset-token', () => {
  let cwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    // biome-ignore lint/performance/noDelete: tests need to truly unset
    delete process.env.AUTH_SECRET;
    cwd = mkTempCwd('asset-token-route-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    ensureBootstrapCode(cwd);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) {
      // biome-ignore lint/performance/noDelete: tests need to truly unset
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it('returns 200 + a verifiable token for a valid absolute-path worktree', async () => {
    const worktree = '/Users/test/some/workspace';
    const res = await POST(reqWithBody({ worktree }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; expiresAt?: number };
    expect(body.token).toBeTruthy();
    expect(body.expiresAt).toBeGreaterThan(Date.now());
    expect(body.expiresAt).toBeLessThanOrEqual(Date.now() + 11 * 60 * 1000);

    // Round-trip: the returned token must verify under the same key.
    const { activeSigningSecret } = await import('@chainglass/shared/auth-bootstrap-code');
    const key = activeSigningSecret(cwd);
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAssetToken(body.token, worktree, key, now)).toBe(true);
  });

  it('returns 400 on missing body field', async () => {
    const res = await POST(reqWithBody({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad-request' });
  });

  it('returns 400 on empty-string worktree', async () => {
    const res = await POST(reqWithBody({ worktree: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on relative worktree (no leading slash)', async () => {
    const res = await POST(reqWithBody({ worktree: 'foo/bar' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on dot-prefixed relative worktree', async () => {
    const res = await POST(reqWithBody({ worktree: './foo' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-string worktree', async () => {
    const res = await POST(reqWithBody({ worktree: 123 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed JSON body', async () => {
    const res = await POST(reqWithBody('not-json{'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad-request' });
  });

  it('returns 200 even when path does not exist on disk (mint validates shape only)', async () => {
    // The mint route validates shape, not path existence. Path-traversal
    // and existence are enforced by IPathResolver at the raw-file route.
    const worktree = '/nonexistent/path/on/disk';
    const res = await POST(reqWithBody({ worktree }));
    expect(res.status).toBe(200);
  });
});
