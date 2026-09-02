import type { RsClient, RsCursorEvent, RsHelloEvent, RsIgnoredEvent } from './rs-client';

const INITIAL_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 5_000;
const RECONNECT_JITTER = 0.2;
const DESCRIPTOR_EVENT_KINDS = new Set(['seat.put', 'seat.tombstone']);

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
}

export function createRsEventStream(options: RsEventStreamOptions): RsEventStream {
  return new ReconnectingRsEventStream(options);
}

class ReconnectingRsEventStream implements RsEventStream {
  private readonly cursors: Record<string, number> = {};
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
      const pendingDescriptorChanges = new Set<Promise<void>>();
      try {
        const from = Object.keys(this.cursors).length > 0 ? { ...this.cursors } : undefined;
        for await (const frame of this.options.client.events(from, signal)) {
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
            const hello = frame as RsHelloEvent;
            established = true;
            attempt = 0;
            this.options.onStatus({ state: 'connected', build: hello.build });
            continue;
          }
          const cursorFrame = frame as RsCursorEvent;
          if (DESCRIPTOR_EVENT_KINDS.has(cursorFrame.event.kind)) {
            const pending = Promise.resolve(this.options.onEvent(cursorFrame)).then(() => {
              this.advanceCursor(cursorFrame);
            });
            pendingDescriptorChanges.add(pending);
            void pending.then(
              () => pendingDescriptorChanges.delete(pending),
              () => {}
            );
            void pending.catch(() => {});
            continue;
          }
          await this.options.onEvent(cursorFrame);
          this.advanceCursor(cursorFrame);
        }
        await Promise.all(pendingDescriptorChanges);
        if (signal.aborted) break;
        throw new Error('pij-rs event stream ended');
      } catch (cause) {
        if (signal.aborted) break;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        const delayMs = reconnectDelay(attempt, this.options.random ?? Math.random);
        this.options.onStatus({ state: 'reconnecting', attempt, delayMs, error });
        await (this.options.sleep ?? abortableSleep)(delayMs, signal);
        if (!established) attempt += 1;
      }
    }
  }
  private advanceCursor(frame: RsCursorEvent): void {
    this.cursors[frame.machine] = Math.max(this.cursors[frame.machine] ?? 0, frame.cursor);
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
