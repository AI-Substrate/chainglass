/**
 * Channel contract + two-loop poller — Plan 089 Phase 1, T007.
 *
 * Two things are proved here, in that order (contract first, per the task):
 *
 * **The `pij` channel vocabulary.** Every event that reaches `sseManager.broadcast` must be a
 * `PijChannelEvent`, must survive JSON, and must carry the spine `seq` it reflects — that seq is what
 * lets a browser subscribe BEFORE fetching a snapshot and then drop the deltas the snapshot already
 * contains. `describeEvent()` below is an exhaustive switch with a `never` fallthrough, so adding a
 * variant to the union without handling it here fails `tsc -p tsconfig.test.json`.
 *
 * **The two loops** (C-10, and not a choice): transitions ride the spine, but the freshness axis and
 * context gauges have **no spine events at all** — a cursor-only poller would show a stale gauge
 * forever. And `system-state` dominates the log ~100:1, so the fan-out filter is the first thing the
 * fast loop does, not an optimisation added later (Finding 03).
 */
import { describe, expect, it } from 'vitest';
import {
  FAST_LOOP_MS,
  MAX_BROADCASTS_PER_FAST_TICK,
  SLOW_LOOP_MS,
  createPijPoller,
} from '../../../../apps/web/src/features/089-first-class-pij/server/pij-poller.service';
import { createPijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records';
import {
  type PijRailContractSeams,
  fakeStatusRecord,
  productionContractSeams,
} from '../../../../apps/web/src/features/089-first-class-pij/server/pij-status.contract';
import {
  PIJ_CHANNEL,
  type PijChannelEvent,
  asPijId,
} from '../../../../apps/web/src/features/089-first-class-pij/types';
import { FakePijExecutor, execFileFailure } from '../../../fakes/fake-pij-executor';
import {
  BroadcastRecorder,
  FakeFlowReader,
  FakeScheduler,
  FakeSpineCursor,
  systemStateEvent,
  taskSetEvent,
} from '../../../fakes/fake-pij-poller-deps';

const WORKSPACE = '/Users/fixture/substrate/chainglass';

/**
 * Exhaustive over the union. The `never` fallthrough is the actual contract test: a new
 * `PijChannelEvent` variant that nobody handles will not compile.
 */
function describeEvent(event: PijChannelEvent): string {
  switch (event.type) {
    case 'fleet-delta':
      return `fleet-delta seq=${event.seq} rows=${event.rows.length} removed=${event.removed.length}`;
    case 'flow-delta':
      return `flow-delta seq=${event.seq} flows=${event.flows.length}`;
    case 'poller-status':
      return `poller-status seq=${event.seq} running=${event.status.running}`;
    case 'status-delta':
      return `status-delta seq=${event.seq} statuses=${event.statuses.length}`;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function listRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    folder: WORKSPACE,
    dataDir: `/Users/fixture/.pij/${id}`,
    pid: 4242,
    state: 'idle',
    activity: 'done',
    liveness: 'active',
    lastEventAt: '2026-07-26T05:00:00.000Z',
    boundModel: 'claude-opus-5',
    effort: 'high',
    bindHealth: 'ok',
    degraded: false,
    prime: false,
    unadopted: false,
    ...overrides,
  };
}

function buildPoller(
  options: {
    cursor?: FakeSpineCursor;
    exec?: FakePijExecutor;
    flows?: FakeFlowReader;
    contracts?: PijRailContractSeams;
  } = {}
) {
  const cursor = options.cursor ?? new FakeSpineCursor(100);
  const exec =
    options.exec ??
    new FakePijExecutor().whenJson(['list', '--json', '--badge'], [listRow('pij-a')]);
  const scheduler = new FakeScheduler();
  const broadcaster = new BroadcastRecorder();
  const poller = createPijPoller({
    cursor,
    records: createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE }),
    flows: options.flows,
    broadcast: broadcaster.broadcast,
    scheduler,
    now: () => new Date('2026-07-26T06:00:00.000Z'),
    contracts: options.contracts,
  });
  return { poller, cursor, exec, scheduler, broadcaster };
}

