import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Plan 067: Event Popper Infrastructure
 *
 * Localhost-only guard for `/api/event-popper/*` routes.
 * These routes bypass authentication but must only be callable from localhost.
 *
 * Security rules:
 * 1. Reject any request with X-Forwarded-For header (proxy bypass prevention)
 * 2. Check request.ip for loopback addresses (127.0.0.1, ::1)
 * 3. Check Host header as fallback
 */

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Check if a request originates from localhost.
 * Returns false if the request has X-Forwarded-For (proxy indicator).
 * Only trusts the socket-level peer address (request.ip), never client headers.
 */
export function isLocalhostRequest(request: NextRequest): boolean {
  // Reject proxied requests — if X-Forwarded-For is present, a proxy is involved
  if (request.headers.get('x-forwarded-for')) {
    return false;
  }

  // Only trust request.ip (resolved from socket, not headers)
  if (request.ip && LOOPBACK_IPS.has(request.ip)) {
    return true;
  }

  // Fail closed — if no trusted peer address is available, deny access.
  // This preserves security when the runtime doesn't provide request.ip.
  return false;
}

/**
 * Guard middleware for event-popper routes.
 * Returns a 403 response if the request is not from localhost.
 * Returns null if the request is allowed (caller should proceed).
 */
export function localhostGuard(request: NextRequest): NextResponse | null {
  if (isLocalhostRequest(request)) {
    return null;
  }

  return NextResponse.json({ error: 'Forbidden: localhost only' }, { status: 403 });
}
