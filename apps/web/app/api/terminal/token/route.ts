/**
 * Terminal Token API — Issues short-lived JWTs for WebSocket authentication
 *
 * The browser fetches a token from this authenticated endpoint, then passes
 * it as a query param on the WebSocket connection to the sidecar server.
 * The sidecar validates the JWT independently via the shared AUTH_SECRET.
 *
 * Plan 064 Phase 6: Terminal Authentication
 * Workshop: 002-terminal-ws-authentication.md
 */

import { auth } from '@/auth';
import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TOKEN_EXPIRY = '5m';
const TOKEN_EXPIRY_SECONDS = 300;

export async function GET() {
  const session = await auth();
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 503 });
  }

  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({ sub: session.user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(key);

  return NextResponse.json({ token, expiresIn: TOKEN_EXPIRY_SECONDS });
}
