/**
 * Terminal Token API — Issues short-lived JWTs for WebSocket authentication.
 *
 * Plan 084 Phase 4 (2026-05-03) — Hardened auth contract:
 *   - Pre-checks (in order): NextAuth `auth()` session → bootstrap cookie.
 *     Both must pass; either failure → 401.
 *   - Signs with `activeSigningSecret(findWorkspaceRoot(process.cwd()))`.
 *     The Buffer key is passed directly to `jose.SignJWT.sign(...)` with no
 *     `TextEncoder` re-wrap — the same bytes the WS sidecar uses to verify
 *     (FX003 R6: `findWorkspaceRoot()` ensures the sidecar resolves the
 *     identical cwd, so HKDF-derived keys converge).
 *   - JWT claims (validated by `terminal-ws.ts` sidecar — see
 *     `validateTerminalJwt()` in that file):
 *       sub: session.user.name (string)
 *       iss: 'chainglass'      (TERMINAL_JWT_ISSUER — string literal, must match)
 *       aud: 'terminal-ws'     (TERMINAL_JWT_AUDIENCE — string literal, must match)
 *       cwd: findWorkspaceRoot(process.cwd()) (absolute path; sidecar must resolve same)
 *       iat, exp: 5-minute window
 *
 * Plan 064 Phase 6 originated the HTTP→JWT→WS pattern; Phase 4 extends it.
 * Workshop: docs/plans/084-random-enhancements-3/workshops/004-bootstrap-code-lifecycle-and-verification.md
 */

import { auth } from '@/auth';
import {
  TERMINAL_JWT_AUDIENCE,
  TERMINAL_JWT_ISSUER,
} from '@/features/064-terminal/server/terminal-auth';
import {
  BOOTSTRAP_COOKIE_NAME,
  findWorkspaceRoot,
  verifyCookieValue,
} from '@chainglass/shared/auth-bootstrap-code';
import { SignJWT } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';

export const dynamic = 'force-dynamic';

const TOKEN_EXPIRY = '5m';
const TOKEN_EXPIRY_SECONDS = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // (a) NextAuth session pre-check — preserves existing 401 behaviour.
  const session = await auth();
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // (b) Bootstrap-cookie pre-check — defence-in-depth on top of the proxy
  // gate (Plan 084 Phase 3). The proxy already gates this route with the
  // cookie, but we re-check in-route so a misconfigured proxy bypass cannot
  // grant terminal access.
  const cookieValue = req.cookies.get(BOOTSTRAP_COOKIE_NAME)?.value;
  let codeAndKey: { code: string; key: Buffer };
  try {
    codeAndKey = await getBootstrapCodeAndKey();
  } catch {
    return NextResponse.json({ error: 'bootstrap-unavailable' }, { status: 503 });
  }
  if (!verifyCookieValue(cookieValue, codeAndKey.code, codeAndKey.key)) {
    return NextResponse.json({ error: 'bootstrap-cookie-required' }, { status: 401 });
  }

  // (c) Sign JWT with the same key the WS sidecar will verify against.
  // Buffer passed directly to jose — no TextEncoder re-wrap (HKDF buffer
  // bytes must reach the verifier byte-identical).
  const cwd = findWorkspaceRoot(process.cwd());
  const token = await new SignJWT({
    sub: session.user.name,
    iss: TERMINAL_JWT_ISSUER,
    aud: TERMINAL_JWT_AUDIENCE,
    cwd,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(codeAndKey.key);

  return NextResponse.json({ token, expiresIn: TOKEN_EXPIRY_SECONDS });
}
