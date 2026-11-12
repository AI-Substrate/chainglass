import type { RsClient, RsCursorEvent, RsHelloEvent, RsIgnoredEvent } from './rs-client';

const INITIAL_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 5_000;
const RECONNECT_JITTER = 0.2;
// Since pij plan 139, ALL event kinds push live, so the recycle is only a defensive reopen of a
// held socket. At 5s it reopened ~500 times an hour on an idle server (nav-speed PRD item 7);
// 10 minutes keeps the defence while staying under 10 connects an hour.
const RECYCLE_MS = 10 * 60_000;
// Keep the conservative resume allowlist for older sparse-push daemons: commit applied
// seat/role/report facts across a cursor gap, but never traffic. Traffic still advances the
// cursor when it directly follows it (see advanceCursor).
const RESUME_EVENT_KINDS = new Set([
  'seat.put',
  'seat.tombstone',
  'role-set',
  'report.now',
  'report.state',
]);

export type RsEventStreamStatus =
  /** `afterRecycle`: the previous socket was closed by the planned recycle, not by a failure. */
  | { state: 'connected'; build: string; afterRecycle: boolean }
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
    let afterRecycle = false;
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
        // A fresh process subscribes live-only (an omitted cursor): cards come from the
        // /v1/state snapshot instead of replaying the whole log from zero, which reached
        // 2.4 GB after the 26 Oct 2026 bg.lost flood and pinned the dev server for minutes.
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
          // The first live event starts this machine's run; later recycles resume from it.
          this.resumeCursors[cursorFrame.machine] ??= cursorFrame.cursor - 1;
          this.observedCursors[cursorFrame.machine] = Math.max(
            this.observedCursors[cursorFrame.machine] ?? 0,
            cursorFrame.cursor
          );
          if (!established) {
            established = true;
            attempt = 0;
            this.options.onStatus({ state: 'connected', build, afterRecycle });
          }
          const pending = Promise.resolve(this.options.onEvent(cursorFrame));
          // Dispatch without awaiting so descriptor bursts use the poller's coalesced refresh.
          // Commit in wire order: a later success must never skip an earlier failed application.
          applied = applied.then(() => pending).then(() => this.advanceCursor(cursorFrame));
          const failed = (error: unknown) => {
            applicationError = error;
            connection.abort();
          };
          void pending.catch(failed);
          void applied.catch(failed);
        }
        await applied;
        if (signal.aborted) break;
        if (recycled) {
          // Only a socket that reached `connected` makes the next connect routine; a hello-only
          // window keeps the previous mark, so a first connect or one after a failure logs at info.
          if (established) afterRecycle = true;
          continue;
        }
        throw new Error('pij-rs event stream ended');
      } catch (cause) {
        await applied.catch(() => {});
        if (signal.aborted) break;
        if (recycled && applicationError === undefined) {
          if (established) afterRecycle = true;
          continue;
        }
        afterRecycle = false;
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
    const current = this.resumeCursors[frame.machine] ?? 0;
    // Traffic may only extend a contiguous run: a gap could hide a descriptor a sparse-push
    // daemon never sent live. Without this, a replay whose resume-kind facts are further apart
    // than one recycle can read (the 3.58M-event bg.lost flood of 26 Oct 2026) restarts from
    // the same cursor every recycle, forever.
    if (!RESUME_EVENT_KINDS.has(frame.event.kind) && frame.cursor !== current + 1) return;
    this.resumeCursors[frame.machine] = Math.max(current, frame.cursor);
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
