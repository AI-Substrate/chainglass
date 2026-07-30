import { execFile } from 'node:child_process';
/**
 * POST /api/pij/focus — Plan 089 Phase 4 (T004). **The one mutating route in this feature.**
 *
 * Everything else under `/api/pij` reads. This route runs `tmux select-window`, and that single
 * exception is fenced on every side:
 *
 * - **C-06**: focus happens on a deliberate human click and by no other means. The server half is
 *   here; the client half is the row button's `onClick`, and both ends are audit-tested. Nothing may
 *   call this from an effect, a timer, or an event handler that fires on its own.
 * - **R-01**: `select-window` and nothing else. No attach, no `send-keys`, no resize. An attached
 *   client's size can clamp and reflow an agent's pane and corrupt the daemon's own liveness read —
 *   the observer perturbing the instrument. Changing which window is *visible* touches none of that.
 * - **C-02**: this file is the fence's single carve-out, and the carve-out is checked rather than
 *   trusted: `fence.test.ts` asserts that the only tmux verb named here is `select-window`.
 *
 * **The window id is resolved server-side, at click time, from a fresh `node show`.** Never from the
 * request: a client-supplied window id is an instruction to focus an arbitrary window, and window ids
 * are recycled by tmux, so even an honest stale one points somewhere real and wrong. `pij list` rows
 * do not carry `windowId` at all (0 of 181 measured), so there is nothing cached to be tempted by.
 *
 * Every refusal carries a machine `reason` from {@link FocusReason} and a human `observation` that
 * says what was seen rather than what the caller did wrong. The client renders those words verbatim.
 */
import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isFolderInWorkspace } from '../../../../src/features/089-first-class-pij/server/join';
import { PijCliError } from '../../../../src/features/089-first-class-pij/server/pij-records';
import type {
  PijNodeDetail,
  PijTreeNode,
} from '../../../../src/features/089-first-class-pij/server/pij-records.interface';
import {
  type FocusExecutor,
  NO_STORE_HEADERS,
  type PijRouteDeps,
  missingParam,
  requirePijSession,
  workspaceParam,
} from '../../../../src/features/089-first-class-pij/server/route-deps';
import { getPijPoller } from '../../../../src/features/089-first-class-pij/server/start-pij-poller';

export const dynamic = 'force-dynamic';

/**
 * Why a focus request did not focus anything.
 *
 * A closed union rather than a message string, because the client renders six materially different
 * situations and "it didn't work" is the one answer that helps nobody. Each has exactly one wording,
 * fixed here so the route and the button cannot drift apart.
 *
 * **Every distinct CAUSE needs its own member, or the nearest one gets borrowed.** `tmux-refused`
 * was added because it had to be: a tmux failure used to answer `store-unreadable`, which named the
 * wrong subsystem entirely — the observation beside it said tmux, and the machine field said the pij
 * store. A reader can catch that; a client branching on `reason` cannot.
 */
export type FocusReason =
  | 'unknown-seat'
  | 'out-of-workspace'
  | 'not-live'
  | 'no-window'
  | 'store-unreadable'
  | 'tmux-refused';

/** The tmux verb. The only one this feature may ever name — see the module docs and `fence.test.ts`. */
const SELECT_WINDOW = 'select-window';

/** tmux answers instantly or something is badly wrong; a focus click must not hang the request. */
export const FOCUS_TIMEOUT_MS = 3_000;

/** pij's own code for "no such seat", as it arrives in the `--json` error envelope. */
const NO_SUCH_SEAT = 'E-NOID';

interface FocusRefusal {
  status: number;
  reason: FocusReason;
  observation: string;
}

/**
 * The refusal wordings. Observations — what was seen — never verdicts about the human.
 *
 * The two 503s are excluded because neither is expressible here: they carry information this
 * signature has no room for (a pij `E-` code; tmux's own message) and are built at their call sites.
 */
export function focusRefusal(
  reason: Exclude<FocusReason, 'store-unreadable' | 'tmux-refused'>,
  detail: { seatId: string; cwd?: string; liveness?: string; lastEventAt?: string | null }
): FocusRefusal {
  switch (reason) {
    case 'unknown-seat':
      return { status: 404, reason, observation: `no seat ${detail.seatId} in the store` };
    case 'out-of-workspace':
      return {
        status: 409,
        reason,
        observation: `seat ${detail.seatId} works in ${detail.cwd}, outside this workspace`,
      };
    case 'not-live':
      // Absent liveness gets its OWN wording. Falling back to `lastEventAt` here would be inferring
      // liveness from freshness — a seat can be dead and recently noisy, or alive and quiet — and the
      // inference would be indistinguishable, to the reader, from an observation.
      return {
        status: 409,
        reason,
        observation: detail.liveness
          ? `seat ${detail.seatId} last observed ${detail.liveness} at ${detail.lastEventAt ?? 'an unrecorded time'}`
          : `liveness not observable for ${detail.seatId}`,
      };
    case 'no-window':
      return {
        status: 409,
        reason,
        observation: `seat ${detail.seatId} has no tmux window on record`,
      };
  }
}

/**
 * The `store-unreadable` 503 — the one refusal the shared helper cannot express.
 *
 * `route-deps.ts`'s `storeUnreadable()` predates the {@link FocusReason} union and returns
 * `{ error, code, verb }`. That body is right for the read routes and WRONG here: with no `reason`
 * field the client falls through to `data-reason="failed"`, the single value in that attribute that
 * is not a designed state — and it does so on the failure path a broken pij store makes the most
 * common of them all. So this route builds its own, keeping the `E-` code verbatim (the dossier's
 * requirement, and the only thing that makes the state diagnosable rather than merely red) and
 * keeping `error`/`verb` too, so the body stays a superset of the shared shape.
 */
