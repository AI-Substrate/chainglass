/**
 * Plan 084 Phase 5 T002 — composite localhost + bootstrap-credential check for
 * sidecar HTTP sinks (`/api/event-popper/*`, `/api/tmux/events`).
 *
 * Closes Finding 02 (sinks formerly relied on `localhostGuard` alone — any
 * loopback process could post). Now requires localhost AND either:
 *   - the bootstrap cookie (browser flow — set by the verify route after the
 *     operator types the code), OR
 *   - the `X-Local-Token` header (CLI flow — value pulled from
 *     `.chainglass/server.json` per Plan 067 / Finding 06).
 *
 * Mirrors Phase 4's `UpgradeAuthResult` discriminated-union pattern (drop
 * `closeReason` — route handlers return JSON, not WS close frames).
 *
 * **Security assumptions inherited from `localhostGuard`** (Phase 5 Completeness
 * fix #8): trusts `request.ip` (resolved from socket, not headers); rejects
 * non-loopback `X-Forwarded-For`. Deployment behind an honest reverse proxy is
 * required — a misconfigured proxy that passes XFF unaltered lets attackers
 * spoof loopback. See `localhost-guard.ts` for the trust model.
 *
 * **Logging contract (AC-22 / FC-C4)**: this module never logs the bootstrap
 * code value or the `localToken` value. The single warn path (bootstrap-code
 * unreadable) emits a fixed, secret-free string.
 *
 * @module apps/web/src/lib/local-auth
 */
import { timingSafeEqual } from 'node:crypto';

import {
  BOOTSTRAP_COOKIE_NAME,
  findWorkspaceRoot,
  verifyCookieValue,
} from '@chainglass/shared/auth-bootstrap-code';
import { readServerInfo } from '@chainglass/shared/event-popper';
import type { NextRequest } from 'next/server';

import { getBootstrapCodeAndKey } from './bootstrap-code';
import { isLocalhostRequest } from './localhost-guard';

/**
 * Discriminated-union result type. Failure variants carry a verbose
 * machine-readable `reason` string that route handlers map to HTTP status:
 *   - `not-localhost` → 403
 *   - `bootstrap-unavailable` → 503 (server-side; investigate config)
 *   - `no-credential` → 401 (client lacks both cookie and token)
 *   - `bad-credential` → 401 (cookie or token present but invalid)
 */
export type LocalAuthResult =
  | { ok: true; via: 'cookie' | 'local-token' }
  | {
      ok: false;
      reason: 'not-localhost' | 'no-credential' | 'bad-credential' | 'bootstrap-unavailable';
    };

/**
 * Composite localhost + bootstrap-credential check.
 *
 * Order:
 *   1. `isLocalhostRequest(req)` — non-loopback rejected outright.
 *   2. `getBootstrapCodeAndKey()` — if it throws, log a SECRET-FREE warning
 *      and return `bootstrap-unavailable` (operator must restore the file).
 *   3. Cookie path — if `chainglass-bootstrap` cookie is present and HMAC
 *      verifies, accept. If present but invalid, reject as `bad-credential`
 *      (DO NOT fall through to the token path — cookie tried first per
 *      dossier T001 case (g)).
 *   4. Token path — if `X-Local-Token` header present, length-check then
 *      `timingSafeEqual` against `readServerInfo().localToken`. Wrong length
 *      or wrong bytes → `bad-credential`. Missing `localToken` field on a
 *      legacy server.json → `bad-credential` (consistent with "client sent
 *      a token we can't verify").
 *   5. Neither cookie nor token present → `no-credential`.
 */
export async function requireLocalAuth(req: NextRequest): Promise<LocalAuthResult> {
  if (!isLocalhostRequest(req)) {
    return { ok: false, reason: 'not-localhost' };
  }

  let codeAndKey;
  try {
    codeAndKey = await getBootstrapCodeAndKey();
  } catch {
    // SECRET-FREE warn message (AC-22): never interpolate `code` or any other
    // value that could leak the bootstrap secret into log capture.
    console.warn(
      '[requireLocalAuth] bootstrap-code.json unreadable; rejecting all requests until restored',
    );
    return { ok: false, reason: 'bootstrap-unavailable' };
  }

  const cookieValue = req.cookies.get(BOOTSTRAP_COOKIE_NAME)?.value;
  if (cookieValue !== undefined && cookieValue.length > 0) {
    if (verifyCookieValue(cookieValue, codeAndKey.code, codeAndKey.key)) {
      return { ok: true, via: 'cookie' };
    }
    // Cookie present but invalid → fail fast (do not fall through to token).
    return { ok: false, reason: 'bad-credential' };
  }

  const tokenHeader = req.headers.get('x-local-token');
  if (tokenHeader !== null && tokenHeader.length > 0) {
    const info = readServerInfo(findWorkspaceRoot(process.cwd()));
    const expected = info?.localToken;
    if (typeof expected !== 'string' || expected.length === 0) {
      // Legacy server.json (pre-Plan-067) lacks localToken — can't verify.
      return { ok: false, reason: 'bad-credential' };
    }
    // Length pre-check (Completeness fix #1): timingSafeEqual throws RangeError
    // on length mismatch; reject short attacker probes cleanly.
    if (tokenHeader.length !== expected.length) {
      return { ok: false, reason: 'bad-credential' };
    }
    const a = Buffer.from(tokenHeader, 'utf-8');
    const b = Buffer.from(expected, 'utf-8');
    if (timingSafeEqual(a, b)) {
      return { ok: true, via: 'local-token' };
    }
    return { ok: false, reason: 'bad-credential' };
  }

  return { ok: false, reason: 'no-credential' };
}
