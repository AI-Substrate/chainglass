/**
 * GET /api/remote-view/windows — the picker's window catalog (Plan 088 Phase 5, T004).
 *
 * NextAuth-gated through the shared `requireRemoteViewSession` gate — the 401 is returned
 * BEFORE any daemon work (a route that skipped the gate could not reach a window list). The
 * web-side catalog enumerates ALL capturable host windows via the daemon-control surface
 * (`streamd --list-windows`, since a Node server cannot call ScreenCaptureKit); the streaming
 * daemon's own surface stays single-window (F005/F006). A missing Screen-Recording grant is
 * reported as a named 403 (AC-14: never a silent empty list).
 */
import {
  DaemonControlError,
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
    const windows = await control.listWindows();
    return NextResponse.json({ windows });
  } catch (err) {
    if (err instanceof DaemonControlError && err.code === 'E_PERMISSION') {
      return NextResponse.json({ error: 'E_PERMISSION', message: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : 'window enumeration failed';
    return NextResponse.json({ error: 'E_INTERNAL', message }, { status: 500 });
  }
}
