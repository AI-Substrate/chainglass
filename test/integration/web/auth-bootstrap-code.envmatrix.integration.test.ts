/**
 * @vitest-environment node
 *
 * Plan 084 Phase 7 T007 — env-var matrix integration test.
 *
 * **Scope**: 6 test cases total = 5 auth-pass cells (C1–C5) + 1 hard-fail boot
 * cell (HF1). Each auth-pass cell exercises three gating layers end-to-end:
 *   1. `checkBootstrapMisconfiguration(env)` — boot would proceed (ok: true)
 *   2. `requireLocalAuth(req)` — composite cookie/X-Local-Token gate behaves correctly
 *   3. `isOAuthDisabled()` — OAuth-disabled flag propagates as expected
 *
 * The hard-fail cell exercises `checkBootstrapMisconfiguration` directly and
 * asserts `{ ok: false, reason }` shape — Phase 2 already covers `process.exit(1)`
 * integration so we deliberately do NOT spawn an actual process here.
 *
 * **AC coverage**: AC-11, AC-12, AC-13, AC-14, AC-20, AC-21, AC-26.
 *
 * **Constitution P4**: real fs (`mkdtempSync` + `setupBootstrapTestEnv`), real
 * crypto, real `NextRequest`, no `vi.mock` of own-domain internals. Only
 * `vi.spyOn(console, 'warn')` (sanctioned for log-discipline assertions per
 * Phase 6 precedent) and `vi.resetModules()` (sanctioned per Phase 5
 * `auth.test.ts` precedent for HMR-safe warn-once).
 *
 * **Cell counting** (per validator M3):
 *   C1: AUTH_SECRET=set,   DISABLE_GITHUB_OAUTH=unset            → bootstrap ON, OAuth ON  (AC-12)
 *   C2: AUTH_SECRET=set,   DISABLE_GITHUB_OAUTH=true             → bootstrap ON, OAuth OFF (AC-11, AC-14)
 *   C3: AUTH_SECRET=unset, DISABLE_GITHUB_OAUTH=true             → bootstrap ON via HKDF, OAuth OFF (AC-13)
 *   C4: AUTH_SECRET=set,   DISABLE_AUTH=true (legacy alone)      → behaves like C2 + 1 deprecation warn (AC-21)
 *   C5: AUTH_SECRET=set,   DISABLE_AUTH=true AND DISABLE_GITHUB_OAUTH=true → behaves like C2 + 1 warn (legacy still observed)
 *   HF1: AUTH_SECRET=unset, DISABLE_GITHUB_OAUTH=unset            → boot hard-fails (AC-20, AC-26 setup)
 */
import {
  BOOTSTRAP_COOKIE_NAME,
  buildCookieValue,
  activeSigningSecret,
} from '@chainglass/shared/auth-bootstrap-code';
import { writeServerInfo } from '@chainglass/shared/event-popper';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkBootstrapMisconfiguration } from '../../../apps/web/src/auth-bootstrap/boot';
import { bootstrapCookieStage } from '../../../apps/web/proxy';
import { requireLocalAuth } from '../../../apps/web/src/lib/local-auth';

import { setupBootstrapTestEnv } from '../../helpers/auth-bootstrap-code';

const URL = 'http://localhost:3000/api/event-popper/list';
const FLAG_KEY = '__CHAINGLASS_DISABLE_AUTH_WARNED';

interface ReqOptions {
  cookieValue?: string;
  remote?: boolean;
}

function makeReq(opts: ReqOptions = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.remote === true) {
    headers['x-forwarded-for'] = '203.0.113.4';
    headers.host = '203.0.113.4:3000';
  } else {
    headers['x-forwarded-for'] = '127.0.0.1';
    headers.host = 'localhost:3000';
  }
  if (opts.cookieValue !== undefined) {
    headers.cookie = `${BOOTSTRAP_COOKIE_NAME}=${opts.cookieValue}`;
  }
  return new NextRequest(URL, { method: 'GET', headers });
}

/**
 * Reset the shared env-var + globalThis warn flag so each cell starts from a
 * known state. Mirrors the Phase 5 `auth.test.ts` setup pattern.
 */
function resetEnvAndFlags(): void {
  delete process.env.AUTH_SECRET;
  delete process.env.DISABLE_AUTH;
  delete process.env.DISABLE_GITHUB_OAUTH;
  delete (globalThis as Record<string, unknown>)[FLAG_KEY];
}

