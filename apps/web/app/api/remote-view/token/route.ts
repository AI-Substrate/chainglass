/**
 * Remote-view Token API — issues short-lived JWTs for the stream WebSocket.
 *
 * Plan 088 Phase 2 (T008). A near-verbatim copy of the terminal token route
 * (`app/api/terminal/token/route.ts`) — Finding 03: the bootstrap-code HKDF mint
 * is a FROZEN contract, copied not redesigned, so the stream socket meets the
 * same auth bar as the terminal socket (AC-9).
 *
 *   - Pre-checks (in order): NextAuth `auth()` session → bootstrap cookie.
 *     Both must pass; either failure → 401. Bootstrap unavailable → 503.
 *   - Signs with the bootstrap-code HKDF Buffer key passed DIRECTLY to
 *     `jose.SignJWT.sign(...)` — no `TextEncoder` re-wrap (FX003: the WS verifier
 *     needs byte-identical key bytes).
 *   - JWT claims:
 *       sub: session.user.name
 *       iss: 'chainglass'        (REMOTE_VIEW_JWT_ISSUER)
 *       aud: 'remote-view-ws'    (REMOTE_VIEW_JWT_AUDIENCE)
 *       iat, exp: 5-minute window
 *     Differences from terminal: aud is `remote-view-ws`, and there is NO `cwd`
 *     claim (the daemon binds the window, not a workspace root).
 */

import { auth } from '@/auth';
import {
  REMOTE_VIEW_DAEMON_CONTROL_TOKEN,
  type RemoteViewDaemonControl,
} from '@/features/088-remote-view/server/daemon-control';
import {
  REMOTE_VIEW_JWT_AUDIENCE,
  REMOTE_VIEW_JWT_ISSUER,
} from '@/features/088-remote-view/server/remote-view-auth';
import { BOOTSTRAP_COOKIE_NAME, verifyCookieValue } from '@chainglass/shared/auth-bootstrap-code';
import { SignJWT } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';
import { getContainer } from '@/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

const TOKEN_EXPIRY = '5m';
const TOKEN_EXPIRY_SECONDS = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // (a) NextAuth session pre-check.
  const session = await auth();
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // (b) Bootstrap-cookie pre-check — defence-in-depth on top of the proxy gate.
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

  // (c) Sign with the same HKDF key the WS verifier will use. Buffer passed
  // directly to jose — no TextEncoder re-wrap. No `cwd` claim for remote-view.
  const token = await new SignJWT({
    sub: session.user.name,
    iss: REMOTE_VIEW_JWT_ISSUER,
    aud: REMOTE_VIEW_JWT_AUDIENCE,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(codeAndKey.key);

  // (d) Surface the daemon's loopback port so the browser can build the real
  // `ws://127.0.0.1:<port>/stream` url (Phase 6, T001 — DL-005, kills the Phase-3 stub).
  // ADDITIVE + back-compat: existing readers keep using `.token`. The port is best-effort —
  // a daemon that won't come up MUST NOT block token issuance (the client surfaces daemonDown
  // through the normal reconnect/health path), so resolution failure just omits `daemonPort`.
  let daemonPort: number | undefined;
  try {
    const control = getContainer().resolve<RemoteViewDaemonControl>(
      REMOTE_VIEW_DAEMON_CONTROL_TOKEN
    );
    daemonPort = await control.daemonPort();
  } catch {
    daemonPort = undefined;
  }

  return NextResponse.json({ token, expiresIn: TOKEN_EXPIRY_SECONDS, daemonPort });
}
