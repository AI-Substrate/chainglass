/**
 * POST /api/pij/focus — Plan 089 Phase 4, T004. The ONE mutating route.
 *
 * Test Doc (suite-level):
 * - Why: this is the only place the feature acts on the world, so its failure modes are not "renders
 *   oddly" — they are "focuses the wrong window", "focuses a window in someone else's workspace", and
 *   "runs tmux for a seat that is not there". Each is invisible from the response body if the route
 *   is wrong, which is why the fake records argv rather than a boolean.
 * - Contract: dossier T004 — the `focusReason` union with its verbatim wordings, containment on
 *   `detail.cwd`, a FRESH `node show` per click, `execFile` fixed argv, C-06.
 * - Usage Notes: `FakePijExecutor` for the pij read, `FakeFocusExecutor` for the tmux write. No
 *   `vi.mock()` anywhere (constitution P4).
 * - Quality Contribution: every refusal reason is covered by exactly one test (the designed-states
 *   N-reasons-N-tests rule), and the success path is pinned to one exact argv.
 * - Worked Example: seat in-workspace, active, windowId '@220' → 200 { focused: '@220' } and exactly
 *   one recorded call `tmux select-window -t @220`.
 */
import { type IWorkspaceService, Workspace } from '@chainglass/workflow';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  type FocusReason,
  handlePijFocusRequest,
} from '../../../../apps/web/app/api/pij/focus/route';
import { createPijPoller } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-poller.service';
import { createPijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records';
import type { PijRouteDeps } from '../../../../apps/web/src/features/089-first-class-pij/server/route-deps';
import { createCompositePijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/rs/composite-pij-records';
import {
  type RsClient,
  RsError,
  type RsSeat,
} from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-client';
import { createRsPijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-pij-records';
import { FakeWorkspaceContextResolver } from '../../../../packages/workflow/src/fakes/fake-workspace-context-resolver';
import { FakeFocusExecutor } from '../../../fakes/fake-focus-executor';
import { FakePijExecutor, execFileFailure } from '../../../fakes/fake-pij-executor';
import {
  BroadcastRecorder,
  FakeScheduler,
  FakeSpineCursor,
} from '../../../fakes/fake-pij-poller-deps';

const WORKSPACE = '/Users/fixture/substrate/chainglass';
/** Shares the workspace's prefix and is NOT inside it — the containment hazard, in path form. */
const SIBLING = '/Users/fixture/substrate/chainglass-worktree';
const SEAT = 'pij-focusable-seat';
const RS_SEAT = 'rs-focus-only-seat';
const RS_PANE_ARGS = ['display-message', '-p', '-t', '%640', '#{pane_id} #{pane_pid} #{window_id}'];
const PS_ARGS = ['-axo', 'pid=,ppid=,lstart='];
const RS_START = 20260906010203;
const RS_PROCESS_TABLE = [
  '640 1 Sun Sep  6 00:00:00 2026',
  '641 640 Sun Sep  6 00:10:00 2026',
  '642 641 Sun Sep  6 01:02:03 2026',
].join('\n');
const WORKSPACE_CONTEXT = {
  workspaceSlug: 'chainglass',
  workspaceName: 'Chainglass',
  workspacePath: WORKSPACE,
  worktreePath: WORKSPACE,
  worktreeBranch: 'main',
  isMainWorktree: true,
  hasGit: true,
};

function rsFocus(table = RS_PROCESS_TABLE): FakeFocusExecutor {
  return new FakeFocusExecutor()
    .when('tmux', RS_PANE_ARGS, '%640 640 @650\n')
    .when('ps', PS_ARGS, table);
}

function makeRsDeps(
  overrides: {
    seat?: Partial<RsSeat>;
    seats?: RsSeat[];
    readFailure?: RsError;
    focus?: FakeFocusExecutor;
    authFn?: () => Promise<unknown>;
    tree?: { roots: Array<{ id: string; children?: Array<{ id: string }> }> };
  } = {}
) {
  const seats = overrides.seats ?? [
    {
      id: RS_SEAT,
      folder: WORKSPACE,
      pane: '%640',
      proc: { pid: 642, proc_start: RS_START },
      state: 'idle',
      ...overrides.seat,
    },
  ];
  const reads: string[] = [];
  const treeScopes: unknown[] = [];
  const client: RsClient = {
    async seats() {
      reads.push('seats');
      if (overrides.readFailure) throw overrides.readFailure;
      return seats;
    },
    async state(id) {
      return { id, unsupported: [] };
    },
    async *events() {},
  };
  // Disjoint ids through the REAL composite: falling back to the old reader must not green-test.
  const legacy = new FakePijExecutor().whenJson(['node', 'show', SEAT, '--json'], nodeDetail());
  const rs = createRsPijRecords({ client });
  const records = createCompositePijRecords({
    rs: {
      list: rs.list.bind(rs),
      state: rs.state.bind(rs),
      nodeShow: rs.nodeShow.bind(rs),
      tree: async (scope) => {
        treeScopes.push(scope);
        return overrides.tree ?? rs.tree(scope);
      },
    },
    cli: createPijRecords({ exec: legacy.exec, defaultCwd: WORKSPACE }),
  });
  const poller = createPijPoller({
    cursor: new FakeSpineCursor(4242),
    records,
    broadcast: new BroadcastRecorder().broadcast,
    scheduler: new FakeScheduler(),
    now: () => new Date('2026-09-06T01:30:00.000Z'),
  });
  const focus = overrides.focus ?? rsFocus();
  const workspaceResolver = new FakeWorkspaceContextResolver();
  workspaceResolver.setContext(WORKSPACE, WORKSPACE_CONTEXT);
  const workspaces = [Workspace.create({ name: 'Chainglass', path: WORKSPACE })];
  return {
    authFn: overrides.authFn ?? authOk,
    workspaceService: {
      list: async () => workspaces,
      resolveContext: workspaceResolver.resolveFromPath.bind(workspaceResolver),
      getInfo: workspaceResolver.getWorkspaceInfo.bind(workspaceResolver),
    },
    workspaces,
    workspaceResolver,
    poller,
    focusExecutor: focus.exec,
    focus,
    legacy,
    reads,
    seats,
    treeScopes,
  };
}

const authOk = async () => ({ user: { name: 'jordan' } });
const authFail = async () => null;

/**
 * `pij node show <id> --json`, in the LIVE key set (verified 2026-07-26).
 *
 * Note what is not here: `folder`. `node show` does not have one — the working directory is `cwd`.
 * A fixture that invented a `folder` key would green-test a containment check reading the wrong
 * field, so this shape is deliberately faithful rather than convenient.
 */
function nodeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: SEAT,
    harness: 'claude',
    lifecycle: 'bound',
    systemState: 'idle',
    semanticState: null,
    badge: 'idle',
    currentAssignment: null,
    currentTask: 'Implement phase 4 of plan 089',
    paneId: '%252',
    windowId: '@220',
    boundModel: 'claude-opus-5',
    effort: 'high',
    state: 'idle',
    activity: 'done',
    liveness: 'active',
    lastEventAt: '2026-07-26T05:22:17.895Z',
    pid: 76391,
    cwd: WORKSPACE,
    ...overrides,
  };
}

async function makeDeps(
  overrides: {
    authFn?: () => Promise<unknown>;
    detail?: Record<string, unknown>;
    nodeShowFails?: Error;
    focus?: FakeFocusExecutor;
    /** The workspace-scoped tree the family rung reads when path containment fails. */
    tree?: { roots: unknown[] };
  } = {}
): Promise<
  PijRouteDeps & {
    exec: FakePijExecutor;
    focus: FakeFocusExecutor;
    workspaceService: Pick<IWorkspaceService, 'list' | 'resolveContext' | 'getInfo'>;
    workspaceResolver: FakeWorkspaceContextResolver;
  }
> {
  const exec = new FakePijExecutor().whenJson(['list', '--json', '--badge'], []);
  if (overrides.nodeShowFails) {
    exec.when(['node', 'show', SEAT, '--json']).fails(overrides.nodeShowFails);
  } else {
    exec.whenJson(['node', 'show', SEAT, '--json'], nodeDetail(overrides.detail));
  }
  if (overrides.tree) {
    exec.whenJson(['tree', '--json', '--all'], overrides.tree);
  }

  const poller = createPijPoller({
    cursor: new FakeSpineCursor(4242),
    records: createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE }),
    broadcast: new BroadcastRecorder().broadcast,
    scheduler: new FakeScheduler(),
    now: () => new Date('2026-07-26T06:00:00.000Z'),
  });
  await poller.start();

  const focus = overrides.focus ?? new FakeFocusExecutor();
  const workspaceResolver = new FakeWorkspaceContextResolver();
  workspaceResolver.setContext(WORKSPACE, WORKSPACE_CONTEXT);
  return {
    authFn: overrides.authFn ?? authOk,
    workspaceService: {
      list: async () => [Workspace.create({ name: 'Chainglass', path: WORKSPACE })],
      resolveContext: workspaceResolver.resolveFromPath.bind(workspaceResolver),
      getInfo: workspaceResolver.getWorkspaceInfo.bind(workspaceResolver),
    },
    workspaceResolver,
    poller,
    focusExecutor: focus.exec,
    exec,
    focus,
  };
}