describe('PijChannelEvent — the channel contract', () => {
  it('every variant survives a JSON round trip unchanged', () => {
    /*
    Test Doc:
    - Why: `sseManager.broadcast` JSON-stringifies the payload. Anything that does not survive that —
      a Map, a Date, undefined in a required slot — silently arrives as something else in the browser.
    - Contract: All three variants round-trip byte-identically.
    - Usage Notes: Uses the branded PijId, which is a plain string at runtime by design.
    - Quality Contribution: Pins the serialization boundary the whole channel crosses.
    - Worked Example: JSON.parse(JSON.stringify(e)) deep-equals e, for each variant.
    */
    const events: PijChannelEvent[] = [
      {
        type: 'fleet-delta',
        seq: 42,
        at: '2026-07-26T06:00:00.000Z',
        // A single-segment id (C-03) and a `contextCurrent` carrying the literal 'unknown' (C-05) —
        // the two values most likely to be mangled by a careless serializer.
        rows: [
          {
            id: asPijId('shipname'),
            folder: WORKSPACE,
            state: 'working',
            lastEventAt: null,
            boundModel: 'claude-opus-5',
            boundProvider: null,
            effort: 'high',
            contextCurrent: {
              value: 'unknown',
              asOf: '2026-07-26T06:00:00.000Z',
              provenance: 'copilot-none',
            },
            extra: { needsHuman: true },
          },
        ],
        removed: [asPijId('pij-gone')],
      },
      { type: 'flow-delta', seq: 43, at: '2026-07-26T06:00:01.000Z', flows: [] },
      {
        type: 'status-delta',
        seq: 43,
        at: '2026-07-26T06:00:01.000Z',
        statuses: [
          {
            peer: asPijId('pij-pm'),
            prev: 'Finished the red poller test.',
            next: 'Implement the fast-drain status path.',
            ts: '2026-07-26T06:00:00.000Z',
            seq: 43,
          },
        ],
      },
      {
        type: 'poller-status',
        seq: 44,
        at: '2026-07-26T06:00:02.000Z',
        status: {
          running: true,
          lastSpinePollAt: '2026-07-26T06:00:00.000Z',
          lastRecordsPollAt: null,
          seq: 44,
          lastError: null,
          spineMissing: false,
          tornLinesSkipped: 0,
          fleetSize: 0,
        },
      },
    ];

    for (const event of events) {
      expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    }
  });

  it('is exhaustively handleable — the union includes the status delta', () => {
    /*
    Test Doc:
    - Why: The channel vocabulary is a contract Phase 2–4 code and the browser both bind to. A variant
      added without updating consumers is a runtime surprise; the `never` fallthrough makes it a
      compile error instead.
    - Contract: describeEvent() handles every variant; its `never` branch is unreachable.
    - Usage Notes: The compile-time half runs under the test-tree typecheck gate.
    - Worked Example: three variants → three distinct descriptions.
    */
    expect(describeEvent({ type: 'flow-delta', seq: 1, at: 'now', flows: [] })).toBe(
      'flow-delta seq=1 flows=0'
    );
    expect(describeEvent({ type: 'fleet-delta', seq: 2, at: 'now', rows: [], removed: [] })).toBe(
      'fleet-delta seq=2 rows=0 removed=0'
    );
    expect(describeEvent({ type: 'status-delta', seq: 3, at: 'now', statuses: [] })).toBe(
      'status-delta seq=3 statuses=0'
    );
  });

  it('broadcasts on the ruled channel id with the event type as the SSE event name', () => {
    /*
    Test Doc:
    - Why: One channel for v1 (ruled by the stream prime), and `sseManager.broadcast` validates the
      event type against /^[a-zA-Z0-9_-]+$/ — a name with a dot or a space throws at runtime.
    - Contract: PIJ_CHANNEL === 'pij'; every variant name passes the manager's pattern.
    - Usage Notes: Asserted against the same regex the manager uses.
    - Quality Contribution: Catches a channel/type naming mistake at build time rather than on the
      first live broadcast.
    - Worked Example: 'fleet-delta' matches; the channel is 'pij'.
    */
    expect(PIJ_CHANNEL).toBe('pij');
    for (const type of ['fleet-delta', 'flow-delta', 'poller-status', 'status-delta']) {
      expect(/^[a-zA-Z0-9_-]+$/.test(type)).toBe(true);
    }
  });
});

