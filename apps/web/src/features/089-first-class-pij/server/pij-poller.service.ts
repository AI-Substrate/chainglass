/**
 * The two-loop pij poller — Plan 089 Phase 1 (T007).
 *
 * **One server-side reader, regardless of tab count** (AC-02). The mux already elects one
 * EventSource per browser; this elects one reader per server, and the two compose for free.
 *
 * ## Why two loops, and why it is not a choice (C-10)
 *
 * Transitions ride the spine. The **freshness axis and the context gauges do not** — they have no
 * spine events at all, they only exist in the descriptor rewritten on each daemon tick. A
 * cursor-only poller (the elegant version) would therefore show a stale gauge forever. So:
 *
 *   - **fast loop, 2s** — the spine cursor. Cheap (<0.01s, a file read), carries every transition.
 *   - **slow loop, 8s** — ONE global `pij list --json`. Costs ~0.45s of process spawn, carries the
 *     freshness axis and the gauges. Workspace scoping is a server-side filter on `folder`, not a
 *     second CLI call (F-13).
 *
 * ## Why the filter is the first thing the fast loop does (Finding 03)
 *
 * `system-state` dominates the spine ~100:1. Forwarding one SSE message per spine event would push
 * ~100 messages per tick through the mux to every open tab. So a tick emits **at most one**
 * `fleet-delta`, carrying the coalesced final state of every seat the tick touched. That is a
 * correctness property of the design, not an optimisation bolted on afterwards.
 *
 * ## Why deltas are full rows
 *
 * A `fleet-delta` carries complete replacement rows, never patches. The client then has no
 * field-level merge logic in which to invent a value — which is what makes AC-03's
 * never-re-derive-the-badge rule enforceable rather than merely stated.
 *
 * READ ONLY throughout: a file read of the spine, and read verbs through `IPijRecords`.
 */
import type { FleetRow, PijChannelEvent, PijId, PijStatusRecord, PollerStatus } from '../types';
import { PIJ_CHANNEL } from '../types';
import type { IFlowReader } from './flow-reader.interface';
import { indexFleetById, isFolderInWorkspace, toFleetRow } from './join';
import { PijCliError } from './pij-records';
import type { IPijRecords, PijListRow } from './pij-records.interface';
import { type PijRailContractSeams, productionContractSeams } from './pij-status.contract';
import type { ISpineCursor, SpineEvent } from './spine-cursor.interface';

/** Spine cursor cadence. Inside C-10's ruled 1–2s band. */
export const FAST_LOOP_MS = 2_000;

/** Record refresh cadence. Inside C-10's ruled 5–10s band. */
export const SLOW_LOOP_MS = 8_000;

/**
 * The fan-out ceiling for one event type in one fast tick. A tick may emit one coalesced
 * `fleet-delta` and one coalesced `status-delta`, never one broadcast per spine line.
 */
export const MAX_BROADCASTS_PER_FAST_TICK = 1;

/** The only spine kind whose `next` is a SystemState word we may apply to a row. */
const SYSTEM_STATE_KIND = 'system-state';

/** An injectable interval seam so cadence is testable without real time. */
export interface PijScheduler {
  /** Run `fn` every `ms`. Returns a cancel function. */
  every(ms: number, fn: () => void | Promise<void>): () => void;
}

/** The default scheduler — `setInterval`, unref'd so it can never hold the process open. */
export const realScheduler: PijScheduler = {
  every(ms, fn) {
    const handle = setInterval(() => {
      void fn();
    }, ms);
    handle.unref?.();
    return () => clearInterval(handle);
  },
};

export interface PijPollerDeps {
  cursor: ISpineCursor;
  records: IPijRecords;
  /** Optional: the flow half is driven on demand (and by Phase 3's watcher), not by a third loop. */
  flows?: IFlowReader;
  /** The single egress. Signature matches `sseManager.broadcast` exactly. */
  broadcast: (channelId: string, eventType: string, data: unknown) => void;
  scheduler?: PijScheduler;
  now?: () => Date;
  fastLoopMs?: number;
  slowLoopMs?: number;
  /** Non-fatal diagnostics. Defaults to console. */
  logger?: { warn: (message: string, ...rest: unknown[]) => void };
  contracts?: PijRailContractSeams;
}

export interface PijSnapshotResult {
  seq: number;
  at: string;
  rows: FleetRow[];
  statuses: PijStatusRecord[];
  status: PollerStatus;
}

export interface PijPollerService {
  start(): Promise<void>;
  stop(): void;
  /** Current state, optionally scoped to a workspace by a server-side `folder` filter. */
  snapshot(options?: { workspace?: string | null }): PijSnapshotResult;
  /** Re-read a plans root and broadcast a `flow-delta` if any signature changed. */
  refreshFlows(plansRoot: string): Promise<void>;
  /** The records adapter, for routes that need a repo-scoped read (`tree`). */
  readonly records: IPijRecords;
  readonly flows?: IFlowReader;
}

