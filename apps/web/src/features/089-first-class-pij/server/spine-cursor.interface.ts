/**
 * Spine cursor contract — Plan 089 Phase 1 (T003).
 *
 * `~/.pij/spine/events.ndjson` is the one pij path ruled **public and stable** for external readers
 * (`pij-platform.md` § Path stability): append-only, schema-versioned per line, open-vocabulary by
 * design, and cheap (<0.01s vs ~0.45s for a CLI invocation). Everything else — individual record
 * paths, directory scans of the registry — is explicitly NOT stable and goes through the CLI.
 *
 * Interface-first per the constitution: this file is the contract; `spine-cursor.ts` is one adapter.
 */

/**
 * One line of the spine log.
 *
 * Deliberately **open**: `kind` is a `string`, not a union (WS-5 — external writers may mint kinds,
 * and discovery observed an undocumented daemon kind in live data on 2026-07-26), and the index
 * signature keeps additive fields alive through the reader rather than silently dropping them.
 */
export interface SpineEvent {
  schema_version: number;
  /** Allocated by the log at append; cross-process atomic and strictly increasing. */
  seq: number;
  ts: string;
  /** Who wrote it — every spine write is attributed. */
  actor: string;
  /** OPEN VOCABULARY. Never switch exhaustively on this; never drop an unrecognised value. */
  kind: string;
  /** Structured `type:value` refs (`node:<id>`, `assignment:<id>`, `state:<word>`, …). */
  refs: string[];
  peer?: string;
  project?: string;
  repo?: string;
  /** The transition this event records; the payload's meaning depends on `kind`. */
  prev?: string;
  /** Absent (never `null`) on a `--root` link. */
  next?: string;
  actorProvenance?: string;
  verifiedBy?: string;
  [additive: string]: unknown;
}

/** The outcome of one incremental read. */
export interface SpineReadResult {
  /** Events with `seq >` the cursor's previous position, in file order. */
  events: SpineEvent[];
  /** The cursor position after this read. */
  seq: number;
  /**
   * Torn/corrupt lines skipped during this read. Surfaced rather than swallowed: a rising count is
   * a real signal about the store, and `pij-platform.md` requires the skip.
   */
  skipped: number;
  /**
   * True when the log (or its directory) was not there. This is the documented rename/tier-migration
   * window — **not** a deletion and **not** an error (C-07).
   */
  missing: boolean;
  /** ISO-8601 stamp of when the read happened, for the freshness axis. */
  readAt: string;
}

/**
 * An incremental, exclusive cursor over the spine log.
 *
 * The `--since` semantic is **exclusive** (`seq > since`) — proved in both directions against the
 * live store during discovery and restated as C-08. An inclusive cursor replays the tip on every
 * tick, forever.
 */
export interface ISpineCursor {
  /** Highest seq delivered so far. Persist this to resume across a reader restart. */
  readonly seq: number;
  /** Read everything appended since `seq`, advancing the cursor. Never throws on a missing store. */
  read(): Promise<SpineReadResult>;
}
