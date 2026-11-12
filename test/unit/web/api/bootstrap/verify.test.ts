/**
 * Plan 084 Phase 3 — T002 unit tests for `POST /api/bootstrap/verify`.
 *
 * Constitution P3 (TDD) + P4 (no vi.mock — NextRequest constructed manually,
 * real route handler, real fs in temp cwd). Real clock — rate-limit window
 * verified within a single 60s window only; cross-window reset deferred to
 * T007 integration tests.
 */

import {
  BOOTSTRAP_COOKIE_NAME,
  BOOTSTRAP_COOKIE_NAME_SECURE,
  _resetSigningSecretCacheForTests,
  ensureBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INVALID_FORMAT_SAMPLES,
  mkTempCwd,
} from '../../../shared/auth-bootstrap-code/test-fixtures';

import {
  POST,
  _resetRateLimitForTests,
} from '../../../../../apps/web/app/api/bootstrap/verify/route';
import { _resetForTests as _resetBootstrapCache } from '../../../../../apps/web/src/lib/bootstrap-code';
import {
  _peerHeaderForTests,
  _uninstallPeerAddressStampForTests,
  installPeerAddressStamp,
} from '../../../../../apps/web/src/lib/socket-peer';
import { removeTmpDir } from '../../../../helpers/tmpdir';

const URL = 'http://localhost:3000/api/bootstrap/verify';

/** A request whose socket peer (as the stamp records it) is `ip`, plus any client headers. */
function reqWithBody(body: unknown, ip = '1.2.3.4', headers: Record<string, string> = {}) {
  return new NextRequest(URL, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...headers,
      ..._peerHeaderForTests(ip),
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
    // biome-ignore lint/performance/noDelete: tests need to truly unset (assigning undefined leaves the key with string value "undefined")
    delete process.env.AUTH_SECRET;
    cwd = mkTempCwd('verify-route-');
    process.chdir(cwd);
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    _resetRateLimitForTests();
    installPeerAddressStamp();
    activeCode = ensureBootstrapCode(cwd).data.code;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuthSecret === undefined) {
      // biome-ignore lint/performance/noDelete: tests need to truly unset (assigning undefined leaves the key with string value "undefined")
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
    _resetBootstrapCache();
    _resetSigningSecretCacheForTests();
    _resetRateLimitForTests();
    _uninstallPeerAddressStampForTests();
    removeTmpDir(cwd);
  });

  // (1) 200 happy path
  it('200: correct code → ok + Set-Cookie (HttpOnly + SameSite=Lax + Path=/ + Max-Age=30d)', async () => {
    const res = await POST(reqWithBody({ code: activeCode }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${BOOTSTRAP_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie.toLowerCase()).toContain('path=/');
    // 30 days — survives iOS Safari/Edge session-cookie eviction.
    expect(setCookie.toLowerCase()).toContain('max-age=2592000');
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

  // (9) The budget follows the socket peer, not X-Forwarded-For
  it('429: rotating X-Forwarded-For does not reset the budget', async () => {
    /*
    Test Doc:
    - Why: keyed on X-Forwarded-For, a client could send a new value per request and never hit the limit.
    - Contract: the bucket is the socket peer the stamp recorded; client headers do not choose it.
    - Usage Notes: peer via _peerHeaderForTests (what the stamp writes); XFF is client-sent.
    - Quality Contribution: catches the limit being keyed on any client-controlled header again.
    - Worked Example: 5 wrong attempts from one peer with 5 different XFF values -> 6th is 429.
    */
    const wrong = '7K2P-9XQM-3T8R';
    const peer = '192.168.1.50';
    for (let i = 0; i < 5; i++) {
      const r = await POST(
        reqWithBody({ code: wrong }, peer, { 'x-forwarded-for': `203.0.113.${i}` })
      );
      expect(r.status).toBe(401);
    }
    const sixth = await POST(
      reqWithBody({ code: wrong }, peer, { 'x-forwarded-for': '203.0.113.99' })
    );
    expect(sixth.status).toBe(429);
  });

  it('429: behind the TLS front, each client has its own budget (all share the loopback peer)', async () => {
    // What the stamp writes for a request the front relayed with its secret: peer 127.0.0.1,
    // client = the front's X-Forwarded-For. Without the front's secret the client IS the peer.
    const wrong = '7K2P-9XQM-3T8R';
    const viaFront = (client: string) =>
      new NextRequest(URL, {
        method: 'POST',
        body: JSON.stringify({ code: wrong }),
        headers: {
          'content-type': 'application/json',
          ..._peerHeaderForTests('127.0.0.1', client, 'https'),
        },
      });
    for (let i = 0; i < 5; i++) {
      expect((await POST(viaFront('192.168.1.60'))).status).toBe(401);
    }
    expect((await POST(viaFront('192.168.1.60'))).status).toBe(429);
    expect((await POST(viaFront('192.168.1.61'))).status).toBe(401);
  });

  it('429: requests with no stamped peer share one budget', async () => {
    const wrong = '7K2P-9XQM-3T8R';
    const unstamped = (xff: string) =>
      new NextRequest(URL, {
        method: 'POST',
        body: JSON.stringify({ code: wrong }),
        headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
      });
    for (let i = 0; i < 5; i++) {
      expect((await POST(unstamped(`198.51.100.${i}`))).status).toBe(401);
    }
    expect((await POST(unstamped('198.51.100.99'))).status).toBe(429);
  });

  // (10) Secure follows the request's protocol, never NODE_ENV (B4: prod over http://<LAN IP>)
  it('200 over plain http in production: Set-Cookie has no Secure (the browser would drop it)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = await POST(reqWithBody({ code: activeCode }, '192.168.1.70'));
      expect(res.status).toBe(200);
      const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
      expect(setCookie).toContain(`${BOOTSTRAP_COOKIE_NAME}=`);
      expect(setCookie).not.toContain('secure');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('200 over https (behind the TLS front): the cookie is __Secure-chainglass-bootstrap with Secure', async () => {
    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        body: JSON.stringify({ code: activeCode }),
        headers: {
          'content-type': 'application/json',
          ..._peerHeaderForTests('127.0.0.1', '192.168.1.70', 'https'),
        },
      })
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    // A separate name, so a Secure cookie never shadows the plain-HTTP one on the same host.
    expect(setCookie.startsWith(`${BOOTSTRAP_COOKIE_NAME_SECURE}=`)).toBe(true);
    expect(setCookie.toLowerCase()).toContain('; secure');
  });

  it('200: a client-sent X-Forwarded-Proto: https does not make the cookie Secure', async () => {
    const res = await POST(
      reqWithBody({ code: activeCode }, '192.168.1.70', { 'x-forwarded-proto': 'https' })
    );
    expect(res.status).toBe(200);
    expect((res.headers.get('set-cookie') ?? '').toLowerCase()).not.toContain('secure');
  });

  // (9) 503 missing bootstrap file
  it('503: missing bootstrap file → unavailable', async () => {
    // remove the file written in beforeEach AND the parent dir to force ENOENT
    removeTmpDir(`${cwd}/.chainglass`);
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
