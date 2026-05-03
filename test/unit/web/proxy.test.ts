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
  it('contains exactly 4 routes — no more, no less', () => {
    expect(AUTH_BYPASS_ROUTES).toEqual([
      '/api/health',
      '/api/auth',
      '/api/bootstrap/verify',
      '/api/bootstrap/forget',
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
    ['/api/events', false],
    ['/api/event-popper', false],
    ['/api/event-popper/list', false],
    ['/api/tmux/events', false],
    ['/api/terminal/token', false],
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

  // (f) /api/event-popper/list without cookie → 401 (NOT bypass — Phase 5 adds requireLocalAuth AFTER this)
  it('(f) /api/event-popper/list without cookie → cookie-missing-api (NOT bypass)', () => {
    expect(
      evaluateCookieGate(reqLike('/api/event-popper/list'), codeAndKey),
    ).toEqual({ kind: 'cookie-missing-api' });
  });

  // (f1) /api/tmux/events without cookie → 401
  it('(f1) /api/tmux/events without cookie → cookie-missing-api', () => {
    expect(
      evaluateCookieGate(reqLike('/api/tmux/events'), codeAndKey),
    ).toEqual({ kind: 'cookie-missing-api' });
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

  function bypassReq(pathname: string) {
    return {
      nextUrl: { pathname },
      cookies: { get: () => undefined },
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
    };
    const result = await bootstrapCookieStage(req as never);
    expect(result).toBe('proceed');
  });
});
