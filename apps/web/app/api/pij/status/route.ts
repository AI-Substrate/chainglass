/**
 * GET /api/pij/status — Plan 089 Phase 1 (T008).
 *
 * **This route is what AC-08's empty-state trichotomy renders.** An empty fleet view must state which
 * of three conditions holds, and a human must be able to tell them apart without opening devtools:
 *
 *   | Condition | How to read it here |
 *   |---|---|
 *   | *no seats here* | `running: true`, `lastRecordsPollAt` set, `lastError: null`, `fleetSize: 0` |
 *   | *poller not running* | `running: false` (or `lastRecordsPollAt: null` — it has never looked) |
 *   | *store unreadable* | `lastError: { code, message, at }` |
 *
 * Plus two health observables: `seq` (the ordering anchor every snapshot and delta is stamped with)
 * and `tornLinesSkipped` — which turns a required silence, skipping corrupt spine lines, into
 * something an operator can actually see rising.
 */
import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import {
  type PijRouteDeps,
  requirePijSession,
  snapshotResponse,
} from '../../../../src/features/089-first-class-pij/server/route-deps';
import { getPijPoller } from '../../../../src/features/089-first-class-pij/server/start-pij-poller';

export const dynamic = 'force-dynamic';

export async function handlePijStatusRequest(
  _request: NextRequest,
  deps: PijRouteDeps
): Promise<Response> {
  const unauthorized = await requirePijSession(deps);
  if (unauthorized) return unauthorized;

  // Deliberately no try/catch around a store read: this endpoint reports the poller's own state and
  // must answer even when — especially when — the store cannot be read.
  const snapshot = deps.poller.snapshot();
  return snapshotResponse(snapshot.seq, snapshot.at, snapshot.status);
}

export async function GET(request: NextRequest): Promise<Response> {
  return handlePijStatusRequest(request, { authFn: auth, poller: getPijPoller() });
}
