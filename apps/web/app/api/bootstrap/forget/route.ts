/**
 * Plan 084 Phase 3 — `POST /api/bootstrap/forget`.
 * Always 200; clears the bootstrap cookie with Max-Age=0.
 * Idempotent; no body validation; no auth check.
 */
import {
  BOOTSTRAP_COOKIE_NAME,
  BOOTSTRAP_COOKIE_NAME_SECURE,
} from '@chainglass/shared/auth-bootstrap-code';
import { type NextRequest, NextResponse } from 'next/server';

import { requestClient } from '@/lib/socket-peer';

export const dynamic = 'force-dynamic';

function buildClearCookie(name: string, secure: boolean): string {
  const parts = [`${name}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Clears the cookie under both names `/api/bootstrap/verify` may have set. `Secure` follows the
 * request's real protocol, as on verify; over plain HTTP the browser would ignore a
 * `__Secure-` cookie anyway, so only the plain name is cleared there.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secure = requestClient(request.headers)?.secure === true;
  const headers = new Headers();
  headers.append('Set-Cookie', buildClearCookie(BOOTSTRAP_COOKIE_NAME, secure));
  if (secure) headers.append('Set-Cookie', buildClearCookie(BOOTSTRAP_COOKIE_NAME_SECURE, true));
  return NextResponse.json({ ok: true }, { status: 200, headers });
}
