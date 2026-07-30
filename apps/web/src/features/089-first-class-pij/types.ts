/**
 * Public types for 089-first-class-pij — Plan 089 Phase 1.
 *
 * Two things live here and nowhere else: the **view row shapes** (what a seat or a plan looks like
 * once joined) and the **`pij` channel vocabulary** (`PijChannelEvent`). Both are contracts: the
 * poller broadcasts them, the snapshot routes return them, and Phases 2–4 render them.
 *
 * The governing doctrine, ruled repeatedly during discovery: **report what was observed, never what
 * it means.** Wherever a field could carry either an observation or a verdict, this file carries the
 * observation and names its provenance.
 */
import type { FlowSummary } from './server/flow-reader.interface';
import type { PijTreeNode } from './server/pij-records.interface';
import type { OrchestrationRole } from './server/pij-status.contract';

/**
 * A pij session id.
 *
 * Branded on purpose. C-03 forbids keying a row on `paneId` or `pid` — both recycle, and a recycled
 * key silently attributes one seat's state to another. A branded id means a `pid: number` will not
 * compile as a key and a bare string must pass through {@link asPijId}, which is a deliberate,
 * greppable act rather than an accident.
 *
 * Ids may be a SINGLE SEGMENT (`shipname`). Never pattern-match the shape.
 */
export type PijId = string & { readonly __brand: 'PijId' };

/** Mark a raw pij id as a `PijId`. The one sanctioned entry point. */
export function asPijId(raw: string): PijId {
  return raw as PijId;
}

/**
 * One seat, as the fleet view sees it.
 *
 * **`pid` and `paneId` are deliberately absent.** AC-03 forbids rendering either as identity, and the
 * cheapest enforcement is a type that never carries them: you cannot render, key, or match on a field
 * that does not exist. `dataDir` is absent for a different reason — it is a record *path*, and record
 * paths are explicitly not a stable contract.
 */
export interface FleetRow {
  id: PijId;
  /** The workspace join key. */
  folder: string;
  /** The daemon's mechanical verdict, verbatim. */
  state?: string;
  activity?: string;
  liveness?: string;
  /** The freshness axis — has no spine event, so it rides the slow loop (C-10). */
  lastEventAt?: string | null;
  /**
   * The ruled worst-first badge. Only ever populated from `pij node show`, which computes it.
   * `undefined` means "not read yet" — an honest absence, never a locally re-derived guess (AC-03).
   */
  badge?: string;
  harness?: string;
  /** PINNED until observed. The UI must say which (C-05). */
  boundModel?: string | null;
  boundProvider?: string | null;
  effort?: string | null;
  bindHealth?: string;
  degraded?: boolean;
  failureReason?: string | null;
  prime?: boolean;
  /**
   * JC-2 projected role. Missing key means pre-JC-2 pij; `null` means the producer knows the field
   * and this seat is undesignated. Consumers must preserve that distinction.
   */
  orchestrationRole?: OrchestrationRole | null;
  /** Ruled derivation (adoption axis), consumed not recomputed. */
  unadopted?: boolean;
  currentTask?: string | null;
  currentAssignment?: string | null;
  contextMax?: number | null;
  /** A real token count or the literal `'unknown'` — never an estimate (C-05). */
  contextCurrent?: { value: number | 'unknown'; asOf?: string; provenance?: string } | null;
  /** tmux window. Carried for Phase 4's human-click focus only (C-06); never auto-actioned. */
  windowId?: string;
  /**
   * Every other field pij reported, verbatim. Records evolve additively and readers must tolerate
   * unknown fields — dove's `needs-human` lands here for free when it ships.
   */
  extra: Record<string, unknown>;
}

/** How the flow↔project join was made. Inference stays labelled as inference. */
export type FlowJoinVia = 'provenance.plan_id' | 'plan-folder-convention' | 'none';

export interface FlowProjectJoin {
  planId: string | null;
  via: FlowJoinVia;
  /** True only for `provenance.plan_id` — the join is data, not convention. */
  confident: boolean;
}

/**
 * How a team (a section's lead seat) was joined to a plan folder — Phase 2.
 *
 * There are deliberately only two rungs. Unlike {@link FlowJoinVia} this join has no convention
 * fallback available to it: the only other signal is the resemblance between an assignment title and
 * a plan folder name, and a resemblance join is wrong precisely when it is confident. See
 * `server/join.ts`'s `joinTeamToFlow` for what the live records do and do not expose.
 */
