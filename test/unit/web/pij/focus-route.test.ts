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
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  type FocusReason,
  handlePijFocusRequest,
} from '../../../../apps/web/app/api/pij/focus/route';
import { createPijPoller } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-poller.service';
import { createPijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records';
import type { PijRouteDeps } from '../../../../apps/web/src/features/089-first-class-pij/server/route-deps';
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
  } = {}
): Promise<PijRouteDeps & { exec: FakePijExecutor; focus: FakeFocusExecutor }> {
  const exec = new FakePijExecutor().whenJson(['list', '--json', '--badge'], []);
  if (overrides.nodeShowFails) {
    exec.when(['node', 'show', SEAT, '--json']).fails(overrides.nodeShowFails);
  } else {
    exec.whenJson(['node', 'show', SEAT, '--json'], nodeDetail(overrides.detail));
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
  return {
    authFn: overrides.authFn ?? authOk,
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
    - Contract: driving each of the five refusal conditions yields five distinct `reason` values, and
      together they are the whole `FocusReason` union.
    - Usage Notes: exercises the real handler five times rather than reading the type — a union member
      with no producer is invisible to the type checker but fatal to the client.
    - Quality Contribution: turns "the union is fully implemented" from a claim into a count.
    - Worked Example: the five emitted reasons sort-equal the five declared ones.
    */
    const emitted: string[] = [];

    const conditions: Array<Parameters<typeof makeDeps>[0]> = [
      {
        nodeShowFails: execFileFailure({
          code: 2,
          stderr: JSON.stringify({ error: 'E-NOID', message: 'gone' }),
        }),
      },
      { detail: { cwd: SIBLING } },
      { detail: { liveness: 'dead' } },
      { detail: { windowId: undefined } },
      { nodeShowFails: execFileFailure({ stderr: 'store on fire' }) },
    ];

    for (const condition of conditions) {
      const response = await handlePijFocusRequest(focusRequest(), await makeDeps(condition));
      expect(response.status).not.toBe(200);
      emitted.push((await response.json()).reason);
    }

    const declared: FocusReason[] = [
      'unknown-seat',
      'out-of-workspace',
      'not-live',
      'no-window',
      'store-unreadable',
    ];
    expect([...emitted].sort()).toEqual([...declared].sort());
  });

  it('reports a tmux failure as a failure, not as a silent success', async () => {
    /*
    Test Doc:
    - Why: the command can fail after every check passes — a dead tmux server, a window closed between
      the read and the call. Returning 200 there would tell the human their click worked when nothing
      moved.
    - Contract: executor rejects → 503 whose observation names the window and the underlying message.
    - Usage Notes: the fake is told to reject.
    - Quality Contribution: closes the gap between "we ran it" and "it worked".
    - Worked Example: 'no server running' → 503 mentioning '@220'.
    */
    const focus = new FakeFocusExecutor().fails(new Error('no server running on /tmp/tmux-501'));
    const deps = await makeDeps({ focus });

    const response = await handlePijFocusRequest(focusRequest(), deps);
    const body = await response.json();

    expect(response.status).toBe(503);
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
  });
});