describe('PijPollerService — the fan-out filter (Finding 03, C-08)', () => {
  it('coalesces status events outside the known-seat guard without spawning another pij read', async () => {
    const cursor = new FakeSpineCursor(100);
    cursor.queueEvents([
      {
        schema_version: 1,
        seq: 101,
        ts: '2026-07-26T05:59:00.000Z',
        actor: 'pij-pm',
        kind: 'status',
        refs: ['node:pij-pm'],
        peer: 'pij-pm',
        prev: 'older',
        next: 'older next',
      },
      {
        schema_version: 1,
        seq: 102,
        ts: '2026-07-26T05:59:30.000Z',
        actor: 'pij-pm',
        kind: 'status',
        refs: ['node:pij-pm'],
        peer: 'pij-pm',
        prev: 'newest',
        next: 'newest next',
      },
      systemStateEvent(103, 'pij-a', 'idle', 'working'),
    ]);

    const { poller, scheduler, broadcaster, exec } = buildPoller({ cursor });
    await poller.start();
    const callsAfterStart = exec.calls.length;
    broadcaster.reset();

    await scheduler.fire(FAST_LOOP_MS);

    const statusDeltas = broadcaster.ofType('status-delta') as Array<
      Extract<PijChannelEvent, { type: 'status-delta' }>
    >;
    expect(statusDeltas).toHaveLength(1);
    expect(statusDeltas[0].statuses).toEqual([
      expect.objectContaining({ peer: 'pij-pm', seq: 102, prev: 'newest' }),
    ]);
    expect(poller.snapshot().statuses).toEqual([]);
    expect(broadcaster.ofType('fleet-delta')).toHaveLength(1);
    expect(statusDeltas.length).toBeLessThanOrEqual(MAX_BROADCASTS_PER_FAST_TICK);
    expect(broadcaster.ofType('fleet-delta').length).toBeLessThanOrEqual(
      MAX_BROADCASTS_PER_FAST_TICK
    );
    expect(exec.calls.length).toBe(callsAfterStart);
  });

  it('runs the real poller against a swapped status seam', async () => {
    const cursor = new FakeSpineCursor(100);
    cursor.queueEvents([
      {
        schema_version: 1,
        seq: 101,
        ts: '2026-07-26T05:59:00.000Z',
        actor: 'pij-a',
        kind: 'status',
        refs: ['node:pij-a'],
        peer: 'pij-a',
        prev: 'ignored by swapped reader',
        next: 'ignored by swapped reader',
      },
    ]);
    const swapped: PijRailContractSeams = {
      ...productionContractSeams,
      status: {
        ...productionContractSeams.status,
        readSpineEvent: (_event, peer) =>
          fakeStatusRecord({ peer, seq: 999, prev: 'swapped poller reader' }),
      },
    };
    const { poller, scheduler, broadcaster } = buildPoller({ cursor, contracts: swapped });
    await poller.start();
    broadcaster.reset();

    await scheduler.fire(FAST_LOOP_MS);

    const [delta] = broadcaster.ofType('status-delta') as Array<
      Extract<PijChannelEvent, { type: 'status-delta' }>
    >;
    expect(delta.statuses).toEqual([
      expect.objectContaining({ peer: 'pij-a', seq: 999, prev: 'swapped poller reader' }),
    ]);
  });

  it('serves statuses for hot peers only and evicts them after the slow fleet refresh', async () => {
    const cursor = new FakeSpineCursor(100);
    cursor.queueEvents([
      {
        schema_version: 1,
        seq: 101,
        ts: '2026-07-26T05:59:00.000Z',
        actor: 'pij-a',
        kind: 'status',
        refs: ['node:pij-a'],
        peer: 'pij-a',
        prev: 'hot status',
        next: 'next',
      },
    ]);
    const { poller, scheduler, exec } = buildPoller({ cursor });
    await poller.start();
    await scheduler.fire(FAST_LOOP_MS);
    expect(poller.snapshot().statuses.map((status) => status.peer)).toEqual(['pij-a']);

    exec.whenJson(['list', '--json', '--badge'], []);
    await scheduler.fire(SLOW_LOOP_MS);

    expect(poller.snapshot().statuses).toEqual([]);
  });

  it('collapses 100 system-state events into at most one broadcast per tick', async () => {
    /*
    Test Doc:
    - Why: `system-state` dominates the spine ~100:1. Forwarding one SSE message per spine event
      would push ~100 messages per tick through the mux to every open tab — the filter is "the first
      line of the service, not an optimisation".
    - Contract: One tick, 100 events, ≤ MAX_BROADCASTS_PER_FAST_TICK broadcasts.
    - Usage Notes: Fake clock; the tick is fired explicitly. The three seats are in the fleet, so
      every one of the 100 events is genuinely actionable — the collapse is the filter working, not
      events being discarded as unknown.
    - Quality Contribution: The single measurement that keeps the channel usable at fleet scale.
    - Worked Example: 100 events over 3 peers → 1 broadcast.
    */
    const cursor = new FakeSpineCursor(100);
    const events = Array.from({ length: 100 }, (_, i) =>
      systemStateEvent(101 + i, `pij-seat-${i % 3}`, 'idle', i % 2 === 0 ? 'working' : 'idle')
    );
    cursor.queueEvents(events);
    const exec = new FakePijExecutor().whenJson(
      ['list', '--json', '--badge'],
      [listRow('pij-seat-0'), listRow('pij-seat-1'), listRow('pij-seat-2')]
    );

    const { poller, scheduler, broadcaster } = buildPoller({ cursor, exec });
    await poller.start();
    broadcaster.reset();

    await scheduler.fire(FAST_LOOP_MS);

    expect(broadcaster.sent.length).toBeLessThanOrEqual(MAX_BROADCASTS_PER_FAST_TICK);
    expect(broadcaster.sent.length).toBe(1);
  });

  it('coalesces many events for one seat into a single full row, not a stream of patches', async () => {
    /*
    Test Doc:
    - Why: Deltas are FULL ROWS by design (plan 1.7) — that is what makes AC-03's never-re-derive rule
      enforceable, because the client has no field-level merge logic in which to invent a value.
    - Contract: N events for one seat → one row carrying the LAST observed state.
    - Usage Notes: idle → working → idle → working within one tick.
    - Quality Contribution: Keeps the client a pure renderer.
    - Worked Example: four transitions → one row, state 'working'.
    */
    const cursor = new FakeSpineCursor(100);
    cursor.queueEvents([
      systemStateEvent(101, 'pij-a', 'idle', 'working'),
      systemStateEvent(102, 'pij-a', 'working', 'idle'),
      systemStateEvent(103, 'pij-a', 'idle', 'working'),
    ]);

    const { poller, scheduler, broadcaster } = buildPoller({ cursor });
    await poller.start();
    broadcaster.reset();

    await scheduler.fire(FAST_LOOP_MS);

    const [delta] = broadcaster.ofType('fleet-delta') as Array<
      Extract<PijChannelEvent, { type: 'fleet-delta' }>
    >;
    expect(delta.rows).toHaveLength(1);
    expect(delta.rows[0].id).toBe('pij-a');
    expect(delta.rows[0].state).toBe('working');
  });

  it('broadcasts nothing at all when a tick brings no events', async () => {
    /*
    Test Doc:
    - Why: A 2s heartbeat of empty deltas is indistinguishable from real activity in a log, and wakes
      every tab for nothing.
    - Contract: An empty read produces zero broadcasts.
    - Usage Notes: —
    - Quality Contribution: Keeps the channel quiet, which is what makes it readable when it is not.
    - Worked Example: empty tick → 0 sent.
    */
    const { poller, scheduler, broadcaster } = buildPoller({ cursor: new FakeSpineCursor(100) });
    await poller.start();
    broadcaster.reset();

    await scheduler.fire(FAST_LOOP_MS);

    expect(broadcaster.sent).toHaveLength(0);
  });

  it('ignores events for seats it has never seen rather than inventing a row for them', async () => {
    /*
    Test Doc:
    - Why: The spine is machine-wide: most events belong to seats in other repos, and a spine event
      carries a peer id and a state transition — NOT a folder, a harness, or a model. Fabricating a
      row from it would put a seat with unknown provenance into a workspace view.
    - Contract: An event for an unknown peer changes nothing; the seat appears after the next slow
      loop, which has the real record.
    - Usage Notes: The known fleet is just 'pij-a'.
    - Quality Contribution: Keeps every rendered row backed by a real record.
    - Worked Example: an event for 'pij-stranger' produces no broadcast.
    */
    const cursor = new FakeSpineCursor(100);
    cursor.queueEvents([systemStateEvent(101, 'pij-stranger', 'idle', 'working')]);

    const { poller, scheduler, broadcaster } = buildPoller({ cursor });
    await poller.start();
    broadcaster.reset();

    await scheduler.fire(FAST_LOOP_MS);

    expect(broadcaster.sent).toHaveLength(0);
  });

  it('stamps every delta with the spine seq it reflects', async () => {
    /*
    Test Doc:
    - Why: The ordering contract Phase 2 depends on: the browser subscribes BEFORE fetching a
      snapshot, buffers deltas, and drops those with seq ≤ the snapshot's seq. Without the stamp there
      is no way to do that, and a delta arriving mid-fetch is either lost or overwrites fresher data.
    - Contract: delta.seq === the cursor position after the read.
    - Usage Notes: Cursor advances to 103.
    - Quality Contribution: Makes the snapshot/delta race resolvable rather than a timing hope.
    - Worked Example: last event seq 103 → delta.seq 103.
    */
    const cursor = new FakeSpineCursor(100);
    cursor.queueEvents([
      systemStateEvent(102, 'pij-a', 'idle', 'working'),
      systemStateEvent(103, 'pij-a', 'working', 'idle'),
    ]);

    const { poller, scheduler, broadcaster } = buildPoller({ cursor });
    await poller.start();
    broadcaster.reset();
    await scheduler.fire(FAST_LOOP_MS);

    const [delta] = broadcaster.ofType('fleet-delta') as Array<
      Extract<PijChannelEvent, { type: 'fleet-delta' }>
    >;
    expect(delta.seq).toBe(103);
    expect(poller.snapshot().seq).toBe(103);
  });

  it('marks a seat changed for a non-system-state transition without guessing its new state', async () => {
    /*
    Test Doc:
    - Why: `task-set` / `state-set` transitions ride refs, not a systemState word. Applying the
      event's `next` to `row.state` there would write a task string into the state field.
    - Contract: A non-system-state event re-emits the row unchanged (so the client learns the seat is
      active) but does not mutate `state`.
    - Usage Notes: A task-set carrying a task string in `next`.
    - Quality Contribution: Prevents cross-vocabulary contamination of the most visible field.
    - Worked Example: state stays 'idle' after a task-set whose `next` is a sentence.
    */
    const cursor = new FakeSpineCursor(100);
    cursor.queueEvents([taskSetEvent(101, 'pij-a', 'Do the thing')]);

    const { poller, scheduler, broadcaster } = buildPoller({ cursor });
    await poller.start();
    broadcaster.reset();
    await scheduler.fire(FAST_LOOP_MS);

    const [delta] = broadcaster.ofType('fleet-delta') as Array<
      Extract<PijChannelEvent, { type: 'fleet-delta' }>
    >;
    expect(delta.rows[0].state).toBe('idle');
  });
});

