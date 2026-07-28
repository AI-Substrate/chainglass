/**
 * use-pij-fleet — the page's one data acquisition path (Plan 089 Phase 2, T002).
 *
 * Test Doc:
 * - Why: this hook owns the plan's single ordering contract. It subscribes to the `pij` channel
 *   BEFORE fetching a snapshot, then reconciles the two by `seq`. Everything the page renders comes
 *   from here, so a fault here is invisible everywhere and wrong everywhere.
 * - Contract: dossier T002 + § B; plan Findings 03/F-13; C-08 (`--since` is exclusive).
 * - Usage Notes: `FakePijApi.deferFleet()` holds the snapshot open so a delta can be delivered inside
 *   the subscribe→snapshot window — the race is reproduced deterministically, never by timing luck.
 *   No `vi.mock()` anywhere (constitution P4): a fake `fetch` and the real SSE provider driven by
 *   `FakeMultiplexedSSE`.
 * - Quality Contribution: pins the four ways this hook can lie — losing a raced delta, applying a
 *   superseded one twice, adopting another workspace's seats, and merging fields it was handed whole.
 * - Worked Example: subscribe → delta seq 41 arrives (buffered) → snapshot seq 40 lands → replay
 *   drops nothing and applies 41 exactly once.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PIJ_CHANNEL_RETENTION,
  usePijFleet,
} from '../../../../apps/web/src/features/089-first-class-pij/hooks/use-pij-fleet';
import type {
  FleetRow,
  FleetSnapshotData,
  PijSnapshot,
} from '../../../../apps/web/src/features/089-first-class-pij/types';
import { MultiplexedSSEProvider } from '../../../../apps/web/src/lib/sse/multiplexed-sse-provider';
import { createFakeMultiplexedSSEFactory } from '../../../fakes/fake-multiplexed-sse';
import { FakePijApi } from '../../../fakes/fake-pij-api';
import {
  UI_FLEET_ROWS,
  UI_FOREIGN_ROW,
  UI_PM_ID,
  UI_SIBLING_ROW,
  UI_TREE_ROOTS,
  UI_WORKSPACE_PATH,
  fleetRow,
  pollerStatus,
} from '../../../fixtures/pij/fleet-ui';
import { flowSummary, foreignFlowSummary, siblingFlowSummary } from '../../../fixtures/pij/flow-ui';

let sse: ReturnType<typeof createFakeMultiplexedSSEFactory>;
let api: FakePijApi;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MultiplexedSSEProvider channels={['pij']} eventSourceFactory={sse.factory}>
      {children}
    </MultiplexedSSEProvider>
  );
}

function fleetSnapshot(
  seq: number,
  rows: FleetRow[],
  statusOverrides = {}
): PijSnapshot<FleetSnapshotData> {
  return {
    seq,
    at: '2026-07-26T12:00:00.000Z',
    data: {
      workspace: UI_WORKSPACE_PATH,
      rows,
      status: pollerStatus({ seq, ...statusOverrides }),
    },
  };
}

/** Deliver one `pij` channel event exactly as the mux delivers it: the flat envelope. */
function deliver(type: string, payload: Record<string, unknown>): void {
  act(() => sse.simulateChannelMessage('pij', type, payload));
}

function renderPijFleet(
  options: { treeRefetchDebounceMs?: number; scope?: 'workspace' | 'global' } = {}
) {
  return renderHook(
    () =>
      usePijFleet({
        workspacePath: UI_WORKSPACE_PATH,
        scope: options.scope,
        fetchImpl: api.fetch,
        treeRefetchDebounceMs: options.treeRefetchDebounceMs ?? 5,
      }),
    { wrapper }
  );
}

beforeEach(() => {
  sse = createFakeMultiplexedSSEFactory();
  api = new FakePijApi();
  api
    .setFleet(fleetSnapshot(40, UI_FLEET_ROWS))
    .setTree({
      seq: 40,
      at: '2026-07-26T12:00:00.000Z',
      data: { workspace: UI_WORKSPACE_PATH, roots: UI_TREE_ROOTS },
    })
    .setFlows({
      seq: 40,
      at: '2026-07-26T12:00:00.000Z',
      data: { workspace: UI_WORKSPACE_PATH, flows: [] },
    });
});