class Poller implements PijPollerService {
  private readonly deps: Required<
    Pick<PijPollerDeps, 'scheduler' | 'now' | 'logger' | 'contracts'>
  > &
    PijPollerDeps;
  private readonly fastLoopMs: number;
  private readonly slowLoopMs: number;

  private fleet = new Map<PijId, FleetRow>();
  private statuses = new Map<PijId, PijStatusRecord>();
  private cancels: Array<() => void> = [];
  private running = false;
  private lastSpinePollAt: string | null = null;
  private lastRecordsPollAt: string | null = null;
  private lastError: PollerStatus['lastError'] = null;
  private spineMissing = false;
  private tornLinesSkipped = 0;
  private flowSignatures = new Map<string, string>();

  constructor(deps: PijPollerDeps) {
    this.deps = {
      ...deps,
      scheduler: deps.scheduler ?? realScheduler,
      now: deps.now ?? (() => new Date()),
      logger: deps.logger ?? console,
      contracts: deps.contracts ?? productionContractSeams,
    };
    this.fastLoopMs = deps.fastLoopMs ?? FAST_LOOP_MS;
    this.slowLoopMs = deps.slowLoopMs ?? SLOW_LOOP_MS;
  }

  get records(): IPijRecords {
    return this.deps.records;
  }

  get flows(): IFlowReader | undefined {
    return this.deps.flows;
  }

  async start(): Promise<void> {
    // Idempotent: under HMR `start()` can be reached more than once, and a second set of loops would
    // silently double the store's reader count (AC-02).
    if (this.running) return;
    this.running = true;

    // Prime the fleet before the first tick, so a snapshot fetched immediately after boot is not
    // empty-because-we-have-not-looked — which AC-08 would otherwise have to render as "no seats".
    await this.tickSlow();

    this.cancels = [
      this.deps.scheduler.every(this.fastLoopMs, () => this.tickFast()),
      this.deps.scheduler.every(this.slowLoopMs, () => this.tickSlow()),
    ];
  }

  stop(): void {
    for (const cancel of this.cancels) cancel();
    this.cancels = [];
    this.running = false;
  }

  snapshot(options: { workspace?: string | null } = {}): PijSnapshotResult {
    const all = [...this.fleet.values()];
    const rows = options.workspace
      ? all.filter((row) => isFolderInWorkspace(row.folder, options.workspace as string))
      : all;
    const visibleIds = new Set(rows.map((row) => row.id));
    return {
      seq: this.deps.cursor.seq,
      at: this.deps.now().toISOString(),
      rows,
      statuses: [...this.statuses.values()].filter((status) => visibleIds.has(status.peer)),
      status: this.status(),
    };
  }

  private status(): PollerStatus {
    return {
      running: this.running,
      lastSpinePollAt: this.lastSpinePollAt,
      lastRecordsPollAt: this.lastRecordsPollAt,
      seq: this.deps.cursor.seq,
      lastError: this.lastError,
      spineMissing: this.spineMissing,
      tornLinesSkipped: this.tornLinesSkipped,
      fleetSize: this.fleet.size,
    };
  }

  /**
   * Fast loop: drain the spine cursor, coalesce, emit at most one delta.
   *
   * Never throws — `ISpineCursor.read()` reports a missing log as a value, and everything else here
   * is in-memory.
   */
  private async tickFast(): Promise<void> {
    const result = await this.deps.cursor.read();
    this.lastSpinePollAt = result.readAt;
    this.spineMissing = result.missing;
    this.tornLinesSkipped += result.skipped;

    if (result.events.length === 0) return;

    // THE FILTER. Collapse every event in this tick down to the set of seats it touched, applying
    // only what a spine event honestly says about a row.
    const touched = new Map<PijId, FleetRow>();
    const statusTouched = new Map<PijId, PijStatusRecord>();
    for (const event of result.events) {
      const peer = peerOf(event);
      if (!peer) continue;
      if (event.kind === 'status') {
        const status = this.deps.contracts.status.readSpineEvent(event, peer);
        if (status) {
          const current = statusTouched.get(peer) ?? this.statuses.get(peer);
          const newest = this.deps.contracts.status.newestByPeer(
            current ? [current, status] : [status]
          );
          const selected = newest.get(peer);
          if (selected) statusTouched.set(peer, selected);
        }
        continue;
      }
      const known = touched.get(peer) ?? this.fleet.get(peer);
      // A spine event carries a peer id and a transition — NOT a folder, harness or model. There is
      // no honest way to build a row for a seat we have never read; it arrives on the next slow loop.
      if (!known) continue;
      touched.set(peer, applyEvent(known, event));
    }

    if (statusTouched.size > 0) {
      for (const [id, status] of statusTouched) this.statuses.set(id, status);
      this.emit({
        type: 'status-delta',
        seq: result.seq,
        at: this.deps.now().toISOString(),
        statuses: [...statusTouched.values()],
      });
    }

    if (touched.size > 0) {
      for (const [id, row] of touched) this.fleet.set(id, row);
      this.emit({
        type: 'fleet-delta',
        seq: result.seq,
        at: this.deps.now().toISOString(),
        rows: [...touched.values()],
        removed: [],
      });
    }
  }

