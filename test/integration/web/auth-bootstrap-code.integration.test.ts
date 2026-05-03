/**
 * Plan 084 Phase 3 — T007 integration test for the auth-bootstrap-code
 * server-side gate. Exercises real route handlers with NextRequest +
 * verifies cross-route flows (verify → cookie → gated proxy decision →
 * forget → cookie cleared → rotation invalidates old cookies).
 *
 * Constitution P3 + P4: real fs in temp cwd, real route imports, no vi.mock.
 */
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOOTSTRAP_CODE_FILE_PATH_REL,
  BOOTSTRAP_COOKIE_NAME,
  buildCookieValue,
  ensureBootstrapCode,
  generateBootstrapCode,
  _resetSigningSecretCacheForTests,
  activeSigningSecret,
} from '@chainglass/shared/auth-bootstrap-code';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { _resetForTests as _resetBootstrapCache } from '../../../apps/web/src/lib/bootstrap-code';
import { POST as forgetPOST } from '../../../apps/web/app/api/bootstrap/forget/route';
import {
  POST as verifyPOST,
  _resetRateLimitForTests,
} from '../../../apps/web/app/api/bootstrap/verify/route';
import {
  evaluateCookieGate,
  type RequestLike,
} from '../../../apps/web/src/lib/cookie-gate';
import { INVALID_FORMAT_SAMPLES } from '../../unit/shared/auth-bootstrap-code/test-fixtures';

import { setupBootstrapTestEnv } from '../../helpers/auth-bootstrap-code';

const VERIFY_URL = 'http://localhost:3000/api/bootstrap/verify';
const FORGET_URL = 'http://localhost:3000/api/bootstrap/forget';

function postJson(url: string, body: unknown, ip = '1.2.3.4'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
  });
}

