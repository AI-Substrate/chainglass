import type {
  FlowSummary,
  IFlowReader,
} from '../../apps/web/src/features/089-first-class-pij/server/flow-reader.interface';
import type { PijScheduler } from '../../apps/web/src/features/089-first-class-pij/server/pij-poller.service';
/**
 * Poller test doubles — Plan 089 Phase 1 (T007).
 *
 * A fake clock, a scripted spine cursor, a scripted flow reader and a broadcast recorder. Together
 * they let the two-loop poller be driven deterministically: no real timers, no real store, no
 * sleeping in tests.
 *
 * Constitution P4: fakes over mocks, no `vi.mock()`.
 */
import type {
  ISpineCursor,
  SpineEvent,
  SpineReadResult,
} from '../../apps/web/src/features/089-first-class-pij/server/spine-cursor.interface';

/**
 * A scheduler that never sleeps. Registered callbacks are invoked only when a test says so, so a
 * "2s fast loop / 8s slow loop" cadence test costs microseconds and cannot flake on timing.
 */
export class FakeScheduler implements PijScheduler {
  readonly registrations: Array<{
    ms: number;
    fn: () => void | Promise<void>;
    cancelled: boolean;
  }> = [];

  every(ms: number, fn: () => void | Promise<void>): () => void {
    const registration = { ms, fn, cancelled: false };
    this.registrations.push(registration);
    return () => {
      registration.cancelled = true;
    };
  }

  /** Fire every live registration whose interval matches, in registration order. */
  async fire(ms: number): Promise<void> {
    for (const registration of this.registrations) {
      if (registration.cancelled || registration.ms !== ms) continue;
      await registration.fn();
    }
  }

  get liveCount(): number {
    return this.registrations.filter((r) => !r.cancelled).length;
  }
}

/** A spine cursor whose reads are scripted, one queued batch per `read()`. */
export class FakeSpineCursor implements ISpineCursor {
  private cursorSeq: number;
  private readonly queue: SpineReadResult[] = [];

  constructor(since = 0) {
    this.cursorSeq = since;
  }

  get seq(): number {
    return this.cursorSeq;
  }

  /** Queue a batch of events for the next `read()`. */
  queueEvents(events: SpineEvent[], options: { skipped?: number; missing?: boolean } = {}): this {
    this.queue.push({
      events,
      seq: events.at(-1)?.seq ?? this.cursorSeq,
      skipped: options.skipped ?? 0,
      missing: options.missing ?? false,
      readAt: '2026-07-26T00:00:00.000Z',
    });
    return this;
  }

  /** Queue a read that finds the log missing — the rename window (C-07). */
  queueMissing(): this {
    this.queue.push({
      events: [],
      seq: this.cursorSeq,
      skipped: 0,
      missing: true,
      readAt: '2026-07-26T00:00:00.000Z',
    });
    return this;
  }

  async read(): Promise<SpineReadResult> {
    const next = this.queue.shift();
    if (!next) {
      return {
        events: [],
        seq: this.cursorSeq,
        skipped: 0,
        missing: false,
        readAt: '2026-07-26T00:00:00.000Z',
      };
    }
    this.cursorSeq = Math.max(this.cursorSeq, next.seq);
    return { ...next, seq: this.cursorSeq };
  }
}

/** A flow reader returning a scripted set of summaries. */
export class FakeFlowReader implements IFlowReader {
  constructor(private summaries: FlowSummary[] = []) {}

  setSummaries(summaries: FlowSummary[]): void {
    this.summaries = summaries;
  }

  async read(planDir: string): Promise<FlowSummary> {
    const found = this.summaries.find((s) => s.planDir === planDir);
    if (found) return found;
    throw new Error(`FakeFlowReader: no scripted summary for ${planDir}`);
  }

  async scan(): Promise<FlowSummary[]> {
    return this.summaries;
  }
}

/** Records everything handed to `sseManager.broadcast(channelId, eventType, data)`. */
export class BroadcastRecorder {
  readonly sent: Array<{ channelId: string; eventType: string; data: unknown }> = [];

  broadcast = (channelId: string, eventType: string, data: unknown): void => {
    this.sent.push({ channelId, eventType, data });
  };

  ofType(eventType: string): unknown[] {
    return this.sent.filter((s) => s.eventType === eventType).map((s) => s.data);
  }

  reset(): void {
    this.sent.length = 0;
  }
}

/** Build a `system-state` spine event — the kind that dominates the log ~100:1. */
export function systemStateEvent(
  seq: number,
  peer: string,
  prev: string,
  next: string
): SpineEvent {
  return {
    schema_version: 1,
    seq,
    ts: `2026-07-26T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    actor: 'daemon',
    kind: 'system-state',
    refs: [`node:${peer}`],
    peer,
    prev,
    next,
    actorProvenance: 'resolved',
  };
}

/** Build a non-`system-state` spine event (a real transition a human cares about). */
export function taskSetEvent(seq: number, peer: string, task: string): SpineEvent {
  return {
    schema_version: 1,
    seq,
    ts: '2026-07-26T00:01:00.000Z',
    actor: 'jordan',
    kind: 'task-set',
    refs: [`node:${peer}`, `assignment:asg-general-${peer}`],
    peer,
    next: task,
    actorProvenance: 'resolved',
  };
}