describe('PijPollerService — the slow loop (C-10)', () => {
  it('runs exactly ONE global pij list per slow tick, never one per workspace', async () => {
    /*
    Test Doc:
    - Why: F-13's acquisition model. A CLI invocation costs ~0.45s; per-workspace calls multiply that
      by the number of open workspaces for data that is already in the one global response.
    - Contract: One slow tick → exactly one `list --json` call, with no scoping flag.
    - Usage Notes: —
    - Quality Contribution: Bounds the poller's cost on a shared host at one process per 8s.
    - Worked Example: after start + one tick, two calls total (start does one).
    */
    const { poller, exec, scheduler } = buildPoller();
    await poller.start();
    const afterStart = exec.calls.length;

    await scheduler.fire(SLOW_LOOP_MS);

    expect(exec.calls.length - afterStart).toBe(1);
    expect(exec.lastArgs).toEqual(['list', '--json', '--badge']);
  });

  it('broadcasts only the rows that actually changed', async () => {
    /*
    Test Doc:
    - Why: 178 rows / ~135KB every 8s to every tab would swamp the mux with data that did not change.
    - Contract: An unchanged slow tick broadcasts nothing; a changed field broadcasts just that row.
    - Usage Notes: 'pij-b' flips state between ticks; 'pij-a' does not.
    - Quality Contribution: Makes the slow loop's cost proportional to change, not to fleet size.
    - Worked Example: second tick → 1 row, id 'pij-b'.
    */
    const exec = new FakePijExecutor().whenJson(
      ['list', '--json', '--badge'],
      [listRow('pij-a'), listRow('pij-b')]
    );
    const { poller, scheduler, broadcaster } = buildPoller({ exec });
    await poller.start();
    broadcaster.reset();

    await scheduler.fire(SLOW_LOOP_MS);
    expect(broadcaster.sent).toHaveLength(0);

    exec.whenJson(
      ['list', '--json', '--badge'],
      [listRow('pij-a'), listRow('pij-b', { state: 'working' })]
    );
    await scheduler.fire(SLOW_LOOP_MS);

    const [delta] = broadcaster.ofType('fleet-delta') as Array<
      Extract<PijChannelEvent, { type: 'fleet-delta' }>
    >;
    expect(delta.rows.map((r) => r.id)).toEqual(['pij-b']);
  });

  it('reports a vanished seat as removed without claiming it died', async () => {
    /*
    Test Doc:
    - Why: C-07 — the registry renames records into `archive/` on a 48h terminal TTL, so a seat
      leaving the hot list is usually a TIER MIGRATION, not a death. The channel says "gone from this
      view", and says nothing about why.
    - Contract: A dropped id appears in `removed`; no death/terminal claim is attached.
    - Usage Notes: —
    - Quality Contribution: Keeps an inference out of the wire format entirely.
    - Worked Example: pij-b disappears → removed: ['pij-b'].
    */
    const exec = new FakePijExecutor().whenJson(
      ['list', '--json', '--badge'],
      [listRow('pij-a'), listRow('pij-b')]
    );
    const { poller, scheduler, broadcaster } = buildPoller({ exec });
    await poller.start();
    broadcaster.reset();

    exec.whenJson(['list', '--json', '--badge'], [listRow('pij-a')]);
    await scheduler.fire(SLOW_LOOP_MS);

    const [delta] = broadcaster.ofType('fleet-delta') as Array<
      Extract<PijChannelEvent, { type: 'fleet-delta' }>
    >;
    expect(delta.removed).toEqual(['pij-b']);
    expect(delta.rows).toEqual([]);
  });
});