function focusRequest(seatId: unknown = SEAT, workspace: string | null = WORKSPACE): NextRequest {
  const query = workspace ? `?workspace=${encodeURIComponent(workspace)}` : '';
  return new NextRequest(`http://localhost/api/pij/focus${query}`, {
    method: 'POST',
    body: JSON.stringify(seatId === undefined ? {} : { seatId }),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/pij/focus — the success path', () => {
  it('runs exactly one fixed-argv `tmux select-window` for the freshly-read window id', async () => {
    /*
    Test Doc:
    - Why: the single mutation this feature performs. Two things must be true at once: the window id
      comes from a read taken at CLICK time, and the command is a fixed argv array rather than a
      string a shell could reinterpret (pij ids and window ids are arbitrary strings).
    - Contract: 200 { focused: '@220' }; exactly one call, `tmux ['select-window','-t','@220']`.
    - Usage Notes: FakeFocusExecutor records every invocation, stubbed or not.
    - Quality Contribution: pins the argv shape and the call count — "focused something" is not the
      claim; "focused exactly this, once" is.
    - Worked Example: as above.
    */
    const deps = await makeDeps();

    const response = await handlePijFocusRequest(focusRequest(), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ focused: '@220' });
    expect(deps.focus.calls).toHaveLength(1);
    expect(deps.focus.calls[0].command).toBe('tmux');
    expect(deps.focus.calls[0].args).toEqual(['select-window', '-t', '@220']);
    expect(deps.focus.calls[0].timeoutMs).toBeGreaterThan(0);
  });

  it('resolves the window id from a fresh read, never from the request body', async () => {
    /*
    Test Doc:
    - Why: a client-supplied window id is an instruction to focus an arbitrary window, and tmux
      recycles ids, so even an honest stale one points somewhere real and wrong. The route must ignore
      any window id in the body and use what `node show` says right now.
    - Contract: a body carrying `windowId: '@999'` still focuses the record's '@220'.
    - Usage Notes: the extra field is simply not read; this test proves that rather than assuming it.
    - Quality Contribution: closes the one way this route could be turned into a focus-anything
      primitive.
    - Worked Example: body { seatId, windowId: '@999' } → focuses '@220'.
    */
    const deps = await makeDeps();
    const request = new NextRequest(
      `http://localhost/api/pij/focus?workspace=${encodeURIComponent(WORKSPACE)}`,
      {
        method: 'POST',
        body: JSON.stringify({ seatId: SEAT, windowId: '@999' }),
        headers: { 'content-type': 'application/json' },
      }
    );

    await handlePijFocusRequest(request, deps);

    expect(deps.focus.lastArgs).toEqual(['select-window', '-t', '@220']);
  });

  it('reads the seat again on every click rather than trusting a snapshot', async () => {
    /*
    Test Doc:
    - Why: a seat's window, workspace and liveness all change between the page rendering and the human
      clicking. A cached read would focus yesterday's window with today's confidence.
    - Contract: two requests produce two `node show` calls.
    - Usage Notes: counts calls to the pij executor with the node-show argv.
    - Quality Contribution: keeps "fresh" a measured property rather than a comment.
    - Worked Example: 2 clicks → 2 reads.
    */
    const deps = await makeDeps();
    const nodeShows = () =>
      deps.exec.calls.filter((call) => call.args[0] === 'node' && call.args[1] === 'show').length;

    await handlePijFocusRequest(focusRequest(), deps);
    await handlePijFocusRequest(focusRequest(), deps);

    expect(nodeShows()).toBe(2);
  });
});

