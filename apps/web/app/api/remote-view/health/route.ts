/**
 * GET /api/remote-view/health — the daemon health verdict (Plan 088 Phase 5, T004).
 *
 * NextAuth-gated through the shared `requireRemoteViewSession` gate (401 before any daemon work).
 * `control.health()` runs the manager's spawn / crash-respawn / version handshake (T001) BEFORE
 * reading the verdict, so a 200 reflects a live, version-matched daemon. The Phase-3 picker hook
 * reads `.ok`, so a daemon that can't be brought up returns a shaped `{ ok: false, … }` (503)
 * rather than an opaque crash.
 */
import {
  REMOTE_VIEW_DAEMON_CONTROL_TOKEN,
  type RemoteViewDaemonControl,
} from '@/features/088-remote-view/server/daemon-control';
import { requireRemoteViewSession } from '@/features/088-remote-view/server/remote-view-auth';
import { getContainer } from '@/lib/bootstrap-singleton';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const gate = await requireRemoteViewSession();
  if (!gate.ok) return gate.response;

  const control = getContainer().resolve<RemoteViewDaemonControl>(REMOTE_VIEW_DAEMON_CONTROL_TOKEN);
  try {
    const verdict = await control.health();
    return NextResponse.json(verdict);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'daemon health unavailable';
    return NextResponse.json({ ok: false, error: 'E_INTERNAL', message }, { status: 503 });
  }
}
