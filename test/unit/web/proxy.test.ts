/**
 * Plan 084 Phase 3 — T004 unit tests for the proxy cookie-gate helper.
 *
 * Tests the pure `evaluateCookieGate()` helper rather than the full proxy
 * wrapper (which needs Auth.js boot). The proxy callback is a thin shim that
 * calls this helper and translates each `GateDecision` to a NextResponse.
 * Layering is proven via case (e1) — valid cookie → falls through (caller
 * runs auth() chain afterwards).
 *
 * F004 follow-up: also tests `bootstrapCookieStage()` directly to prove
 * bypass routes short-circuit BEFORE `getBootstrapCodeAndKey()` so a
 * missing bootstrap file cannot block `/api/health` or
 * `/api/bootstrap/verify` (the recovery path itself).
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOOTSTRAP_CODE_FILE_PATH_REL,
  BOOTSTRAP_COOKIE_NAME,
  buildCookieValue,
  ensureBootstrapCode,
  _resetSigningSecretCacheForTests,
} from '@chainglass/shared/auth-bootstrap-code';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { _resetForTests as _resetBootstrapCache } from '../../../apps/web/src/lib/bootstrap-code';
import { bootstrapCookieStage } from '../../../apps/web/proxy';
import {
  AUTH_BYPASS_ROUTES,
  evaluateCookieGate,
  isBypassPath,
} from '../../../apps/web/src/lib/cookie-gate';
import { mkTempCwd } from '../shared/auth-bootstrap-code/test-fixtures';

const CODE = '7K2P-9XQM-3T8R';
const KEY = Buffer.from('a'.repeat(64), 'utf-8');
const VALID_COOKIE = buildCookieValue(CODE, KEY);
const codeAndKey = { code: CODE, key: KEY };

function reqLike(pathname: string, cookieValue?: string) {
  return {
    nextUrl: { pathname },
    cookies: {
      get(name: string) {
        if (name === BOOTSTRAP_COOKIE_NAME && cookieValue !== undefined) {
          return { value: cookieValue };
        }
        return undefined;
      },
    },
  };
}

describe('AUTH_BYPASS_ROUTES (locked contract)', () => {
  it('contains exactly 6 routes — 4 always-public + 2 sink prefixes (Phase 7 F001 fix)', () => {
    // Plan 084 Phase 7 (minih review F001): /api/event-popper and
    // /api/tmux/events bypass at the proxy layer because their route handlers
    // run requireLocalAuth (composite localhost + cookie OR X-Local-Token).
    // Keeping the cookie gate in front blocked CLI X-Local-Token flows, which
    // broke AC-17 at the system level.
    expect(AUTH_BYPASS_ROUTES).toEqual([
      '/api/health',
      '/api/auth',
      '/api/bootstrap/verify',
      '/api/bootstrap/forget',
      '/api/event-popper',
      '/api/tmux/events',
    ]);
  });
});

describe('isBypassPath', () => {
  it.each([
    ['/api/health', true],
    ['/api/auth', true],
    ['/api/auth/signin', true], // covers Auth.js catch-all
    ['/api/auth/callback/github', true],
    ['/api/bootstrap/verify', true],
    ['/api/bootstrap/forget', true],
    ['/api/events', false], // SSE — needs session auth, NOT a sink
    // Phase 7 F001: sink prefixes bypass at proxy; route handler enforces
    // requireLocalAuth. AC-17 system-level CLI flow now passes.
    ['/api/event-popper', true],
    ['/api/event-popper/list', true],
    ['/api/event-popper/ask-question', true],
    ['/api/tmux/events', true],
    ['/api/terminal/token', false], // Phase 4 defence-in-depth — proxy + handler
    ['/dashboard', false],
    ['/login', false],
    ['/', false],
    ['/api/healthx', false], // not a prefix segment match
  ])('isBypassPath(%s) === %s', (path, expected) => {
    expect(isBypassPath(path)).toBe(expected);
  });
});

describe('evaluateCookieGate', () => {
  // (a) /api/health reachable without cookie
  it('(a) /api/health → bypass', () => {
    expect(evaluateCookieGate(reqLike('/api/health'), codeAndKey)).toEqual({
      kind: 'bypass',
    });
  });

  // (b) /api/auth/signin reachable without cookie (Auth.js catch-all)
  it('(b) /api/auth/signin → bypass', () => {
    expect(
      evaluateCookieGate(reqLike('/api/auth/signin'), codeAndKey),
    ).toEqual({ kind: 'bypass' });
  });

  // (c) /api/bootstrap/verify reachable without cookie
  it('(c) /api/bootstrap/verify → bypass', () => {
    expect(
      evaluateCookieGate(reqLike('/api/bootstrap/verify'), codeAndKey),
    ).toEqual({ kind: 'bypass' });
  });

  // (d) /api/bootstrap/forget reachable without cookie
  it('(d) /api/bootstrap/forget → bypass', () => {
    expect(
      evaluateCookieGate(reqLike('/api/bootstrap/forget'), codeAndKey),
    ).toEqual({ kind: 'bypass' });
  });

  // (e) /api/events without cookie → 401-equivalent
  it('(e) /api/events without cookie → cookie-missing-api', () => {
    expect(evaluateCookieGate(reqLike('/api/events'), codeAndKey)).toEqual({
      kind: 'cookie-missing-api',
    });
  });

  // (e1) /api/events with valid cookie → falls through (proxy hands off to auth() chain)
  it('(e1) /api/events with valid cookie → cookie-valid (proves layering)', () => {
    expect(
      evaluateCookieGate(reqLike('/api/events', VALID_COOKIE), codeAndKey),
    ).toEqual({ kind: 'cookie-valid' });
  });

  // (f) Phase 7 F001 fix: /api/event-popper/* now bypasses at the proxy
  //     layer; the route handler's requireLocalAuth is the single composite
  //     gate (localhost + cookie OR X-Local-Token). This unblocks the AC-17
  //     CLI flow that was system-level-broken under the original contract.
  it('(f) /api/event-popper/list → bypass (Phase 7 F001 — sole gate is requireLocalAuth)', () => {
    expect(
      evaluateCookieGate(reqLike('/api/event-popper/list'), codeAndKey),
    ).toEqual({ kind: 'bypass' });
  });

  // (f1) /api/tmux/events → bypass (same Phase 7 F001 reasoning)
  it('(f1) /api/tmux/events → bypass (Phase 7 F001 — sole gate is requireLocalAuth)', () => {
    expect(
      evaluateCookieGate(reqLike('/api/tmux/events'), codeAndKey),
    ).toEqual({ kind: 'bypass' });
  });

  // (f2) /api/terminal/token without cookie → 401 (Phase 4 will defence-in-depth check)
  it('(f2) /api/terminal/token without cookie → cookie-missing-api', () => {
    expect(
      evaluateCookieGate(reqLike('/api/terminal/token'), codeAndKey),
    ).toEqual({ kind: 'cookie-missing-api' });
  });

  // (g) /dashboard without cookie → next() (NOT redirect — popup paints in RootLayout)
  it('(g) /dashboard without cookie → cookie-missing-page (NOT redirect)', () => {
    expect(evaluateCookieGate(reqLike('/dashboard'), codeAndKey)).toEqual({
      kind: 'cookie-missing-page',
    });
  });

  // (h) /dashboard with valid cookie → falls through to auth() chain
  it('(h) /dashboard with valid cookie → cookie-valid', () => {
    expect(
      evaluateCookieGate(reqLike('/dashboard', VALID_COOKIE), codeAndKey),
    ).toEqual({ kind: 'cookie-valid' });
  });

  // (i) /dashboard with invalid cookie value (rotation case) → cookie-missing-page
  it('(i) /dashboard with invalid cookie value → cookie-missing-page', () => {
    expect(
      evaluateCookieGate(reqLike('/dashboard', 'tampered-value'), codeAndKey),
    ).toEqual({ kind: 'cookie-missing-page' });
  });

  // (j) Root page without cookie → cookie-missing-page
  it('(j) / without cookie → cookie-missing-page', () => {
    expect(evaluateCookieGate(reqLike('/'), codeAndKey)).toEqual({
      kind: 'cookie-missing-page',
    });
  });

  // (k) /login without cookie → cookie-missing-page (so popup paints over login screen too)
  it('(k) /login without cookie → cookie-missing-page', () => {
    expect(evaluateCookieGate(reqLike('/login'), codeAndKey)).toEqual({
      kind: 'cookie-missing-page',
    });
  });
});

// F004 follow-up: prove bypass paths short-circuit BEFORE getBootstrapCodeAndKey.
// A missing/unreadable bootstrap-code.json must NOT block /api/health,
// /api/auth/*, /api/bootstrap/verify, or /api/bootstrap/forget.
describe('bootstrapCookieStage — bypass-before-accessor (F004)', () => {
  let cwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    cwd = mkTempCwd('proxy-bypass-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  function bypassReq(pathname: string, headers: Record<string, string> = {}) {
    return {
      nextUrl: { pathname },
      cookies: { get: () => undefined },
      // Phase 7 F001 round 2: bootstrapCookieStage now reads
      // headers.get('x-local-token') + invokes isLocalhostRequest. Default
      // empty headers + no `ip` means: no token (skip token short-circuit) +
      // isLocalhostRequest returns false (skip localhost path). Tests that
      // want to exercise the token short-circuit must pass headers explicitly.
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
    };
  }

  it.each(AUTH_BYPASS_ROUTES)(
    'bypass %s with NO bootstrap-code.json on disk → "bypass" (skips both accessor AND auth() chain)',
    async (path) => {
      // No file written; accessor would throw if reached.
      const result = await bootstrapCookieStage(bypassReq(path) as never);
      expect(result).toBe('bypass');
    },
  );

  it('non-bypass /api/events with unreadable .chainglass → 503 NextResponse', async () => {
    ensureBootstrapCode(cwd);
    const { writeFileSync, chmodSync } = await import('node:fs');
    writeFileSync(join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL), '{', 'utf-8');
    chmodSync(join(cwd, '.chainglass'), 0o555);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    const result = await bootstrapCookieStage(bypassReq('/api/events') as never);
    chmodSync(join(cwd, '.chainglass'), 0o755); // restore
    expect(typeof result).toBe('object');
    expect(result).not.toBe('bypass');
    expect(result).not.toBe('proceed');
    const res = result as Exclude<typeof result, 'bypass' | 'proceed'>;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'bootstrap-unavailable' });
  });

  it('non-bypass /dashboard with unreadable .chainglass → next() (operator gets a working error UI; no redirect loop)', async () => {
    ensureBootstrapCode(cwd);
    const { writeFileSync, chmodSync } = await import('node:fs');
    writeFileSync(join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL), '{', 'utf-8');
    chmodSync(join(cwd, '.chainglass'), 0o555);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    const result = await bootstrapCookieStage(bypassReq('/dashboard') as never);
    chmodSync(join(cwd, '.chainglass'), 0o755); // restore
    expect(result).not.toBe('bypass');
    expect(result).not.toBe('proceed');
    const res = result as Exclude<typeof result, 'bypass' | 'proceed'>;
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('bypass /api/auth/callback/github with NO bootstrap-code.json → "bypass" (Auth.js can callback even during bootstrap-file outage)', async () => {
    const result = await bootstrapCookieStage(
      bypassReq('/api/auth/callback/github') as never,
    );
    expect(result).toBe('bypass');
  });

  it('non-bypass /api/events with valid bootstrap file but no cookie → 401', async () => {
    ensureBootstrapCode(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    const result = await bootstrapCookieStage(bypassReq('/api/events') as never);
    expect(result).not.toBe('bypass');
    expect(result).not.toBe('proceed');
    const res = result as Exclude<typeof result, 'bypass' | 'proceed'>;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'bootstrap-required' });
  });

  it('non-bypass /api/events with valid cookie → "proceed" (falls through to Auth.js chain — proves layering)', async () => {
    const cwdLocal = cwd;
    ensureBootstrapCode(cwdLocal);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    const { activeSigningSecret, ensureBootstrapCode: ensure2 } = await import(
      '@chainglass/shared/auth-bootstrap-code'
    );
    const code = ensure2(cwdLocal).data.code;
    const key = activeSigningSecret(cwdLocal);
    const cookieValue = (await import('@chainglass/shared/auth-bootstrap-code')).buildCookieValue(
      code,
      key,
    );
    const req = {
      nextUrl: { pathname: '/api/events' },
      cookies: {
        get(name: string) {
          if (name === BOOTSTRAP_COOKIE_NAME) return { value: cookieValue };
          return undefined;
        },
      },
      // Phase 7 F001 round 2: bootstrapCookieStage now reads headers
      headers: { get: () => null },
    };
    const result = await bootstrapCookieStage(req as never);
    expect(result).toBe('proceed');
  });
});

/**
 * Plan 084 Phase 5 T005 — env-var alias `DISABLE_AUTH → DISABLE_GITHUB_OAUTH`.
 *
 * `proxy.ts` line ~74 short-circuits the OAuth chain when `isOAuthDisabled()`
 * is true. Phase 5 routes BOTH env-var names through the shared helper from
 * `auth.ts` (single source of truth — both files cannot drift). This block
 * pins the helper's contract; auth.test.ts (T004) covers the warn-once
 * behaviour and the deprecation path more deeply.
 */