describe('usePijFleet — acquisition', () => {
  it('asks each route for the workspace PATH, never the slug', async () => {
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    const encoded = encodeURIComponent(UI_WORKSPACE_PATH);
    expect(api.calls).toContain(`/api/pij/tree?workspace=${encoded}`);
    expect(api.calls).toContain(`/api/pij/flow?workspace=${encoded}`);

    // The FLEET read is deliberately global — see the hook's loadFleet doc. The server's workspace
    // filter is path containment, which excludes a repo's own worktrees (git puts them beside the
    // checkout), so pre-filtering there destroys rows before the tree can place them. Membership is
    // decided here instead. Asserted as an absence so re-adding the parameter fails loudly.
    expect(api.calls).toContain('/api/pij/fleet');
    expect(api.calls.filter((url) => url.startsWith('/api/pij/fleet?'))).toEqual([]);
  });

  it('exposes the snapshot rows, tree and status', async () => {
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    expect(result.current.rows).toHaveLength(UI_FLEET_ROWS.length);
    expect(result.current.tree).toEqual(UI_TREE_ROOTS);
    expect(result.current.status?.fleetSize).toBe(178);
    expect(result.current.seq).toBe(40);
  });

  it('reports a failed fleet read as degraded, with the pij code kept verbatim', async () => {
    api.failWith('fleet', 503, { error: 'storeUnreadable', code: 'E-STORE-UNREADABLE' });
    const { result } = renderPijFleet();

    await waitFor(() => expect(result.current.phase).toBe('degraded'));
    expect(result.current.errors.fleet).toContain('E-STORE-UNREADABLE');
    // A broken fleet read must not take the other two surfaces down with it.
    expect(result.current.tree).toEqual(UI_TREE_ROOTS);
  });
});

describe('usePijFleet — the ordering contract', () => {
  it('neither loses nor double-applies a delta that arrives before the snapshot (the race)', async () => {
    const release = api.deferFleet();
    const { result } = renderPijFleet();

    // Subscription is live; the snapshot is still in flight. This is the window.
    const raced = fleetRow(UI_PM_ID, {
      state: 'working',
      currentTask: 'raced task',
      badge: 'working',
    });
    deliver('fleet-delta', { seq: 41, at: '2026-07-26T12:00:01.000Z', rows: [raced], removed: [] });

    expect(result.current.phase).toBe('connecting');

    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.phase).toBe('live'));

    const applied = result.current.rows.filter((row) => row.id === UI_PM_ID);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual(raced);
    expect(result.current.seq).toBe(41);
  });

  it('drops a buffered delta the snapshot already reflects (seq <= snapshot.seq)', async () => {
    const release = api.deferFleet();
    const { result } = renderPijFleet();

    const superseded = fleetRow(UI_PM_ID, { state: 'stale-from-an-old-delta' });
    deliver('fleet-delta', {
      seq: 40,
      at: '2026-07-26T11:59:59.000Z',
      rows: [superseded],
      removed: [],
    });

    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.phase).toBe('live'));

    const pm = result.current.rows.find((row) => row.id === UI_PM_ID);
    expect(pm?.state).toBe('working');
  });

  it('keeps applying live deltas that repeat a seq — the slow loop does not advance the cursor', async () => {
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    // `tickSlow` stamps deltas with the CURRENT cursor seq, which record changes never move. Treating
    // "seq not greater than the last applied" as stale would drop every record refresh after the first.
    deliver('fleet-delta', {
      seq: 40,
      at: '2026-07-26T12:00:02.000Z',
      rows: [fleetRow(UI_PM_ID, { state: 'first' })],
      removed: [],
    });
    deliver('fleet-delta', {
      seq: 40,
      at: '2026-07-26T12:00:03.000Z',
      rows: [fleetRow(UI_PM_ID, { state: 'second' })],
      removed: [],
    });

    expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.state).toBe('second');
  });

  it('replaces rows whole — a field the replacement omits is gone, never merged', async () => {
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.badge).toBe('waiting');
    const replacement = fleetRow(UI_PM_ID, { state: 'idle' });
    expect(replacement.badge).toBeUndefined();

    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:04.000Z',
      rows: [replacement],
      removed: [],
    });

    const pm = result.current.rows.find((row) => row.id === UI_PM_ID);
    expect(pm).toEqual(replacement);
    // The badge came from the snapshot and is absent from the replacement. If it survived, a merge
    // exists — and a merged badge is exactly the re-derivation AC-03 forbids.
    expect(pm?.badge).toBeUndefined();
  });

  it('applies `removed` unconditionally, without consulting the workspace', async () => {
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:05.000Z',
      rows: [],
      removed: [UI_PM_ID],
    });

    expect(result.current.rows.find((row) => row.id === UI_PM_ID)).toBeUndefined();
  });

  it('updates status from a poller-status event', async () => {
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    deliver('poller-status', {
      seq: 41,
      at: '2026-07-26T12:00:06.000Z',
      status: pollerStatus({
        running: false,
        lastError: { code: 'E-STORE', message: 'EACCES', at: '2026-07-26T12:00:06.000Z' },
      }),
    });

    expect(result.current.status?.running).toBe(false);
    expect(result.current.status?.lastError?.code).toBe('E-STORE');
    expect(result.current.phase).toBe('degraded');
  });
});

