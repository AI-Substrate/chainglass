import { describe, expect, it } from 'vitest';
import { createPijPoller } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-poller.service';
import type {
  IPijRecords,
  PijListRow,
  PijNodeDetail,
  PijStateReport,
  PijTree,
} from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records.interface';
import type { RsCursorEvent } from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-client';
import type { ISpineCursor } from '../../../../apps/web/src/features/089-first-class-pij/server/spine-cursor.interface';
import type { PijChannelEvent } from '../../../../apps/web/src/features/089-first-class-pij/types';

const emptyCursor: ISpineCursor = {
  seq: 0,
  async read() {
    return {
      events: [],
      seq: 0,
      skipped: 0,
      missing: false,
      readAt: '2026-09-02T00:00:00.000Z',
    };
  },
};

class FakeRecords implements IPijRecords {
  calls = 0;
  active = 0;
  maxActive = 0;

  constructor(private readonly responses: Array<Promise<PijListRow[]>>) {}

  async list(): Promise<PijListRow[]> {
    this.calls += 1;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected records read');
    try {
      return await response;
    } finally {
      this.active -= 1;
    }
  }

  async tree(): Promise<PijTree> {
    throw new Error('not used');
  }

  async nodeShow(): Promise<PijNodeDetail> {
    throw new Error('not used');
  }

  async state(): Promise<PijStateReport> {
    throw new Error('not used');
  }

  async raw(): Promise<unknown> {
    throw new Error('not used');
  }
}

function rsEvent(cursor: number, kind: string, payload: string): RsCursorEvent {
  return {
    type: 'event',
    machine: 'local',
    cursor,
    event: { v: 1, at: 1788318613497 + cursor, kind, seat: 'pij-seat', payload },
  };
}

describe('PijPollerService rs ingestion', () => {
  it('coalesces concurrent refresh requests into one in-flight and one trailing global read', async () => {
    let releaseFirst!: (rows: PijListRow[]) => void;
    const first = new Promise<PijListRow[]>((resolve) => {
      releaseFirst = resolve;
    });
    const records = new FakeRecords([
      first,
      Promise.resolve([{ id: 'pij-seat', folder: '/workspace', state: 'working' }]),
    ]);
    const broadcasts: PijChannelEvent[] = [];
    const poller = createPijPoller({
      cursor: emptyCursor,
      records,
      broadcast: (_channel, _type, data) => broadcasts.push(data as PijChannelEvent),
    });

    const firstRefresh = poller.refreshRecords();
    const secondRefresh = poller.refreshRecords();
    const thirdRefresh = poller.refreshRecords();
    expect(records.calls).toBe(1);
    expect(records.maxActive).toBe(1);

    releaseFirst([{ id: 'pij-seat', folder: '/workspace', state: 'idle' }]);
    await Promise.all([firstRefresh, secondRefresh, thirdRefresh]);

    expect(records.calls).toBe(2);
    expect(records.maxActive).toBe(1);
    expect(broadcasts.filter((event) => event.type === 'fleet-delta')).toHaveLength(2);
    expect(poller.snapshot().rows[0].state).toBe('working');
  });

  it('advances rs cursor while applying only an explicitly carried system-state transition', async () => {
    const records = new FakeRecords([
      Promise.resolve([{ id: 'pij-seat', folder: '/workspace', state: 'idle' }]),
    ]);
    const broadcasts: PijChannelEvent[] = [];
    const poller = createPijPoller({
      cursor: emptyCursor,
      records,
      broadcast: (_channel, _type, data) => broadcasts.push(data as PijChannelEvent),
    });
    await poller.refreshRecords();
    broadcasts.length = 0;

    poller.ingest(rsEvent(9, 'system-state', '{"prev":"idle","next":"working"}'));

    expect(poller.snapshot()).toMatchObject({ seq: 9, rows: [{ state: 'working' }] });
    expect(broadcasts).toEqual([
      expect.objectContaining({
        type: 'fleet-delta',
        seq: 9,
        rows: [expect.objectContaining({ state: 'working' })],
      }),
    ]);

    poller.ingest(rsEvent(10, 'report.state', '{"state":"blocked","registry_seq":9}'));

    expect(poller.snapshot()).toMatchObject({ seq: 10, rows: [{ state: 'working' }] });
    expect(broadcasts).toHaveLength(1);
  });
  it('primes once without scheduling legacy poll loops in rs mode', async () => {
    const records = new FakeRecords([Promise.resolve([])]);
    const scheduled: number[] = [];
    const poller = createPijPoller({
      cursor: emptyCursor,
      records,
      pollSpine: false,
      pollRecords: false,
      scheduler: {
        every(ms) {
          scheduled.push(ms);
          return () => {};
        },
      },
      broadcast: () => {},
    });

    await poller.start();

    expect(records.calls).toBe(1);
    expect(scheduled).toEqual([]);
  });
});