describe('Phase 5 T005 — proxy.ts env-var alias via isOAuthDisabled()', () => {
  let originalDisableAuth: string | undefined;
  let originalDisableGithub: string | undefined;
  const FLAG_KEY = '__CHAINGLASS_DISABLE_AUTH_WARNED';

  beforeEach(() => {
    originalDisableAuth = process.env.DISABLE_AUTH;
    originalDisableGithub = process.env.DISABLE_GITHUB_OAUTH;
    delete process.env.DISABLE_AUTH;
    delete process.env.DISABLE_GITHUB_OAUTH;
    delete (globalThis as Record<string, unknown>)[FLAG_KEY];
  });

  afterEach(() => {
    if (originalDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = originalDisableAuth;
    if (originalDisableGithub === undefined) delete process.env.DISABLE_GITHUB_OAUTH;
    else process.env.DISABLE_GITHUB_OAUTH = originalDisableGithub;
    delete (globalThis as Record<string, unknown>)[FLAG_KEY];
  });

  it('(i) DISABLE_GITHUB_OAUTH=true → isOAuthDisabled() === true', async () => {
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    const { isOAuthDisabled } = await import('../../../apps/web/src/auth');
    expect(isOAuthDisabled()).toBe(true);
  });

  it('(ii) DISABLE_AUTH=true (legacy) → isOAuthDisabled() === true', async () => {
    process.env.DISABLE_AUTH = 'true';
    const { isOAuthDisabled } = await import('../../../apps/web/src/auth');
    expect(isOAuthDisabled()).toBe(true);
  });

  it('(iii) both unset → isOAuthDisabled() === false', async () => {
    const { isOAuthDisabled } = await import('../../../apps/web/src/auth');
    expect(isOAuthDisabled()).toBe(false);
  });

  it('(iv) bootstrap-cookie gate runs INDEPENDENT of env-vars (Phase 3 contract preserved)', async () => {
    // Even with DISABLE_GITHUB_OAUTH=true, evaluateCookieGate's outcome is
    // determined purely by path + cookie shape. Env-var doesn't enter.
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    expect(evaluateCookieGate(reqLike('/api/events'), codeAndKey)).toEqual({
      kind: 'cookie-missing-api',
    });
    expect(
      evaluateCookieGate(reqLike('/api/events', VALID_COOKIE), codeAndKey),
    ).toEqual({ kind: 'cookie-valid' });
  });
});

/**
 * Plan 084 Phase 5 F001 fix — bootstrap-cookie gate runs OUTSIDE the
 * `auth(...)` wrapper. Regression: when `DISABLE_GITHUB_OAUTH=true` (or legacy
 * `DISABLE_AUTH=true`), the OAuth wrapper turns into a pass-through. Phase 5's
 * earlier proxy.ts had the bootstrap-cookie gate INSIDE the wrapped callback,
 * meaning the gate was bypassed in disabled-OAuth mode. F001 hoists the gate
 * above the wrapper. This block exercises the default export end-to-end.
 */
describe('Phase 5 F001 — bootstrap gate enforced even when DISABLE_GITHUB_OAUTH=true', () => {
  let cwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;
  let originalDisableAuth: string | undefined;
  let originalDisableGithub: string | undefined;
  const FLAG_KEY = '__CHAINGLASS_DISABLE_AUTH_WARNED';

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    originalDisableAuth = process.env.DISABLE_AUTH;
    originalDisableGithub = process.env.DISABLE_GITHUB_OAUTH;
    delete process.env.AUTH_SECRET;
    delete process.env.DISABLE_AUTH;
    delete process.env.DISABLE_GITHUB_OAUTH;
    delete (globalThis as Record<string, unknown>)[FLAG_KEY];
    cwd = mkTempCwd('proxy-f001-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
    if (originalDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = originalDisableAuth;
    if (originalDisableGithub === undefined) delete process.env.DISABLE_GITHUB_OAUTH;
    else process.env.DISABLE_GITHUB_OAUTH = originalDisableGithub;
    delete (globalThis as Record<string, unknown>)[FLAG_KEY];
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  // Helper: build a NextRequest-shaped object the proxy default export accepts.
  function makeReq(pathname: string, cookieValue?: string) {
    const url = new URL(`http://localhost:3000${pathname}`);
    return {
      nextUrl: { pathname, origin: url.origin },
      url: url.toString(),
      cookies: {
        get(name: string) {
          if (name === BOOTSTRAP_COOKIE_NAME && cookieValue !== undefined) {
            return { value: cookieValue };
          }
          return undefined;
        },
      },
      headers: new Map(),
    };
  }

  it('DISABLE_GITHUB_OAUTH=true + non-bypass /api/events without cookie → 401 bootstrap-required (gate enforced)', async () => {
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    ensureBootstrapCode(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    // Re-import proxy default with env-var set so auth.ts wrapper short-circuits.
    const { default: middleware } = await import('../../../apps/web/proxy');
    const res = await middleware(makeReq('/api/events') as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'bootstrap-required' });
  });

  it('DISABLE_AUTH=true (legacy) + non-bypass /api/events without cookie → 401 (gate enforced)', async () => {
    process.env.DISABLE_AUTH = 'true';
    ensureBootstrapCode(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    const { default: middleware } = await import('../../../apps/web/proxy');
    const res = await middleware(makeReq('/api/events') as never);
    expect(res.status).toBe(401);
  });

  it('DISABLE_GITHUB_OAUTH=true + bypass route /api/health → next() (no cookie required)', async () => {
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    const { default: middleware } = await import('../../../apps/web/proxy');
    const res = await middleware(makeReq('/api/health') as never);
    // Bypass paths short-circuit before bootstrap accessor — no file needed.
    // NextResponse.next() ≡ status 200 (proxy doesn't transform).
    expect([200, 204]).toContain(res.status);
  });

  it('DISABLE_GITHUB_OAUTH=true + valid bootstrap cookie + non-bypass /api/events → next() (OAuth bypassed)', async () => {
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    const ensured = ensureBootstrapCode(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    const { activeSigningSecret, buildCookieValue } = await import(
      '@chainglass/shared/auth-bootstrap-code'
    );
    const cookie = buildCookieValue(ensured.data.code, activeSigningSecret(cwd));
    const { default: middleware } = await import('../../../apps/web/proxy');
    const res = await middleware(makeReq('/api/events', cookie) as never);
    expect([200, 204]).toContain(res.status);
  });
});