  /** Slow loop: ONE global list, diff, emit only what changed. Degrades rather than blanks. */
  private async tickSlow(): Promise<void> {
    let rows: PijListRow[];
    try {
      rows = await this.deps.records.list();
    } catch (error) {
      // AC-09: keep the last-known fleet. Blanking would both lose the data and pretend the store is
      // empty rather than unreachable.
      const failure = error instanceof PijCliError ? error : null;
      this.lastError = {
        code: failure?.code ?? 'E-UNKNOWN',
        message: failure?.message ?? String(error),
        at: this.deps.now().toISOString(),
      };
      this.emit({
        type: 'poller-status',
        seq: this.deps.cursor.seq,
        at: this.deps.now().toISOString(),
        status: this.status(),
      });
      return;
    }

    this.lastRecordsPollAt = this.deps.now().toISOString();
    this.lastError = null;

    const next = indexFleetById(rows.map(toFleetRow));
    const changed: FleetRow[] = [];
    for (const [id, row] of next) {
      const previous = this.fleet.get(id);
      if (!previous || !sameRow(previous, row)) changed.push(row);
    }
    // A seat leaving the hot list is usually a TIER MIGRATION (48h terminal TTL), not a death. The
    // channel says "gone from this view" and deliberately says nothing about why (C-07).
    const removed = [...this.fleet.keys()].filter((id) => !next.has(id));

    this.fleet = next;
    for (const peer of this.statuses.keys()) {
      if (!next.has(peer)) this.statuses.delete(peer);
    }

    if (changed.length === 0 && removed.length === 0) return;
    this.emit({
      type: 'fleet-delta',
      seq: this.deps.cursor.seq,
      at: this.deps.now().toISOString(),
      rows: changed,
      removed,
    });
  }

  async refreshFlows(plansRoot: string): Promise<void> {
    if (!this.deps.flows) return;
    const summaries = await this.deps.flows.scan(plansRoot);

    // Finding 08: `events[].length + nav.now` is a sufficient change signature and comes free. Flow
    // files write zero times when nothing is happening, so an unconditional broadcast is pure noise.
    const changed = summaries.filter(
      (summary) => this.flowSignatures.get(summary.planDir) !== summary.signature
    );
    for (const summary of summaries) this.flowSignatures.set(summary.planDir, summary.signature);

    if (changed.length === 0) return;
    this.emit({
      type: 'flow-delta',
      seq: this.deps.cursor.seq,
      at: this.deps.now().toISOString(),
      flows: changed,
    });
  }

  /**
   * The single egress. Typed as `PijChannelEvent`, so every broadcast this service makes is checked
   * against the union at compile time — the event's own `type` doubles as the SSE event name.
   */
  private emit(event: PijChannelEvent): void {
    try {
      this.deps.broadcast(PIJ_CHANNEL, event.type, event);
    } catch (error) {
      // A broken transport must never take down the reader; the next tick will carry fresh state.
      this.deps.logger.warn('[pij] broadcast failed (non-fatal):', error);
    }
  }
}

export function createPijPoller(deps: PijPollerDeps): PijPollerService {
  return new Poller(deps);
}

/** The seat an event is about. `peer` is the ruled exact-match query key; `node:` refs are the backup. */
function peerOf(event: SpineEvent): PijId | undefined {
  if (typeof event.peer === 'string' && event.peer.length > 0) return event.peer as PijId;
  const nodeRef = event.refs?.find((ref) => ref.startsWith('node:'));
  return nodeRef ? (nodeRef.slice('node:'.length) as PijId) : undefined;
}

/**
 * Apply what an event honestly says about a row.
 *
 * Only `system-state` carries a SystemState word in `next`. For every other kind the transition rides
 * the refs and the payload means something else entirely — applying `next` there would write, say, a
 * task sentence into the state field. So other kinds mark the seat as *touched* (the client learns it
 * is active) without inventing a new state for it.
 */
function applyEvent(row: FleetRow, event: SpineEvent): FleetRow {
  if (event.kind !== SYSTEM_STATE_KIND || typeof event.next !== 'string') return row;
  return { ...row, state: event.next, lastEventAt: event.ts };
}

/** Structural equality over the row we would broadcast. Cheap, and exact for a JSON-shaped value. */
function sameRow(a: FleetRow, b: FleetRow): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
