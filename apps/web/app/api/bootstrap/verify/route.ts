/**
 * Plan 084 Phase 3 — `POST /api/bootstrap/verify` route.
 *
 * Verifies a user-submitted bootstrap code against the active code on disk
 * and, on success, sets the bootstrap HttpOnly session cookie (`chainglass-bootstrap` over HTTP,
 * `__Secure-chainglass-bootstrap` over HTTPS).
 *
 * Status codes (locked contract for Phase 6 popup):
 *   200 → `{ ok: true }` + Set-Cookie
 *   400 → `{ error: 'invalid-format' }` (bad regex, malformed JSON, empty body, missing field)
 *   401 → `{ error: 'wrong-code' }`
 *   429 → `{ error: 'rate-limited', retryAfterMs: number }` + `Retry-After` header
 *   503 → `{ error: 'unavailable' }` (file missing / unreadable)
 *
 * Cookie attributes:
 *   HttpOnly + SameSite=Lax + Path=/ + (Secure, and the `__Secure-` name, when the request came
 *   over HTTPS) +
 *   Max-Age=2592000 (30 days). iOS Safari / Edge aggressively evict
 *   session cookies when tabs are backgrounded; mobile users were being
 *   re-prompted next-day. Server-side rotation still invalidates the
 *   cookie via HMAC mismatch — Max-Age is complementary, not conflicting.
 *
 * Rate limit: 5 attempts per client per 60s leaky-bucket, keyed on the client address recorded by
 * the socket-peer stamp (`@/lib/socket-peer` `requestClient`): the TCP peer, or behind the TLS
 * front the front's client (trusted only when the request carries the front's secret). Never
 * keyed on client headers: keyed on X-Forwarded-For, a client could rotate the header and get a
 * fresh budget per request. Requests without a stamp share one bucket. In-memory `Map`,
 * cleared on process restart. Defence-in-depth — primary defence is 60-bit
 * code entropy. CSRF: SameSite=Lax blocks cross-site POST; Origin allowlist
 * is Phase 4's concern (terminal-WS).
 */
import { timingSafeEqual } from 'node:crypto';

import {
  BOOTSTRAP_CODE_PATTERN,
  BOOTSTRAP_COOKIE_NAME,
  BOOTSTRAP_COOKIE_NAME_SECURE,
  buildCookieValue,
} from '@chainglass/shared/auth-bootstrap-code';
import { type NextRequest, NextResponse } from 'next/server';

import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';
import { requestClient } from '@/lib/socket-peer';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function sweepExpired(now: number): void {
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      buckets.delete(ip);
    }
  }
}

interface RateCheckResult {
  ok: boolean;
  retryAfterMs: number;
}

function checkRateLimit(ip: string, now: number): RateCheckResult {
  sweepExpired(now);
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return { ok: true, retryAfterMs: 0 };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart);
    return { ok: false, retryAfterMs: Math.max(retryAfterMs, 1) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * `Secure` follows the request's real protocol (`requestClient().secure`: the socket's own, or
 * the TLS front's https when the request proves it came through the front), never NODE_ENV: a
 * Secure cookie set over plain http is dropped by the browser, so prod on `http://<LAN IP>` could
 * never sign in. Over HTTPS the cookie is `__Secure-chainglass-bootstrap`, a different name, so
 * it never shadows the plain-HTTP one: a browser may not set a cookie over http whose name and
 * host match a Secure one (ports don't count), which would break http sign-in on that host.
 */
function buildSetCookie(value: string, secure: boolean): string {
  const parts = [
    `${secure ? BOOTSTRAP_COOKIE_NAME_SECURE : BOOTSTRAP_COOKIE_NAME}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function jsonError(
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rate-limit key: the stamped client. Unstamped requests all share one bucket (fail closed).
  const client = requestClient(request.headers);
  const ip = client?.address ?? 'unstamped';
  const now = Date.now();

  // Rate limit FIRST so a flood of bad bodies doesn't burn through file IO.
  const rate = checkRateLimit(ip, now);
  if (!rate.ok) {
    return jsonError(
      429,
      { error: 'rate-limited', retryAfterMs: rate.retryAfterMs },
      { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) }
    );
  }

  // Body parse — any failure → 400 invalid-format
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, { error: 'invalid-format' });
  }

  const submitted =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string'
      ? (body as { code: string }).code
      : null;

  if (!submitted || !BOOTSTRAP_CODE_PATTERN.test(submitted)) {
    return jsonError(400, { error: 'invalid-format' });
  }

  // Resolve active code + key. Failure → 503.
  let codeAndKey: Awaited<ReturnType<typeof getBootstrapCodeAndKey>> | undefined;
  try {
    codeAndKey = await getBootstrapCodeAndKey();
  } catch {
    return jsonError(503, { error: 'unavailable' });
  }

  // Constant-time compare. Format-validated submitted code is exactly 14 chars,
  // matching the active code's length, so timingSafeEqual is safe without padding.
  const submittedBuf = Buffer.from(submitted, 'utf-8');
  const activeBuf = Buffer.from(codeAndKey.code, 'utf-8');
  if (submittedBuf.length !== activeBuf.length || !timingSafeEqual(submittedBuf, activeBuf)) {
    return jsonError(401, { error: 'wrong-code' });
  }

  // Match — issue cookie.
  const cookieValue = buildCookieValue(codeAndKey.code, codeAndKey.key);
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'Set-Cookie': buildSetCookie(cookieValue, client?.secure === true) },
    }
  );
}

/**
 * Reset the in-memory rate-limit buckets. **Test-only.**
 * @internal
 */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
