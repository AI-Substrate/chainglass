/**
 * HMAC-SHA256 asset-token sign/verify with timing-safe compare.
 *
 * Plan 084 FX011. HtmlViewer renders HTML inside a sandboxed iframe
 * (`sandbox="allow-scripts"`) whose opaque origin strips the HttpOnly
 * `chainglass-bootstrap` cookie from sub-resource requests. The asset
 * token is a short-lived, worktree-bound HMAC the iframe carries in
 * the URL as `?_at=<token>` so the proxy + raw-file route can authorise
 * the request without the cookie.
 *
 * Token shape:
 *   `<expSecs>.<base64url(HMAC-SHA256(key, "asset:" + worktree + ":" + expSecs))>`
 *
 * The literal `"asset:"` prefix in the HMAC input is type-tagging per
 * NIST SP 800-108 § 8.2 (domain separation): it prevents an attacker
 * from substituting a cookie HMAC for an asset-token HMAC under the
 * same key. Rotating the bootstrap key invalidates both — the correct
 * shared-fate semantics.
 *
 * Stateless: rotating the code, rotating the key, or letting the
 * timestamp expire each invalidates outstanding tokens with no
 * server-side bookkeeping.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Mint an asset token bound to `worktree`, valid for `ttlSeconds`.
 *
 * `worktree` is passed verbatim — callers are responsible for canonical
 * form (the same string used at mint must be supplied at verify, so the
 * mint route and the raw-file route must agree on which query param
 * carries the worktree).
 */
export function buildAssetToken(
  worktree: string,
  key: Buffer,
  ttlSeconds: number
): { token: string; expiresAt: number } {
  const expSecs = Math.floor(Date.now() / 1000) + ttlSeconds;
  const hmac = createHmac('sha256', key)
    .update(`asset:${worktree}:${expSecs}`, 'utf-8')
    .digest('base64url');
  return { token: `${expSecs}.${hmac}`, expiresAt: expSecs * 1000 };
}

/**
 * Verify an asset token against the expected `worktree` and `key`.
 *
 * Returns `false` for `undefined`/`null`/empty/malformed/expired/
 * mismatched inputs. Length pre-check before `timingSafeEqual` is
 * load-bearing (RangeError-safe — same defensive pattern as
 * `verifyCookieValue`).
 *
 * Expiry boundary: `nowSeconds >= expSecs` is expired
 * (`now == expSecs` is the exact-moment edge — expired).
 */
export function verifyAssetToken(
  token: string | undefined,
  worktree: string,
  key: Buffer,
  nowSeconds: number
): boolean {
  if (token === undefined || token === null || token.length === 0) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  // Reject 3+ parts — exactly one dot allowed.
  if (token.indexOf('.', dot + 1) >= 0) return false;
  const expPart = token.slice(0, dot);
  const hmacPart = token.slice(dot + 1);
  if (expPart.length === 0 || hmacPart.length === 0) return false;
  if (!/^[0-9]+$/.test(expPart)) return false;
  const expSecs = Number.parseInt(expPart, 10);
  if (!Number.isFinite(expSecs) || expSecs <= 0) return false;
  if (nowSeconds >= expSecs) return false;
  const expected = createHmac('sha256', key)
    .update(`asset:${worktree}:${expSecs}`, 'utf-8')
    .digest('base64url');
  if (hmacPart.length !== expected.length) return false;
  const a = Buffer.from(hmacPart, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  return timingSafeEqual(a, b);
}
