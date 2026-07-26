/**
 * Snapshot routes — Plan 089 Phase 1, T008.
 *
 * Four GETs: `/api/pij/{fleet,tree,flow,status}`. They exist for two reasons that pull in opposite
 * directions and must both hold:
 *
 *   **Consistency.** Every snapshot is stamped with the spine `seq` it was built at. The browser
 *   subscribes to the `pij` channel BEFORE fetching, buffers arriving deltas, and drops those with
 *   `seq <=` the snapshot's. Without the stamp the snapshot/delta race is unresolvable and a delta
 *   arriving mid-fetch is either lost or overwrites fresher data (plan 1.8, Phase 2's 2.1).
 *
 *   **Honesty.** `/api/pij/status` is what AC-08's empty-state trichotomy renders. An empty `rows`
 *   array is meaningless on its own — the status alongside it is what distinguishes *no seats here*
 *   from *poller not running* from *store unreadable*.
 *
 * Auth follows `app/api/events/mux/route.ts` exactly, including its injectable-deps shape
 * (`MuxDeps` → `PijRouteDeps`), so route logic is testable without a session.
 */
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { handlePijFleetRequest } from '../../../../apps/web/app/api/pij/fleet/route';
import { handlePijFlowRequest } from '../../../../apps/web/app/api/pij/flow/route';
import { handlePijStatusRequest } from '../../../../apps/web/app/api/pij/status/route';
import { handlePijTreeRequest } from '../../../../apps/web/app/api/pij/tree/route';
import { createPijPoller } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-poller.service';
import { createPijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records';
import type { PijRouteDeps } from '../../../../apps/web/src/features/089-first-class-pij/server/route-deps';
import { FakePijExecutor, execFileFailure } from '../../../fakes/fake-pij-executor';
import {
  BroadcastRecorder,
  FakeFlowReader,
  FakeScheduler,
  FakeSpineCursor,
} from '../../../fakes/fake-pij-poller-deps';

const WORKSPACE = '/Users/fixture/substrate/chainglass';
const OTHER = '/Users/fixture/other-repo';

const authOk = async () => ({ user: { name: 'jordan' } });
const authFail = async () => null;

function listRow(id: string, folder = WORKSPACE) {
  return {
    id,
    folder,
    dataDir: `/Users/fixture/.pij/${id}`,
    pid: 4242,
    state: 'idle',
    liveness: 'active',
    lastEventAt: '2026-07-26T05:00:00.000Z',
    boundModel: 'claude-opus-5',
    effort: 'high',
    prime: false,
    unadopted: false,
  };
}

function flowSummary(planFolder: string) {
  return {
    planDir: `/w/docs/plans/${planFolder}`,
    planFolder,
    state: 'live' as const,
    completion: 'active' as const,
    completionSource: 'nav.bag.status' as const,
    phases: [],
    phasesDone: 0,
    phasesTotal: 0,
    reviews: [],
    nodes: [],
    eventCount: 1,
    signature: '1:ph1',
    readAt: '2026-07-26T06:00:00.000Z',
  };
}

async function makeDeps(
  overrides: {
    authFn?: () => Promise<unknown>;
    exec?: FakePijExecutor;
    since?: number;
    flows?: FakeFlowReader;
    start?: boolean;
  } = {}
): Promise<PijRouteDeps & { exec: FakePijExecutor }> {
  const exec =
    overrides.exec ??
    new FakePijExecutor()
      .whenJson(['list', '--json'], [listRow('pij-here'), listRow('pij-there', OTHER)])
      .whenJson(['tree', '--json'], { roots: [{ id: 'pij-here', unadopted: true }] });

  const poller = createPijPoller({
    cursor: new FakeSpineCursor(overrides.since ?? 4242),
    records: createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE }),
    flows: overrides.flows,
    broadcast: new BroadcastRecorder().broadcast,
    scheduler: new FakeScheduler(),
    now: () => new Date('2026-07-26T06:00:00.000Z'),
  });
  if (overrides.start !== false) await poller.start();

  return { authFn: overrides.authFn ?? authOk, poller, exec };
}

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('/api/pij/* — authentication (inherited posture, per the mux route)', () => {
  it('every snapshot route returns 401 with no session', async () => {
    /*
    Test Doc:
    - Why: T5 — pij data gets exactly the same exposure as the rest of chainglass. That is only true
      if every route actually gates, and "every" means the one someone adds without thinking too.
    - Contract: All four handlers return 401 JSON when authFn yields null.
    - Usage Notes: Table-driven so a new route added to the list is covered by construction.
    - Quality Contribution: The security boundary for a feature that surfaces the whole machine's
      agent fleet.
    - Worked Example: each handler → 401 { error: 'Unauthorized' }.
    */
    const deps = await makeDeps({ authFn: authFail });
    const handlers = [
      ['fleet', handlePijFleetRequest],
      ['tree', handlePijTreeRequest],
      ['flow', handlePijFlowRequest],
      ['status', handlePijStatusRequest],
    ] as const;

    for (const [name, handler] of handlers) {
      const response = await handler(request(`/api/pij/${name}`), deps);
      expect(response.status, `${name} must gate`).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    }
  });

  it('does not touch the store at all when unauthenticated', async () => {
    /*
    Test Doc:
    - Why: A route that reads first and authorises second leaks timing and does work for an
      unauthenticated caller.
    - Contract: The auth check precedes any read; no CLI call is made past the boot prime.
    - Usage Notes: Compares call counts before and after.
    - Quality Contribution: Keeps the gate genuinely first.
    - Worked Example: tree with no session → no new exec call.
    */
    const deps = await makeDeps({ authFn: authFail });
    const before = deps.exec.calls.length;

    await handlePijTreeRequest(request(`/api/pij/tree?workspace=${WORKSPACE}`), deps);

    expect(deps.exec.calls.length).toBe(before);
  });
});