function focusStoreUnreadable(error: unknown): Response {
  const failure = error instanceof PijCliError ? error : null;
  const code = failure?.code ?? 'E-UNKNOWN';
  // Which field holds pij's OWN words depends on how the failure was classified: every coded path
  // (`E-ARG:…` at the head of the stream, or the `--json` envelope) puts pij's message in `message`,
  // but `E-EXIT` means pij said nothing structured and `message` is node's "Command failed: pij …",
  // which names the process rather than the problem. There, stderr is the only real information.
  const said =
    failure === null
      ? 'no detail'
      : failure.code === 'E-EXIT'
        ? failure.stderr.trim() || failure.message
        : failure.message;

  return NextResponse.json(
    {
      reason: 'store-unreadable' satisfies FocusReason,
      observation: `the pij store could not be read: ${code} ${said}`.slice(0, 300),
      code,
      verb: failure?.verb,
      error: failure?.message ?? 'pij store unreadable',
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}

/** Whether the workspace-scoped tree places this seat, at any depth. */
function treeHasSeat(nodes: PijTreeNode[], id: string): boolean {
  return nodes.some(
    (node) => node.id === id || (node.children?.length ? treeHasSeat(node.children, id) : false)
  );
}

function refuse(refusal: FocusRefusal): Response {
  return NextResponse.json(
    { reason: refusal.reason, observation: refusal.observation },
    { status: refusal.status, headers: NO_STORE_HEADERS }
  );
}

export async function handlePijFocusRequest(
  request: NextRequest,
  deps: PijRouteDeps
): Promise<Response> {
  const unauthorized = await requirePijSession(deps);
  if (unauthorized) return unauthorized;

  const workspace = workspaceParam(request);
  if (!workspace) return missingParam('workspace');

  const body = (await request.json().catch(() => null)) as { seatId?: unknown } | null;
  const seatId = typeof body?.seatId === 'string' && body.seatId.length > 0 ? body.seatId : null;
  if (!seatId) return missingParam('seatId');

  // FRESH read, every click. A seat's window, workspace and liveness are all things that change
  // between the page rendering and the human clicking.
  let detail: PijNodeDetail;
  try {
    detail = await deps.poller.records.nodeShow(seatId);
  } catch (error) {
    // "That seat is not in the registry" is a fact about the seat, not a broken store — pij says so
    // with its own code, and conflating the two would render a 503 panic for a stale button.
    if (error instanceof PijCliError && error.code === NO_SUCH_SEAT) {
      return refuse(focusRefusal('unknown-seat', { seatId }));
    }
    return focusStoreUnreadable(error);
  }

  // `cwd`, not `folder`: `node show` has no `folder` key. See PijNodeDetail.cwd.
  //
  // Two rungs, same as the rail's membership rule: path containment first, then the tree — git
  // places a worktree BESIDE its checkout, so a family seat fails the path test while being exactly
  // the seat the human clicked. The tree read is fresh and workspace-scoped (`all`, because a
  // worktree seat the fleet still shows may be idle), and an unreadable tree simply cannot place
  // the seat — the refusal below then names the cwd it saw.
  if (!detail.cwd) {
    return refuse(focusRefusal('out-of-workspace', { seatId, cwd: '(unrecorded)' }));
  }
  if (!isFolderInWorkspace(detail.cwd, workspace)) {
    let inFamily = false;
    try {
      const tree = await deps.poller.records.tree({ cwd: workspace, all: true });
      inFamily = treeHasSeat(tree.roots, seatId);
    } catch {
      inFamily = false;
    }
    if (!inFamily) {
      return refuse(focusRefusal('out-of-workspace', { seatId, cwd: detail.cwd }));
    }
  }

  if (detail.liveness !== 'active') {
    return refuse(
      focusRefusal('not-live', {
        seatId,
        liveness: detail.liveness,
        lastEventAt: detail.lastEventAt,
      })
    );
  }

  if (!detail.windowId) {
    return refuse(focusRefusal('no-window', { seatId }));
  }

  const execute = deps.focusExecutor ?? nodeFocusExecutor;
  try {
    await execute('tmux', [SELECT_WINDOW, '-t', detail.windowId], {
      timeoutMs: FOCUS_TIMEOUT_MS,
    });
  } catch (error) {
    // A tmux failure is not a pij store failure. It reaches the caller the same way — 503, with the
    // real reason attached rather than a generic 500 — but it gets its OWN reason, because the
    // machine field is the half of this response nobody can sanity-check against the words beside it.
    return NextResponse.json(
      {
        reason: 'tmux-refused' satisfies FocusReason,
        observation: `tmux refused to focus ${detail.windowId}: ${(error as Error).message}`,
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    { focused: detail.windowId },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  return handlePijFocusRequest(request, { authFn: auth, poller: getPijPoller() });
}

/**
 * The real seam. Mirrors `pij-records.ts`'s `nodeExecFileExecutor` exactly: `execFile`, a fixed argv
 * array, no shell, bounded by a timeout. Never `execSync`, never a command string — the
 * `api/terminal` route's shell-string precedent is a bad one and is deliberately not followed.
 */
const nodeFocusExecutor: FocusExecutor = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(command, [...args], { timeout: options.timeoutMs }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
