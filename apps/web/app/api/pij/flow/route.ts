import { join } from 'node:path';
/**
 * GET /api/pij/flow — Plan 089 Phase 1 (T008).
 *
 * One classified row per plan folder under `<workspace>/docs/plans/`. The dominant output is
 * **absence** — 82 of 85 plan folders in this repo have no flow data — and absence has four distinct
 * honest labels (`legacy` · `untracked` · `not-started` · `corrupt`), never one blank.
 *
 * The scan globs the directory itself rather than calling `harness flow list`, which only scans
 * `.harness/flows/` and **cannot see flight plans at all** (it returns `{flows: [], count: 0}` in a
 * repo full of them). `?workspace=<path>` is required for the same reason the tree route requires
 * it: defaulting to the server's own repo would show chainglass's plans inside every workspace.
 */
import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import {
  type PijRouteDeps,
  missingParam,
  requirePijSession,
  snapshotResponse,
  storeUnreadable,
  workspaceParam,
} from '../../../../src/features/089-first-class-pij/server/route-deps';
import {
  getPijPoller,
  notePijFlowWorkspace,
} from '../../../../src/features/089-first-class-pij/server/start-pij-poller';
import type { FlowSnapshotData } from '../../../../src/features/089-first-class-pij/types';

export const dynamic = 'force-dynamic';

/** Where flight plans live, by convention, in every repo that uses `/builder`. */
export const PLANS_SUBDIR = join('docs', 'plans');

export async function handlePijFlowRequest(
  request: NextRequest,
  deps: PijRouteDeps
): Promise<Response> {
  const unauthorized = await requirePijSession(deps);
  if (unauthorized) return unauthorized;

  const workspace = workspaceParam(request);
  if (!workspace) return missingParam('workspace');

  try {
    // Phase 3 (T005): the bootstrap enumeration sees the workspaces the container knows, which does
    // not include a `?worktree=` root — that path only exists once somebody asks for it. This is that
    // moment. Watch-once lives in the watcher, so calling it on every request costs nothing, and the
    // C-04 refusal is deliberately NOT swallowed: a request naming a pij-store path has asked for
    // something the fence forbids, and the catch below reports it rather than ignoring it.
    deps.noteWorkspace?.(workspace);

    const snapshot = deps.poller.snapshot();
    // No flow reader wired is a capability that is not enabled, not a failure — Phase 3 adds the
    // watcher. An empty list with a 200 is the honest answer.
    const flows = deps.poller.flows
      ? await deps.poller.flows.scan(join(workspace, PLANS_SUBDIR))
      : [];
    const data: FlowSnapshotData = { workspace, flows };
    return snapshotResponse(snapshot.seq, snapshot.at, data);
  } catch (error) {
    return storeUnreadable(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handlePijFlowRequest(request, {
    authFn: auth,
    poller: getPijPoller(),
    noteWorkspace: notePijFlowWorkspace,
  });
}