describe('/api/pij/fleet', () => {
  it('stamps the snapshot with the spine seq it was built at', async () => {
    /*
    Test Doc:
    - Why: The ordering contract. Phase 2 subscribes before fetching, buffers deltas, and drops those
      with seq ≤ this one. Without the stamp there is nothing to compare against.
    - Contract: The response carries `seq` and `at` alongside `data`.
    - Usage Notes: Cursor pinned at 4242.
    - Quality Contribution: Makes the snapshot/delta race resolvable rather than a timing hope.
    - Worked Example: seq === 4242.
    */
    const deps = await makeDeps();

    const body = await (await handlePijFleetRequest(request('/api/pij/fleet'), deps)).json();

    expect(body.seq).toBe(4242);
    expect(body.at).toBe('2026-07-26T06:00:00.000Z');
  });

  it('scopes to a workspace by folder, and returns the global set without the param', async () => {
    /*
    Test Doc:
    - Why: AC-04 — the default view lists only seats under the workspace path, with a toggle for the
      global set. Both come from the ONE global list already in memory (F-13).
    - Contract: ?workspace=… filters; omitting it returns everything.
    - Usage Notes: One seat here, one in another repo.
    - Quality Contribution: The scope behaviour the default page depends on.
    - Worked Example: scoped → ['pij-here']; unscoped → both.
    */
    const deps = await makeDeps();

    const scoped = await (
      await handlePijFleetRequest(request(`/api/pij/fleet?workspace=${WORKSPACE}`), deps)
    ).json();
    const global = await (await handlePijFleetRequest(request('/api/pij/fleet'), deps)).json();

    expect(scoped.data.rows.map((r: { id: string }) => r.id)).toEqual(['pij-here']);
    expect(scoped.data.workspace).toBe(WORKSPACE);
    expect(global.data.rows).toHaveLength(2);
    expect(global.data.workspace).toBeNull();
  });

  it('serves the snapshot from memory — a page load never spawns a CLI process', async () => {
    /*
    Test Doc:
    - Why: AC-02 — the store must see ONE reader regardless of tab count. A fleet route that shelled
      out per request would make every page load and every refresh a new reader, at ~0.45s each.
    - Contract: The route reads the poller's in-memory snapshot; no new exec call.
    - Usage Notes: —
    - Quality Contribution: The server-side half of "the pij store sees a single reader".
    - Worked Example: three requests → zero additional CLI calls.
    */
    const deps = await makeDeps();
    const before = deps.exec.calls.length;

    for (let i = 0; i < 3; i += 1) {
      await handlePijFleetRequest(request('/api/pij/fleet'), deps);
    }

    expect(deps.exec.calls.length).toBe(before);
  });

  it('carries the poller status alongside the rows, so an empty list is never ambiguous', async () => {
    /*
    Test Doc:
    - Why: AC-08. `rows: []` on its own cannot distinguish *no seats here* from *poller not running*
      from *store unreadable*; shipping the status in the same payload means the component never has
      to make a second request to be honest.
    - Contract: fleet payload includes the full PollerStatus.
    - Usage Notes: An empty store that is otherwise healthy.
    - Quality Contribution: Makes the trichotomy renderable from one response.
    - Worked Example: rows [] with running true, lastError null, lastRecordsPollAt set.
    */
    const deps = await makeDeps({ exec: new FakePijExecutor().whenJson(['list', '--json'], []) });

    const body = await (await handlePijFleetRequest(request('/api/pij/fleet'), deps)).json();

    expect(body.data.rows).toEqual([]);
    expect(body.data.status.running).toBe(true);
    expect(body.data.status.lastError).toBeNull();
    expect(body.data.status.lastRecordsPollAt).not.toBeNull();
  });

  it('never emits pid or paneId anywhere in the response body', async () => {
    /*
    Test Doc:
    - Why: C-03/AC-03. Both recycle, so neither is identity. The cheapest enforcement is that they
      never leave the server — a field absent from the wire cannot be rendered or keyed on by any
      future client, however careless.
    - Contract: The serialized body contains neither substring.
    - Usage Notes: The source list rows DO carry pid 4242; this asserts it was stripped.
    - Quality Contribution: Turns a UI rule into a transport guarantee.
    - Worked Example: '"pid"' and '"paneId"' absent from the JSON text.
    */
    const raw = await (
      await handlePijFleetRequest(request('/api/pij/fleet'), await makeDeps())
    ).text();

    expect(raw).not.toContain('"pid"');
    expect(raw).not.toContain('"paneId"');
    expect(raw).not.toContain('"dataDir"');
  });
});