describe('usePijFleet — workspace containment of global deltas', () => {
  it('keeps foreign rows out and says so: zero BY FILTER, not zero by absence', async () => {
    // Deltas are global by design (one shared channel, many workspaces). An empty view whose cause is
    // "the filter dropped everything" must be distinguishable from "there is nothing to show" —
    // otherwise a scope-key mismatch reads as an honest empty fleet.
    api.setFleet(fleetSnapshot(40, []));
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:07.000Z',
      rows: [UI_FOREIGN_ROW, UI_SIBLING_ROW],
      removed: [],
    });

    expect(result.current.rows).toEqual([]);
    expect(result.current.filteredOut).toBe(2);
  });

  it('counts nothing as filtered when the delta belongs here', async () => {
    api.setFleet(fleetSnapshot(40, []));
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:08.000Z',
      rows: [fleetRow('pij-local-newt')],
      removed: [],
    });

    expect(result.current.rows.map((row) => row.id)).toEqual(['pij-local-newt']);
    expect(result.current.filteredOut).toBe(0);
  });

  it('rejects a sibling directory that shares the workspace prefix', async () => {
    api.setFleet(fleetSnapshot(40, []));
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:09.000Z',
      rows: [UI_SIBLING_ROW],
      removed: [],
    });

    expect(result.current.rows).toEqual([]);
    expect(result.current.filteredOut).toBe(1);
  });

  it('shows a worktree seat the TREE places, though its folder is outside the workspace root', async () => {
    /*
    Test Doc:
    - Why: this is the bug the whole membership rule was rewritten for (2026-07-28, voxel-flying-game
      via pij-superior-mastodon). Git places a worktree BESIDE its checkout, so a seat working in
      `<repo>-worktrees/<branch>` fails path containment while being in the same repo family. The old
      rule dropped those rows before the tree could place them, and the page rendered "2 seats ·
      governs 0 sections" out of 18 — an error-free, well-formed, wrong answer that no reader could
      be expected to doubt.
    - Contract: membership is `tree family OR path containment`, and a seat included only by the tree
      is counted in `outsideRoot` so its presence is visible rather than merely correct.
    - Usage Notes: the SIBLING case directly above must keep failing containment — same directory
      shape, opposite verdict. The discriminator is the tree, never the name: `chainglass-worktree`
      is absent from this tree, `chainglass-worktrees/s3` is in it.
    - Quality Contribution: pins the rule that a name-based fix would silently re-break, and pairs
      with the sibling test so "reject siblings" cannot be satisfied by rejecting worktrees too.
    - Worked Example: otter at `<workspace>-worktrees/s3-thing`, present in the tree → shown, and
      `outsideRoot` is 1.
    */
    const worktreeRow = fleetRow('pij-worktree-otter', {
      folder: `${UI_WORKSPACE_PATH}-worktrees/s3-thing`,
    });
    api.setFleet(fleetSnapshot(40, [worktreeRow])).setTree({
      seq: 40,
      at: '2026-07-26T12:00:00.000Z',
      data: {
        workspace: UI_WORKSPACE_PATH,
        roots: [{ id: 'pij-worktree-otter', folder: worktreeRow.folder }],
      },
    });

    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    expect(result.current.rows.map((row) => row.id)).toEqual(['pij-worktree-otter']);
    expect(result.current.outsideRoot).toBe(1);
    expect(result.current.filteredOut).toBe(0);
  });
});

