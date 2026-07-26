/**
 * GET /api/pij/tree — Plan 089 Phase 1 (T008).
 *
 * The repo-scoped session forest. Unlike the fleet route this DOES reach the CLI, because `pij tree`
 * is a derived view and "re-implementing pij's derivation logic outside pij is the failure the
 * platform contract exists to prevent".
 *
 * `?workspace=<path>` is **required**, and it becomes the CLI's `cwd`. That is not ceremony:
 * `pij tree` scopes from cwd, the Next.js server's cwd is the chainglass repo, and a tree request for
 * another workspace without an explicit cwd would return chainglass's tree labelled as the other
 * workspace's — plausible, wrong, and silent. Repo scoping also tames the forest ~14× (7KB vs 100KB).
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
import { getPijPoller } from '../../../../src/features/089-first-class-pij/server/start-pij-poller';
import type { TreeSnapshotData } from '../../../../src/features/089-first-class-pij/types';

export const dynamic = 'force-dynamic';

export async function handlePijTreeRequest(
  request: NextRequest,
  deps: PijRouteDeps
): Promise<Response> {
  const unauthorized = await requirePijSession(deps);
  if (unauthorized) return unauthorized;

  const workspace = workspaceParam(request);
  if (!workspace) return missingParam('workspace');

  try {
    const tree = await deps.poller.records.tree({ cwd: workspace });
    const snapshot = deps.poller.snapshot();
    const data: TreeSnapshotData = { workspace, roots: tree.roots };
    return snapshotResponse(snapshot.seq, snapshot.at, data);
  } catch (error) {
    return storeUnreadable(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handlePijTreeRequest(request, { authFn: auth, poller: getPijPoller() });
}
