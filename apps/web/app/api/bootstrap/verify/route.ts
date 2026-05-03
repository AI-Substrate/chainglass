/**
 * Plan 084 Phase 3 — `POST /api/bootstrap/verify` route.
 *
 * Verifies a user-submitted bootstrap code against the active code on disk
 * and, on success, sets the `chainglass-bootstrap` HttpOnly session cookie.
 *
 * Status codes (locked contract for Phase 6 popup):
 *   200 → `{ ok: true }` + Set-Cookie
 *   400 → `{ error: 'invalid-format' }` (bad regex, malformed JSON, empty body, missing field)
 *   401 → `{ error: 'wrong-code' }`
 *   429 → `{ error: 'rate-limited', retryAfterMs: number }` + `Retry-After` header
 *   503 → `{ error: 'unavailable' }` (file missing / unreadable)
 *
 * Cookie attributes (locked):
 *   HttpOnly + SameSite=Lax + Path=/ + (Secure when NODE_ENV=production) +
 *   NO Max-Age, NO Expires (session cookie; rotation is the only expiry).
 *
 * Rate limit: 5 attempts per IP per 60s leaky-bucket. In-memory `Map`,
 * cleared on process restart. Defence-in-depth — primary defence is 60-bit
 * code entropy. CSRF: SameSite=Lax blocks cross-site POST; Origin allowlist
 * is Phase 4's concern (terminal-WS).
 */
import { timingSafeEqual } from 'node:crypto';

import {
  BOOTSTRAP_CODE_PATTERN,
  BOOTSTRAP_COOKIE_NAME,
  buildCookieValue,
} from '@chainglass/shared/auth-bootstrap-code';
import { type NextRequest, NextResponse } from 'next/server';

import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function ipFromRequest(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  // NextRequest has no `.ip` in all runtimes; fallback to a stable marker.
  return 'unknown';
}

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

function buildSetCookie(value: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${BOOTSTRAP_COOKIE_NAME}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

function jsonError(
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = ipFromRequest(request);
  const now = Date.now();

  // Rate limit FIRST so a flood of bad bodies doesn't burn through file IO.
  const rate = checkRateLimit(ip, now);
  if (!rate.ok) {
    return jsonError(
      429,
      { error: 'rate-limited', retryAfterMs: rate.retryAfterMs },
      { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) },
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
  let codeAndKey;
  try {
    codeAndKey = await getBootstrapCodeAndKey();
  } catch {
    return jsonError(503, { error: 'unavailable' });
  }

  // Constant-time compare. Format-validated submitted code is exactly 14 chars,
  // matching the active code's length, so timingSafeEqual is safe without padding.
  const submittedBuf = Buffer.from(submitted, 'utf-8');
  const activeBuf = Buffer.from(codeAndKey.code, 'utf-8');
  if (
    submittedBuf.length !== activeBuf.length ||
    !timingSafeEqual(submittedBuf, activeBuf)
  ) {
    return jsonError(401, { error: 'wrong-code' });
  }

  // Match — issue cookie.
  const cookieValue = buildCookieValue(codeAndKey.code, codeAndKey.key);
  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { 'Set-Cookie': buildSetCookie(cookieValue) } },
  );
}

/**
 * Reset the in-memory rate-limit buckets. **Test-only.**
 * @internal
 */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
