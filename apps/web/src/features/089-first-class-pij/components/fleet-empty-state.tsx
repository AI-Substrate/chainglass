/**
 * Why is this view empty? — Plan 089 Phase 2 (T004).
 *
 * Five states, and they must never look alike. An empty fleet page has five completely different
 * causes, four of which are somebody's problem to fix; collapsing them into one grey "no data"
 * message is the confident lie this whole plan is written against.
 *
 *   1. **`empty`** — the store is readable, the reader is live, and there are genuinely no seats
 *      anywhere. Nothing is wrong.
 *   2. **`filtered`** — seats exist (`fleetSize > 0`) but none matched this workspace. Because the
 *      containment key is a filesystem path, the *plausible* cause is a mismatch — a trailing slash, a
 *      symlink, a case difference — so the path being matched is printed. This state is the cost of
 *      the one-shared-channel ruling made visible instead of absorbed.
 *   3. **`all-idle`** — seats matched, and the 48h idle filter is hiding every one of them. The near
 *      neighbour of `filtered` and its exact opposite in meaning: `filtered` says "none of these seats
 *      is yours", `all-idle` says "all of them are yours and you asked not to see them". Reporting the
 *      second as the first sends a human hunting a path mismatch that does not exist.
 *   4. **`stale`** — the reader is not running, or has not completed a record poll recently. The store
 *      may be perfectly fine; the server-side reader is not.
 *   5. **`unreadable`** — the read itself failed. The pij `E-` code is shown verbatim, because it is
 *      the one string that makes the failure diagnosable.
 *
 * Two counts reach this component and they answer different questions. `visibleCount` is what is on
 * screen and decides *whether* to say anything at all; `rowCount` is the scoped snapshot before the
 * idle filter and decides *what* to say. Neither is ever `fleetSize`: that is the GLOBAL count, 178 on
 * this machine while a given workspace holds none.
 */
'use client';

import { IDLE_WINDOW_MS } from '../lib/fleet-grouping';
import type { PollerStatus } from '../types';
import { isRecordsPollStale } from './freshness';

export type FleetEmptyReason = 'empty' | 'filtered' | 'all-idle' | 'stale' | 'unreadable';

/** The idle window as the copy states it: "48h". Derived, so the two can never drift apart. */
const IDLE_WINDOW_LABEL = `${IDLE_WINDOW_MS / (60 * 60 * 1000)}h`;

export interface FleetEmptyStateProps {
  /** Seats actually drawn, after the idle filter. Zero means the list area is blank. */
  visibleCount: number;
  /** Rows in the scoped snapshot BEFORE the idle filter — the honest "are there seats here?" count. */
  rowCount: number;
  /** Global scope applies no workspace filter, so it has no standing to report one. */
  scope: 'workspace' | 'global';
  status: PollerStatus | null;
  /** The absolute path being matched — printed in the `filtered` state so a mismatch is visible. */
  workspacePath: string;
  now: number;
  /** A non-2xx from the fleet route, already formatted with its `E-` code. */
  fetchError?: string | null;
}

/**
 * Which of the five states applies.
 *
 * Order is deliberate: a failed read outranks a stale one; a stale reader outranks any claim about
 * what the fleet contains, because a stale reader's counts are not evidence of anything; and having
 * seats outranks the workspace filter, because a workspace that HAS seats can never be one that
 * matched none.
 *
 * In global scope `filtered` is unreachable by construction — `rowCount` and `fleetSize` come from the
 * same unscoped read there, so a zero row count means a zero fleet and `empty` is the true statement.
 */
export function fleetEmptyReason(props: FleetEmptyStateProps): FleetEmptyReason | null {
  if (props.visibleCount > 0) return null;
  if (props.fetchError || props.status?.lastError) return 'unreadable';
  if (!props.status || isRecordsPollStale(props.status, props.now)) return 'stale';
  if (props.rowCount > 0) return 'all-idle';
  if (props.scope === 'workspace' && props.status.fleetSize > 0) return 'filtered';
  return 'empty';
}

const CARD = 'rounded-lg border p-4 text-sm';

export function FleetEmptyState(props: FleetEmptyStateProps) {
  const reason = fleetEmptyReason(props);
  if (!reason) return null;

  if (reason === 'unreadable') {
    const code = props.status?.lastError?.code ?? null;
    const message = props.status?.lastError?.message ?? props.fetchError ?? '';
    return (
      <div
        data-testid="fleet-empty-unreadable"
        data-reason={reason}
        className={`${CARD} border-red-500/40 bg-red-50/60 dark:bg-red-950/20`}
      >
        <h4 className="mb-1 font-medium">◎ Store unreadable</h4>
        <p className="text-muted-foreground">
          Reading the pij store failed{code ? ' with ' : ''}
          {code ? <span className="font-mono text-foreground">{code}</span> : null}. This is a read
          failure, not an empty fleet — the seats below (if any) are the last thing that was true.
        </p>
        {message ? <p className="mt-1 font-mono text-xs text-muted-foreground">{message}</p> : null}
      </div>
    );
  }

  if (reason === 'stale') {
    return (
      <div
        data-testid="fleet-empty-stale"
        data-reason={reason}
        className={`${CARD} border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20`}
      >
        <h4 className="mb-1 font-medium">◍ The pij reader is not keeping up</h4>
        <p className="text-muted-foreground">
          {props.status?.running === false
            ? 'The server-side reader is not running, so no seat data is arriving.'
            : 'The reader has not completed a record poll recently, so this view may be missing seats.'}{' '}
          The store itself may be perfectly healthy — this is about the reader.
        </p>
      </div>
    );
  }

  if (reason === 'all-idle') {
    return (
      <div
        data-testid="fleet-empty-all-idle"
        data-reason={reason}
        className={`${CARD} border-border bg-card`}
      >
        <h4 className="mb-1 font-medium">◌ Every seat here is idle</h4>
        <p className="text-muted-foreground">
          {props.rowCount} seat{props.rowCount === 1 ? '' : 's'} in this view, and every one of them
          was last heard from more than {IDLE_WINDOW_LABEL} ago — the idle filter is hiding them.
          They are still in the fleet; nothing is missing and nothing failed.
        </p>
      </div>
    );
  }

  if (reason === 'filtered') {
    const elsewhere = props.status?.fleetSize ?? 0;
    return (
      <div
        data-testid="fleet-empty-filtered"
        data-reason={reason}
        className={`${CARD} border-border bg-card`}
      >
        <h4 className="mb-1 font-medium">◌ No seats matched this workspace</h4>
        <p className="text-muted-foreground">
          {elsewhere} seat{elsewhere === 1 ? '' : 's'} live elsewhere on this machine, and none of
          them is inside the path being matched:
        </p>
        <p className="mt-1 break-all font-mono text-xs text-foreground">{props.workspacePath}</p>
        <p className="mt-1 text-muted-foreground">
          If seats should be here, compare that path with the seat&apos;s own folder — a trailing
          slash, a symlinked path or a case difference is a real mismatch, not a near miss.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="fleet-empty-none"
      data-reason={reason}
      className={`${CARD} border-border bg-card`}
    >
      <h4 className="mb-1 font-medium">◌ No seats here</h4>
      <p className="text-muted-foreground">
        The store is readable and the reader is live — there are simply no pij seats on this machine
        yet. Spawn one and it appears within a poll.
      </p>
    </div>
  );
}
