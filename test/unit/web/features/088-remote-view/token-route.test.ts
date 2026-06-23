// @vitest-environment node
/**
 * Plan 088 Phase 2 — T008: GET /api/remote-view/token + committed auth vectors.
 *
 * Same approach as the terminal token route test (Constitution P3/P4 — no
 * vi.mock; NextRequest built manually; real node:crypto + jose + fs in a temp
 * cwd; DISABLE_AUTH=true fakes the NextAuth session). The route is a verbatim
 * copy of the terminal mint (Finding 03) with aud='remote-view-ws' and NO cwd.
 *
 * The auth-vectors block verifies the committed cross-language fixture
 * (test/contracts/remote-view-auth-vectors.json) the Swift verifier (Task 4.4)
 * re-checks byte-identically against the same pinned key.
 *
 * Gate coverage (companion F010): this suite forces DISABLE_AUTH=true to isolate
 * the SECOND gate (the bootstrap cookie). The FIRST gate — `auth()` returns no
 * NextAuth session → 401 — is intentionally NOT unit-tested here, mirroring the
 * terminal token route test (test/unit/web/api/terminal/token.test.ts): exercising
 * the real NextAuth `auth()` requires NextAuth env vars + AUTH_SECRET (which the
 * beforeEach deliberately unsets), so a unit attempt throws rather than yielding a
 * clean 401. That branch is covered by the Phase 7 e2e sweep. The gate itself is
 * the frozen verbatim copy of the terminal route's gate (Finding 03), so its
 * behaviour is shared, not re-implemented.
 */
import { rmSync } from 'node:fs';

import {
  FAKE_DAEMON_PORT,
  type RemoteViewDaemonControl,
  createFakeDaemonControl,
} from '@/features/088-remote-view/server/daemon-control';
import {
  REMOTE_VIEW_JWT_AUDIENCE,
  REMOTE_VIEW_JWT_ISSUER,
} from '@/features/088-remote-view/server/remote-view-auth';
import {
  BOOTSTRAP_COOKIE_NAME,
  _resetSigningSecretCacheForTests,
  activeSigningSecret,
  buildCookieValue,
  ensureBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';
import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The ONLY mock in this file (T001, Phase 6). The real-crypto/auth/fs path stays unmocked
// (Constitution P3/P4); we mock just the DI container so the route's new daemon-port resolution
// returns a FAKE control instead of resolving the production one — which would call ensureDaemon()
// and spawn a real `streamd` (a non-hermetic side-effect in a unit test). vi.hoisted lets the
// per-test `resolveMock` vary (return a port / throw) the way remote-view-routes.test.ts does.
const { resolveMock } = vi.hoisted(() => ({ resolveMock: vi.fn() }));
vi.mock('@/lib/bootstrap-singleton', () => ({ getContainer: () => ({ resolve: resolveMock }) }));

import { GET } from '../../../../../apps/web/app/api/remote-view/token/route';
import { _resetForTests as _resetBootstrapCache } from '../../../../../apps/web/src/lib/bootstrap-code';
import authVectors from '../../../../contracts/remote-view-auth-vectors.json';
import { mkTempCwd } from '../../../shared/auth-bootstrap-code/test-fixtures';

const URL_ = 'http://localhost:3000/api/remote-view/token';

/** Point the mocked container at a specific daemon-control for one test. */
function useControl(control: RemoteViewDaemonControl): void {
  resolveMock.mockReturnValue(control);
}

function reqWithCookie(cookieValue: string | undefined): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue !== undefined) headers.cookie = `${BOOTSTRAP_COOKIE_NAME}=${cookieValue}`;
  return new NextRequest(URL_, { method: 'GET', headers });
}