describe('/api/pij/tree', () => {
  it('requires a workspace and uses it as the CLI cwd', async () => {
    /*
    Test Doc:
    - Why: `pij tree` is repo-scoped FROM CWD. The server's cwd is chainglass, so a tree request for
      another workspace without an explicit cwd returns chainglass's tree under the other
      workspace's name — plausible, wrong, silent.
    - Contract: No `workspace` param → 400; with one, that path is the exec cwd.
    - Usage Notes: —
    - Quality Contribution: Makes the scoping trap unreachable through the HTTP surface.
    - Worked Example: 400 without; cwd === WORKSPACE with.
    */
    const deps = await makeDeps();

    const missing = await handlePijTreeRequest(request('/api/pij/tree'), deps);
    expect(missing.status).toBe(400);

    await handlePijTreeRequest(request(`/api/pij/tree?workspace=${WORKSPACE}`), deps);
    expect(deps.exec.lastArgs).toEqual(['tree', '--json']);
    expect(deps.exec.lastCwd).toBe(WORKSPACE);
  });

  it('stamps the tree snapshot with the cursor seq and passes the roots through', async () => {
    /*
    Test Doc:
    - Why: Consistency applies to every snapshot, not just the fleet. And `unadopted` is a ruled
      derivation we consume rather than compute.
    - Contract: seq present; roots verbatim including their marks.
    - Usage Notes: —
    - Quality Contribution: AC-05's data, unmodified and orderable against deltas.
    - Worked Example: seq 4242, root unadopted true.
    */
    const deps = await makeDeps();

    const body = await (
      await handlePijTreeRequest(request(`/api/pij/tree?workspace=${WORKSPACE}`), deps)
    ).json();

    expect(body.seq).toBe(4242);
    expect(body.data.roots[0].unadopted).toBe(true);
  });

  it('returns 503 with the pij error code when the store cannot be read', async () => {
    /*
    Test Doc:
    - Why: AC-08/AC-09 — "store unreadable" is a distinct rendered state, so the route must say so
      rather than returning an empty tree that reads as "nothing here".
    - Contract: A PijCliError becomes 503 with { error, code }.
    - Usage Notes: tree fails with an E-code.
    - Quality Contribution: Keeps a failure from masquerading as an empty result.
    - Worked Example: 503, code 'E-EXIT'.
    */
    const exec = new FakePijExecutor()
      .whenJson(['list', '--json'], [])
      .when(['tree', '--json'])
      .fails(execFileFailure({ stderr: 'store on fire' }));
    const deps = await makeDeps({ exec });

    const response = await handlePijTreeRequest(
      request(`/api/pij/tree?workspace=${WORKSPACE}`),
      deps
    );

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('E-EXIT');
  });
});