describe('usePijFleet — tree freshness', () => {
  it('refetches the tree, debounced, when a delta introduces an id the tree has never seen', async () => {
    const { result } = renderPijFleet({ treeRefetchDebounceMs: 5 });
    await waitFor(() => expect(result.current.phase).toBe('live'));
    const before = api.countOf('tree');

    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:10.000Z',
      rows: [fleetRow('pij-brand-new-ibex')],
      removed: [],
    });
    deliver('fleet-delta', {
      seq: 42,
      at: '2026-07-26T12:00:11.000Z',
      rows: [fleetRow('pij-brand-new-oryx')],
      removed: [],
    });

    // Two unknown ids in quick succession are ONE refetch: the tree is a whole-forest read, and the
    // point of the debounce is that a burst of spawns costs one CLI call, not one per seat.
    await waitFor(() => expect(api.countOf('tree')).toBe(before + 1));
  });

  it('does not refetch the tree for ids it already knows', async () => {
    const { result } = renderPijFleet({ treeRefetchDebounceMs: 5 });
    await waitFor(() => expect(result.current.phase).toBe('live'));
    const before = api.countOf('tree');

    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:12.000Z',
      rows: [fleetRow(UI_PM_ID, { state: 'working' })],
      removed: [],
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(api.countOf('tree')).toBe(before);
  });

  it('refetches every surface on an explicit refresh (what a tab change calls)', async () => {
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));
    const before = api.countOf('fleet');

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(api.countOf('fleet')).toBe(before + 1));
  });
});

describe('usePijFleet — retention', () => {
  /** Deliver a run of `fleet-delta`s in ONE act, so the cursor lands exactly where the run ends. */
  function deliverRun(from: number, to: number): void {
    act(() => {
      for (let index = from; index <= to; index += 1) {
        sse.simulateChannelMessage('pij', 'fleet-delta', {
          seq: 40,
          at: '2026-07-26T12:00:14.000Z',
          rows: [fleetRow(UI_PM_ID, { state: `delta-${index}` })],
          removed: [],
        });
      }
    });
  }

  it('caps retention rather than accumulating a page-lifetime array', async () => {
    // Phase 2 bought its way out of the freeze with `maxMessages: 0`, which trades a silent stall for
    // an unbounded array — acceptable at one delta per slow loop, not at flow-delta rates. The cap is
    // back, so this asserts it IS a cap: a test that proved a cursor survives trimming while nothing
    // was ever trimmed would be the green that lies.
    expect(PIJ_CHANNEL_RETENTION).toBeGreaterThan(0);
  });

  it('keeps applying deltas once retention has begun trimming the buffer', async () => {
    // An index into a SLIDING array is a broken cursor by construction: past the cap the array stops
    // growing while the index sits at the same number, so "have I fallen behind?" is false forever and
    // every subsequent delta is skipped. The page keeps its "live" badge and silently stops updating.
    // The fix is an absolute count of messages received, which trimming cannot move.
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    // Delivered as a run so the cursor reaches exactly the cap before the next event arrives.
    // Delivering cap+1 in a single batch would hide the fault: the slide keeps the LAST `cap`, so the
    // final delta would still be inside the window on the first pass.
    deliverRun(1, PIJ_CHANNEL_RETENTION);
    expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.state).toBe(
      `delta-${PIJ_CHANNEL_RETENTION}`
    );

    // The first message past the cap — the exact event Phase 2's review caught being dropped.
    deliver('fleet-delta', {
      seq: 40,
      at: '2026-07-26T12:00:15.000Z',
      rows: [fleetRow(UI_PM_ID, { state: 'delta-past-cap' })],
      removed: [],
    });
    expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.state).toBe('delta-past-cap');

    // And the freeze is permanent when it happens, not a one-event stutter — so a second event, well
    // past the cap and after a further run of trimming, proves the cursor is tracking, not parked.
    deliverRun(PIJ_CHANNEL_RETENTION + 2, PIJ_CHANNEL_RETENTION + 500);
    deliver('fleet-delta', {
      seq: 40,
      at: '2026-07-26T12:00:16.000Z',
      rows: [fleetRow(UI_PM_ID, { state: 'delta-long-past-cap' })],
      removed: [],
    });
    expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.state).toBe(
      'delta-long-past-cap'
    );
  });

  it('replays a delta that raced the fetch even when the buffer has been trimmed since', async () => {
    // The replay window is a pair of positions in the message stream, and the rewind on snapshot-apply
    // moves the cursor BACKWARDS. Expressed as array indices both ends drift as the array slides; as
    // absolute counts neither does. This is the same race the ordering test covers, run on the far
    // side of the cap so the two representations disagree.
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));
    deliverRun(1, PIJ_CHANNEL_RETENTION + 10);

    const release = api.deferFleet();
    api.setFleet(fleetSnapshot(40, UI_FLEET_ROWS));
    await act(async () => {
      result.current.refresh();
    });

    const raced = fleetRow(UI_PM_ID, { state: 'raced-past-the-cap' });
    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:17.000Z',
      rows: [raced],
      removed: [],
    });

    await act(async () => {
      release();
    });

    await waitFor(() =>
      expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.state).toBe(
        'raced-past-the-cap'
      )
    );
  });
});