describe('GET /api/remote-view/token', () => {
  let cwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;
  let originalDisableAuth: string | undefined;
  let activeCode: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    originalDisableAuth = process.env.DISABLE_AUTH;
    // biome-ignore lint/performance/noDelete: tests must truly unset
    delete process.env.AUTH_SECRET;
    process.env.DISABLE_AUTH = 'true';
    cwd = mkTempCwd('remote-view-token-route-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    activeCode = ensureBootstrapCode(cwd).data.code;
    useControl(createFakeDaemonControl()); // default: a healthy fake daemon on FAKE_DAEMON_PORT
  });

  afterEach(() => {
    process.chdir(originalCwd);
    // biome-ignore lint/performance/noDelete: tests must truly unset
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
    // biome-ignore lint/performance/noDelete: tests must truly unset
    if (originalDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = originalDisableAuth;
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns 401 when the bootstrap cookie is missing (defence-in-depth)', async () => {
    /*
    Test Doc:
    - Why: AC-9 — the stream socket must meet the terminal bar; a valid session alone is not enough.
    - Contract: no chainglass-bootstrap cookie → 401.
    - Usage Notes: DISABLE_AUTH fakes the NextAuth session so we isolate the cookie gate.
    - Quality Contribution: proves the second gate of the frozen double-gate contract.
    - Worked Example: GET with no cookie → 401.
    */
    const res = await GET(reqWithCookie(undefined));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the cookie is tampered (bad HMAC)', async () => {
    /*
    Test Doc:
    - Why: a forged/tampered bootstrap cookie must not yield a token.
    - Contract: an invalid cookie value → 401.
    - Usage Notes: verifyCookieValue is timing-safe HMAC.
    - Quality Contribution: covers the tamper path of the cookie gate.
    - Worked Example: GET with garbage cookie → 401.
    */
    const res = await GET(reqWithCookie('not-a-real-hmac-signed-cookie'));
    expect(res.status).toBe(401);
  });

  it('mints a JWT with sub/iss/aud and NO cwd, 5-min expiry, when session + cookie are valid', async () => {
    /*
    Test Doc:
    - Why: Finding 03 — the JWT shape is the contract the Swift verifier checks; remote-view drops the terminal-only cwd claim.
    - Contract: 200 + {token, expiresIn:300}; claims iss=chainglass, aud=remote-view-ws, sub from session, iat/exp ~5min, NO cwd.
    - Usage Notes: verifies with the live HKDF key (Buffer-direct, no TextEncoder re-wrap).
    - Quality Contribution: pins the exact mint shape Task 4.4 mirrors.
    - Worked Example: GET valid → aud 'remote-view-ws', payload.cwd undefined.
    */
    const key = activeSigningSecret(cwd);
    const cookie = buildCookieValue(activeCode, key);
    const res = await GET(reqWithCookie(cookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.expiresIn).toBe(300);
    expect(body.daemonPort).toBe(FAKE_DAEMON_PORT); // T001: additive — the WS base port for the browser

    const { payload } = await jwtVerify(body.token, key);
    expect(payload.iss).toBe(REMOTE_VIEW_JWT_ISSUER);
    expect(payload.aud).toBe(REMOTE_VIEW_JWT_AUDIENCE);
    expect(payload.sub).toBe('debug'); // DISABLE_AUTH fake session
    expect(payload.cwd).toBeUndefined(); // remote-view carries NO cwd claim
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    // biome-ignore lint/style/noNonNullAssertion: asserted numbers above
    expect(payload.exp! - payload.iat!).toBeGreaterThan(60);
  });

  it('still issues the token (200) but OMITS daemonPort when the daemon will not come up (T001 graceful)', async () => {
    /*
    Test Doc:
    - Why: T001 — daemonPort is ADDITIVE + best-effort; a daemon that can't be brought up must NOT
      block token issuance (the client surfaces daemonDown via its own reconnect/health path).
    - Contract: control.daemonPort() throws → 200 + {token, expiresIn:300}, daemonPort undefined.
    - Usage Notes: the route swallows the resolution failure; the JWT path is independent of the daemon.
    - Quality Contribution: pins the back-compat/graceful guarantee — issuance never regresses on daemon-down.
    - Worked Example: a control whose daemonPort() rejects → body.daemonPort === undefined, body.token a string.
    */
    useControl(
      createFakeDaemonControl({
        daemonPort: async () => {
          throw new Error('daemon down');
        },
      })
    );
    const key = activeSigningSecret(cwd);
    const cookie = buildCookieValue(activeCode, key);
    const res = await GET(reqWithCookie(cookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.expiresIn).toBe(300);
    expect(body.daemonPort).toBeUndefined(); // omitted, not a fabricated/zero port
  });

  it('signs Buffer-direct so the raw HKDF key verifies byte-identically (FX003)', async () => {
    /*
    Test Doc:
    - Why: a TextEncoder re-wrap would make the WS verifier's key bytes diverge — the frozen contract forbids it.
    - Contract: jwtVerify with the raw HKDF Buffer succeeds.
    - Usage Notes: AUTH_SECRET unset → the HKDF Buffer is the signing key.
    - Quality Contribution: guards the exact FX003 regression for the new route.
    - Worked Example: GET valid → jwtVerify(token, rawKey) resolves.
    */
    const key = activeSigningSecret(cwd);
    const cookie = buildCookieValue(activeCode, key);
    const res = await GET(reqWithCookie(cookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    await expect(jwtVerify(body.token, key)).resolves.toBeTruthy();
  });
});

describe('remote-view auth vectors (cross-language fixture for Task 4.4)', () => {
  const key = Buffer.from(authVectors.signingKeyHex, 'hex');

  it('accepts the `good` vector and rejects expired / wrong-aud / wrong-key', async () => {
    /*
    Test Doc:
    - Why: the Swift verifier (Task 4.4) re-checks these exact tokens with the same pinned key; the TS side proves they are correct fixtures.
    - Contract: jwtVerify(token, pinnedKey, {issuer, audience}) resolves for `good` and rejects every `valid:false` vector.
    - Usage Notes: pinned key (not the live cwd-derived key) so verification is deterministic across languages.
    - Quality Contribution: locks the cross-language auth baseline before Swift exists.
    - Worked Example: `wrong-aud` (aud=terminal-ws) → rejected by the audience check.
    */
    const opts = { issuer: authVectors.issuer, audience: authVectors.audience };
    for (const v of authVectors.vectors) {
      if (v.valid) {
        const { payload } = await jwtVerify(v.token, key, opts);
        expect(payload.sub).toBe('remote-user');
        expect(payload.aud).toBe(REMOTE_VIEW_JWT_AUDIENCE);
      } else {
        await expect(jwtVerify(v.token, key, opts)).rejects.toBeTruthy();
      }
    }
  });
});
