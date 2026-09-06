import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  Cursor,
  RsClient,
  RsCursorEvent,
  RsEvent,
  RsSeat,
  RsStateReport,
} from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-client';
import {
  type RsEventStream,
  type RsEventStreamStatus,
  createRsEventStream,
} from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-event-stream';

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

type EventScript = (
  from: Cursor | undefined,
  signal: AbortSignal | undefined
) => AsyncIterable<RsEvent>;

class FakeRsClient implements RsClient {
  readonly eventCalls: Array<Cursor | undefined> = [];

  constructor(
    private readonly scripts: EventScript[],
    private readonly rows: RsSeat[] = []
  ) {}

  async seats(): Promise<RsSeat[]> {
    return this.rows;
  }

  async state(id: string): Promise<RsStateReport> {
    return { id, unsupported: [] };
  }

  events(from?: Cursor, signal?: AbortSignal): AsyncIterable<RsEvent> {
    this.eventCalls.push(from ? { ...from } : undefined);
    const script = this.scripts.shift();
    if (!script) throw new Error('Unexpected event subscription');
    return script(from, signal);
  }
}

function hello(build: string): RsEvent {
  return { hello: true, build, v: 1 };
}

function event(cursor: number, kind = 'message.pushed'): RsCursorEvent {
  return {
    type: 'event',
    machine: 'local',
    cursor,
    event: {
      v: 1,
      at: 1788318613497 + cursor,
      kind,
      seat: 'pij-seat',
      payload: '{"msg_id":"message-1"}',
    },
  };
}

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (!signal || signal.aborted) return;
  await new Promise<void>((resolve) =>
    signal.addEventListener('abort', () => resolve(), { once: true })
  );
}

