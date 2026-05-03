// @vitest-environment node
/**
 * Plan 084 Phase 4 — T003 unit tests for `GET /api/terminal/token`.
 *
 * Constitution P3 (TDD) + P4 (no vi.mock — NextRequest constructed manually,
 * real route handler, real `node:crypto` + `jose`, real fs in temp cwd).
 *
 * Session faking: `DISABLE_AUTH=true` short-circuits `auth()` to a fake
 * session (`{ user: { name: 'debug', email: 'debug@local' } }`). This is the
 * production-proven path used by Phase 3 integration tests. We do NOT add a
 * test seam to `apps/web/src/auth.ts`.
 *
 * The "no NextAuth session" branch is covered by Phase 7 e2e tests — calling
 * the real NextAuth `auth()` from a unit test requires NextAuth env vars and
 * is out of scope here.
 */
import { rmSync } from 'node:fs';

import { TERMINAL_JWT_AUDIENCE, TERMINAL_JWT_ISSUER } from '@/features/064-terminal/server/terminal-ws';
import {
  BOOTSTRAP_COOKIE_NAME,
  _resetSigningSecretCacheForTests,
  activeSigningSecret,
  buildCookieValue,
  ensureBootstrapCode,
  findWorkspaceRoot,
} from '@chainglass/shared/auth-bootstrap-code';
import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { _resetForTests as _resetBootstrapCache } from '../../../../../apps/web/src/lib/bootstrap-code';
import { GET } from '../../../../../apps/web/app/api/terminal/token/route';
import { mkTempCwd } from '../../../shared/auth-bootstrap-code/test-fixtures';

const URL = 'http://localhost:3000/api/terminal/token';

function reqWithCookie(cookieValue: string | undefined): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue !== undefined) {
    headers.cookie = `${BOOTSTRAP_COOKIE_NAME}=${cookieValue}`;
  }
  return new NextRequest(URL, { method: 'GET', headers });
}

describe('GET /api/terminal/token', () => {
  let cwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;
  let originalDisableAuth: string | undefined;
  let activeCode: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    originalDisableAuth = process.env.DISABLE_AUTH;
    delete process.env.AUTH_SECRET;
    process.env.DISABLE_AUTH = 'true'; // Fake session via the auth.ts wrapper.
    cwd = mkTempCwd('terminal-token-route-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    activeCode = ensureBootstrapCode(cwd).data.code;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
    if (originalDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = originalDisableAuth;
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns 401 when no chainglass-bootstrap cookie is present (cookie pre-check)', async () => {
    // Why: AC-15 — defence-in-depth on top of the proxy gate. Even with a
    // valid NextAuth session, the route must reject when the bootstrap cookie
    // is missing.
    const res = await GET(reqWithCookie(undefined));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 401 when the cookie is tampered (bad HMAC)', async () => {
    // Why: verifyCookieValue is timing-safe HMAC; tampered cookies fail.
    const res = await GET(reqWithCookie('not-a-real-hmac-signed-cookie-value-at-all'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the cookie was signed for a different code (rotation invalidation)', async () => {
    // Why: rotating the active code invalidates all existing cookies.
    const key = activeSigningSecret(cwd);
    const wrongCookie = buildCookieValue('FAKE-CODE-XXXX', key);
    const res = await GET(reqWithCookie(wrongCookie));
    expect(res.status).toBe(401);
  });

  it('returns 200 + JWT with iss/aud/cwd/sub claims when both session AND cookie are valid', async () => {
    // Why: Findings 05 + 07 — JWTs must carry iss/aud/cwd. Sub from session.
    // process.cwd() returns the resolved path (macOS may resolve /var → /private/var
    // symlinks), so use it (matching what the route uses).
    const expectedCwd = findWorkspaceRoot(process.cwd());
    const key = activeSigningSecret(cwd);
    const cookie = buildCookieValue(activeCode, key);

    const res = await GET(reqWithCookie(cookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);

    const verifyResult = await jwtVerify(body.token, key);
    expect(verifyResult.payload.iss).toBe(TERMINAL_JWT_ISSUER);
    expect(verifyResult.payload.aud).toBe(TERMINAL_JWT_AUDIENCE);
    expect(verifyResult.payload.cwd).toBe(expectedCwd);
    expect(verifyResult.payload.sub).toBe('debug'); // From DISABLE_AUTH fake session.
    expect(typeof verifyResult.payload.iat).toBe('number');
    expect(typeof verifyResult.payload.exp).toBe('number');
    expect(verifyResult.payload.exp! - verifyResult.payload.iat!).toBeGreaterThan(60); // > 1min
  });

  it('signs the JWT with activeSigningSecret(cwd) — Buffer-direct (HKDF path under AUTH_SECRET unset)', async () => {
    // Why: validate-v2 fix — Buffer key passed directly to jose, no
    // TextEncoder re-wrap. With AUTH_SECRET unset, the HKDF Buffer is the
    // signing key; the verifier must accept it byte-identical.
    const key = activeSigningSecret(cwd);
    const cookie = buildCookieValue(activeCode, key);
    const res = await GET(reqWithCookie(cookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    // If the route accidentally re-encoded the key via TextEncoder, jwtVerify
    // with the raw HKDF Buffer would fail. We assert it succeeds.
    await expect(jwtVerify(body.token, key)).resolves.toBeTruthy();
  });

  it('honours AUTH_SECRET when set (parity path; same Buffer-direct rule)', async () => {
    process.env.AUTH_SECRET = 'parity-test-secret-32-bytes-long';
    _resetSigningSecretCacheForTests();
    _resetBootstrapCache();
    const key = activeSigningSecret(cwd);
    const cookie = buildCookieValue(activeCode, key);
    const res = await GET(reqWithCookie(cookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    const verifyResult = await jwtVerify(body.token, key);
    expect(verifyResult.payload.sub).toBe('debug');
  });
});
