/**
 * Plan 084 Phase 3 — `POST /api/bootstrap/forget`.
 * Always 200; clears the `chainglass-bootstrap` cookie with Max-Age=0.
 * Idempotent; no body validation; no auth check.
 */
import { BOOTSTRAP_COOKIE_NAME } from '@chainglass/shared/auth-bootstrap-code';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function buildClearCookie(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${BOOTSTRAP_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export async function POST(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { 'Set-Cookie': buildClearCookie() } },
  );
}