describe('createRsEventStream', () => {
  it('starts one subscription, resumes from an applied descriptor, and records established builds', async () => {
    let secondEvent!: () => void;
    const secondEventSeen = new Promise<void>((resolve) => {
      secondEvent = resolve;
    });
    const client = new FakeRsClient([
      async function* () {
        yield hello('pij-rs 0.1.0');
        yield event(17, 'seat.put');
        throw new Error('connection dropped');
      },
      async function* (_from, signal) {
        yield hello('pij-rs 0.1.1');
        yield event(18, 'delivery.outcome');
        secondEvent();
        await waitForAbort(signal);
      },
    ]);
    const received: RsCursorEvent[] = [];
    const statuses: RsEventStreamStatus[] = [];
    const stream = createRsEventStream({
      client,
      onEvent: (frame) => {
        received.push(frame);
      },
      onStatus: (status) => statuses.push(status),
      sleep: async () => {},
      random: () => 0.5,
    });

    stream.start();
    stream.start();
    await secondEventSeen;
    stream.stop();

    expect(client.eventCalls).toEqual([undefined, { local: 17 }]);
    expect(received.map((frame) => frame.cursor)).toEqual([17, 18]);
    expect(
      statuses.filter((status) => status.state === 'connected').map((status) => status.build)
    ).toEqual(['pij-rs 0.1.0', 'pij-rs 0.1.1']);
    expect(statuses).toContainEqual(
      expect.objectContaining({ state: 'reconnecting', attempt: 0, delayMs: 250 })
    );
  });

  it('schedules descriptor refreshes concurrently so a burst coalesces below the stream', async () => {
    let releaseFirst!: () => void;
    const firstApplied = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondReceived!: () => void;
    const secondSeen = new Promise<void>((resolve) => {
      secondReceived = resolve;
    });
    const client = new FakeRsClient([
      async function* (_from, signal) {
        yield hello('pij-rs 0.1.0');
        yield event(1, 'seat.put');
        yield event(2, 'seat.tombstone');
        await waitForAbort(signal);
      },
    ]);
    const received: number[] = [];
    const stream = createRsEventStream({
      client,
      onEvent: async (frame) => {
        received.push(frame.cursor);
        if (frame.cursor === 1) await firstApplied;
        else secondReceived();
      },
      onStatus: () => {},
    });

    stream.start();
    await secondSeen;

    expect(received).toEqual([1, 2]);
    releaseFirst();
    stream.stop();
  });

  it('reports and ignores unknown frame types instead of applying them as cursor events', async () => {
    let ignoredSeen!: () => void;
    const ignored = new Promise<void>((resolve) => {
      ignoredSeen = resolve;
    });
    const client = new FakeRsClient([
      async function* (_from, signal) {
        yield { ignored: true, frame: { type: 'future-frame', value: 1 } };
        await waitForAbort(signal);
      },
    ]);
    const received: RsCursorEvent[] = [];
    const statuses: RsEventStreamStatus[] = [];
    const stream = createRsEventStream({
      client,
      onEvent: (frame) => {
        received.push(frame);
      },
      onStatus: (status) => {
        statuses.push(status);
        if (status.state === 'ignored') ignoredSeen();
      },
    });

    stream.start();
    await ignored;
    stream.stop();

    expect(received).toEqual([]);
    expect(statuses).toContainEqual({ state: 'ignored', frameType: 'future-frame' });
  });

  it('caps exponential reconnect backoff with jitter', async () => {
    const scripts: EventScript[] = Array.from({ length: 6 }, () => () => ({
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<RsEvent>> {
            throw new Error('connect failed');
          },
        };
      },
    }));
    const client = new FakeRsClient(scripts);
    const delays: number[] = [];
    let reachedCap!: () => void;
    const capped = new Promise<void>((resolve) => {
      reachedCap = resolve;
    });
    const stream = createRsEventStream({
      client,
      onEvent: () => {},
      onStatus: () => {},
      random: () => 1,
      sleep: async (ms) => {
        delays.push(ms);
        if (delays.length === 6) {
          stream.stop();
          reachedCap();
        }
      },
    });

    stream.start();
    await capped;

    expect(delays).toEqual([300, 600, 1_200, 2_400, 4_800, 5_000]);
  });
  it('recycles a held socket without letting pushed kinds burn a missing descriptor', async () => {
    let replayed!: () => void;
    const replaySeen = new Promise<void>((resolve) => {
      replayed = resolve;
    });
    const client = new FakeRsClient([
      async function* (_from, signal) {
        yield hello('pij-rs 0.1.0');
        yield event(10, 'seat.put');
        // Cursor 11 (seat.put) exists in replay but never arrives on the live socket.
        yield event(12, 'message.pushed');
        yield event(13, 'spawn.bound');
        yield event(14, 'spawn.failed');
        await waitForAbort(signal);
      },
      async function* (_from, signal) {
        yield hello('pij-rs 0.1.0');
        yield event(11, 'seat.put');
        replayed();
        await waitForAbort(signal);
      },
    ]);
    const stream = createRsEventStream({
      client,
      onEvent: () => {},
      onStatus: () => {},
      recycleMs: 10,
    });
    stream.start();
    await replaySeen;
    stream.stop();
    expect(client.eventCalls).toEqual([undefined, { local: 10 }]);
  });

  it.each(['spawn.bound', 'spawn.failed'])(
    'does not resume past a missing descriptor after successfully applying pushed %s',
    async (kind) => {
      const [report, descriptor] = resetFrames;
      const spawn = captured.find((frame) => frame.event.kind === kind);
      if (!spawn) throw new Error(`Missing captured ${kind}`);
      // Scripted regression, NOT a wire capture: move only the pushed cursor beyond the
      // missing descriptor. All report/spawn payloads, identities and timestamps are captured.
      const pushed: RsCursorEvent = { ...spawn, cursor: descriptor.cursor + 1 };
      let replayed!: () => void;
      const replaySeen = new Promise<void>((resolve) => {
        replayed = resolve;
      });
      const client = new FakeRsClient([
        async function* () {
          yield report;
          yield pushed;
          throw new Error('scripted disconnect after pushed spawn');
        },
        async function* (_from, signal) {
          yield descriptor;
          replayed();
          await waitForAbort(signal);
        },
      ]);
      const applied: RsCursorEvent[] = [];
      const stream = createRsEventStream({
        client,
        onEvent: (frame) => {
          applied.push(frame);
        },
        onStatus: () => {},
        sleep: async () => {},
      });
      stream.start();
      try {
        await replaySeen;
        expect(applied).toEqual([report, pushed, descriptor]);
        expect(client.eventCalls).toEqual([undefined, { [report.machine]: report.cursor }]);
      } finally {
        stream.stop();
      }
    }
  );

  it('backs off when each socket sends hello then fails without an event', async () => {
    const client = new FakeRsClient(
      Array.from(
        { length: 4 },
        () =>
          async function* () {
            yield hello('pij-rs 0.1.0');
            throw new Error('failed after hello');
          }
      )
    );
    const delays: number[] = [];
    const statuses: RsEventStreamStatus[] = [];
    let finished!: () => void;
    const done = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const stream = createRsEventStream({
      client,
      onEvent: () => {},
      onStatus: (status) => statuses.push(status),
      random: () => 0.5,
      sleep: async (ms) => {
        delays.push(ms);
        if (delays.length === 4) {
          stream.stop();
          finished();
        }
      },
    });
    stream.start();
    await done;
    expect(delays).toEqual([250, 500, 1000, 2000]);
    expect(statuses.some((status) => status.state === 'connected')).toBe(false);
  });

  it('does not commit a later cursor across a failed descriptor application', async () => {
    let resumed!: () => void;
    const resumedSeen = new Promise<void>((resolve) => {
      resumed = resolve;
    });
    const client = new FakeRsClient([
      async function* (_from, signal) {
        yield event(1, 'seat.put');
        yield event(2, 'seat.tombstone');
        await waitForAbort(signal);
      },
      async function* (_from, signal) {
        yield hello('pij-rs 0.1.0');
        resumed();
        await waitForAbort(signal);
      },
    ]);
    const stream = createRsEventStream({
      client,
      onEvent: async (frame) => {
        if (frame.cursor === 1) throw new Error('refresh failed');
      },
      onStatus: () => {},
      sleep: async () => {},
    });
    stream.start();
    await resumedSeen;
    stream.stop();
    expect(client.eventCalls).toEqual([undefined, { local: 0 }]);
  });
  it('replays each known machine from zero on a fresh process instead of subscribing live-only', async () => {
    let connected!: () => void;
    const seen = new Promise<void>((resolve) => {
      connected = resolve;
    });
    const client = new FakeRsClient(
      [
        async function* (_from, signal) {
          yield event(1, 'report.now');
          connected();
          await waitForAbort(signal);
        },
      ],
      [
        { id: 'pij-one', machine: 'local' },
        { id: 'pij-two', machine: 'remote' },
      ]
    );
    const stream = createRsEventStream({ client, onEvent: () => {}, onStatus: () => {} });
    stream.start();
    await seen;
    stream.stop();
    expect(client.eventCalls).toEqual([{ local: 0, remote: 0 }]);
  });
});