describe('POST /api/pij/focus — every refusal reason, one test each', () => {
  it('unknown-seat: 404 when pij has no such seat, distinct from a broken store', async () => {
    /*
    Test Doc:
    - Why: a stale button on an open page points at a seat that has since been reaped. That is a fact
      about the seat (404), not a store failure (503) — and pij reports it with its own code
      (`E-NOID`) inside a JSON envelope on stderr, which is the only thing separating the two.
    - Contract: 404, reason 'unknown-seat', observation "no seat <id> in the store"; tmux never runs.
    - Usage Notes: the failure is shaped exactly as the live CLI emits it (verified 2026-07-26).
    - Quality Contribution: keeps a routine stale click from rendering as a system fault.
    - Worked Example: E-NOID envelope → 404 'no seat pij-focusable-seat in the store'.
    */
    const deps = await makeDeps({
      nodeShowFails: execFileFailure({
        code: 2,
        stderr: JSON.stringify({
          error: 'E-NOID',
          message: `no session '${SEAT}' in registry`,
        }),
      }),
    });

    const response = await handlePijFocusRequest(focusRequest(), deps);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      reason: 'unknown-seat',
      observation: `no seat ${SEAT} in the store`,
    });
    expect(deps.focus.calls).toEqual([]);
  });

  it('out-of-workspace: 409 for a seat in a sibling directory that shares the prefix', async () => {
    /*
    Test Doc:
    - Why: THE containment hazard, in the one place it would do real damage — focusing a window
      belonging to a different repo's agent. `startsWith` says '/w/chainglass-worktree' is inside
      '/w/chainglass'; the relative-path rule says it is not.
    - Contract: 409, reason 'out-of-workspace', observation names the seat's own cwd; tmux never runs.
    - Usage Notes: the same rule as `isFolderInWorkspace`, applied to `detail.cwd` (node show has no
      `folder` key at all).
    - Quality Contribution: proves the route is checking the right FIELD with the right RULE.
    - Worked Example: cwd '/…/chainglass-worktree' → refused against workspace '/…/chainglass'.
    */
    const deps = await makeDeps({ detail: { cwd: SIBLING } });

    const response = await handlePijFocusRequest(focusRequest(), deps);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      reason: 'out-of-workspace',
      observation: `seat ${SEAT} works in ${SIBLING}, outside this workspace`,
    });
    expect(deps.focus.calls).toEqual([]);
  });

  it('focuses a worktree seat the workspace tree places, though its cwd is outside by path', async () => {
    /*
    Test Doc:
    - Why: git puts a worktree BESIDE its checkout, so a family seat fails path containment while
      being exactly the seat the human clicked (pij-unknown-guan, vox-flier, 2026-07-30 — rendered
      by the tree, refused by the path rule). Membership has two rungs everywhere else; focus must
      use the same two.
    - Contract: cwd outside + seat present in the workspace-scoped `tree --all` → 200 and one
      select-window; the tree read is scoped to the REQUEST's workspace, `--all` because a family
      seat the fleet still shows may be idle.
    - Usage Notes: the sibling path here is the same containment-hazard shape as the refusal test
      above — the tree, not a looser path rule, is what flips the outcome.
    - Quality Contribution: pins the family rung server-side, where the authority lives.
    - Worked Example: cwd '/…/chainglass-worktree', tree contains the seat → focused '@220'.
    */
    const deps = await makeDeps({
      detail: { cwd: SIBLING },
      tree: { roots: [{ id: 'pij-prime', children: [{ id: SEAT }] }] },
    });

    const response = await handlePijFocusRequest(focusRequest(), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ focused: '@220' });
    expect(deps.focus.calls).toEqual([
      { command: 'tmux', args: ['select-window', '-t', '@220'], timeoutMs: 3_000 },
    ]);
  });

  it('out-of-workspace: 409 stands when the workspace tree does not place the seat either', async () => {
    /*
    Test Doc:
    - Why: the family rung must widen focus to worktrees, not to the machine — a seat in a genuinely
      different repo stays refused even when a tree read succeeds.
    - Contract: cwd outside + tree WITHOUT the seat → 409 'out-of-workspace', tmux never runs.
    - Usage Notes: distinct from the refusal test above, where no tree is stubbed at all (an
      unreadable tree also cannot place a seat).
    - Quality Contribution: proves the second rung rejects, not just accepts.
    - Worked Example: tree of one unrelated seat → refused.
    */
    const deps = await makeDeps({
      detail: { cwd: SIBLING },
      tree: { roots: [{ id: 'pij-unrelated' }] },
    });

    const response = await handlePijFocusRequest(focusRequest(), deps);

    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('out-of-workspace');
    expect(deps.focus.calls).toEqual([]);
  });

  it('not-live: 409 quoting the observation and when it was made', async () => {
    /*
    Test Doc:
    - Why: 129 of 181 live seats are dead. Focusing a dead seat's window would land the human in a
      pane where nothing is happening, with no explanation. The refusal has to say what was observed
      and when, because "not live" alone reads as a bug.
    - Contract: 409, reason 'not-live', observation "seat <id> last observed <liveness> at <ts>".
    - Usage Notes: the rule is `liveness !== 'active'` — 'stale' refuses too, not just 'dead'.
    - Quality Contribution: pins both the rule and the wording the button renders verbatim.
    - Worked Example: liveness 'dead' → "…last observed dead at 2026-07-25T01:23:05.517Z".
    */
    const deps = await makeDeps({
      detail: { liveness: 'dead', lastEventAt: '2026-07-25T01:23:05.517Z' },
    });

    const response = await handlePijFocusRequest(focusRequest(), deps);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      reason: 'not-live',
      observation: `seat ${SEAT} last observed dead at 2026-07-25T01:23:05.517Z`,
    });
    expect(deps.focus.calls).toEqual([]);
  });

  it('not-live: an ABSENT liveness gets its own wording, never one inferred from lastEventAt', async () => {
    /*
    Test Doc:
    - Why: absent liveness means NOT OBSERVABLE, which is not the same as "not live". The tempting
      fallback — infer it from `lastEventAt` — is wrong in both directions: a seat can be dead and
      recently noisy, or alive and quiet. And an inference rendered in the same sentence as an
      observation is indistinguishable from one.
    - Contract: no `liveness` key → "liveness not observable for <id>", and `lastEventAt` appears
      nowhere in the wording even though the record has one.
    - Usage Notes: same reason code — the distinction is in the words the human reads.
    - Quality Contribution: keeps the display doctrine (observations, never inferences) at the one
      point where inference would be easiest to justify.
    - Worked Example: liveness absent, lastEventAt present → "liveness not observable for …".
    */
    const deps = await makeDeps({
      detail: { liveness: undefined, lastEventAt: '2026-07-26T05:22:17.895Z' },
    });

    const response = await handlePijFocusRequest(focusRequest(), deps);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      reason: 'not-live',
      observation: `liveness not observable for ${SEAT}`,
    });
    expect(body.observation).not.toContain('2026-07-26');
    expect(deps.focus.calls).toEqual([]);
  });

  it('no-window: 409 when the record carries no tmux window', async () => {
    /*
    Test Doc:
    - Why: an unadopted seat is a real, live process with no tmux window at all. There is nothing to
      focus, and the honest answer says so rather than running tmux against `undefined`.
    - Contract: 409, reason 'no-window', observation "seat <id> has no tmux window on record".
    - Usage Notes: the record is otherwise perfectly focusable — active, in-workspace.
    - Quality Contribution: separates "cannot" from "will not", which are different to a reader.
    - Worked Example: windowId absent → 409, tmux never invoked.
    */
    const deps = await makeDeps({ detail: { windowId: undefined } });

    const response = await handlePijFocusRequest(focusRequest(), deps);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      reason: 'no-window',
      observation: `seat ${SEAT} has no tmux window on record`,
    });
    expect(deps.focus.calls).toEqual([]);
  });

  it('store-unreadable: 503 carrying the machine reason AND the pij code verbatim', async () => {
    /*
    Test Doc:
    - Why: AC-08's third leg, and the leg the closed `FocusReason` union is most likely to be broken
      on. Every other refusal is hand-built here with its `reason`; this one used to hand off to the
      SHARED `storeUnreadable()` helper, whose body shape ({ error, code, verb }) predates the union
      and carries no `reason` at all. A response missing it is not a smaller answer — it drops the
      client into `data-reason="failed"`, the undesigned fallback, on the failure path a broken pij
      store makes the MOST common of the five. Asserting only `code` (as this test did) cannot see
      that: the code survives the omission perfectly.
    - Contract: 503, reason 'store-unreadable', an observation naming the `E-` code verbatim
      alongside pij's own message, and the `code` field kept for diagnosis; tmux never runs.
    - Usage Notes: an unlabelled non-zero exit, which maps to E-EXIT.
    - Quality Contribution: closes the one hole in "N reasons, N tests" — the reason existed in the
      union and in the type, but nothing proved the route ever emitted it on this path.
    - Worked Example: exit 1 'store on fire' → 503 reason 'store-unreadable', code 'E-EXIT'.
    */
    const deps = await makeDeps({
      nodeShowFails: execFileFailure({ stderr: 'store on fire' }),
    });

    const response = await handlePijFocusRequest(focusRequest(), deps);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.reason).toBe('store-unreadable' satisfies FocusReason);
    expect(body.observation).toContain('E-EXIT');
    expect(body.observation).toContain('store on fire');
    expect(body.code).toBe('E-EXIT');
    expect(deps.focus.calls).toEqual([]);
  });

  it('gives every reason in the union a response that actually carries it', async () => {
    /*
    Test Doc:
    - Why: the designed-states rule is "N states, N tests", and the enumeration is what makes it
      checkable. Each leg above asserts its own reason in isolation; nothing asserted that the set of
      reasons the route can EMIT equals the set the union declares. That gap is exactly how
      'store-unreadable' came to be declared, typed, documented and never sent.
    - Contract: every member of `FocusReason` has a condition here, driving it yields exactly that
      reason, and together they are the whole union.
    - Usage Notes: the cases are a `Record<FocusReason, …>`, NOT an array. That is the load-bearing
      detail. In its first form this test held a hand-written array of conditions beside a hand-written
      array of expected reasons, and both were maintained by the author: when 'tmux-refused' was added
      to the union and emitted by the route, this test stayed GREEN — no condition drove the tmux path,
      and TypeScript does not require an array literal to cover a union. It reproduced, one level up,
      the very blindness it was written to close. Keyed by the union, a new member is a COMPILE error
      until someone gives it a condition, and the expected set derives from the keys rather than being
      restated.
    - Quality Contribution: turns "the union is fully implemented" from a claim into a count the type
      checker keeps honest.
    - Worked Example: six keys, six refusals, each emitting the reason it is keyed by.
    */
    const legacy = async (condition: Parameters<typeof makeDeps>[0]) =>
      handlePijFocusRequest(focusRequest(), await makeDeps(condition));
    const rs = async (condition: Parameters<typeof makeRsDeps>[0]) =>
      handlePijFocusRequest(focusRequest(RS_SEAT), makeRsDeps(condition));
    const conditions: Record<FocusReason, () => Promise<Response>> = {
      'unregistered-workspace': async () =>
        handlePijFocusRequest(focusRequest(SEAT, '/'), await makeDeps()),
      'workspace-unreadable': async () => {
        const deps = await makeDeps();
        deps.workspaceService.list = async () => {
          throw new Error('registry unreadable');
        };
        return handlePijFocusRequest(focusRequest(), deps);
      },
      'unknown-seat': () =>
        legacy({
          nodeShowFails: execFileFailure({
            code: 2,
            stderr: JSON.stringify({ error: 'E-NOID', message: 'gone' }),
          }),
        }),
      'out-of-workspace': () => legacy({ detail: { cwd: SIBLING } }),
      'not-live': () => legacy({ detail: { liveness: 'dead' } }),
      'no-window': () => legacy({ detail: { windowId: undefined } }),
      'no-process': () => rs({ seat: { proc: null } }),
      'no-pane': () => rs({ seat: { pane: undefined } }),
      'process-gone': () => rs({ focus: rsFocus('640 1 Sun Sep 6 00:00:00 2026') }),
      'process-reused': () => rs({ seat: { proc: { pid: 642, proc_start: RS_START + 1 } } }),
      'pane-moved': () => rs({ focus: rsFocus().when('tmux', RS_PANE_ARGS, '%640 900 @650') }),
      'identity-unverified': () => rs({ focus: rsFocus('unreadable process row') }),
      'store-unreadable': () =>
        legacy({ nodeShowFails: execFileFailure({ stderr: 'store on fire' }) }),
      'tmux-refused': () =>
        legacy({ focus: new FakeFocusExecutor().fails(new Error('no server running')) }),
    };

    const emitted: string[] = [];
    for (const [expected, condition] of Object.entries(conditions)) {
      const response = await condition();
      const body = await response.json();

      expect(response.status, `${expected} must not answer 200`).not.toBe(200);
      expect(body.reason, `the ${expected} condition must emit its own reason`).toBe(expected);
      emitted.push(body.reason);
    }

    expect([...emitted].sort()).toEqual(Object.keys(conditions).sort());
  });

  it('tmux-refused: 503 whose machine reason names TMUX, not the store', async () => {
    /*
    Test Doc:
    - Why: two claims, and the second is the one that was wrong. First, the command can fail after
      every check passes — a dead tmux server, a window closed between the read and the call — and
      returning 200 there would tell the human their click worked when nothing moved. Second, and
      subtler: this branch used to answer `reason: 'store-unreadable'` because the union had no member
      for a tmux refusal, so the nearest one got reused. The human-readable observation was honest
      ("tmux refused to focus @220: …") while the machine field said the pij store was unreadable —
      a client keying off `data-reason` gets a false cause, and a human debugging it is sent to the
      store. Only the observation was asserted here, so nothing pinned the lie either way.
    - Contract: executor rejects → 503, reason 'tmux-refused', observation naming the window and the
      underlying message.
    - Usage Notes: the fake is told to reject; everything before tmux succeeds, so this is the only
      refusal on the far side of the ladder.
    - Quality Contribution: closes the gap between "we ran it" and "it worked", and makes the machine
      field agree with the sentence beside it.
    - Worked Example: 'no server running' → 503 reason 'tmux-refused', observation mentioning '@220'.
    */
    const focus = new FakeFocusExecutor().fails(new Error('no server running on /tmp/tmux-501'));
    const deps = await makeDeps({ focus });

    const response = await handlePijFocusRequest(focusRequest(), deps);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.reason).toBe('tmux-refused' satisfies FocusReason);
    // Named explicitly: this is the value it used to carry, and it was a statement about the wrong
    // subsystem entirely.
    expect(body.reason).not.toBe('store-unreadable');
    expect(body.observation).toContain('@220');
    expect(body.observation).toContain('no server running');
  });
});

