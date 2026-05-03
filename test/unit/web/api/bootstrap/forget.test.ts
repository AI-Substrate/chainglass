/**
 * Plan 084 Phase 3 — T003 unit tests for `POST /api/bootstrap/forget`.
 * Always 200 + Set-Cookie with Max-Age=0; idempotent.
 */
import { BOOTSTRAP_COOKIE_NAME } from '@chainglass/shared/auth-bootstrap-code';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { POST } from '../../../../../apps/web/app/api/bootstrap/forget/route';

const URL = 'http://localhost:3000/api/bootstrap/forget';

function req(): NextRequest {
  return new NextRequest(URL, { method: 'POST' });
}

describe('POST /api/bootstrap/forget', () => {
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
    const res = await POST(
      new NextRequest(URL, { method: 'POST', body: '' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('production: clearing Set-Cookie includes Secure (F003)', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await POST(req());
      expect(res.status).toBe(200);
      const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
      expect(setCookie).toContain('secure');
      expect(setCookie).toContain('max-age=0');
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });
});
