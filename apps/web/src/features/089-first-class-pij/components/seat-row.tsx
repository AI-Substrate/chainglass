/**
 * One seat — Plan 089 Phase 2 (T003, T005).
 *
 * The columns are the ratified POC's: seat · observed · model · effort · flags · last event. Three
 * things about what is *not* here:
 *
 * - **No pid, no pane id.** Not hidden — absent. `FleetRow` cannot carry them (C-03), so there is no
 *   field to leak, and the tree renderer that does see them strips them explicitly.
 * - **No re-derived badge.** `badge` is a worst-first derivation across two state vocabularies that
 *   only `pij node show` computes. When it is absent the row says nothing rather than synthesising
 *   one from the fields that happen to be present — a synthetic badge drifts from pij exactly when an
 *   open assignment carries the worse state, which is exactly when it matters (AC-03).
 * - **No verdicts.** The observed column shows the daemon's own word. The one exception is the POC's
 *   ratified relabel of `stalled`, which is a verdict about a human's work rather than an
 *   observation, and is shown as the observation underneath it: how long the seat has been quiet.
 */
'use client';

import { type SeatPlacement, seatTask } from '../lib/fleet-grouping';
import { formatElapsed } from '../lib/relative-time';
import { ContextGauge, Freshness, Provenance } from './freshness';
import { RoleChip, seatRole } from './role-chip';

/** The daemon word we do not print. See the module docs. */
const VERDICT_WORD = 'stalled';

const STATE_DOT: Record<string, string> = {
  working: 'bg-emerald-600',
  idle: 'bg-muted-foreground',
  quiet: 'bg-amber-500',
  starting: 'bg-blue-600',
  stopped: 'bg-muted-foreground/40 border border-muted-foreground',
  dead: 'bg-muted-foreground/40 border border-muted-foreground',
};

export function ObservedState({ placement, now }: { placement: SeatPlacement; now: number }) {
  const row = placement.row;
  if (!row?.state) {
    return <span className="text-xs text-muted-foreground">not read yet</span>;
  }

  const isVerdict = row.state === VERDICT_WORD;
  const label = isVerdict
    ? `quiet ${formatElapsed(row.lastEventAt, now).replace(' ago', '')}`
    : row.state;
  const dot = STATE_DOT[isVerdict ? 'quiet' : row.state] ?? 'bg-muted-foreground';

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span className={`inline-block size-2 rounded-full ${dot}`} aria-hidden="true" />
      <span>{label}</span>
      {row.liveness ? (
        <span className="text-[11px] text-muted-foreground">· {row.liveness}</span>
      ) : null}
      {/* Present only when a `node show` has happened. Absence is information, so it is left blank. */}
      {row.badge ? (
        <span className="rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
          {row.badge}
        </span>
      ) : null}
    </span>
  );
}

function Flags({ placement }: { placement: SeatPlacement }) {
  const row = placement.row;
  const flags: string[] = [];
  if (row?.unadopted || placement.node?.unadopted) flags.push('unadopted');
  if (row?.degraded) flags.push('degraded');
  if (row?.bindHealth && row.bindHealth !== 'ok') flags.push(row.bindHealth);
  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded-full border border-red-500/40 px-1.5 text-[10px] text-red-700 dark:text-red-400"
        >
          {flag}
        </span>
      ))}
    </span>
  );
}

/** The column headings, kept beside the row that fills them so the two cannot drift. */
export function SeatRowHeader() {
  return (
    <div className="grid grid-cols-[minmax(180px,1.4fr)_150px_minmax(140px,1fr)_100px_110px_90px] gap-2 border-b border-border px-3.5 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
      <div>seat</div>
      <div>observed</div>
      <div>model</div>
      <div>effort</div>
      <div>flags</div>
      <div className="text-right">last event</div>
    </div>
  );
}

export function SeatRow({ placement, now }: { placement: SeatPlacement; now: number }) {
  const row = placement.row;
  const task = seatTask(placement);
  const indent = placement.depth * 16;

  return (
    <div
      data-testid={`seat-row-${placement.id}`}
      data-seat-id={placement.id}
      className="grid grid-cols-[minmax(180px,1.4fr)_150px_minmax(140px,1fr)_100px_110px_90px] items-baseline gap-2 border-b border-border/60 px-3.5 py-1.5 last:border-b-0 hover:bg-muted/50"
    >
      <div style={{ paddingLeft: indent }}>
        <div className="flex items-center gap-1.5">
          {placement.depth > 0 && <span className="text-muted-foreground/60">└</span>}
          <span className="font-mono text-xs">{placement.id}</span>
          <RoleChip role={seatRole({ node: placement.node, row })} />
          {!row && (
            <span
              className="text-[10px] text-muted-foreground"
              title="in the tree, not in the current fleet snapshot"
            >
              no row yet
            </span>
          )}
        </div>
        {row?.currentTask ? (
          <div
            className="mt-0.5 truncate text-[11px] text-muted-foreground"
            title={row.currentTask}
          >
            {row.currentTask}
          </div>
        ) : null}
      </div>
      <div>
        <ObservedState placement={placement} now={now} />
      </div>
      <div>
        {/* `boundModel` is what the seat is running once a harness event has confirmed it, and what it
            was ASKED to run before that. `bindHealth === 'ok'` is the confirmation. */}
        <Provenance value={row?.boundModel ?? null} observed={row?.bindHealth === 'ok'} />
      </div>
      <div>
        <Provenance value={row?.effort ?? null} observed={false} absentLabel="—" />
      </div>
      <div>
        <Flags placement={placement} />
      </div>
      <div className="flex flex-col items-end">
        <Freshness at={row?.lastEventAt} now={now} />
        {row?.contextCurrent ? (
          <span className="text-[10px] text-muted-foreground">
            <ContextGauge row={row} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
