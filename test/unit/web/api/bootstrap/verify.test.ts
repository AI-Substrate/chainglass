/**
 * Plan 084 Phase 3 — T002 unit tests for `POST /api/bootstrap/verify`.
 *
 * Constitution P3 (TDD) + P4 (no vi.mock — NextRequest constructed manually,
 * real route handler, real fs in temp cwd). Real clock — rate-limit window
 * verified within a single 60s window only; cross-window reset deferred to
 * T007 integration tests.
 */
import { rmSync } from 'node:fs';

import {
  BOOTSTRAP_COOKIE_NAME,
  ensureBootstrapCode,
  _resetSigningSecretCacheForTests,
} from '@chainglass/shared/auth-bootstrap-code';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  INVALID_FORMAT_SAMPLES,
  mkTempCwd,
} from '../../../shared/auth-bootstrap-code/test-fixtures';

import { _resetForTests as _resetBootstrapCache } from '../../../../../apps/web/src/lib/bootstrap-code';
import {
  POST,
  _resetRateLimitForTests,
} from '../../../../../apps/web/app/api/bootstrap/verify/route';

const URL = 'http://localhost:3000/api/bootstrap/verify';

function reqWithBody(body: unknown, ip = '1.2.3.4'): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
  });
}

describe('POST /api/bootstrap/verify', () => {
  let cwd: string;
  let originalCwd: string;
  let originalAuthSecret: string | undefined;
  let activeCode: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuthSecret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    cwd = mkTempCwd('verify-route-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    _resetRateLimitForTests();
    activeCode = ensureBootstrapCode(cwd).data.code;
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
    _resetRateLimitForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  // (1) 200 happy path
  it('200: correct code → ok + Set-Cookie (HttpOnly + SameSite=Lax + Path=/, no Max-Age)', async () => {
    const res = await POST(reqWithBody({ code: activeCode }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${BOOTSTRAP_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie.toLowerCase()).toContain('path=/');
    expect(setCookie.toLowerCase()).not.toContain('max-age');
    expect(setCookie.toLowerCase()).not.toContain('expires=');
  });

  // (2) 401 wrong code (correct format)
  it('401: wrong code (correct format) → wrong-code', async () => {
    const wrong = '7K2P-9XQM-3T8R'; // valid format, vanishingly unlikely match
    if (wrong === activeCode) {
      // Astronomical edge — pick a different valid string
      throw new Error('test fixture collided with active code; rerun');
    }
    const res = await POST(reqWithBody({ code: wrong }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'wrong-code' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  // (3a-f) 400 format-invalid via INVALID_FORMAT_SAMPLES
  for (const [idx, sample] of INVALID_FORMAT_SAMPLES.entries()) {
    it(`400 (a-f #${idx}): format-invalid '${sample}' → invalid-format`, async () => {
      const res = await POST(reqWithBody({ code: sample }, `10.0.0.${idx + 1}`));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid-format' });
    });
  }

  // (4) malformed JSON
  it('400: malformed JSON → invalid-format', async () => {
    const res = await POST(reqWithBody('not-json{', '10.0.0.100'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-format' });
  });

  // (5) empty body
  it('400: empty body → invalid-format', async () => {
    const res = await POST(reqWithBody('', '10.0.0.101'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-format' });
  });

  // (6) missing code field
  it('400: missing code field → invalid-format', async () => {
    const res = await POST(reqWithBody({}, '10.0.0.102'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-format' });
  });

  // (7) 429 rate-limited
  it('429: 6th wrong attempt within 60s from one IP → rate-limited + Retry-After + retryAfterMs', async () => {
    const ip = '10.0.0.200';
    const wrong = '7K2P-9XQM-3T8R';
    // 5 attempts pass through (each returns 401)
    for (let i = 0; i < 5; i++) {
      const r = await POST(reqWithBody({ code: wrong }, ip));
      expect(r.status).toBe(401);
    }
    const sixth = await POST(reqWithBody({ code: wrong }, ip));
    expect(sixth.status).toBe(429);
    const retryAfter = sixth.headers.get('retry-after');
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    const body = await sixth.json();
    expect(body.error).toBe('rate-limited');
    expect(typeof body.retryAfterMs).toBe('number');
    expect(body.retryAfterMs).toBeGreaterThan(0);
    // Must be exactly two fields
    expect(Object.keys(body).sort()).toEqual(['error', 'retryAfterMs']);
  });

  // (8) Separate IPs have independent budgets
  it('429: separate IPs have independent budgets', async () => {
    const wrong = '7K2P-9XQM-3T8R';
    const ipA = '10.1.0.1';
    const ipB = '10.1.0.2';
    for (let i = 0; i < 5; i++) {
      await POST(reqWithBody({ code: wrong }, ipA));
    }
    const aSixth = await POST(reqWithBody({ code: wrong }, ipA));
    expect(aSixth.status).toBe(429);
    const bFirst = await POST(reqWithBody({ code: wrong }, ipB));
    expect(bFirst.status).toBe(401);
  });

  // (10) production-only Secure cookie attribute (F002)
  it('200 in production: Set-Cookie includes Secure', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await POST(reqWithBody({ code: activeCode }));
      expect(res.status).toBe(200);
      const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
      expect(setCookie).toContain('secure');
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  // (9) 503 missing bootstrap file
  it('503: missing bootstrap file → unavailable', async () => {
    // remove the file written in beforeEach AND the parent dir to force ENOENT
    rmSync(`${cwd}/.chainglass`, { recursive: true, force: true });
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    // Make .chainglass parent (cwd) read-only so ensureBootstrapCode cannot regenerate
    const { mkdirSync, chmodSync } = await import('node:fs');
    mkdirSync(`${cwd}/.chainglass`);
    chmodSync(`${cwd}/.chainglass`, 0o555);
    const res = await POST(reqWithBody({ code: activeCode }));
    chmodSync(`${cwd}/.chainglass`, 0o755); // restore for cleanup
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });
});
