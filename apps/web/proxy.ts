import { timingSafeEqual } from 'node:crypto';

import { findWorkspaceRoot, verifyAssetToken } from '@chainglass/shared/auth-bootstrap-code';
import { readServerInfo } from '@chainglass/shared/event-popper';

import { auth, isOAuthDisabled } from '@/auth';
import { isAssetTokenEligiblePath } from '@/lib/asset-token-gate';
import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';
import { evaluateCookieGate, isBypassPath } from '@/lib/cookie-gate';
import { isLocalhostRequest } from '@/lib/localhost-guard';
import {
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
  NextResponse,
} from 'next/server';

/**
 * Plan 084 Phase 3 — bootstrap-cookie stage of the proxy chain. Returns:
 *  - `'bypass'` — short-circuit BOTH the cookie gate and the Auth.js chain.
 *    Two flavours of bypass live here (see `AUTH_BYPASS_ROUTES` in
 *    `cookie-gate.ts` for the locked contract): always-public routes
 *    (`/api/health`, `/api/auth/*`, `/api/bootstrap/verify`,
 *    `/api/bootstrap/forget`) AND localhost-gated-by-their-own-check sink
 *    routes (`/api/event-popper`, `/api/tmux/events` — Phase 7 F001 fix
 *    after minih flagged that the proxy was blocking token-only CLI flows
 *    before the route handlers' composite `requireLocalAuth` could run).
 *  - `'proceed'` — request passes the cookie gate and should fall
 *    through to the Auth.js chain (`DISABLE_AUTH` + `req.auth`).
 *  - a `NextResponse` — short-circuit the entire chain with that response
 *    (401 / 503 / `next()`).
 *
 * Bypass routes MUST short-circuit BEFORE the accessor — so a
 * missing/unreadable `bootstrap-code.json` never blocks the recovery path
 * (the verify route is a bypass, and so is health). They MUST also skip
 * the Auth.js chain — bypassed sink routes have their own `requireLocalAuth`
 * composite gate that handles auth, so the proxy stays out of the way.
 * For all other paths, resolve the active code+key and run the cookie gate.
 */
export type BootstrapStageResult = 'bypass' | 'proceed' | NextResponse;

export async function bootstrapCookieStage(req: NextRequest): Promise<BootstrapStageResult> {
  if (isBypassPath(req.nextUrl.pathname)) {
    return 'bypass';
  }

  // Plan 084 FX011: asset-token short-circuit for HtmlViewer sub-resource
  // requests from sandboxed iframes.
  //
  // The HtmlViewer renders HTML inside `sandbox="allow-scripts"`, which gives
  // the iframe an opaque origin — the browser strips the HttpOnly bootstrap
  // cookie from every sub-resource fetch. To still authenticate `<img>` /
  // `<link>` / `<script>` requests, the parent (cookie-authenticated) React
  // mints a short-lived HMAC-signed token via /api/bootstrap/asset-token and
  // splices it into rewritten asset URLs as `?_at=<token>`.
  //
  // Scope discipline: this check is intentionally regex-narrow (raw-file
  // route only via `isAssetTokenEligiblePath`). Broadening would let any
  // caller bypass the cookie gate for any route by carrying a valid asset
  // token, defeating the always-on local gate.
  //
  // Silent fallthrough on invalid/missing token (mirrors the X-Local-Token
  // shape below) — cookie-bearing requests still pass the next stage.
  if (isAssetTokenEligiblePath(req.nextUrl.pathname)) {
    const at = req.nextUrl.searchParams.get('_at');
    const wt = req.nextUrl.searchParams.get('worktree');
    if (at && wt) {
      try {
        const codeAndKey = await getBootstrapCodeAndKey();
        const nowS = Math.floor(Date.now() / 1000);
        if (verifyAssetToken(at, wt, codeAndKey.key, nowS)) {
          return 'bypass';
        }
      } catch {
        // Bootstrap-code read failure → fall through to existing handling
        // (which will produce 503 for /api/* below).
      }
    }
  }

  // Plan 084 Phase 7 F001 round 4 (minih review): CLI-token short-circuit
  // with constant-time validation against `.chainglass/server.json`.
  //
  // Round 2 trusted any non-empty token on localhost — security regression
  // (proxy is the only gate for dashboard pages that don't call `auth()`).
  // Round 3 added `timingSafeEqual` against `readServerInfo().localToken` but
  // only checked the workspace-root location, missing the cwd-only legacy
  // layout that `_resolve-worktree.ts` (`authenticateRequest`) also accepts.
  // Round 4 mirrors the route-handler's exact fallback chain (cwd first,
  // then walk-up workspace root) so a token accepted by the route layer is
  // never bounced by the proxy with 401.
  //
  // Wrong/missing token → fall through to the cookie gate. Non-loopback
  // callers fall through unconditionally — `isLocalhostRequest` is socket-
  // trusted. Trust model: localhost + matching token = filesystem access
  // on the same host (Plan 067), which already grants full HTTP.
  //
  // FOLLOW-UP: this triplet (`requireLocalAuth`, `authenticateRequest`,
  // `bootstrapCookieStage`) all read+compare the same token against the same
  // file. Extract to a shared `validateLocalToken(headerValue)` helper so
  // proxy / sink-handlers / workflow-REST never drift again.
  const tokenHeader = req.headers.get('x-local-token');
  if (tokenHeader && tokenHeader.length > 0 && isLocalhostRequest(req)) {
    try {
      const cwd = process.cwd();
      let workspaceRoot: string | undefined;
      try {
        workspaceRoot = findWorkspaceRoot(cwd);
      } catch {
        workspaceRoot = undefined;
      }
      const info =
        readServerInfo(cwd) ??
        (workspaceRoot !== undefined && workspaceRoot !== cwd
          ? readServerInfo(workspaceRoot)
          : null);
      const expected = info?.localToken;
      if (
        typeof expected === 'string' &&
        expected.length > 0 &&
        expected.length === tokenHeader.length &&
        timingSafeEqual(Buffer.from(tokenHeader, 'utf-8'), Buffer.from(expected, 'utf-8'))
      ) {
        return 'bypass';
      }
    } catch {
      // Any read/walk error → fall through to cookie gate.
    }
  }

  let codeAndKey: Awaited<ReturnType<typeof getBootstrapCodeAndKey>> | undefined;
  try {
    codeAndKey = await getBootstrapCodeAndKey();
  } catch {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'bootstrap-unavailable' }, { status: 503 });
    }
    return NextResponse.next();
  }

  const decision = evaluateCookieGate(req, codeAndKey);
  switch (decision.kind) {
    case 'cookie-missing-api':
      return NextResponse.json({ error: 'bootstrap-required' }, { status: 401 });
    case 'cookie-missing-page':
      return NextResponse.next();
    case 'bypass':
    case 'cookie-valid':
      return 'proceed';
  }
}

