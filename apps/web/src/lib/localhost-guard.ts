import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { socketPeerAddress } from './socket-peer';

/**
 * Localhost-only guard. `isLocalhostRequest` backs `requireLocalAuth` and the proxy's
 * X-Local-Token short-circuit; `localhostGuard` gates routes that must only be callable from
 * localhost (e.g. `/api/workspaces/[slug]/files/open`).
 *
 * "Local" means the TCP peer is a loopback address. The peer comes from the socket: the stamp
 * installed by `installPeerAddressStamp()` (socket-peer.ts) records it on every request before
 * Next sees it, tagged with a per-process token the client never sees. No client header is
 * trusted: not Host, not X-Forwarded-For, not a client-sent copy of the stamp header.
 *
 * Rules:
 * 1. No stamped peer (stamp not installed, header missing or forged) → not local (fail closed).
 * 2. Peer not loopback → not local.
 * 3. A non-loopback X-Forwarded-For hop → not local: the peer is a reverse proxy relaying a
 *    remote client. (Next itself fills XFF with the socket address when the client sent none.)
 */

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalhostRequest(request: NextRequest): boolean {
  const peer = socketPeerAddress(request.headers);
  if (!peer || !LOOPBACK_IPS.has(peer)) return false;

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    for (const hop of xff.split(',')) {
      if (!LOOPBACK_IPS.has(hop.trim())) return false;
    }
  }
  return true;
}

/**
 * Returns a 403 response if the request is not from localhost, or null if it may proceed.
 */
export function localhostGuard(request: NextRequest): NextResponse | null {
  if (isLocalhostRequest(request)) {
    return null;
  }

  return NextResponse.json({ error: 'Forbidden: localhost only' }, { status: 403 });
}