function gateReq(pathname: string, cookieValue?: string): RequestLike {
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

function extractCookieValue(setCookie: string): string {
  const m = setCookie.match(new RegExp(`${BOOTSTRAP_COOKIE_NAME}=([^;]+)`));
  if (!m) throw new Error(`No ${BOOTSTRAP_COOKIE_NAME} in Set-Cookie: ${setCookie}`);
  return m[1] ?? '';
}

describe('auth-bootstrap-code integration', () => {
  let env: ReturnType<typeof setupBootstrapTestEnv>;
  let originalAuthSecret: string | undefined;

  beforeEach(() => {
    originalAuthSecret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    env = setupBootstrapTestEnv();
  });

  afterEach(() => {
    env.cleanup();
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  // (1+2+3) Generate file → verify with correct code → 200 + cookie → cookie validates via proxy gate
  it('(1+2+3) generate → verify → cookie issued → proxy passes /dashboard with cookie', async () => {
    const verifyRes = await verifyPOST(postJson(VERIFY_URL, { code: env.code }));
    expect(verifyRes.status).toBe(200);
    const setCookie = verifyRes.headers.get('set-cookie') ?? '';
    const cookieValue = extractCookieValue(setCookie);
    expect(cookieValue.length).toBeGreaterThan(0);

    // Now the proxy cookie-gate should accept this cookie for /dashboard
    const key = activeSigningSecret(env.cwd);
    const decision = evaluateCookieGate(
      gateReq('/dashboard', cookieValue),
      { code: env.code, key },
    );
    expect(decision.kind).toBe('cookie-valid');
  });

  // (4) Without the cookie → page falls through (next()), api → 401
  it('(4) no cookie: /dashboard → cookie-missing-page; /api/events → cookie-missing-api', async () => {
    const key = activeSigningSecret(env.cwd);
    const codeAndKey = { code: env.code, key };
    expect(evaluateCookieGate(gateReq('/dashboard'), codeAndKey).kind).toBe(
      'cookie-missing-page',
    );
    expect(evaluateCookieGate(gateReq('/api/events'), codeAndKey).kind).toBe(
      'cookie-missing-api',
    );
  });

  // (5) Forget clears the cookie
  it('(5) POST /api/bootstrap/forget → 200 + Max-Age=0', async () => {
    const res = await forgetPOST(new NextRequest(FORGET_URL, { method: 'POST' }));
    expect(res.status).toBe(200);
    const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
    expect(setCookie).toContain('max-age=0');
  });

  // (6) Format-invalid covers all 6 INVALID_FORMAT_SAMPLES
  it('(6) all 6 INVALID_FORMAT_SAMPLES → 400 invalid-format', async () => {
    for (const [idx, sample] of INVALID_FORMAT_SAMPLES.entries()) {
      const res = await verifyPOST(
        postJson(VERIFY_URL, { code: sample }, `10.7.0.${idx + 1}`),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid-format' });
    }
  });

  // (7) Rate limit: 5 wrong + 6th 429 (within single 60s window)
  it('(7) 5 wrong attempts then 6th → 429', async () => {
    const ip = '10.7.99.1';
    const wrong = '7K2P-9XQM-3T8R';
    if (wrong === env.code) throw new Error('test fixture collided with active code');
    for (let i = 0; i < 5; i++) {
      const r = await verifyPOST(postJson(VERIFY_URL, { code: wrong }, ip));
      expect(r.status).toBe(401);
    }
    const sixth = await verifyPOST(postJson(VERIFY_URL, { code: wrong }, ip));
    expect(sixth.status).toBe(429);
    const body = await sixth.json();
    expect(body.error).toBe('rate-limited');
    expect(typeof body.retryAfterMs).toBe('number');
  });

  // (8) Rotation invalidates old cookies — write new code → reset caches → old cookie no longer validates
  it('(8) rotating the code invalidates the old cookie', async () => {
    // First, get a cookie for the original code
    const verifyRes = await verifyPOST(postJson(VERIFY_URL, { code: env.code }));
    expect(verifyRes.status).toBe(200);
    const oldCookieValue = extractCookieValue(verifyRes.headers.get('set-cookie') ?? '');
    const oldKey = activeSigningSecret(env.cwd);
    expect(
      evaluateCookieGate(gateReq('/dashboard', oldCookieValue), {
        code: env.code,
        key: oldKey,
      }).kind,
    ).toBe('cookie-valid');

    // Rotate: write a new bootstrap-code.json with a different code
    const newCode = generateBootstrapCode();
    expect(newCode).not.toBe(env.code);
    const filePath = join(env.cwd, BOOTSTRAP_CODE_FILE_PATH_REL);
    const now = new Date().toISOString();
    writeFileSync(
      filePath,
      JSON.stringify(
        { version: 1, code: newCode, createdAt: now, rotatedAt: now },
        null,
        2,
      ),
      'utf-8',
    );

    // Caches must be reset to simulate the operator restart-after-rotate
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();

    const newKey = activeSigningSecret(env.cwd);
    // Old cookie no longer validates against the new code+key
    expect(
      evaluateCookieGate(gateReq('/dashboard', oldCookieValue), {
        code: newCode,
        key: newKey,
      }).kind,
    ).toBe('cookie-missing-page');

    // Building a new cookie with the new code+key validates
    const newCookie = buildCookieValue(newCode, newKey);
    expect(
      evaluateCookieGate(gateReq('/dashboard', newCookie), {
        code: newCode,
        key: newKey,
      }).kind,
    ).toBe('cookie-valid');
  });

  // (smoke) setupBootstrapTestEnv() helper itself produces a usable env
  it('(smoke) setupBootstrapTestEnv() returns a working BootstrapTestEnv', () => {
    expect(env.cwd).toBeTruthy();
    expect(env.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(env.verifyUrl).toBe(VERIFY_URL);
    expect(env.forgetUrl).toBe(FORGET_URL);
    expect(typeof env.cleanup).toBe('function');
  });
});