describe('PijPollerService — degraded mode (AC-09) and honest emptiness (AC-08)', () => {
  it('emits poller-status and KEEPS last-known rows when the store becomes unreadable', async () => {
    /*
    Test Doc:
    - Why: AC-09 — with the daemon down the views must render last-known data with visible staleness.
      They must never blank, and must never pretend freshness. Clearing the fleet on error would do
      both at once.
    - Contract: A failing list → a poller-status event with lastError set, no crash, and the snapshot
      still holding the previous rows.
    - Usage Notes: The second list call fails with E-EXIT.
    - Quality Contribution: The behaviour AC-09 names, tested rather than intended.
    - Worked Example: after the failure, snapshot still has pij-a and status.lastError.code E-EXIT.
    */
    const exec = new FakePijExecutor().whenJson(['list', '--json', '--badge'], [listRow('pij-a')]);
    const { poller, scheduler, broadcaster } = buildPoller({ exec });
    await poller.start();
    expect(poller.snapshot().rows).toHaveLength(1);
    broadcaster.reset();

    exec.when(['list', '--json', '--badge']).fails(execFileFailure({ stderr: 'store on fire' }));
    await scheduler.fire(SLOW_LOOP_MS);

    const [status] = broadcaster.ofType('poller-status') as Array<
      Extract<PijChannelEvent, { type: 'poller-status' }>
    >;
    expect(status.status.lastError?.code).toBe('E-EXIT');
    expect(poller.snapshot().rows).toHaveLength(1);
    expect(poller.snapshot().status.fleetSize).toBe(1);
  });

  it('recovers and clears the error on the next successful tick', async () => {
    /*
    Test Doc:
    - Why: A sticky error banner after the store came back is its own lie.
    - Contract: A successful tick clears lastError.
    - Usage Notes: fail, then succeed.
    - Quality Contribution: Makes the degraded state genuinely transient.
    - Worked Example: lastError null again after recovery.
    */
    const exec = new FakePijExecutor()
      .when(['list', '--json', '--badge'])
      .fails(execFileFailure({ stderr: 'x' }));
    const { poller, scheduler } = buildPoller({ exec });
    await poller.start();
    expect(poller.snapshot().status.lastError).not.toBeNull();

    exec.whenJson(['list', '--json', '--badge'], [listRow('pij-a')]);
    await scheduler.fire(SLOW_LOOP_MS);

    expect(poller.snapshot().status.lastError).toBeNull();
  });

  it('distinguishes "no seats here" from "poller not running" from "store unreadable"', async () => {
    /*
    Test Doc:
    - Why: AC-08 — an empty fleet view must state WHICH of three conditions holds, and a human must be
      able to tell them apart without opening devtools. The status object is what makes that
      renderable; if these three collapse to one, the component cannot be written honestly.
    - Contract: Each condition is a distinct combination of running / lastRecordsPollAt / lastError.
    - Usage Notes: Never-started, started-and-empty, and started-then-failed.
    - Quality Contribution: The data behind AC-08, proved distinguishable at the source.
    - Worked Example: three distinct status shapes.
    */
    const notStarted = buildPoller();
    expect(notStarted.poller.snapshot().status).toMatchObject({
      running: false,
      lastRecordsPollAt: null,
      lastError: null,
    });

    const empty = buildPoller({
      exec: new FakePijExecutor().whenJson(['list', '--json', '--badge'], []),
    });
    await empty.poller.start();
    expect(empty.poller.snapshot().status).toMatchObject({
      running: true,
      lastError: null,
      fleetSize: 0,
    });
    expect(empty.poller.snapshot().status.lastRecordsPollAt).not.toBeNull();

    const broken = buildPoller({
      exec: new FakePijExecutor()
        .when(['list', '--json', '--badge'])
        .fails(execFileFailure({ stderr: 'nope' })),
    });
    await broken.poller.start();
    expect(broken.poller.snapshot().status).toMatchObject({ running: true, fleetSize: 0 });
    expect(broken.poller.snapshot().status.lastError?.code).toBe('E-EXIT');
  });

  it('surfaces a missing spine log as staleness, not as a crash', async () => {
    /*
    Test Doc:
    - Why: C-07's rename window. The fast loop must survive the log not being there for a tick.
    - Contract: `spineMissing` is set; no throw; no broadcast.
    - Usage Notes: —
    - Quality Contribution: Keeps the poller alive through the documented window.
    - Worked Example: spineMissing true after a missing read.
    */
    const cursor = new FakeSpineCursor(100).queueMissing();
    const { poller, scheduler } = buildPoller({ cursor });
    await poller.start();

    await scheduler.fire(FAST_LOOP_MS);

    expect(poller.snapshot().status.spineMissing).toBe(true);
  });

  it('counts torn lines rather than hiding them', async () => {
    /*
    Test Doc:
    - Why: Skipping torn lines is required; skipping them SILENTLY means a store steadily corrupting
      itself looks perfectly healthy.
    - Contract: `tornLinesSkipped` accumulates across ticks.
    - Usage Notes: Two ticks, one torn line each.
    - Quality Contribution: Turns a required silence into an observable.
    - Worked Example: 1 then 2.
    */
    const cursor = new FakeSpineCursor(100)
      .queueEvents([systemStateEvent(101, 'pij-a', 'idle', 'working')], { skipped: 1 })
      .queueEvents([systemStateEvent(102, 'pij-a', 'working', 'idle')], { skipped: 1 });
    const { poller, scheduler } = buildPoller({ cursor });
    await poller.start();

    await scheduler.fire(FAST_LOOP_MS);
    expect(poller.snapshot().status.tornLinesSkipped).toBe(1);
    await scheduler.fire(FAST_LOOP_MS);
    expect(poller.snapshot().status.tornLinesSkipped).toBe(2);
  });
});

