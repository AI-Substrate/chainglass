/**
 * Plan 084 Phase 3 — T003 unit tests for `POST /api/bootstrap/forget`.
 * Always 200 + Set-Cookie with Max-Age=0; idempotent.
 */
import {
  BOOTSTRAP_COOKIE_NAME,
  BOOTSTRAP_COOKIE_NAME_SECURE,
} from '@chainglass/shared/auth-bootstrap-code';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../../../../../apps/web/app/api/bootstrap/forget/route';
import {
  _peerHeaderForTests,
  _uninstallPeerAddressStampForTests,
  installPeerAddressStamp,
} from '../../../../../apps/web/src/lib/socket-peer';

const URL = 'http://localhost:3000/api/bootstrap/forget';

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(URL, { method: 'POST', headers });
}

describe('POST /api/bootstrap/forget', () => {
  beforeEach(() => installPeerAddressStamp());
  afterEach(() => _uninstallPeerAddressStampForTests());

  it('returns 200 + Set-Cookie with Max-Age=0', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
    expect(setCookie).toContain(`${BOOTSTRAP_COOKIE_NAME.toLowerCase()}=`);
    expect(setCookie).toContain('max-age=0');
    expect(setCookie).toContain('httponly');
    expect(setCookie).toContain('samesite=lax');
    expect(setCookie).toContain('path=/');
  });

  it('is idempotent across 3 calls', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await POST(req());
      expect(res.status).toBe(200);
      const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
      expect(setCookie).toContain('max-age=0');
    }
  });

  it('does not require a body', async () => {
    const res = await POST(new NextRequest(URL, { method: 'POST', body: '' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('over plain http in production: the clearing cookie has no Secure', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = await POST(req(_peerHeaderForTests('192.168.1.70')));
      const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
      expect(setCookie).toContain('max-age=0');
      expect(setCookie).not.toContain('secure');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('over https (behind the TLS front): clears both names, with Secure', async () => {
    const res = await POST(req(_peerHeaderForTests('127.0.0.1', '192.168.1.70', 'https')));
    const cleared = res.headers.getSetCookie();
    expect(cleared.map((c) => c.split('=')[0]).sort()).toEqual(
      [BOOTSTRAP_COOKIE_NAME, BOOTSTRAP_COOKIE_NAME_SECURE].sort()
    );
    for (const c of cleared) {
      expect(c.toLowerCase()).toContain('max-age=0');
      expect(c.toLowerCase()).toContain('; secure');
    }
  });
});
