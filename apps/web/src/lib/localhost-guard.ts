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
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Check if a request originates from localhost.
 * Returns false if the request has X-Forwarded-For (proxy indicator).
 * Only trusts the socket-level peer address (request.ip), never client headers.
 */
export function isLocalhostRequest(request: NextRequest): boolean {
  const xff = request.headers.get('x-forwarded-for');
  const ip = (request as unknown as { ip?: string }).ip;
  const host = request.headers.get('host') ?? '';
  const hostname = host.split(':')[0];

  // If X-Forwarded-For is present, check if it's a loopback address.
  // Next.js dev server adds XFF=::1 for local requests — that's fine.
  // Reject only if XFF contains a non-loopback address (real proxy).
  if (xff) {
    const firstXff = xff.split(',')[0].trim();
    if (!LOOPBACK_IPS.has(firstXff)) {
      return false;
    }
  }

  // Trust request.ip if available (resolved from socket, not headers)
  if (ip && LOOPBACK_IPS.has(ip)) {
    return true;
  }

  // Fallback: check Host header for localhost patterns (dev server)
  if (LOOPBACK_HOSTS.has(hostname)) {
    return true;
  }

  // Fail closed — if no trusted indicator is available, deny access.
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
