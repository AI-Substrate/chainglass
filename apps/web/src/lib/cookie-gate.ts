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
 * The 4 explicit bypass routes — locked contract, no extras allowed.
 * Phase 5 must NOT add `/api/event-popper/*`, `/api/tmux/events`,
 * `/api/events/*`, or `/api/terminal/token` here. Those go through the cookie
 * gate first, then their own composite checks.
 */
export const AUTH_BYPASS_ROUTES = [
  '/api/health',
  '/api/auth',
  '/api/bootstrap/verify',
  '/api/bootstrap/forget',
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
