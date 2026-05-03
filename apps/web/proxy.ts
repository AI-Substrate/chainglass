import { auth } from '@/auth';
import { evaluateCookieGate, isBypassPath } from '@/lib/cookie-gate';
import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Plan 084 Phase 3 — bootstrap-cookie stage of the proxy chain. Returns:
 *  - `'bypass'` — short-circuit BOTH the cookie gate and the Auth.js
 *    chain (always public — `/api/health`, `/api/auth/*`,
 *    `/api/bootstrap/verify`, `/api/bootstrap/forget`).
 *  - `'proceed'` — request passes the cookie gate and should fall
 *    through to the Auth.js chain (`DISABLE_AUTH` + `req.auth`).
 *  - a `NextResponse` — short-circuit the entire chain with that response
 *    (401 / 503 / `next()`).
 *
 * Bypass routes MUST short-circuit BEFORE the accessor — so a
 * missing/unreadable `bootstrap-code.json` never blocks the recovery path
 * (the verify route is a bypass, and so is health). They MUST also skip
 * the Auth.js chain — `/api/health` and `/api/bootstrap/{verify,forget}`
 * are unauthenticated by design (the original proxy excluded them via
 * matcher; the broadened Phase 3 matcher needs the bypass list to do the
 * same job). For all other paths, resolve the active code+key and run
 * the cookie gate.
 */
export type BootstrapStageResult = 'bypass' | 'proceed' | NextResponse;

export async function bootstrapCookieStage(
  req: Pick<NextRequest, 'nextUrl' | 'cookies'>,
): Promise<BootstrapStageResult> {
  if (isBypassPath(req.nextUrl.pathname)) {
    return 'bypass';
  }

  let codeAndKey;
  try {
    codeAndKey = await getBootstrapCodeAndKey();
  } catch {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'bootstrap-unavailable' },
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const decision = evaluateCookieGate(req, codeAndKey);
  switch (decision.kind) {
    case 'cookie-missing-api':
      return NextResponse.json(
        { error: 'bootstrap-required' },
        { status: 401 },
      );
    case 'cookie-missing-page':
      return NextResponse.next();
    case 'bypass':
    case 'cookie-valid':
      return 'proceed';
  }
}

export default auth(async (req) => {
  const bootstrapResult = await bootstrapCookieStage(req);
  if (bootstrapResult === 'bypass') {
    // Public route — short-circuit the Auth.js chain so `/api/health`,
    // `/api/auth/*`, `/api/bootstrap/verify`, `/api/bootstrap/forget`
    // remain reachable without a session. The original (pre-Phase-3)
    // proxy excluded these via matcher; the broadened matcher delegates
    // the same exclusion to AUTH_BYPASS_ROUTES.
    return NextResponse.next();
  }
  if (bootstrapResult !== 'proceed') return bootstrapResult;

  if (process.env.DISABLE_AUTH === 'true') {
    return NextResponse.next();
  }
  if (!req.auth) {
    const isApiRoute = req.nextUrl.pathname.startsWith('/api/');
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest).*)',
  ],
};
