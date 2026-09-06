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

type EventScript = (
  from: Cursor | undefined,
  signal: AbortSignal | undefined
) => AsyncIterable<RsEvent>;

class FakeRsClient implements RsClient {
  readonly eventCalls: Array<Cursor | undefined> = [];

  constructor(private readonly scripts: EventScript[]) {}

  async seats(): Promise<RsSeat[]> {
    return [];
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
  it('starts one subscription, resumes from the last cursor, and records every hello build', async () => {
    let secondEvent!: () => void;
    const secondEventSeen = new Promise<void>((resolve) => {
      secondEvent = resolve;
    });
    const client = new FakeRsClient([
      async function* () {
        yield hello('pij-rs 0.1.0');
        yield event(17);
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
});
