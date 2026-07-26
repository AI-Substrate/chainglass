/**
 * Shared route plumbing for `/api/pij/*` — Plan 089 Phase 1 (T008).
 *
 * Modelled directly on `app/api/events/mux/route.ts`'s `MuxDeps`: a small injectable-deps interface
 * plus a `defaultDeps`, so every handler can be exercised in a unit test without a session, a
 * database, or a live pij store.
 *
 * Every snapshot leaves here through {@link snapshotResponse}, which stamps it with the spine `seq`
 * it was built at. That stamp is the ordering contract: the browser subscribes to the `pij` channel
 * BEFORE fetching, buffers arriving deltas, and drops those with `seq <=` the snapshot's. Without it
 * a delta that lands mid-fetch is either lost or overwrites fresher data.
 */
import { NextResponse } from 'next/server';
import type { PijSnapshot } from '../types';
import type { PijPollerService } from './pij-poller.service';
import { PijCliError } from './pij-records';

/**
 * The process seam for the ONE mutating route (Phase 4, C-06).
 *
 * `execFile`-shaped like {@link PijExecutor} and for the same reason: a command plus a fixed argv
 * array, never a shell string. Deliberately named for its ROLE rather than for the program it runs,
 * so the tmux vocabulary stays confined to the single file the fence carves out.
 */
export type FocusExecutor = (
  command: string,
  args: readonly string[],
  options: { timeoutMs: number }
) => Promise<void>;

/** Injectable dependencies, exactly the `MuxDeps` shape and for exactly the same reason. */
export interface PijRouteDeps {
  authFn: () => Promise<unknown>;
  poller: PijPollerService;
  /**
   * Phase 3: tell the flow watcher about a workspace it may not have seen (the `?worktree=` case).
   * Optional, so the other two routes and every existing test construct these deps unchanged.
   */
  noteWorkspace?: (workspacePath: string) => void;
  /**
   * Phase 4: the focus route's process seam. Optional for the same reason — the four read routes
   * never have one, and a route that cannot mutate is the correct default.
   */
  focusExecutor?: FocusExecutor;
}

/** Snapshots must never be cached: a cached poller status is a lie with a timestamp on it. */
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

/**
 * The session gate. Identical to the mux route's, deliberately — T5: pij data inherits chainglass's
 * auth posture rather than inventing one.
 *
 * Returns a 401 response when the caller is unauthenticated, or `null` to continue. Callers must run
 * this BEFORE touching the store, so an unauthenticated request does no work.
 */
export async function requirePijSession(deps: PijRouteDeps): Promise<Response | null> {
  const session = await deps.authFn();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
  }
  return null;
}

/** Wrap a payload as a seq-stamped snapshot. */
export function snapshotResponse<T>(seq: number, at: string, data: T): Response {
  const body: PijSnapshot<T> = { seq, at, data };
  return NextResponse.json(body, { status: 200, headers: NO_STORE_HEADERS });
}

/** 400 for a missing required parameter. */
export function missingParam(name: string): Response {
  return NextResponse.json(
    { error: `Missing required query parameter: ${name}` },
    { status: 400, headers: NO_STORE_HEADERS }
  );
}

/**
 * 400 for a request that names two mutually exclusive scopes.
 *
 * Separate from {@link missingParam} because the two are opposite mistakes and the fix differs:
 * one caller said nothing, the other said two things. Resolving the ambiguity silently would ship a
 * wrong answer half the time, and the wrong half is invisible — a global view showing one repo.
 */
export function ambiguousParams(...names: string[]): Response {
  return NextResponse.json(
    {
      error: `Ambiguous request: pass exactly one of ${names.join(', ')} — not both`,
    },
    { status: 400, headers: NO_STORE_HEADERS }
  );
}

/**
 * Turn a read failure into an honest 503.
 *
 * 503 rather than 500, and with the pij code attached, because "the store could not be read" is a
 * *rendered state* (AC-08's third leg), not an internal error to be swallowed. Returning an empty
 * result here would be the confident lie this plan is written against.
 */
export function storeUnreadable(error: unknown): Response {
  const failure = error instanceof PijCliError ? error : null;
  return NextResponse.json(
    {
      error: failure?.message ?? 'pij store unreadable',
      code: failure?.code ?? 'E-UNKNOWN',
      verb: failure?.verb,
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}

/** Read and normalise the `workspace` query parameter. */
export function workspaceParam(request: { nextUrl: URL }): string | null {
  const raw = request.nextUrl.searchParams.get('workspace');
  return raw && raw.length > 0 ? raw : null;
}
