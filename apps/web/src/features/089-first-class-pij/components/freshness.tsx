/**
 * Freshness and provenance — Plan 089 Phase 2 (T005).
 *
 * Three small components with one job between them: never let the page imply it knows something it
 * does not.
 *
 * - **`Freshness`** states when a seat was last heard from. It never characterises the gap (C-05
 *   doctrine: observations, never verdicts) — "last heard 6m ago" is a fact; "stalled" is a guess
 *   about someone else's work.
 * - **`Provenance`** distinguishes *pinned* from *observed*. `boundModel` and `effort` start life as
 *   what the seat was asked for, and only become what it is actually running once a harness event
 *   confirms it. A UI that prints them identically is quietly asserting the confirmation happened.
 * - **`StalenessBanner`** says the whole page is old. The poller's slow loop carries the freshness
 *   axis and the gauges; if it has not completed recently, every relative time below is understated,
 *   and the honest response is to say so once, loudly, rather than to redraw stale numbers.
 */
'use client';

import { NO_TIMESTAMP, formatElapsed, formatLastHeard } from '../lib/relative-time';
import type { FleetRow, PollerStatus } from '../types';

/** The slow loop's cadence. Kept in step with `SLOW_LOOP_MS` in the poller service. */
export const SLOW_LOOP_MS = 8_000;

/**
 * How far behind the slow loop may fall before the page says so. Three missed loops: one is a slow
 * `pij list` (~0.45s of process spawn, occasionally much worse under load), three is a pattern.
 */
export const STALE_AFTER_MS = SLOW_LOOP_MS * 3;

export function Freshness({
  at,
  now,
  className,
}: {
  at: string | null | undefined;
  now: number;
  className?: string;
}) {
  return (
    <span
      className={className ?? 'text-xs text-muted-foreground whitespace-nowrap'}
      title={at ?? undefined}
    >
      {formatElapsed(at, now)}
    </span>
  );
}

/**
 * A bound value plus how we know it.
 *
 * `observed` is only ever true where the record itself attests it. Nothing here infers observation
 * from the mere presence of a value.
 */
export function Provenance({
  value,
  observed,
  absentLabel = 'not yet observed',
}: {
  value: string | null | undefined;
  observed: boolean;
  absentLabel?: string;
}) {
  if (!value) return <span className="text-xs text-muted-foreground">{absentLabel}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs">{value}</span>
      <span
        className={
          observed
            ? 'rounded-full border border-emerald-600/40 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-400'
            : 'rounded-full border border-amber-600/40 px-1.5 text-[10px] text-amber-700 dark:text-amber-500'
        }
      >
        {observed ? 'observed' : 'pinned'}
      </span>
    </span>
  );
}

/**
 * The context gauge.
 *
 * `contextCurrent.value` is a real token count **or the literal string `'unknown'`** — the pij record
 * says so, and the distinction is the whole point of C-05. Rendering `unknown` as `0` would turn "we
 * could not read the transcript" into "this seat has used no context", which is the most confidently
 * wrong number this page could print.
 */
export function ContextGauge({ row }: { row: FleetRow }) {
  const current = row.contextCurrent;
  if (!current) return <span className="text-xs text-muted-foreground">{NO_TIMESTAMP}</span>;

  if (current.value === 'unknown') {
    return (
      <span className="text-xs text-muted-foreground" title={current.provenance ?? undefined}>
        unknown
      </span>
    );
  }

  const max = row.contextMax;
  const percent =
    typeof max === 'number' && max > 0 ? Math.round((current.value / max) * 100) : null;
  return (
    <span className="font-mono text-xs" title={current.provenance ?? undefined}>
      {current.value.toLocaleString()}
      {percent === null ? '' : ` · ${percent}%`}
    </span>
  );
}

/** Has the slow loop fallen far enough behind that every time on this page is understated? */
export function isRecordsPollStale(status: PollerStatus | null, now: number): boolean {
  if (!status) return false;
  if (!status.running) return true;
  if (!status.lastRecordsPollAt) return true;
  const at = Date.parse(status.lastRecordsPollAt);
  if (Number.isNaN(at)) return false;
  return now - at > STALE_AFTER_MS;
}

/**
 * The page-level "this is old" notice.
 *
 * Deliberately says what is old and how old — not "error". A stale read is still a read, and the rows
 * below it are still the last thing that was true.
 */
export function StalenessBanner({ status, now }: { status: PollerStatus | null; now: number }) {
  if (!isRecordsPollStale(status, now)) return null;

  const lastPoll = status?.lastRecordsPollAt ?? null;
  return (
    <output
      data-testid="pij-staleness-banner"
      className="mb-3 inline-block rounded-md border border-amber-500/40 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      {status?.running === false
        ? 'The pij reader is not running. '
        : 'The pij reader has not completed a record poll recently. '}
      {lastPoll
        ? `Everything below is as of ${formatLastHeard(lastPoll, now).replace('last heard ', '')}.`
        : 'It has not completed one at all yet, so no seat data has arrived.'}
    </output>
  );
}
