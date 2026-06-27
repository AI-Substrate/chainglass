/**
 * GET /api/remote-view/displays — the picker's display (whole-desktop) catalog (Plan 088,
 * multi-target capture).
 *
 * The display sibling of `/windows`: NextAuth-gated through the shared `requireRemoteViewSession`
 * gate (401 BEFORE any daemon work), then enumerates capturable host displays via the daemon-control
 * surface (`streamd --list-displays`, since a Node server cannot call ScreenCaptureKit). The picker
 * offers each screen as a "Whole Desktop" tile so a multi-monitor host can choose WHICH screen to
 * stream. A missing Screen-Recording grant is reported as a named 403 (AC-14: never a silent empty
 * list); a missing bundle as a 503 (`just streamd-install`).
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
    const displays = await control.listDisplays();
    return NextResponse.json({ displays });
  } catch (err) {
    if (err instanceof DaemonControlError && err.code === 'E_PERMISSION') {
      return NextResponse.json({ error: 'E_PERMISSION', message: err.message }, { status: 403 });
    }
    if (err instanceof DaemonControlError && err.code === 'E_LOCKED') {
      // 423 Locked: not a permission/install fault — recoverable by unlocking the host (Plan 088).
      return NextResponse.json({ error: 'E_LOCKED', message: err.message }, { status: 423 });
    }
    if (err instanceof DaemonControlError && err.code === 'E_BUNDLE_MISSING') {
      // 503: not the client's fault, recoverable by installing the bundle (AC-14; T008).
      return NextResponse.json(
        { error: 'E_BUNDLE_MISSING', message: err.message },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : 'display enumeration failed';
    return NextResponse.json({ error: 'E_INTERNAL', message }, { status: 500 });
  }
}
