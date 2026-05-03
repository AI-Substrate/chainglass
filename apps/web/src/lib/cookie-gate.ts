/**
 * Plan 084 Phase 3 — pure cookie-gate decision used by proxy.ts.
 *
 * Extracted so unit tests can exercise routing decisions without booting
 * Auth.js. The proxy callback calls this first; on `bypass` or
 * `cookie-valid` it falls through to the existing `auth()` chain. On
 * `cookie-missing-api` it returns 401; on `cookie-missing-page` it returns
 * `next()` so RootLayout's `<BootstrapGate>` can paint the popup.
 */
import {
  BOOTSTRAP_COOKIE_NAME,
  verifyCookieValue,
} from '@chainglass/shared/auth-bootstrap-code';

import type { BootstrapCodeAndKey } from './bootstrap-code';

/**
 * Bypass routes — locked contract.
 *
 * **Always-public** (Phase 3):
 *   - `/api/health` — load-balancer probes
 *   - `/api/auth` — NextAuth subroutes (callback/signin/signout)
 *   - `/api/bootstrap/verify` — accepts the typed code
 *   - `/api/bootstrap/forget` — clears the cookie
 *
 * **Localhost-gated by their own composite check** (Phase 7 F001 fix —
 * minih review on Phase 7 surfaced that `bootstrapCookieStage` was rejecting
 * token-only CLI requests with 401 before the route handler's
 * `requireLocalAuth` could ever run, breaking AC-17 at the system level for
 * the sink routes):
 *   - `/api/event-popper` — 8 sinks, gated by `requireLocalAuth` in handlers
 *   - `/api/tmux/events` — gated by `requireLocalAuth` in handler
 *
 * `/api/events/*` (SSE) and `/api/terminal/token` are NOT bypassed — they
 * legitimately need the cookie gate (browser flows; session-bearing).
 *
 * The intent of layering for sinks is "localhost + (cookie OR X-Local-Token)";
 * the proxy gate enforced "cookie OR reject", which collapsed the OR to AND
 * for token-only callers. Bypassing here lets the composite gate live in one
 * place (the route handler).
 */
export const AUTH_BYPASS_ROUTES = [
  '/api/health',
  '/api/auth',
  '/api/bootstrap/verify',
  '/api/bootstrap/forget',
  '/api/event-popper',
  '/api/tmux/events',
] as const;

export type GateDecision =
  | { kind: 'bypass' }
  | { kind: 'cookie-valid' }
  | { kind: 'cookie-missing-api' }
  | { kind: 'cookie-missing-page' };

export interface RequestLike {
  readonly nextUrl: { readonly pathname: string };
  readonly cookies: { get(name: string): { value: string } | undefined };
}

export function isBypassPath(pathname: string): boolean {
  for (const prefix of AUTH_BYPASS_ROUTES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

export function evaluateCookieGate(
  req: RequestLike,
  codeAndKey: BootstrapCodeAndKey,
): GateDecision {
  const pathname = req.nextUrl.pathname;
  if (isBypassPath(pathname)) return { kind: 'bypass' };

  const cookieValue = req.cookies.get(BOOTSTRAP_COOKIE_NAME)?.value;
  const valid = verifyCookieValue(cookieValue, codeAndKey.code, codeAndKey.key);
  if (valid) return { kind: 'cookie-valid' };

  if (pathname.startsWith('/api/')) return { kind: 'cookie-missing-api' };
  return { kind: 'cookie-missing-page' };
}
