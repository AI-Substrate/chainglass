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
  ambiguousParams,
  missingParam,
  requirePijSession,
  snapshotResponse,
  storeUnreadable,
  workspaceParam,
} from '../../../../src/features/089-first-class-pij/server/route-deps';
import { getPijPoller } from '../../../../src/features/089-first-class-pij/server/start-pij-poller';
import { readTmuxWindowLabels } from '../../../../src/features/089-first-class-pij/server/tmux-windows';
import type { TreeSnapshotData } from '../../../../src/features/089-first-class-pij/types';

export const dynamic = 'force-dynamic';

export async function handlePijTreeRequest(
  request: NextRequest,
  deps: PijRouteDeps
): Promise<Response> {
  const unauthorized = await requirePijSession(deps);
  if (unauthorized) return unauthorized;

  // Exactly one scope, checked BEFORE anything is read: a rejected request must not cost a CLI call.
  const workspace = workspaceParam(request);
  const global = request.nextUrl.searchParams.get('global') === '1';
  // `?all=1` includes dead seats. The fleet view needs them to decide MEMBERSHIP — a dead seat in a
  // sibling worktree is otherwise claimed by neither the tree nor path containment, and vanishes.
  const all = request.nextUrl.searchParams.get('all') === '1';
  if (workspace && global) return ambiguousParams('workspace', 'global');
  if (!workspace && !global) return missingParam('workspace');

  try {
    // Branching on `workspace` rather than on `global` lets the type narrow on its own — after the
    // ladder above, "no workspace" can only mean global.
    const tree = workspace
      ? await deps.poller.records.tree({ cwd: workspace, all })
      : await deps.poller.records.tree({ global: true, all });
    // The window-label join (`3:cheetah` for a node's `windowId`). Read-only, and failure inside
    // `readTmuxWindowLabels` is already an empty map — the tree never becomes unreadable over it.
    const windows = await (deps.tmuxWindows ?? readTmuxWindowLabels)();
    const snapshot = deps.poller.snapshot();
    // `workspace: null` is the global answer's honest scope. Echoing a path here would label the
    // whole machine as one repo, which is precisely the claim the global page must not make.
    const data: TreeSnapshotData = {
      workspace: global ? null : workspace,
      roots: tree.roots,
      windows,
    };
    return snapshotResponse(snapshot.seq, snapshot.at, data);
  } catch (error) {
    return storeUnreadable(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handlePijTreeRequest(request, { authFn: auth, poller: getPijPoller() });
}
