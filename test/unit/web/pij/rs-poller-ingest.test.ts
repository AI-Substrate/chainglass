import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const captured = readFileSync(
  join(
    import.meta.dirname,
    '../../../../docs/plans/093-pij-rs-reader/assets/inputs/live-report-frames-6012-14473.ndjson'
  ),
  'utf8'
)
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as RsCursorEvent);

const resetFrames = readFileSync(
  join(
    import.meta.dirname,
    '../../../../docs/plans/093-pij-rs-reader/assets/inputs/live-reset-frames-12639-12672.ndjson'
  ),
  'utf8'
)
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as RsCursorEvent);

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

  it('ingests real report cards and declared state without inventing a mechanical transition', async () => {
    const stateFrames = captured.filter((frame) => frame.event.kind === 'report.state');
    const cards = captured.filter((frame) => frame.event.kind === 'report.now');
    const rows = [...new Set(captured.map((frame) => frame.event.seat))].map((id) => ({
      id,
      folder: '/workspace',
      state: 'idle',
    }));
    const refreshed = rows.map((row) => {
      const report = stateFrames.filter((frame) => frame.event.seat === row.id).at(-1);
      return { ...row, semanticState: report ? JSON.parse(report.event.payload).state : null };
    });
    const records = new FakeRecords([Promise.resolve(rows), Promise.resolve(refreshed)]);
    const broadcasts: PijChannelEvent[] = [];
    let flush!: () => void | Promise<void>;
    const poller = createPijPoller({
      cursor: emptyCursor,
      records,
      pollSpine: false,
      pollRecords: false,
      scheduler: {
        every(_ms, fn) {
          flush = fn;
          return () => {};
        },
      },
      broadcast: (_channel, _type, data) => broadcasts.push(data as PijChannelEvent),
    });
    await poller.start();
    broadcasts.length = 0;
    for (const frame of captured) poller.ingest(frame);
    const snapshot = poller.snapshot();
    expect(snapshot.statuses).toHaveLength(2);
    for (const status of snapshot.statuses) {
      const frame = cards.filter((item) => item.event.seat === status.peer).at(-1);
      if (!frame) throw new Error(`Missing captured report.now for ${status.peer}`);
      const payload = JSON.parse(frame.event.payload);
      expect(status).toEqual({
        peer: frame.event.seat,
        prev: payload.did,
        next: payload.next,
        seq: frame.cursor,
        ts: new Date(frame.event.at).toISOString(),
      });
    }
    const declared = stateFrames.at(-1);
    if (!declared) throw new Error('Missing captured report.state');
    expect(snapshot.rows.find((row) => row.id === declared.event.seat)).toMatchObject({
      state: 'idle',
      extra: { semanticState: JSON.parse(declared.event.payload).state, stateNote: null },
    });
    expect(broadcasts).toEqual([]);
    await flush();
    expect(broadcasts.filter((event) => event.type === 'status-delta')).toHaveLength(1);
    expect(broadcasts.filter((event) => event.type === 'fleet-delta')).toHaveLength(1);
    // Replay duplicates or older reports cannot replace newer cards or states.
    poller.ingest(stateFrames[0]);
    poller.ingest(cards[0]);
    await poller.refreshRecords();
    expect(poller.snapshot().statuses).toEqual(snapshot.statuses);
    expect(
      poller.snapshot().rows.find((row) => row.id === declared.event.seat)?.extra.semanticState
    ).toBe(JSON.parse(declared.event.payload).state);
    poller.stop();
  });
  it('primes once and schedules only a coalesced event flush in rs mode', async () => {
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
    expect(scheduled).toEqual([2000]);
    poller.stop();
  });
  it('does not resurrect an old declaration after a newer descriptor clears it', async () => {
    const [report, descriptor] = resetFrames;
    const row = { id: report.event.seat, folder: '/workspace', state: 'idle', semanticState: null };
    const records = new FakeRecords([
      Promise.resolve([row]),
      Promise.resolve([row]),
      Promise.resolve([row]),
    ]);
    const poller = createPijPoller({ cursor: emptyCursor, records, broadcast: () => {} });
    await poller.refreshRecords();
    poller.ingest(report);
    expect(poller.snapshot().rows[0].extra.semanticState).toBe(
      JSON.parse(report.event.payload).state
    );
    // This is a real captured notification: no payload or timestamp is fabricated for the reset.
    expect(descriptor.event.payload).toBe('');
    expect(descriptor.event.at).toBe(0);
    poller.ingest(descriptor);
    await poller.refreshRecords();
    expect(poller.snapshot().rows[0]).toMatchObject({
      state: 'idle',
      extra: { semanticState: null, stateNote: null },
    });
    // A later replay of that same old declaration remains incapable of restoring it.
    poller.ingest(report);
    await poller.refreshRecords();
    expect(poller.snapshot().rows[0].extra.semanticState).toBeNull();
  });

  it('protects a newer report from an older read but lets the next descriptor read clear it', async () => {
    const [report] = resetFrames;
    const row = { id: report.event.seat, folder: '/workspace', state: 'idle', semanticState: null };
    let release!: (rows: PijListRow[]) => void;
    const pending = new Promise<PijListRow[]>((resolve) => {
      release = resolve;
    });
    const records = new FakeRecords([Promise.resolve([row]), pending, Promise.resolve([row])]);
    const poller = createPijPoller({ cursor: emptyCursor, records, broadcast: () => {} });
    await poller.refreshRecords();
    const reading = poller.refreshRecords();
    poller.ingest(report);
    release([row]);
    await reading;
    expect(poller.snapshot().rows[0].extra.semanticState).toBe(
      JSON.parse(report.event.payload).state
    );
    await poller.refreshRecords();
    expect(poller.snapshot().rows[0].extra.semanticState).toBeNull();
  });

  it('keeps a fresh null descriptor authoritative when historical replay races bootstrap', async () => {
    const [report, descriptor] = resetFrames;
    const row = { id: report.event.seat, folder: '/workspace', state: 'idle', semanticState: null };
    let release!: (rows: PijListRow[]) => void;
    const records = new FakeRecords([
      new Promise<PijListRow[]>((resolve) => {
        release = resolve;
      }),
    ]);
    const poller = createPijPoller({ cursor: emptyCursor, records, broadcast: () => {} });
    const reading = poller.refreshRecords();
    poller.ingest(report);
    poller.ingest(descriptor);
    release([row]);
    await reading;
    expect(poller.snapshot().rows[0].extra.semanticState).toBeNull();
  });
  it('publishes rs error recovery and fresh read time even when rows are unchanged', async () => {
    const row = { id: 'pij-seat', folder: '/workspace', state: 'idle' };
    const records = new FakeRecords([Promise.resolve([row]), Promise.resolve([row])]);
    const list = records.list.bind(records);
    let fail = false;
    records.list = () => (fail ? Promise.reject(new Error('daemon unavailable')) : list());
    const events: PijChannelEvent[] = [];
    let now = new Date('2026-09-06T00:00:00.000Z');
    const poller = createPijPoller({
      cursor: emptyCursor,
      records,
      pollSpine: false,
      pollRecords: false,
      now: () => now,
      broadcast: (_channel, _type, data) => events.push(data as PijChannelEvent),
    });
    await poller.start();
    fail = true;
    await poller.refreshRecords();
    const failed = events.at(-1);
    if (failed?.type !== 'poller-status') throw new Error('Missing failure status');
    expect(failed.status.lastError?.message).toContain('daemon unavailable');
    events.length = 0;
    fail = false;
    now = new Date('2026-09-06T00:00:10.000Z');
    await poller.refreshRecords();
    expect(events).toEqual([
      expect.objectContaining({
        type: 'poller-status',
        status: expect.objectContaining({
          running: true,
          lastError: null,
          lastRecordsPollAt: now.toISOString(),
          fleetSize: 1,
        }),
      }),
    ]);
    poller.stop();
  });
});
