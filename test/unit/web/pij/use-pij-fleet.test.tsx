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
import { usePijFleet } from '../../../../apps/web/src/features/089-first-class-pij/hooks/use-pij-fleet';
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
    expect(api.calls).toContain(`/api/pij/fleet?workspace=${encoded}`);
    expect(api.calls).toContain(`/api/pij/tree?workspace=${encoded}`);
    expect(api.calls).toContain(`/api/pij/flow?workspace=${encoded}`);
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
  it('keeps applying deltas past the channel’s default 1000-message retention cap', async () => {
    // `useChannelEvents` retains 1000 messages by default and then SLIDES: the array length stops
    // growing while this hook's applied-index cursor sits at the same number, so the cursor is never
    // behind again and every subsequent delta is skipped. The page keeps its "live" badge and silently
    // stops updating — a freeze with no error, which is the worst shape this bug could take.
    const { result } = renderPijFleet();
    await waitFor(() => expect(result.current.phase).toBe('live'));

    // Delivered in ONE act so the cursor reaches exactly the cap before the next event arrives.
    // Delivering all 1001 in a single batch would hide the fault: the slide keeps the LAST 1000, so
    // the final delta would still be inside the window on the first pass.
    act(() => {
      for (let index = 1; index <= 1000; index += 1) {
        sse.simulateChannelMessage('pij', 'fleet-delta', {
          seq: 40,
          at: '2026-07-26T12:00:14.000Z',
          rows: [fleetRow(UI_PM_ID, { state: `delta-${index}` })],
          removed: [],
        });
      }
    });
    expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.state).toBe('delta-1000');

    deliver('fleet-delta', {
      seq: 40,
      at: '2026-07-26T12:00:15.000Z',
      rows: [fleetRow(UI_PM_ID, { state: 'delta-1001' })],
      removed: [],
    });
    expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.state).toBe('delta-1001');

    // And the freeze is permanent, not a one-event stutter — so a second event past the cap proves the
    // cursor is still tracking rather than parked.
    deliver('fleet-delta', {
      seq: 40,
      at: '2026-07-26T12:00:16.000Z',
      rows: [fleetRow(UI_PM_ID, { state: 'delta-1002' })],
      removed: [],
    });
    expect(result.current.rows.find((row) => row.id === UI_PM_ID)?.state).toBe('delta-1002');
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