export type TeamFlowVia = 'assignment.project.planPath' | 'none';

export interface TeamFlowJoin {
  /** Absolute plan folder, when one was reached by DATA. */
  planDir: string | null;
  /** Its basename — `089-first-class-pij`. */
  planFolder: string | null;
  via: TeamFlowVia;
  /** True only when a record carried the link. The flow chip renders on nothing less. */
  confident: boolean;
}

/** The join that means "no plan folder was reached". The default everywhere, today. */
export const NO_TEAM_FLOW: TeamFlowJoin = {
  planDir: null,
  planFolder: null,
  via: 'none',
  confident: false,
};

/** What AC-08's empty-state trichotomy renders. Every field here answers "why is this view empty?". */
export interface PollerStatus {
  /** Is the poller loop running at all? */
  running: boolean;
  /** When the fast (spine) loop last completed. `null` ⇒ it has never run. */
  lastSpinePollAt: string | null;
  /** When the slow (CLI) loop last completed. `null` ⇒ it has never run. */
  lastRecordsPollAt: string | null;
  /** The spine cursor position every snapshot and delta is stamped with. */
  seq: number;
  /** The store was there but unreadable. Distinct from "no seats". */
  lastError: { code: string; message: string; at: string } | null;
  /** The spine log was absent at the last read — a rename window, not a deletion (C-07). */
  spineMissing: boolean;
  /** Torn lines skipped since start. A rising count is a real signal about the store. */
  tornLinesSkipped: number;
  /** Rows currently held. Zero with `running: true` and no error genuinely means "no seats here". */
  fleetSize: number;
}

/** The channel id. One channel for v1, as ruled by the stream prime. */
export const PIJ_CHANNEL = 'pij';

/** JC-1 consumed status subset. Unknown producer fields are intentionally not required. */
export interface PijStatusRecord {
  peer: PijId;
  prev: string;
  next: string;
  ts: string;
  seq: number;
  project?: string;
}

/**
 * The `pij` channel vocabulary.
 *
 * Every event carries the spine `seq` it reflects, so the browser can subscribe BEFORE fetching a
 * snapshot, buffer what arrives, and drop deltas with `seq <=` the snapshot's — the ordering contract
 * Phase 2 depends on.
 *
 * `fleet-delta` carries **full rows**, not patches. That is what makes AC-03's never-re-derive rule
 * enforceable: the client has no field-level merge logic in which to invent a value.
 */
export type PijChannelEvent =
  | {
      type: 'fleet-delta';
      seq: number;
      at: string;
      /** Complete replacement rows for every seat that changed. */
      rows: FleetRow[];
      /** Seats no longer present. NOT necessarily dead — they may have migrated to the archive tier. */
      removed: PijId[];
    }
  | {
      type: 'flow-delta';
      seq: number;
      at: string;
      flows: FlowSummary[];
    }
  | {
      type: 'status-delta';
      seq: number;
      at: string;
      statuses: PijStatusRecord[];
    }
  | {
      type: 'poller-status';
      seq: number;
      at: string;
      status: PollerStatus;
    };

/** Narrowing helper for consumers switching on the union. */
export type PijChannelEventType = PijChannelEvent['type'];

/** A snapshot response. Every snapshot is stamped with the cursor seq it was built at. */
export interface PijSnapshot<T> {
  seq: number;
  at: string;
  data: T;
}

/** `/api/pij/fleet` payload. */
export interface FleetSnapshotData {
  /** The workspace this was scoped to, or `null` for the global set. */
  workspace: string | null;
  rows: FleetRow[];
  statuses: PijStatusRecord[];
  status: PollerStatus;
}

/** `/api/pij/tree` payload. */
export interface TreeSnapshotData {
  workspace: string | null;
  roots: PijTreeNode[];
  /**
   * tmux window labels keyed by `windowId` (`@12` → `3:cheetah`), joined at read time so the rail
   * can name the window a seat lives in. Absent when tmux is unreachable — the line simply doesn't
   * render, and nothing else degrades.
   */
  windows?: Record<string, string>;
}

/** `/api/pij/flow` payload. */
export interface FlowSnapshotData {
  workspace: string | null;
  flows: FlowSummary[];
}
