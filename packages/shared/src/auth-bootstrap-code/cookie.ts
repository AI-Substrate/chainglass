/**
 * HMAC-SHA256 cookie sign/verify with timing-safe compare.
 *
 * Plan 084 Phase 1 T004. The cookie value is the base64url-encoded HMAC
 * of the bootstrap code under the active signing key. Stateless
 * verification — rotating the code or the key invalidates every cookie.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { BOOTSTRAP_COOKIE_NAME, BOOTSTRAP_COOKIE_NAME_SECURE } from './types.js';

/** Compute the cookie value: `base64url(HMAC-SHA256(key, code))`. */
export function buildCookieValue(code: string, key: Buffer): string {
  return createHmac('sha256', key).update(code, 'utf-8').digest('base64url');
}

/**
 * Verify a cookie value against the expected `code` and `key`.
 *
 * Returns `false` for `undefined`, empty, length-mismatched, or HMAC-mismatched
 * inputs. Uses `timingSafeEqual` over equal-length Buffers — length pre-check
 * avoids `timingSafeEqual` throwing on size mismatch.
 */
export function verifyCookieValue(value: string | undefined, code: string, key: Buffer): boolean {
  if (value === undefined || value.length === 0) return false;
  const expected = buildCookieValue(code, key);
  if (value.length !== expected.length) return false;
  const a = Buffer.from(value, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  return timingSafeEqual(a, b);
}

/**
 * The bootstrap cookie value to check from a request's cookies. It is set as
 * `__Secure-chainglass-bootstrap` over HTTPS and `chainglass-bootstrap` over
 * HTTP, and a browser that used both sends both over HTTPS: returns whichever
 * verifies, else the first present (so callers can tell "present but stale"
 * from "absent"), else `undefined`.
 */
export function readBootstrapCookie(
  cookies: { get(name: string): { value: string } | undefined },
  code: string,
  key: Buffer
): string | undefined {
  const values = [BOOTSTRAP_COOKIE_NAME_SECURE, BOOTSTRAP_COOKIE_NAME]
    .map((name) => cookies.get(name)?.value)
    .filter((value): value is string => value !== undefined && value.length > 0);
  return values.find((value) => verifyCookieValue(value, code, key)) ?? values[0];
}