/**
 * Plan 084 Phase 5 F001 fix — bootstrap-cookie gate now runs OUTSIDE the
 * `auth(...)` wrapper. The wrapper itself, when `isOAuthDisabled()` is true,
 * returns a pass-through middleware that never invokes the supplied callback;
 * keeping the bootstrap-cookie gate inside that callback meant `DISABLE_*=true`
 * silently bypassed the entire popup gate. Hoisting the gate above the wrapper
 * makes the bootstrap layer unconditional — runs for every non-bypass path,
 * regardless of OAuth env-var state.
 */
// NextAuth v5 `auth(callback)` is overloaded: a 1-arg callback matches BOTH the
// App-Router-handler overload (req, AppRouteHandlerFnContext) and the
// NextAuthMiddleware overload (req, NextFetchEvent). Overload resolution is
// driven by the callback's arguments, NOT the assignment target — so TS picks
// the first (handler) overload and a `: NextMiddleware` annotation can't steer
// it; it only produces a type mismatch. At runtime `auth(cb)` is a universal
// handler that works as Next middleware, so we assert the result to
// `NextMiddleware` (the form we invoke as `oauthMiddleware(req, event)` below).
const oauthMiddleware = auth(async (req) => {
  // This callback only runs when OAuth is ENABLED (auth.ts wrapper short-
  // circuits to `(req) => NextResponse.next()` when disabled). Belt-and-
  // suspenders `isOAuthDisabled()` check kept for readability.
  if (isOAuthDisabled()) {
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
}) as unknown as NextMiddleware;

const proxyMiddleware: NextMiddleware = async (req: NextRequest, event: NextFetchEvent) => {
  const bootstrapResult = await bootstrapCookieStage(req);
  if (bootstrapResult === 'bypass') {
    // Public route — short-circuit BOTH the cookie gate and the Auth.js chain
    // so `/api/health`, `/api/auth/*`, `/api/bootstrap/verify`,
    // `/api/bootstrap/forget` remain reachable without a session. The original
    // (pre-Phase-3) proxy excluded these via matcher; the broadened matcher
    // delegates the same exclusion to AUTH_BYPASS_ROUTES.
    return NextResponse.next();
  }
  if (bootstrapResult !== 'proceed') return bootstrapResult;

  // Bootstrap cookie verified (or skipped for bypass) — now run the OAuth
  // chain. When `DISABLE_GITHUB_OAUTH=true` (or legacy `DISABLE_AUTH=true`),
  // `oauthMiddleware` is a pass-through `(req) => NextResponse.next()` from
  // auth.ts wrapper, so this returns next() immediately. Critically, the
  // bootstrap gate ABOVE has already enforced the cookie — the OAuth
  // short-circuit cannot bypass it (Phase 5 F001 fix).
  return oauthMiddleware(req, event);
};

export default proxyMiddleware;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest).*)'],
};