describe('usePijFleet — flow deltas', () => {
  /** The flow snapshot the tab starts from: two plan folders in this workspace. */
  function seedFlows() {
    api.setFlows({
      seq: 40,
      at: '2026-07-26T12:00:00.000Z',
      data: {
        workspace: UI_WORKSPACE_PATH,
        flows: [flowSummary('088-remote-app-view'), flowSummary('089-first-class-pij')],
      },
    });
  }

  it('merges changed-only summaries by planDir, leaving the untouched ones alone', async () => {
    // `refreshFlows` broadcasts only what its signature diff found changed, so a delta is a PATCH over
    // the plan set, keyed by absolute path. A plan the delta does not mention has not gone anywhere.
    seedFlows();
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.flows).toHaveLength(2));

    deliver('flow-delta', {
      seq: 40,
      at: '2026-07-26T12:00:20.000Z',
      flows: [flowSummary('089-first-class-pij', { state: 'live', nowPhaseId: 'ph3' })],
    });

    const byFolder = new Map(result.current.flows.map((flow) => [flow.planFolder, flow]));
    expect(byFolder.get('089-first-class-pij')?.state).toBe('live');
    expect(byFolder.get('089-first-class-pij')?.nowPhaseId).toBe('ph3');
    expect(byFolder.get('088-remote-app-view')?.state).toBe('untracked');
    expect(result.current.flows).toHaveLength(2);
  });

  it('applies two flow-deltas carrying the SAME seq — both, in order', async () => {
    // `refreshFlows` stamps its deltas with the current cursor seq, and a flow file changing moves no
    // spine cursor: consecutive flow refreshes REPEAT a seq as a matter of course. A "must be newer"
    // guard would drop every flow update after the first and freeze the tab while it looked live.
    seedFlows();
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.flows).toHaveLength(2));

    deliver('flow-delta', {
      seq: 40,
      at: '2026-07-26T12:00:21.000Z',
      flows: [flowSummary('089-first-class-pij', { nowPhaseId: 'ph2' })],
    });
    deliver('flow-delta', {
      seq: 40,
      at: '2026-07-26T12:00:22.000Z',
      flows: [flowSummary('089-first-class-pij', { nowPhaseId: 'ph3' })],
    });

    expect(
      result.current.flows.find((f) => f.planFolder === '089-first-class-pij')?.nowPhaseId
    ).toBe('ph3');
  });

  it('counts a foreign plan folder into flowsFilteredOut — never into the fleet counter', async () => {
    // Two counters because they are two claims. The Fleet tab renders `filteredOut` as "N updates
    // filtered out (other workspaces)" ABOUT SEATS; folding a rejected plan folder into it would make
    // that sentence false, and it is a sentence a human reads while wondering where a seat went.
    api.setFleet(fleetSnapshot(40, []));
    seedFlows();
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.flows).toHaveLength(2));

    deliver('flow-delta', {
      seq: 40,
      at: '2026-07-26T12:00:23.000Z',
      flows: [
        foreignFlowSummary('091-somebody-elses-plan'),
        siblingFlowSummary('092-shared-prefix-plan'),
        flowSummary('089-first-class-pij', { state: 'live' }),
      ],
    });

    expect(result.current.flowsFilteredOut).toBe(2);
    expect(result.current.filteredOut).toBe(0);
    expect(result.current.flows.map((f) => f.planFolder).sort()).toEqual([
      '088-remote-app-view',
      '089-first-class-pij',
    ]);
  });

  it('keeps a vanished plan until a snapshot says otherwise — there is no removal signal', async () => {
    // A deleted plan folder emits nothing at all: `refreshFlows` broadcasts what it FOUND, so absence
    // is not carried by any delta. Refetching the snapshot is the deletion path, and it is the only
    // one — inventing a removal from "not mentioned lately" would delete a plan nobody touched.
    seedFlows();
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.flows).toHaveLength(2));

    api.setFlows({
      seq: 41,
      at: '2026-07-26T12:00:24.000Z',
      data: { workspace: UI_WORKSPACE_PATH, flows: [flowSummary('088-remote-app-view')] },
    });
    deliver('flow-delta', {
      seq: 40,
      at: '2026-07-26T12:00:25.000Z',
      flows: [flowSummary('088-remote-app-view', { state: 'live' })],
    });

    expect(result.current.flows).toHaveLength(2);

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.flows).toHaveLength(1));
    expect(result.current.flows[0].planFolder).toBe('088-remote-app-view');
  });

  it('contains flows by workspace even in global scope — the flow route is workspace-scoped', async () => {
    // The fleet's containment follows the scope toggle because the fleet route itself widens. The flow
    // route does not: `/api/pij/flow` REQUIRES a workspace, so a global-scope tab is still holding one
    // workspace's plans, and accepting another's would put plans on screen the snapshot never had.
    seedFlows();
    const { result } = renderPijFleet({ scope: 'global' });
    await waitFor(() => expect(result.current.flows).toHaveLength(2));

    deliver('flow-delta', {
      seq: 40,
      at: '2026-07-26T12:00:26.000Z',
      flows: [foreignFlowSummary('091-somebody-elses-plan')],
    });

    expect(result.current.flows).toHaveLength(2);
    expect(result.current.flowsFilteredOut).toBe(1);
  });
});