describe('PijPollerService — lifecycle (AC-02: one reader regardless of tab count)', () => {
  it('registers exactly two loops and start() is idempotent', async () => {
    /*
    Test Doc:
    - Why: AC-02 — N tabs must produce exactly one poller and one spine cursor server-side. Under HMR
      `start()` can be reached more than once; a second set of loops would double the store's reader
      count invisibly.
    - Contract: One fast loop + one slow loop; a second start() adds nothing.
    - Usage Notes: —
    - Quality Contribution: The server-side half of AC-02.
    - Worked Example: liveCount stays 2 across two start() calls.
    */
    const { poller, scheduler } = buildPoller();

    await poller.start();
    expect(scheduler.liveCount).toBe(2);
    expect(scheduler.registrations.map((r) => r.ms).sort((a, b) => a - b)).toEqual([
      FAST_LOOP_MS,
      SLOW_LOOP_MS,
    ]);

    await poller.start();
    expect(scheduler.liveCount).toBe(2);
  });

  it('stop() cancels both loops and marks the poller not running', async () => {
    /*
    Test Doc:
    - Why: SIGTERM cleanup must actually stop reading; a surviving interval keeps polling a store
      after shutdown has been announced.
    - Contract: stop() cancels every registration and flips `running` false.
    - Usage Notes: —
    - Quality Contribution: Makes the instrumentation cleanup meaningful.
    - Worked Example: liveCount 0, running false, and a fired tick does nothing.
    */
    const { poller, scheduler, broadcaster } = buildPoller();
    await poller.start();

    poller.stop();

    expect(scheduler.liveCount).toBe(0);
    expect(poller.snapshot().status.running).toBe(false);
    broadcaster.reset();
    await scheduler.fire(SLOW_LOOP_MS);
    expect(broadcaster.sent).toHaveLength(0);
  });

  it('uses the ruled cadences: 2s spine, 8s records', async () => {
    /*
    Test Doc:
    - Why: C-10 pins the two cadences (1–2s cursor, 5–10s slow). They are forced by the data, not
      chosen: gauges and freshness have no spine events.
    - Contract: FAST_LOOP_MS 2000, SLOW_LOOP_MS 8000, both inside the ruled bands.
    - Usage Notes: —
    - Quality Contribution: Freezes a number the plan reasoned about explicitly.
    - Worked Example: 2000 / 8000.
    */
    expect(FAST_LOOP_MS).toBe(2000);
    expect(SLOW_LOOP_MS).toBe(8000);
  });
});

