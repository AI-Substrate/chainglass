/**
 * GET /api/pij/fleet — Plan 089 Phase 1 (T008).
 *
 * The fleet snapshot, served from the poller's in-memory state. A page load spawns NO process: the
 * pij store sees one reader (the poller) regardless of how many tabs are open (AC-02).
 *
 * `?workspace=<path>` scopes by descriptor `folder`; omitting it returns the global set. Scoping is a
 * server-side filter over the ONE global `pij list` the slow loop already made (F-13) — never a
 * second CLI call.
 *
 * The `PollerStatus` ships in the same payload on purpose: `rows: []` alone cannot distinguish
 * *no seats here* from *poller not running* from *store unreadable*, and AC-08 requires a human to
 * tell them apart without opening devtools.
 */
import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import {
  type PijRouteDeps,
  requirePijSession,
  snapshotResponse,
  storeUnreadable,
  workspaceParam,
} from '../../../../src/features/089-first-class-pij/server/route-deps';
import { getPijPoller } from '../../../../src/features/089-first-class-pij/server/start-pij-poller';
import type { FleetSnapshotData } from '../../../../src/features/089-first-class-pij/types';

export const dynamic = 'force-dynamic';

export async function handlePijFleetRequest(
  request: NextRequest,
  deps: PijRouteDeps
): Promise<Response> {
  const unauthorized = await requirePijSession(deps);
  if (unauthorized) return unauthorized;

  const workspace = workspaceParam(request);

  try {
    const snapshot = deps.poller.snapshot({ workspace });
    const data: FleetSnapshotData = {
      workspace,
      rows: snapshot.rows,
      status: snapshot.status,
    };
    return snapshotResponse(snapshot.seq, snapshot.at, data);
  } catch (error) {
    return storeUnreadable(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handlePijFleetRequest(request, { authFn: auth, poller: getPijPoller() });
}