describe('/api/pij/flow', () => {
  it('returns one classified summary per plan folder, stamped with the cursor seq', async () => {
    /*
    Test Doc:
    - Why: 82 of 85 plan folders have no flow data, so this endpoint's dominant output is absence —
      and absence has four distinct honest labels.
    - Contract: The payload carries the scanned summaries and a seq.
    - Usage Notes: Two scripted summaries.
    - Quality Contribution: The data behind AC-07.
    - Worked Example: two flows, seq 4242.
    */
    const flows = new FakeFlowReader([
      flowSummary('088-remote-app-view'),
      flowSummary('089-first-class-pij'),
    ]);
    const deps = await makeDeps({ flows });

    const body = await (
      await handlePijFlowRequest(request(`/api/pij/flow?workspace=${WORKSPACE}`), deps)
    ).json();

    expect(body.seq).toBe(4242);
    expect(body.data.flows.map((f: { planFolder: string }) => f.planFolder)).toEqual([
      '088-remote-app-view',
      '089-first-class-pij',
    ]);
  });

  it('requires a workspace, because a plans root is meaningless without one', async () => {
    /*
    Test Doc:
    - Why: The scan is over `<workspace>/docs/plans/*`. Defaulting to the server's own repo would
      quietly show chainglass's plans in every workspace.
    - Contract: Missing `workspace` → 400.
    - Usage Notes: —
    - Quality Contribution: Same trap as the tree route, closed the same way.
    - Worked Example: 400.
    */
    const deps = await makeDeps({ flows: new FakeFlowReader([]) });

    expect((await handlePijFlowRequest(request('/api/pij/flow'), deps)).status).toBe(400);
  });

  it('returns an empty list rather than an error when flow reading is not configured', async () => {
    /*
    Test Doc:
    - Why: The flow half is optional in Phase 1 (Phase 3 wires the watcher). A missing reader is a
      capability that is not enabled, not a failure.
    - Contract: No flow reader → 200 with flows [].
    - Usage Notes: —
    - Quality Contribution: Keeps the route honest about a not-yet-wired capability.
    - Worked Example: 200, flows [].
    */
    const deps = await makeDeps();

    const response = await handlePijFlowRequest(
      request(`/api/pij/flow?workspace=${WORKSPACE}`),
      deps
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.flows).toEqual([]);
  });
});

describe('/api/pij/status — what AC-08 renders', () => {
  it('reports a never-started poller distinctly from a running one', async () => {
    /*
    Test Doc:
    - Why: "Poller not running" is one of the three ruled empty-state causes, and it is the one a
      human can actually act on (restart the server). It must not look like "no seats".
    - Contract: running false with lastRecordsPollAt null before start(); both flip after.
    - Usage Notes: start:false builds an unstarted poller.
    - Quality Contribution: The middle leg of the trichotomy.
    - Worked Example: false/null → true/timestamp.
    */
    const cold = await makeDeps({ start: false });
    const coldBody = await (await handlePijStatusRequest(request('/api/pij/status'), cold)).json();
    expect(coldBody.data.running).toBe(false);
    expect(coldBody.data.lastRecordsPollAt).toBeNull();

    const warm = await makeDeps();
    const warmBody = await (await handlePijStatusRequest(request('/api/pij/status'), warm)).json();
    expect(warmBody.data.running).toBe(true);
    expect(warmBody.data.lastRecordsPollAt).not.toBeNull();
  });

  it('surfaces the store error with its code, distinctly from an empty fleet', async () => {
    /*
    Test Doc:
    - Why: The third leg. "Store unreadable" must carry enough for a human to tell them apart
      without opening devtools — which means the code and the message, not a boolean.
    - Contract: lastError { code, message, at } is present and fleetSize is 0.
    - Usage Notes: The list call fails at boot.
    - Quality Contribution: Completes AC-08's data requirement.
    - Worked Example: code 'E-EXIT', fleetSize 0, running true.
    */
    const deps = await makeDeps({
      exec: new FakePijExecutor()
        .when(['list', '--json'])
        .fails(execFileFailure({ stderr: 'nope' })),
    });

    const body = await (await handlePijStatusRequest(request('/api/pij/status'), deps)).json();

    expect(body.data.lastError.code).toBe('E-EXIT');
    expect(body.data.fleetSize).toBe(0);
    expect(body.data.running).toBe(true);
  });

  it('exposes the cursor seq and the torn-line counter', async () => {
    /*
    Test Doc:
    - Why: The seq is the snapshot-ordering anchor; the torn-line counter turns a required silence
      (skipping corrupt lines) into an observable about the store's health.
    - Contract: Both present on the status payload.
    - Usage Notes: —
    - Quality Contribution: Gives an operator something to look at when the fleet looks wrong.
    - Worked Example: seq 4242, tornLinesSkipped 0.
    */
    const body = await (
      await handlePijStatusRequest(request('/api/pij/status'), await makeDeps())
    ).json();

    expect(body.data.seq).toBe(4242);
    expect(body.data.tornLinesSkipped).toBe(0);
    expect(body.seq).toBe(4242);
  });

  it('is never cached', async () => {
    /*
    Test Doc:
    - Why: Next.js will happily static-optimise a GET route. A cached poller status is a lie with a
      timestamp on it — the single worst thing this endpoint could serve.
    - Contract: Cache-Control is no-store.
    - Usage Notes: The `dynamic = 'force-dynamic'` export is the build-time half; this is the
      response-time half.
    - Quality Contribution: Keeps the freshness claim true.
    - Worked Example: header 'no-store'.
    */
    const response = await handlePijStatusRequest(request('/api/pij/status'), await makeDeps());

    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
});