describe('PijPollerService — workspace scoping is a server-side filter (F-13)', () => {
  it('scopes a snapshot by folder without making a second CLI call', async () => {
    /*
    Test Doc:
    - Why: The whole acquisition model. Scoping must cost nothing beyond a filter over the one global
      response.
    - Contract: snapshot({ workspace }) filters on folder; the CLI call count does not change.
    - Usage Notes: Two seats in different repos.
    - Quality Contribution: Proves the model rather than assuming it.
    - Worked Example: workspace filter yields 1 of 2 rows, 0 extra calls.
    */
    const exec = new FakePijExecutor().whenJson(
      ['list', '--json', '--badge'],
      [listRow('pij-here'), listRow('pij-there', { folder: '/Users/fixture/other-repo' })]
    );
    const { poller, exec: recorded } = buildPoller({ exec });
    await poller.start();
    const callsAfterStart = recorded.calls.length;

    const scoped = poller.snapshot({ workspace: WORKSPACE });

    expect(scoped.rows.map((r) => r.id)).toEqual(['pij-here']);
    expect(poller.snapshot().rows).toHaveLength(2);
    expect(recorded.calls.length).toBe(callsAfterStart);
  });
});

describe('PijPollerService — flow deltas', () => {
  it('broadcasts a flow-delta only when a flow signature actually changes', async () => {
    /*
    Test Doc:
    - Why: Finding 08 — `events[].length + nav.now` is a sufficient change signature and comes free.
      Flow files are quiet (zero writes when nothing is happening), so an unconditional broadcast
      would be pure noise.
    - Contract: First refresh emits; an identical refresh does not; a changed signature emits again.
    - Usage Notes: Phase 3 wires the watcher; Phase 1 provides the method and the filter.
    - Quality Contribution: Keeps the flow half of the channel as quiet as the underlying files.
    - Worked Example: emit, silence, emit.
    */
    const summary = {
      planDir: '/w/docs/plans/089-first-class-pij',
      planFolder: '089-first-class-pij',
      state: 'live' as const,
      completion: 'active' as const,
      completionSource: 'nav.bag.status' as const,
      phases: [],
      phasesDone: 0,
      phasesTotal: 0,
      reviews: [],
      nodes: [],
      eventCount: 3,
      signature: '3:ph1',
      readAt: '2026-07-26T06:00:00.000Z',
    };
    const flows = new FakeFlowReader([summary]);
    const { poller, broadcaster } = buildPoller({ flows });
    await poller.start();
    broadcaster.reset();

    await poller.refreshFlows('/w/docs/plans');
    expect(broadcaster.ofType('flow-delta')).toHaveLength(1);

    await poller.refreshFlows('/w/docs/plans');
    expect(broadcaster.ofType('flow-delta')).toHaveLength(1);

    flows.setSummaries([{ ...summary, eventCount: 4, signature: '4:ph2' }]);
    await poller.refreshFlows('/w/docs/plans');
    expect(broadcaster.ofType('flow-delta')).toHaveLength(2);
  });
});
