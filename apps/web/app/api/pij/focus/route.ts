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
 * - **R-01**: `select-window` is the only mutation. No attach, no `send-keys`, no resize.
 *   rs focus first makes bounded, read-only pane/process probes; those never become liveness labels.
 * - **C-02**: this file is the fence's single mutation carve-out, checked by `fence.test.ts`.
 *
 * **Targets are resolved server-side at click time.** Legacy details supply their fresh window;
 * rs details supply a pane and process identity, checked against the OS before resolving a window.
 * Neither client-supplied nor cached row window ids authorize rs focus.
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
import { RsError } from '../../../../src/features/089-first-class-pij/server/rs/rs-client';
import { getPijPoller } from '../../../../src/features/089-first-class-pij/server/start-pij-poller';

export const dynamic = 'force-dynamic';

/**
 * Why a focus request did not focus anything.
 *
 * A closed union rather than a message string, because the client renders materially different
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
  | 'no-process'
  | 'no-pane'
  | 'process-gone'
  | 'process-reused'
  | 'pane-moved'
  | 'identity-unverified'
  | 'store-unreadable'
  | 'tmux-refused';

/** The only mutation this feature may name — see the module docs and `fence.test.ts`. */
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
    case 'no-process':
      return {
        status: 409,
        reason,
        observation: `seat ${detail.seatId} has no usable process identity on record`,
      };
    case 'no-pane':
      return {
        status: 409,
        reason,
        observation: `seat ${detail.seatId} has no matching tmux pane at focus time`,
      };
    case 'process-gone':
      return {
        status: 409,
        reason,
        observation: `process gone for seat ${detail.seatId}: the recorded process is not running`,
      };
    case 'process-reused':
      return {
        status: 409,
        reason,
        observation: `process id reused by another program for seat ${detail.seatId}`,
      };
    case 'pane-moved':
      return {
        status: 409,
        reason,
        observation: `pane moved for seat ${detail.seatId}: its focus target no longer matches`,
      };
    case 'identity-unverified':
      return {
        status: 409,
        reason,
        observation: `the recorded process identity for ${detail.seatId} could not be verified in its pane`,
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
  if (error instanceof RsError) {
    return NextResponse.json(
      {
        reason: 'store-unreadable' satisfies FocusReason,
        observation: `the pij store could not be read: ${error.code} ${error.message}`.slice(
          0,
          300
        ),
        code: error.code,
        verb: error.command,
        error: error.message,
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
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
    if (
      (error instanceof PijCliError && error.code === NO_SUCH_SEAT) ||
      (error instanceof RsError && error.code === 'not_found')
    ) {
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

  const execute = deps.focusExecutor ?? nodeFocusExecutor;
  if (detail.source === 'pij-rs') {
    const target = await resolveRsFocusWindow(detail, execute);
    if (typeof target !== 'string') return refuse(target);
    return selectWindow(target, execute);
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

  return selectWindow(detail.windowId, execute);
}

async function selectWindow(windowId: string, execute: FocusExecutor): Promise<Response> {
  try {
    await execute('tmux', [SELECT_WINDOW, '-t', windowId], { timeoutMs: FOCUS_TIMEOUT_MS });
  } catch (error) {
    return refuse(tmuxRefusal(windowId, error));
  }
  return NextResponse.json({ focused: windowId }, { status: 200, headers: NO_STORE_HEADERS });
}

function tmuxRefusal(target: string, error: unknown): FocusRefusal {
  const message = error instanceof Error ? error.message : 'no detail';
  return {
    status: 503,
    reason: 'tmux-refused',
    observation: `tmux refused to focus ${target}: ${message}`.slice(0, 300),
  };
}

const PANE_FORMAT = '#{pane_id} #{pane_pid} #{window_id}';
const PROCESS_COLUMNS = 'pid=,ppid=,lstart=';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Matches pij-rs core/model.rs: local wall-clock YYYYMMDDhhmmss, never UTC or elapsed time. */
function processStart(row: string | number): number | null {
  let year: number;
  let month: number;
  let day: number;
  let hour: number;
  let minute: number;
  let second: number;
  if (typeof row === 'number') {
    if (!Number.isSafeInteger(row)) return null;
    year = Math.floor(row / 10_000_000_000);
    month = Math.floor(row / 100_000_000) % 100;
    day = Math.floor(row / 1_000_000) % 100;
    hour = Math.floor(row / 10_000) % 100;
    minute = Math.floor(row / 100) % 100;
    second = row % 100;
  } else {
    const match =
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/.exec(
        row.trim()
      );
    if (!match) return null;
    month = MONTHS.indexOf(match[1]) + 1;
    day = Number(match[2]);
    hour = Number(match[3]);
    minute = Number(match[4]);
    second = Number(match[5]);
    year = Number(match[6]);
  }
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const days =
    month === 2
      ? leap
        ? 29
        : 28
      : month === 4 || month === 6 || month === 9 || month === 11
        ? 30
        : 31;
  if (
    month < 1 ||
    month > 12 ||
    year < 1970 ||
    year > 9999 ||
    day < 1 ||
    day > days ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  return (
    year * 10_000_000_000 +
    month * 100_000_000 +
    day * 1_000_000 +
    hour * 10_000 +
    minute * 100 +
    second
  );
}

/** One snapshot, bounded ancestor traversal; no process-per-row requests and no liveness writes. */
function processPaneRefusal(
  table: string,
  proc: NonNullable<PijNodeDetail['proc']>,
  panePid: number
): Extract<
  FocusReason,
  'process-gone' | 'process-reused' | 'pane-moved' | 'identity-unverified'
> | null {
  const processes = new Map<number, { parent: number; start: string }>();
  for (const row of table.trim().split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(row);
    if (!match) return 'identity-unverified';
    const pid = Number(match[1]);
    const parent = Number(match[2]);
    if (
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      !Number.isSafeInteger(parent) ||
      processes.has(pid)
    ) {
      return 'identity-unverified';
    }
    processes.set(pid, { parent, start: match[3] });
  }
  const candidate = processes.get(proc.pid);
  if (!candidate) return 'process-gone';
  const start = processStart(candidate.start);
  if (start === null) return 'identity-unverified';
  if (start !== proc.proc_start) return 'process-reused';
  if (!processes.has(panePid)) return 'pane-moved';
  let pid = proc.pid;
  for (let remaining = processes.size; remaining > 0; remaining--) {
    if (pid === panePid) return null;
    const process = processes.get(pid);
    if (!process) return 'identity-unverified';
    if (process.parent === 0) return 'pane-moved';
    pid = process.parent;
  }
  return 'identity-unverified';
}

async function inspectPane(
  seatId: string,
  paneId: string,
  execute: FocusExecutor
): Promise<{ pid: number; windowId: string } | FocusRefusal> {
  let output: string;
  try {
    output = await execute('tmux', ['display-message', '-p', '-t', paneId, PANE_FORMAT], {
      timeoutMs: FOCUS_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof Error && /can't find pane:/.test(error.message)) {
      return focusRefusal('no-pane', { seatId });
    }
    return tmuxRefusal(paneId, error);
  }
  const match = /^(%\d+)\s+(\d+)\s+(@\d+)$/.exec(output.trim());
  if (!match || match[1] !== paneId) return focusRefusal('no-pane', { seatId });
  const pid = Number(match[2]);
  if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(Number(match[3].slice(1)))) {
    return focusRefusal('identity-unverified', { seatId });
  }
  return { pid, windowId: match[3] };
}

async function resolveRsFocusWindow(
  detail: PijNodeDetail,
  execute: FocusExecutor
): Promise<string | FocusRefusal> {
  const seatId = detail.id;
  const { proc, paneId } = detail;
  if (
    !proc ||
    !Number.isSafeInteger(proc.pid) ||
    proc.pid <= 0 ||
    !Number.isSafeInteger(proc.proc_start) ||
    proc.proc_start <= 0
  ) {
    return focusRefusal('no-process', { seatId });
  }
  if (processStart(proc.proc_start) === null) {
    return focusRefusal('identity-unverified', { seatId });
  }
  if (!paneId || !/^%\d+$/.test(paneId) || !Number.isSafeInteger(Number(paneId.slice(1)))) {
    return focusRefusal('no-pane', { seatId });
  }
  const pane = await inspectPane(seatId, paneId, execute);
  if ('reason' in pane) return pane;
  let table: string;
  try {
    table = await execute('ps', ['-axo', PROCESS_COLUMNS], { timeoutMs: FOCUS_TIMEOUT_MS });
  } catch {
    return { ...focusRefusal('identity-unverified', { seatId }), status: 503 };
  }
  const reason = processPaneRefusal(table, proc, pane.pid);
  if (reason) return focusRefusal(reason, { seatId });
  // Refuse a pane recycled/moved during the process read. No tmux/OS atomic transaction exists;
  // selection follows this final check immediately and uses only its observed window id.
  const confirmed = await inspectPane(seatId, paneId, execute);
  if ('reason' in confirmed) return confirmed;
  if (confirmed.pid !== pane.pid || confirmed.windowId !== pane.windowId) {
    return focusRefusal('pane-moved', { seatId });
  }
  return confirmed.windowId;
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
    execFile(
      command,
      [...args],
      {
        timeout: options.timeoutMs,
        // Match the roster reader's bounded headroom for a machine-wide process snapshot.
        maxBuffer: (command === 'ps' ? 32 : 1) * 1024 * 1024,
        env: { ...process.env, LC_ALL: 'C' },
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      }
    );
  });