describe('POST /api/pij/focus — the gate, before anything else', () => {
  it('returns 401 with no session and touches neither the store nor tmux', async () => {
    /*
    Test Doc:
    - Why: this is the one route that can act. An unauthenticated caller must not reach the store, and
      must certainly not move a window.
    - Contract: 401; zero new pij calls; zero tmux calls.
    - Usage Notes: counts calls across the request.
    - Quality Contribution: the security boundary on the only mutating surface in the feature.
    - Worked Example: no session → 401, nothing executed.
    */
    const deps = await makeDeps({ authFn: authFail });
    const before = deps.exec.calls.length;

    const response = await handlePijFocusRequest(focusRequest(), deps);

    expect(response.status).toBe(401);
    expect(deps.exec.calls.length).toBe(before);
    expect(deps.focus.calls).toEqual([]);
    expect(deps.workspaceResolver.resolveFromPathCalls).toEqual([]);
  });

  it('requires both a workspace and a seat id before reading anything', async () => {
    /*
    Test Doc:
    - Why: without a workspace there is nothing to check containment against, and a route that
      defaulted to "no containment check" would focus any seat on the machine. Without a seat id there
      is nothing to focus.
    - Contract: missing either → 400, no pij read, no tmux.
    - Usage Notes: covers a missing param and an empty-string seat id.
    - Quality Contribution: makes the unscoped focus request unrepresentable.
    - Worked Example: no workspace → 400; seatId '' → 400.
    */
    const deps = await makeDeps();
    const before = deps.exec.calls.length;

    const noWorkspace = await handlePijFocusRequest(focusRequest(SEAT, null), deps);
    const noSeat = await handlePijFocusRequest(focusRequest(''), deps);

    expect(noWorkspace.status).toBe(400);
    expect(noSeat.status).toBe(400);
    expect(deps.exec.calls.length).toBe(before);
    expect(deps.focus.calls).toEqual([]);
    expect(deps.workspaceResolver.resolveFromPathCalls).toEqual([]);
  });

  it.each([
    '/',
    '/Users/fixture',
    '/unregistered',
    SIBLING,
    `${WORKSPACE}/src`,
    `${WORKSPACE}/..`,
    '.',
  ])('refuses unregistered scope %s before any seat read or process command', async (workspace) => {
    const deps = makeRsDeps();
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT, workspace), deps);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: 'unregistered-workspace' });
    expect(deps.reads).toEqual([]);
    expect(deps.focus.calls).toEqual([]);
  });

  it.each([WORKSPACE, `${WORKSPACE}/`])(
    'accepts authoritative registered root %s',
    async (workspace) => {
      const deps = makeRsDeps();
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT, workspace), deps);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ focused: '@650' });
      expect(deps.workspaceResolver.resolveFromPathCalls).toEqual([]);
    }
  );

  it.each([SIBLING, `${WORKSPACE}/.worktrees/feature`])(
    'accepts a discovered worktree root from the owner inventory: %s',
    async (worktree) => {
      const deps = makeRsDeps({ seat: { folder: worktree } });
      // Owner lookup may report the main checkout for a nested worktree.
      deps.workspaceResolver.setContext(worktree, WORKSPACE_CONTEXT);
      deps.workspaceResolver.setWorkspaceInfo('chainglass', {
        slug: 'chainglass',
        name: 'Chainglass',
        path: WORKSPACE,
        createdAt: new Date('2026-09-07T00:00:00Z'),
        hasGit: true,
        worktrees: [
          {
            path: worktree,
            head: 'abc123',
            branch: 'feature',
            isDetached: false,
            isBare: false,
            isPrunable: false,
          },
        ],
      });
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT, worktree), deps);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ focused: '@650' });
      expect(deps.workspaceResolver.getWorkspaceInfoCalls).toEqual([{ slug: 'chainglass' }]);
    }
  );

  it('normalizes an authoritative registered root stored with a trailing slash', async () => {
    const deps = makeRsDeps();
    deps.workspaces[0] = Workspace.create({ name: 'Chainglass', path: `${WORKSPACE}/` });
    deps.workspaceResolver.reset();
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ focused: '@650' });
    expect(deps.workspaceResolver.resolveFromPathCalls).toEqual([]);
  });

  it('does not accept an arbitrary descendant merely because an owner context exists', async () => {
    const deps = makeRsDeps();
    deps.workspaceResolver.setWorkspaceInfo('chainglass', {
      slug: 'chainglass',
      name: 'Chainglass',
      path: WORKSPACE,
      createdAt: new Date('2026-09-07T00:00:00Z'),
      hasGit: true,
      worktrees: [
        {
          path: WORKSPACE,
          head: 'abc123',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ],
    });
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT, `${WORKSPACE}/src`), deps);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: 'unregistered-workspace' });
    expect(deps.workspaceResolver.getWorkspaceInfoCalls).toEqual([{ slug: 'chainglass' }]);
    expect(deps.reads).toEqual([]);
    expect(deps.focus.calls).toEqual([]);
  });

  it.each([WORKSPACE, SIBLING])(
    'does not widen a registered root to its containing worktree: %s',
    async (folder) => {
      const deps = makeRsDeps({ seat: { folder }, tree: { roots: [] } });
      deps.workspaceResolver.setContext(WORKSPACE, {
        ...WORKSPACE_CONTEXT,
        worktreePath: '/Users/fixture/substrate',
        isMainWorktree: false,
      });
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
      expect(response.status).toBe(folder === WORKSPACE ? 200 : 409);
      if (folder === SIBLING) {
        expect(await response.json()).toMatchObject({ reason: 'out-of-workspace' });
        expect(deps.treeScopes).toEqual([{ cwd: WORKSPACE, all: true }]);
        expect(deps.focus.calls).toEqual([]);
      }
    }
  );

  it('rechecks registration on every click instead of caching an accepted scope', async () => {
    const deps = makeRsDeps();
    expect((await handlePijFocusRequest(focusRequest(RS_SEAT), deps)).status).toBe(200);
    deps.workspaceResolver.reset();
    deps.workspaces.length = 0;
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: 'unregistered-workspace' });
    expect(deps.reads).toEqual(['seats']);
    expect(deps.focus.calls.filter((call) => call.args[0] === 'select-window')).toHaveLength(1);
  });

  it('fails closed when the workspace registry cannot be read', async () => {
    const deps = makeRsDeps();
    deps.workspaceService.list = async () => {
      throw new Error('registry unreadable');
    };
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: 'workspace-unreadable' });
    expect(deps.reads).toEqual([]);
    expect(deps.focus.calls).toEqual([]);
  });

  it.each(['owner', 'inventory'])('fails closed when worktree %s lookup fails', async (stage) => {
    const deps = makeRsDeps();
    if (stage === 'owner')
      deps.workspaceResolver.injectResolveError = new Error('owner unreadable');
    else deps.workspaceResolver.injectGetInfoError = new Error('inventory unreadable');
    const response = await handlePijFocusRequest(
      focusRequest(RS_SEAT, `${WORKSPACE}/.worktrees/feature`),
      deps
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: 'workspace-unreadable' });
    expect(deps.reads).toEqual([]);
    expect(deps.focus.calls).toEqual([]);
  });
});

