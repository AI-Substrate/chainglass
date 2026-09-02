import { describe, expect, it } from 'vitest';
import type { PijListRow } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records.interface';
import {
  readSeatRole,
  readWatchdogState,
  watchdogSummary,
} from '../../../../apps/web/src/features/089-first-class-pij/server/pij-status.contract';
import type {
  Cursor,
  RsClient,
  RsEvent,
  RsSeat,
  RsStateReport,
} from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-client';
import { createRsPijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-pij-records';

const UNSUPPORTED = [
  { field: 'activity', why: 'needs event age' },
  { field: 'lastEventAt', why: 'not on the rs descriptor' },
  { field: 'ageMs', why: 'derived from lastEventAt' },
  { field: 'liveness:stale', why: 'rs active is a weaker claim' },
  { field: 'failureReason', why: 'not on the rs descriptor' },
  { field: 'bindHealth', why: 'no rs counterpart' },
  { field: 'degraded', why: 'derived from bindHealth' },
  { field: 'degradedReason', why: 'derived from bindHealth' },
  { field: 'daemonLastTickAt', why: 'not recorded' },
  { field: 'daemonTickAgeMs', why: 'derived from an unavailable tick' },
  { field: 'daemonTickStale', why: 'derived from an unavailable tick' },
  { field: 'watchdog', why: 'no watchdog block on the seat row' },
];

class FakeRsClient implements RsClient {
  readonly stateIds: string[] = [];

  constructor(
    private readonly rows: RsSeat[],
    private readonly report: RsStateReport = {
      id: rows[0]?.id ?? 'none',
      unsupported: UNSUPPORTED,
    }
  ) {}

  async seats(): Promise<RsSeat[]> {
    return this.rows;
  }

  async state(id: string): Promise<RsStateReport> {
    this.stateIds.push(id);
    return { ...this.report, id };
  }

  async *events(_from?: Cursor, _signal?: AbortSignal): AsyncIterable<RsEvent> {}
}

function liveSeat(overrides: Partial<RsSeat> = {}): RsSeat {
  return {
    id: 'pij-rs-seat',
    machine: 'local',
    harness: 'omp',
    pane: '%42',
    proc: { pid: 4242, proc_start: 20260902010101 },
    folder: '/workspace',
    state: 'idle',
    semantic_state: null,
    role: null,
    parent: null,
    relay: false,
    ...overrides,
  };
}

describe('createRsPijRecords', () => {
  it('maps every rs seat field and preserves source-unavailable provenance', async () => {
    const client = new FakeRsClient([
      liveSeat({
        id: 'pij-tombstoned',
        tombstoned_at: '2026-09-02T01:02:03.000Z',
        tombstone_reason: 'process-exited',
        future_rs_field: { value: 1 },
      }),
    ]);
    const records = createRsPijRecords({ client });

    const [row] = await records.list();

    expect(row).toMatchObject({
      id: 'pij-tombstoned',
      machine: 'local',
      harness: 'omp',
      pane: '%42',
      folder: '/workspace',
      pid: 4242,
      state: 'idle',
      semanticState: null,
      orchestrationRole: null,
      parent: null,
      relay: false,
      terminal: {
        tombstonedAt: '2026-09-02T01:02:03.000Z',
        tombstoneReason: 'process-exited',
      },
      future_rs_field: { value: 1 },
      rsUnavailable: UNSUPPORTED.map(({ field }) => field),
    });
    expect(row).not.toHaveProperty('proc');
    expect(row).not.toHaveProperty('semantic_state');
    expect(row).not.toHaveProperty('role');
    expect(row).not.toHaveProperty('tombstoned_at');
    expect(row).not.toHaveProperty('tombstone_reason');
  });

  it('omits unsupported seat fields so existing field-specific absence semantics stay authoritative', async () => {
    const records = createRsPijRecords({ client: new FakeRsClient([liveSeat()]) });

    const [row] = await records.list();

    for (const field of [
      'activity',
      'lastEventAt',
      'liveness',
      'failureReason',
      'bindHealth',
      'degraded',
      'watchdog',
    ]) {
      expect(row).not.toHaveProperty(field);
    }
    const watchdog = readWatchdogState(row as PijListRow);
    expect(watchdog).toEqual({ reason: 'unreported', willNudge: false });
    expect(watchdogSummary(watchdog)).toBe('watchdog not reported');
    expect(readSeatRole(row as PijListRow)).toEqual({ kind: 'absent', reason: 'role-unknown' });
  });

  it('reads unsupported provenance once per global list, never once per seat', async () => {
    const client = new FakeRsClient([
      liveSeat({ id: 'pij-one' }),
      liveSeat({ id: 'pij-two' }),
      liveSeat({ id: 'pij-three' }),
    ]);
    const records = createRsPijRecords({ client });

    const rows = await records.list();

    expect(rows).toHaveLength(3);
    expect(client.stateIds).toEqual(['pij-one']);
    expect(rows.map((row) => row.rsUnavailable)).toEqual([
      UNSUPPORTED.map(({ field }) => field),
      UNSUPPORTED.map(({ field }) => field),
      UNSUPPORTED.map(({ field }) => field),
    ]);
  });

  it('does not request state provenance when the fleet is empty', async () => {
    const client = new FakeRsClient([]);
    const records = createRsPijRecords({ client });

    await expect(records.list()).resolves.toEqual([]);
    expect(client.stateIds).toEqual([]);
  });

  it('delegates state by id without changing the live report', async () => {
    const report: RsStateReport = {
      id: 'pij-seat',
      state: 'working',
      liveness: 'active',
      unsupported: UNSUPPORTED,
    };
    const client = new FakeRsClient([liveSeat()], report);
    const records = createRsPijRecords({ client });

    await expect(records.state('pij-seat')).resolves.toEqual(report);
    expect(client.stateIds).toEqual(['pij-seat']);
  });
});
