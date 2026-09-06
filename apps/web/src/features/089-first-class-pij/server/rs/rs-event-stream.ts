import type { RsClient, RsCursorEvent, RsHelloEvent, RsIgnoredEvent } from './rs-client';

const INITIAL_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 5_000;
const RECONNECT_JITTER = 0.2;
const RECYCLE_MS = 5_000;
// Resume advances on kinds we act on AND that arrive only by replay (seat.*, report.*).
// A pushed kind, acted-on or not (including spawn.*), never moves it: that burns missing frames.
const RESUME_EVENT_KINDS = new Set(['seat.put', 'seat.tombstone', 'report.now', 'report.state']);

export type RsEventStreamStatus =
  | { state: 'connected'; build: string }
  | { state: 'reconnecting'; attempt: number; delayMs: number; error: Error }
  | { state: 'ignored'; frameType: string }
  | { state: 'stopped' };

export interface RsEventStream {
  start(): void;
  stop(): void;
}

export interface RsEventStreamOptions {
  client: RsClient;
  onEvent: (event: RsCursorEvent) => void | Promise<void>;
  onStatus: (status: RsEventStreamStatus) => void;
  random?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  recycleMs?: number;
}

export function createRsEventStream(options: RsEventStreamOptions): RsEventStream {
  return new ReconnectingRsEventStream(options);
}

class ReconnectingRsEventStream implements RsEventStream {
  private readonly resumeCursors: Record<string, number> = {};
  private readonly observedCursors: Record<string, number> = {};
  private controller: AbortController | undefined;
  private running: Promise<void> | undefined;

  constructor(private readonly options: RsEventStreamOptions) {}

  start(): void {
    if (this.running) return;
    this.controller = new AbortController();
    this.running = this.run(this.controller.signal).finally(() => {
      this.running = undefined;
      this.controller = undefined;
      this.options.onStatus({ state: 'stopped' });
    });
  }

  stop(): void {
    this.controller?.abort();
  }

  private async run(signal: AbortSignal): Promise<void> {
    let attempt = 0;
    while (!signal.aborted) {
      let established = false;
      let build = '';
      let recycled = false;
      let applied = Promise.resolve();
      let applicationError: unknown;
      const connection = new AbortController();
      const abort = () => connection.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => {
        recycled = true;
        connection.abort();
      }, this.options.recycleMs ?? RECYCLE_MS);
      timer.unref?.();
      try {
        if (Object.keys(this.resumeCursors).length === 0) {
          // An omitted cursor (even {}) is live-only. Fresh processes replay cards from zero;
          // nothing is persisted in pij's sole-writer store. Discover aliases with one global read.
          for (const seat of await this.options.client.seats()) {
            if (typeof seat.machine === 'string') this.resumeCursors[seat.machine] = 0;
          }
        }
        const from =
          Object.keys(this.resumeCursors).length > 0 ? { ...this.resumeCursors } : undefined;
        for await (const frame of this.options.client.events(from, connection.signal)) {
          if ('ignored' in frame && frame.ignored === true) {
            const ignored = frame as RsIgnoredEvent;
            this.options.onStatus({
              state: 'ignored',
              frameType:
                typeof ignored.frame.type === 'string'
                  ? ignored.frame.type
                  : '(missing frame type)',
            });
            continue;
          }
          if ('hello' in frame && frame.hello === true) {
            build = (frame as RsHelloEvent).build;
            continue;
          }
          const cursorFrame = frame as RsCursorEvent;
          this.resumeCursors[cursorFrame.machine] ??= 0;
          this.observedCursors[cursorFrame.machine] = Math.max(
            this.observedCursors[cursorFrame.machine] ?? 0,
            cursorFrame.cursor
          );
          if (!established) {
            established = true;
            attempt = 0;
            this.options.onStatus({ state: 'connected', build });
          }
          const pending = Promise.resolve(this.options.onEvent(cursorFrame));
          // Dispatch without awaiting so descriptor bursts use the poller's coalesced refresh.
          // Commit in wire order: a later success must never skip an earlier failed application.
          if (RESUME_EVENT_KINDS.has(cursorFrame.event.kind)) {
            applied = applied.then(() => pending).then(() => this.advanceCursor(cursorFrame));
          } else {
            applied = applied.then(() => pending);
          }
          const failed = (error: unknown) => {
            applicationError = error;
            connection.abort();
          };
          void pending.catch(failed);
          void applied.catch(failed);
        }
        await applied;
        if (signal.aborted) break;
        if (recycled) continue;
        throw new Error('pij-rs event stream ended');
      } catch (cause) {
        await applied.catch(() => {});
        if (signal.aborted) break;
        if (recycled && applicationError === undefined) continue;
        const failure = applicationError ?? cause;
        const error = failure instanceof Error ? failure : new Error(String(failure));
        const delayMs = reconnectDelay(attempt, this.options.random ?? Math.random);
        this.options.onStatus({ state: 'reconnecting', attempt, delayMs, error });
        await (this.options.sleep ?? abortableSleep)(delayMs, signal);
        if (!established) attempt += 1;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      }
    }
  }
  private advanceCursor(frame: RsCursorEvent): void {
    this.resumeCursors[frame.machine] = Math.max(
      this.resumeCursors[frame.machine] ?? 0,
      frame.cursor
    );
  }
}

function reconnectDelay(attempt: number, random: () => number): number {
  const exponential = Math.min(MAX_RECONNECT_MS, INITIAL_RECONNECT_MS * 2 ** attempt);
  const jitter = 1 + (random() * 2 - 1) * RECONNECT_JITTER;
  return Math.min(MAX_RECONNECT_MS, Math.round(exponential * jitter));
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    timer.unref?.();
    signal.addEventListener('abort', done, { once: true });

    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