describe('usePijFleet — global scope', () => {
  it('drops the workspace parameter entirely rather than widening the filter', async () => {
    const { result } = renderPijFleet({ scope: 'global' });
    await waitFor(() => expect(result.current.phase).toBe('live'));

    expect(api.calls).toContain('/api/pij/fleet');
    expect(api.calls.some((url) => url.startsWith('/api/pij/fleet?'))).toBe(false);
    // The tree is repo-scoped whatever the fleet scope is — `pij tree` needs a cwd to mean anything.
    expect(api.calls).toContain(`/api/pij/tree?workspace=${encodeURIComponent(UI_WORKSPACE_PATH)}`);
  });

  it('applies foreign rows instead of counting them out — there is no workspace to be outside of', async () => {
    api.setFleet(fleetSnapshot(40, []));
    const { result } = renderPijFleet({ scope: 'global' });
    await waitFor(() => expect(result.current.phase).toBe('live'));

    deliver('fleet-delta', {
      seq: 41,
      at: '2026-07-26T12:00:13.000Z',
      rows: [UI_FOREIGN_ROW],
      removed: [],
    });

    expect(result.current.rows.map((row) => row.id)).toEqual([UI_FOREIGN_ROW.id]);
    expect(result.current.filteredOut).toBe(0);
  });
});
