/**
 * GET /api/pij/windows — the tmux window-label map, alone.
 *
 * The tree route joins these labels into its snapshot, but a tree read costs a `pij` CLI spawn and
 * the labels go stale on their own clock: tmux windows are renamed as their job changes (the naming
 * mandate encourages exactly that), and nothing about a rename touches the pij store, so no tree
 * refetch is ever triggered by it. This route is the cheap refresh path — one `tmux list-windows`,
 * no CLI, no workspace scoping (labels are keyed by window id; the join is the client's).
 */
import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import {
  NO_STORE_HEADERS,
  type PijRouteDeps,
  requirePijSession,
} from '../../../../src/features/089-first-class-pij/server/route-deps';
import { getPijPoller } from '../../../../src/features/089-first-class-pij/server/start-pij-poller';
import { readTmuxWindowLabels } from '../../../../src/features/089-first-class-pij/server/tmux-windows';

export const dynamic = 'force-dynamic';

export async function handlePijWindowsRequest(deps: PijRouteDeps): Promise<Response> {
  const unauthorized = await requirePijSession(deps);
  if (unauthorized) return unauthorized;

  // `readTmuxWindowLabels` already degrades to an empty map; there is no failure path to shape here.
  const windows = await (deps.tmuxWindows ?? readTmuxWindowLabels)();
  return NextResponse.json({ windows }, { status: 200, headers: NO_STORE_HEADERS });
}

export async function GET(): Promise<Response> {
  return handlePijWindowsRequest({ authFn: auth, poller: getPijPoller() });
}