describe('POST /api/pij/focus — rs click-time identity, never inferred liveness', () => {
  /*
  Test Doc:
  - Why: pane ids and PIDs recycle independently; an extant pane is not evidence that it is this seat.
  - Contract: fresh rs detail, workspace family, exact local start stamp, OS ancestry, then one selection.
  - Usage Notes: real rs adapter/composite with disjoint legacy ids; fake bounded OS/pane outputs only.
  - Quality Contribution: every rejection asserts no selection; success pins read/write argv and order.
  - Worked Example: pid 642 -> 641 -> pane pid 640, stamp 20260906010203 -> window @650, not cached @220.
  */
  it.each([
    { pid: 642, proc_start: RS_START },
    { pid: 640, proc_start: 20260906000000 },
  ])('authorizes exact process identity for $pid and only the resolved window', async (proc) => {
    const deps = makeRsDeps({ seat: { proc } });
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ focused: '@650' });
    expect(deps.reads).toEqual(['seats']);
    expect(deps.legacy.calls).toEqual([]);
    expect(deps.focus.calls).toEqual([
      { command: 'tmux', args: RS_PANE_ARGS, timeoutMs: 3_000 },
      { command: 'ps', args: PS_ARGS, timeoutMs: 3_000 },
      { command: 'tmux', args: RS_PANE_ARGS, timeoutMs: 3_000 },
      { command: 'tmux', args: ['select-window', '-t', '@650'], timeoutMs: 3_000 },
    ]);
  });

  it('reads rs again for each click and ignores the request window', async () => {
    const deps = makeRsDeps();
    await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
    deps.seats[0].pane = '%641';
    deps.focus.when(
      'tmux',
      ['display-message', '-p', '-t', '%641', '#{pane_id} #{pane_pid} #{window_id}'],
      '%641 640 @651'
    );
    const request = new NextRequest(
      `http://localhost/api/pij/focus?workspace=${encodeURIComponent(WORKSPACE)}`,
      {
        method: 'POST',
        body: JSON.stringify({ seatId: RS_SEAT, windowId: '@220' }),
      }
    );
    const response = await handlePijFocusRequest(request, deps);
    expect(await response.json()).toEqual({ focused: '@651' });
    expect(deps.reads).toEqual(['seats', 'seats']);
    expect(deps.legacy.calls).toEqual([]);
    expect(deps.focus.lastArgs).toEqual(['select-window', '-t', '@651']);
  });

  it.each([
    [
      'recycled PID start',
      RS_PROCESS_TABLE.replace('01:02:03', '01:02:04'),
      '%640 640 @650',
      'process-reused',
      'process id reused by another program',
    ],
    ['recycled pane PID', RS_PROCESS_TABLE, '%640 900 @650', 'pane-moved', 'pane moved'],
    [
      'unrelated process',
      `${RS_PROCESS_TABLE.replace('642 641', '642 1')}\n1 0 Sun Sep 6 00:00:00 2026`,
      '%640 640 @650',
      'pane-moved',
      'pane moved',
    ],
    [
      'missing process',
      '640 1 Sun Sep 6 00:00:00 2026',
      '%640 640 @650',
      'process-gone',
      'process gone',
    ],
    [
      'ancestry cycle',
      RS_PROCESS_TABLE.replace('641 640', '641 642'),
      '%640 640 @650',
      'identity-unverified',
      'could not be verified',
    ],
    [
      'incomplete ancestry',
      RS_PROCESS_TABLE.replace('642 641', '642 999'),
      '%640 640 @650',
      'identity-unverified',
      'could not be verified',
    ],
    [
      'malformed process table',
      'not a process table',
      '%640 640 @650',
      'identity-unverified',
      'could not be verified',
    ],
    ['empty process table', '', '%640 640 @650', 'identity-unverified', 'could not be verified'],
    [
      'duplicate PID',
      `${RS_PROCESS_TABLE}\n642 640 Sun Sep 6 01:02:03 2026`,
      '%640 640 @650',
      'identity-unverified',
      'could not be verified',
    ],
  ])(
    'refuses %s with its observed cause and without selecting',
    async (_name, table, pane, reason, observation) => {
      const focus = rsFocus(table).when('tmux', RS_PANE_ARGS, pane);
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT), makeRsDeps({ focus }));
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.reason).toBe(reason);
      expect(body.observation).toContain(observation);
      expect(body.observation).toContain(RS_SEAT);
      expect(focus.calls.some((call) => call.args[0] === 'select-window')).toBe(false);
      expect(focus.calls.filter((call) => call.command === 'ps')).toHaveLength(1);
    }
  );

  it.each([
    undefined,
    null,
    { pid: 642 },
    { pid: -1, proc_start: RS_START },
    { pid: 642, proc_start: 1.5 },
  ])('refuses absent or invalid process identity before probing: %j', async (proc) => {
    const deps = makeRsDeps({ seat: { proc } });
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('no-process');
    expect(deps.focus.calls).toEqual([]);
  });

  it.each([undefined, '', '%640;new-window', '%9007199254740992'])(
    'refuses an unusable pane before probing: %s',
    async (pane) => {
      const deps = makeRsDeps({ seat: { pane } });
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
      expect(response.status).toBe(409);
      expect((await response.json()).reason).toBe('no-pane');
      expect(deps.focus.calls).toEqual([]);
    }
  );

  it.each(['', '%641 640 @650', new Error("can't find pane: %640")])(
    'refuses a missing pane: %s',
    async (pane) => {
      const focus = rsFocus().when('tmux', RS_PANE_ARGS, pane);
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT), makeRsDeps({ focus }));
      expect(response.status).toBe(409);
      expect((await response.json()).reason).toBe('no-pane');
      expect(focus.calls).toHaveLength(1);
    }
  );

  it.each(['%640 900 @650', '%640 640 @999'])(
    'refuses a pane changed during the process read: %s',
    async (pane) => {
      const focus = rsFocus().when('tmux', RS_PANE_ARGS, '%640 640 @650', pane);
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT), makeRsDeps({ focus }));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        reason: 'pane-moved',
        observation: expect.stringContaining('pane moved'),
      });
      expect(focus.calls).toHaveLength(3);
    }
  );

  it.each([
    ['Wed Feb 29 01:02:03 2028', 20280229010203, 200],
    ['Sun Feb 29 01:02:03 2026', 20260229010203, 409],
    ['Sun Sep 31 01:02:03 2026', 20260931010203, 409],
    ['Sun Sep 6 24:02:03 2026', 20260906240203, 409],
    ['Sun Sep 6 01:60:03 2026', 20260906016003, 409],
    ['Sun Sep 6 01:02:60 2026', 20260906010260, 409],
    ['Sun Sep 6 01:02:03 1969', 19690906010203, 409],
  ])(
    'uses the upstream local calendar stamp, including boundaries: %s',
    async (start, proc_start, status) => {
      const focus = rsFocus(`640 1 Sun Sep 6 00:00:00 2026\n642 640 ${start}`);
      const response = await handlePijFocusRequest(
        focusRequest(RS_SEAT),
        makeRsDeps({ focus, seat: { proc: { pid: 642, proc_start } } })
      );
      expect(response.status).toBe(status);
      if (status !== 200) expect((await response.json()).reason).toBe('identity-unverified');
      expect(focus.calls.filter((call) => call.args[0] === 'select-window')).toHaveLength(
        status === 200 ? 1 : 0
      );
    }
  );

  it.each([1, 20260230010203, 20260006010203, 20261306010203, 100000101000000])(
    'does not report PID reuse for malformed recorded start %s and a valid live snapshot',
    async (proc_start) => {
      const deps = makeRsDeps({ seat: { proc: { pid: 642, proc_start } } });
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ reason: 'identity-unverified' });
      expect(deps.focus.calls).toEqual([]);
    }
  );

  it('does not report PID reuse for an unreadable observed start and a valid recorded stamp', async () => {
    const focus = rsFocus(RS_PROCESS_TABLE.replace('01:02:03', '24:02:03'));
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), makeRsDeps({ focus }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'identity-unverified' });
    expect(focus.calls.some((call) => call.args[0] === 'select-window')).toBe(false);
  });

  it('refuses an unknown rs id even when that id exists only in the legacy reader', async () => {
    const deps = makeRsDeps();
    const response = await handlePijFocusRequest(focusRequest(SEAT), deps);
    expect(response.status).toBe(404);
    expect((await response.json()).reason).toBe('unknown-seat');
    expect(deps.legacy.calls).toEqual([]);
    expect(deps.focus.calls).toEqual([]);
  });

  it('preserves rs store failure metadata separately from process and pane failures', async () => {
    const deps = makeRsDeps({
      readFailure: new RsError('unreachable', 'daemon unavailable', { command: '/v1/seats' }),
    });
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      reason: 'store-unreadable',
      code: 'unreachable',
      verb: '/v1/seats',
    });
    expect(deps.focus.calls).toEqual([]);
  });

  it.each(['pane probe', 'selection', 'process table'])(
    'refuses bounded failure of %s without misreporting the store',
    async (stage) => {
      const focus = rsFocus();
      if (stage === 'pane probe') focus.when('tmux', RS_PANE_ARGS, new Error('no server running'));
      if (stage === 'selection')
        focus.when('tmux', ['select-window', '-t', '@650'], new Error('window closed'));
      if (stage === 'process table') focus.when('ps', PS_ARGS, new Error('timed out'));
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT), makeRsDeps({ focus }));
      expect(response.status).toBe(503);
      expect((await response.json()).reason).toBe(
        stage === 'process table' ? 'identity-unverified' : 'tmux-refused'
      );
      expect(focus.calls.filter((call) => call.args[0] === 'select-window')).toHaveLength(
        stage === 'selection' ? 1 : 0
      );
    }
  );

  it.each([true, false])(
    'uses the workspace-family tree rung for a sibling worktree: %s',
    async (inFamily) => {
      const deps = makeRsDeps({
        seat: { folder: SIBLING },
        tree: {
          roots: [
            { id: 'rs-family-root', children: [{ id: inFamily ? RS_SEAT : 'rs-unrelated' }] },
          ],
        },
      });
      const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
      expect(response.status).toBe(inFamily ? 200 : 409);
      expect(deps.treeScopes).toEqual([{ cwd: WORKSPACE, all: true }]);
      if (!inFamily) {
        expect((await response.json()).reason).toBe('out-of-workspace');
        expect(deps.focus.calls).toEqual([]);
      }
    }
  );

  it('authenticates before any rs or OS read', async () => {
    const deps = makeRsDeps({ authFn: authFail });
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), deps);
    expect(response.status).toBe(401);
    expect(deps.reads).toEqual([]);
    expect(deps.focus.calls).toEqual([]);
  });
  it('refuses when the rs pane disappears after identity was verified', async () => {
    const focus = rsFocus().when(
      'tmux',
      RS_PANE_ARGS,
      '%640 640 @650',
      new Error("can't find pane: %640")
    );
    const response = await handlePijFocusRequest(focusRequest(RS_SEAT), makeRsDeps({ focus }));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('no-pane');
    expect(focus.calls).toHaveLength(3);
    expect(focus.calls.some((call) => call.args[0] === 'select-window')).toBe(false);
  });
});