describe('Plan 084 env-var matrix (Phase 7 T007)', () => {
  let env: ReturnType<typeof setupBootstrapTestEnv>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let originalAuthSecret: string | undefined;
  let originalDisableAuth: string | undefined;
  let originalDisableGithub: string | undefined;

  beforeEach(() => {
    originalAuthSecret = process.env.AUTH_SECRET;
    originalDisableAuth = process.env.DISABLE_AUTH;
    originalDisableGithub = process.env.DISABLE_GITHUB_OAUTH;
    resetEnvAndFlags();
    env = setupBootstrapTestEnv();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    env.cleanup();
    warnSpy.mockRestore();
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
    if (originalDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = originalDisableAuth;
    if (originalDisableGithub === undefined) delete process.env.DISABLE_GITHUB_OAUTH;
    else process.env.DISABLE_GITHUB_OAUTH = originalDisableGithub;
    delete (globalThis as Record<string, unknown>)[FLAG_KEY];
  });

  /**
   * Helper: re-import auth.ts under the current process.env snapshot so
   * `isOAuthDisabled()` reads the freshly-mutated env. Mirrors Phase 5
   * auth.test.ts pattern (vi.resetModules + dynamic import).
   */
  async function loadIsOAuthDisabled(): Promise<() => boolean> {
    const mod = await import('../../../apps/web/src/auth');
    return mod.isOAuthDisabled;
  }

  it('C1: AUTH_SECRET=set, DISABLE_GITHUB_OAUTH=unset → bootstrap ON + OAuth ON (AC-12)', async () => {
    process.env.AUTH_SECRET = 'test-secret-c1-12345678901234567890';

    // (1) Boot would proceed
    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });

    // (2) Bootstrap cookie gate works — valid cookie → ok via cookie
    const key = activeSigningSecret(env.cwd);
    const cookieValue = buildCookieValue(env.code, key);
    const okResult = await requireLocalAuth(makeReq({ cookieValue }));
    expect(okResult).toEqual({ ok: true, via: 'cookie' });

    // ...and missing cookie → no-credential
    const missing = await requireLocalAuth(makeReq());
    expect(missing).toEqual({ ok: false, reason: 'no-credential' });

    // ...and non-localhost → not-localhost (regardless of cookie)
    const remote = await requireLocalAuth(makeReq({ remote: true, cookieValue }));
    expect(remote).toEqual({ ok: false, reason: 'not-localhost' });

    // (3) OAuth disabled flag is FALSE
    const isOAuthDisabled = await loadIsOAuthDisabled();
    expect(isOAuthDisabled()).toBe(false);

    // No deprecation warn fired (no legacy alias observed)
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('C2: AUTH_SECRET=set, DISABLE_GITHUB_OAUTH=true → bootstrap ON, OAuth OFF (AC-11, AC-14)', async () => {
    process.env.AUTH_SECRET = 'test-secret-c2-12345678901234567890';
    process.env.DISABLE_GITHUB_OAUTH = 'true';

    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });

    const key = activeSigningSecret(env.cwd);
    const cookieValue = buildCookieValue(env.code, key);
    const okResult = await requireLocalAuth(makeReq({ cookieValue }));
    expect(okResult).toEqual({ ok: true, via: 'cookie' });

    const isOAuthDisabled = await loadIsOAuthDisabled();
    expect(isOAuthDisabled()).toBe(true);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('C3: AUTH_SECRET=unset, DISABLE_GITHUB_OAUTH=true → bootstrap ON via HKDF, OAuth OFF (AC-13)', async () => {
    process.env.DISABLE_GITHUB_OAUTH = 'true';

    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });

    // HKDF path: activeSigningSecret returns a Buffer derived from the bootstrap code
    const key = activeSigningSecret(env.cwd);
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBeGreaterThan(0);

    const cookieValue = buildCookieValue(env.code, key);
    const okResult = await requireLocalAuth(makeReq({ cookieValue }));
    expect(okResult).toEqual({ ok: true, via: 'cookie' });

    const isOAuthDisabled = await loadIsOAuthDisabled();
    expect(isOAuthDisabled()).toBe(true);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('C4: AUTH_SECRET=set, DISABLE_AUTH=true (legacy alias alone) → behaves like C2 + exactly one deprecation warn (AC-21)', async () => {
    process.env.AUTH_SECRET = 'test-secret-c4-12345678901234567890';
    process.env.DISABLE_AUTH = 'true';

    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });

    const isOAuthDisabled = await loadIsOAuthDisabled();
    expect(isOAuthDisabled()).toBe(true);

    // First call fires the warn
    isOAuthDisabled();
    // Second call: warn-once flag prevents duplicate
    isOAuthDisabled();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[auth] DISABLE_AUTH is deprecated; use DISABLE_GITHUB_OAUTH instead. Will be removed in next release.',
    );

    // Bootstrap gate still ON
    const key = activeSigningSecret(env.cwd);
    const cookieValue = buildCookieValue(env.code, key);
    const okResult = await requireLocalAuth(makeReq({ cookieValue }));
    expect(okResult).toEqual({ ok: true, via: 'cookie' });
  });

  it('C5: AUTH_SECRET=set, DISABLE_AUTH=true AND DISABLE_GITHUB_OAUTH=true → behaves like C2 + warn fires once (legacy still observed)', async () => {
    process.env.AUTH_SECRET = 'test-secret-c5-12345678901234567890';
    process.env.DISABLE_AUTH = 'true';
    process.env.DISABLE_GITHUB_OAUTH = 'true';

    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });

    const isOAuthDisabled = await loadIsOAuthDisabled();
    expect(isOAuthDisabled()).toBe(true);

    // Both names true → newName=true OR legacyName=true → returns true
    // legacyName observed → warn-once still fires (alias was seen)
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[auth] DISABLE_AUTH is deprecated; use DISABLE_GITHUB_OAUTH instead. Will be removed in next release.',
    );

    // Bootstrap gate still ON
    const key = activeSigningSecret(env.cwd);
    const cookieValue = buildCookieValue(env.code, key);
    const okResult = await requireLocalAuth(makeReq({ cookieValue }));
    expect(okResult).toEqual({ ok: true, via: 'cookie' });
  });

  it('HF1: AUTH_SECRET=unset, DISABLE_GITHUB_OAUTH=unset → boot misconfig hard-fail (AC-20)', () => {
    // env is intentionally clean (no AUTH_SECRET, no disable flags)
    const result = checkBootstrapMisconfiguration(process.env);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toContain('GitHub OAuth is enabled but AUTH_SECRET is unset');
      expect(result.reason).toContain('DISABLE_GITHUB_OAUTH=true');
    }
  });

  it('HF1 supplementary: AUTH_SECRET=whitespace-only is still treated as unset (Phase 2 contract)', () => {
    process.env.AUTH_SECRET = '   \t\n  ';
    const result = checkBootstrapMisconfiguration(process.env);
    expect(result.ok).toBe(false);
  });

  it('case-sensitivity: DISABLE_AUTH=TRUE (uppercase) is NOT recognised — boot still hard-fails per AC-20', () => {
    process.env.DISABLE_AUTH = 'TRUE'; // not literal lowercase 'true'
    const result = checkBootstrapMisconfiguration(process.env);
    // GitHub OAuth still considered ON because the literal-'true' check fails
    expect(result.ok).toBe(false);
  });

  // ── F002 fix (Phase 7 minih review) — token-only proxy-stage regression ──
  // Plan 084 Phase 5 originally gated /api/event-popper/* and /api/tmux/events
  // through the cookie gate first, then requireLocalAuth in the route handler.
  // T008 surfaced that a CLI request sending only X-Local-Token (no cookie)
  // got 401 bootstrap-required from the proxy BEFORE requireLocalAuth could
  // run. F001 fix: add /api/event-popper and /api/tmux/events to
  // AUTH_BYPASS_ROUTES so the route handler is the single gate. These tests
  // guard that contract — keep the env-matrix suite from going green when
  // the proxy regresses.

  it('F001 regression: /api/event-popper/* is a proxy bypass — token-only requests reach requireLocalAuth (AC-17)', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001-12345678901234567890';

    // Token-only request to a sink — no cookie. Proxy MUST bypass.
    const sinkReq = new NextRequest('http://localhost:3000/api/event-popper/list', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '127.0.0.1',
        host: 'localhost:3000',
        'x-local-token': 'whatever-token-value',
      },
    });
    const proxyDecision = await bootstrapCookieStage(sinkReq);
    expect(proxyDecision).toBe('bypass');

    // Same for /api/tmux/events
    const tmuxReq = new NextRequest('http://localhost:3000/api/tmux/events', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '127.0.0.1',
        host: 'localhost:3000',
        'x-local-token': 'whatever-token-value',
      },
    });
    const tmuxDecision = await bootstrapCookieStage(tmuxReq);
    expect(tmuxDecision).toBe('bypass');
  });

  it('F001 regression: /api/event-popper sub-paths are bypassed (prefix matching)', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001b-1234567890123456789';
    for (const path of [
      '/api/event-popper/list',
      '/api/event-popper/ask-question',
      '/api/event-popper/answer-question/some-id',
      '/api/event-popper/send-alert',
      '/api/event-popper/dismiss/some-id',
    ]) {
      const req = new NextRequest(`http://localhost:3000${path}`, {
        method: 'GET',
        headers: { host: 'localhost:3000' },
      });
      expect(await bootstrapCookieStage(req)).toBe('bypass');
    }
  });

  it('F001 regression: non-sink API routes are STILL gated by the cookie (no over-broad bypass)', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001c-1234567890123456789';
    // /api/events (SSE — needs session auth, NOT a sink) — must NOT bypass
    const sseReq = new NextRequest('http://localhost:3000/api/events/some-channel', {
      method: 'GET',
      headers: { host: 'localhost:3000' },
    });
    const decision = await bootstrapCookieStage(sseReq);
    // No cookie + non-bypass + API → cookie-missing-api → 401 NextResponse
    expect(decision).not.toBe('bypass');
    expect(decision).not.toBe('proceed');
    if (decision !== 'bypass' && decision !== 'proceed') {
      expect(decision.status).toBe(401);
    }

    // /api/terminal/token — needs cookie (browser flow) — must NOT bypass
    const tokenReq = new NextRequest('http://localhost:3000/api/terminal/token', {
      method: 'GET',
      headers: { host: 'localhost:3000' },
    });
    const tokenDecision = await bootstrapCookieStage(tokenReq);
    expect(tokenDecision).not.toBe('bypass');
  });

  // ── F001 round 3 (post-minih-review-3) — token-validated short-circuit ──
  // Round 2 trusted any non-empty X-Local-Token on localhost; minih flagged
  // that as a CRITICAL security regression because dashboard pages don't call
  // `auth()` themselves. Round 3 validates the header value against the
  // `localToken` field of `.chainglass/server.json` via constant-time compare
  // (same source `requireLocalAuth` validates against). Wrong/missing token
  // falls through to the cookie gate. These tests guard that contract — keep
  // the env-matrix suite from going green if the bypass becomes permissive
  // again.

  /**
   * Write a real `.chainglass/server.json` into the env's cwd so the proxy
   * can read it via `findWorkspaceRoot(process.cwd())` → `readServerInfo()`.
   * Uses the test process's own pid + a fresh ISO timestamp so the
   * PID-liveness + recycle-detection checks pass.
   */
  function writeTestServerInfo(token: string): void {
    writeServerInfo(env.cwd, {
      port: 3000,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      localToken: token,
    });
  }

  it('F001 round 3: workflow execution + matching X-Local-Token + localhost → bypass', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001-r3a-1234567890123456';
    const recordedToken = 'recorded-cli-token-aaaaaaaaaaaaaaaa';
    writeTestServerInfo(recordedToken);
    const req = new NextRequest(
      'http://localhost:3000/api/workspaces/my-ws/workflows/g1/execution/run',
      {
        method: 'POST',
        headers: {
          'x-forwarded-for': '127.0.0.1',
          host: 'localhost:3000',
          'x-local-token': recordedToken,
        },
      },
    );
    expect(await bootstrapCookieStage(req)).toBe('bypass');
  });

  it('F001 round 3: detailed route + matching X-Local-Token + localhost → bypass', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001-r3b-1234567890123456';
    const recordedToken = 'recorded-detailed-token-bbbbbbbbbbbb';
    writeTestServerInfo(recordedToken);
    const req = new NextRequest(
      'http://localhost:3000/api/workspaces/my-ws/workflows/g1/detailed',
      {
        method: 'GET',
        headers: {
          'x-forwarded-for': '127.0.0.1',
          host: 'localhost:3000',
          'x-local-token': recordedToken,
        },
      },
    );
    expect(await bootstrapCookieStage(req)).toBe('bypass');
  });

  it('F001 round 3 (negative): same-length but wrong X-Local-Token does NOT bypass', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001-r3c-1234567890123456';
    const recordedToken = 'recorded-cli-token-cccccccccccccccc';
    // Same length, different bytes — must defeat any naive non-empty check.
    const forgedToken = 'forged-by-attacker-cccccccccccccccc';
    expect(forgedToken.length).toBe(recordedToken.length);
    writeTestServerInfo(recordedToken);
    const req = new NextRequest(
      'http://localhost:3000/api/workspaces/my-ws/workflows/g1/execution/run',
      {
        method: 'POST',
        headers: {
          'x-forwarded-for': '127.0.0.1',
          host: 'localhost:3000',
          'x-local-token': forgedToken,
        },
      },
    );
    const decision = await bootstrapCookieStage(req);
    expect(decision).not.toBe('bypass');
    // Falls through to the cookie gate — no cookie on this request → 401.
    if (decision !== 'bypass' && decision !== 'proceed') {
      expect(decision.status).toBe(401);
    }
  });

  it('F001 round 3 (negative): X-Local-Token with NO server.json on disk does NOT bypass', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001-r3d-1234567890123456';
    // Deliberately do NOT write server.json — the proxy must not bypass.
    const req = new NextRequest(
      'http://localhost:3000/api/workspaces/my-ws/workflows/g1/detailed',
      {
        method: 'GET',
        headers: {
          'x-forwarded-for': '127.0.0.1',
          host: 'localhost:3000',
          'x-local-token': 'whatever-token-value',
        },
      },
    );
    const decision = await bootstrapCookieStage(req);
    expect(decision).not.toBe('bypass');
  });

  it('F001 round 3: X-Local-Token from a NON-localhost origin is NOT short-circuited', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001-r3e-1234567890123456';
    const recordedToken = 'recorded-cli-token-eeeeeeeeeeeeeeee';
    writeTestServerInfo(recordedToken);
    // Non-loopback XFF — isLocalhostRequest returns false even with the
    // matching token, so we never even reach the readServerInfo step.
    const req = new NextRequest(
      'http://example.com/api/workspaces/my-ws/workflows/g1/execution/run',
      {
        method: 'POST',
        headers: {
          'x-forwarded-for': '203.0.113.4',
          host: 'example.com',
          'x-local-token': recordedToken,
        },
      },
    );
    const decision = await bootstrapCookieStage(req);
    expect(decision).not.toBe('bypass');
    if (decision !== 'bypass' && decision !== 'proceed') {
      expect(decision.status).toBe(401);
    }
  });

  it('F001 round 3: empty X-Local-Token is treated as no token (cookie path runs)', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001-r3f-1234567890123456';
    writeTestServerInfo('any-recorded-token-ffffffffffffffff');
    const req = new NextRequest('http://localhost:3000/api/workspaces/my-ws/workflows/g1/detailed', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '127.0.0.1',
        host: 'localhost:3000',
        'x-local-token': '',
      },
    });
    // Empty token → falsy → short-circuit skipped → cookie gate runs → 401
    const decision = await bootstrapCookieStage(req);
    expect(decision).not.toBe('bypass');
  });

  it('F001 round 4: cwd-only `server.json` layout (legacy non-relocated launch) → token bypasses (matches `_resolve-worktree.ts` fallback chain)', async () => {
    // Round 3 only walked up to the workspace root; `_resolve-worktree.ts`
    // (`authenticateRequest`) also accepts `server.json` at `process.cwd()`
    // for back-compat. minih round 3 reproduced: server.json only at cwd →
    // route handler would accept the token, but proxy returned 401 first.
    // Round 4 mirrors the same cwd → workspaceRoot fallback in the proxy.
    process.env.AUTH_SECRET = 'test-secret-f001-r4-12345678901234567';
    const recordedToken = 'recorded-cwd-only-token-zzzzzzzzzzzz';
    // env.cwd IS process.cwd() because setupBootstrapTestEnv chdirs to it.
    // Writing server.json directly at env.cwd exercises the cwd-first branch.
    writeServerInfo(env.cwd, {
      port: 3000,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      localToken: recordedToken,
    });
    const req = new NextRequest(
      'http://localhost:3000/api/workspaces/my-ws/workflows/g1/execution/run',
      {
        method: 'POST',
        headers: {
          'x-forwarded-for': '127.0.0.1',
          host: 'localhost:3000',
          'x-local-token': recordedToken,
        },
      },
    );
    expect(await bootstrapCookieStage(req)).toBe('bypass');
  });

  it('F001 round 3 (defence-in-depth): page route + bypass attempt without matching token returns NextResponse.next() (cookie-missing-page), NOT bypass', async () => {
    process.env.AUTH_SECRET = 'test-secret-f001-r3g-1234567890123456';
    writeTestServerInfo('the-only-valid-token-gggggggggggggggg');
    // A non-API page (e.g. /dashboard) with a forged token must still be
    // gated by the cookie path. Even though page routes return next() rather
    // than 401, the OAuth chain that runs after must still see the request
    // (i.e. NOT 'bypass').
    const req = new NextRequest('http://localhost:3000/dashboard', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '127.0.0.1',
        host: 'localhost:3000',
        'x-local-token': 'forged-token-mismatched-length',
      },
    });
    const decision = await bootstrapCookieStage(req);
    expect(decision).not.toBe('bypass');
  });
});
