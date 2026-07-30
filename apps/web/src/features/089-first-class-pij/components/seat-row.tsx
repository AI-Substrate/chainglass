/**
 * One seat — Plan 089 Phase 2 (T003, T005).
 *
 * The columns are the ratified POC's: seat · observed · model · effort · flags · last event. Three
 * things about what is *not* here:
 *
 * - **No pid, no pane id.** Not hidden — absent. `FleetRow` cannot carry them (C-03), so there is no
 *   field to leak, and the tree renderer that does see them strips them explicitly.
 * - **No re-derived badge.** `badge` is a worst-first derivation across two state vocabularies that
 *   only pij computes. Since Phase 4 the poller's `pij list --json --badge` supplies it for every row,
 *   so in practice it is nearly always present — but the absence rendering stays, because the flag is
 *   a request and not a guarantee, and a row that arrives without one must say nothing rather than
 *   synthesise a badge from whatever fields are present. A synthetic badge drifts from pij exactly
 *   when an open assignment carries the worse state, which is exactly when it matters (AC-03).
 * - **No verdicts.** The observed column shows the daemon's own word. The one exception is the POC's
 *   ratified relabel of `stalled`, which is a verdict about a human's work rather than an
 *   observation, and is shown as the observation underneath it: how long the seat has been quiet.
 */
'use client';

import { useEffect, useState } from 'react';
import { useSeatFocus } from '../hooks/use-seat-focus';
import { type SeatPlacement, seatTask } from '../lib/fleet-grouping';
import { isFolderInWorkspacePath } from '../lib/folder-containment';
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
      {/* Rendered verbatim, never re-derived. Absence is information, so it is left blank. */}
      {row.badge ? (
        <span
          data-testid={`seat-badge-${placement.id}`}
          className="rounded-full border border-border px-1.5 text-[10px] text-muted-foreground"
        >
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

/**
 * The focus button — the ONLY thing in this feature that can reach the mutating route (C-06).
 *
 * Three states, and the middle one is the interesting one:
 *
 * - **Absent** where there is no provider (the global fleet list), because there is no workspace to
 *   check containment against and therefore no honest button to offer.
 * - **Disabled** for a seat whose folder is outside this workspace. Disabled rather than hidden: the
 *   seat is visible in the list, so silently omitting its button would read as a rendering gap. The
 *   title says which directory it actually works in.
 * - **Enabled** otherwise — and even then the server checks containment again, because the client's
 *   copy of `folder` is as old as the last snapshot.
 */
export function FocusButton({ placement }: { placement: SeatPlacement }) {
  const affordance = useSeatFocusAffordance(placement);
  if (!affordance.available) return null;

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        data-testid={`focus-seat-${placement.id}`}
        disabled={!affordance.inWorkspace || affordance.busy}
        title={affordance.title}
        onClick={() => affordance.focus.focus(placement.id)}
        className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        {affordance.busy ? 'focusing…' : 'focus'}
      </button>
      <FocusResult placement={placement} />
    </span>
  );
}

export function useSeatFocusAffordance(placement: SeatPlacement) {
  const focus = useSeatFocus();
  const folder = placement.row?.folder ?? placement.node?.folder ?? '';
  // The tree decides membership, not the path: git places a worktree BESIDE its checkout, so a
  // family seat can be outside the workspace by path while its window is exactly the one the human
  // is trying to reach. A placement with a tree node was placed by the workspace-scoped tree read;
  // path containment stays as the rung for seats too new for that read. The server re-derives the
  // same two rungs on click, so this enable is an affordance, never the authority.
  const inWorkspace = focus
    ? placement.node !== undefined || isFolderInWorkspacePath(folder, focus.workspacePath)
    : false;
  const busy = focus?.pending === placement.id;

  if (!focus) {
    return {
      available: false as const,
      focus: null,
      inWorkspace,
      busy,
      title: `seat works in ${folder || '(no folder on record)'}, outside this workspace`,
    };
  }

  return {
    available: true as const,
    focus,
    inWorkspace,
    busy,
    title: inWorkspace
      ? 'Bring this seat’s window to the front'
      : `seat works in ${folder || '(no folder on record)'}, outside this workspace`,
  };
}

/**
 * How long a SUCCESS receipt stays on screen. The window moved — the receipt has nothing left to
 * say, and "focused @17" lingering forever read as a mystery label (Jordan, 2026-07-30). Refusals
 * never expire: they explain a click that did nothing, which stays true until the next click.
 *
 * The timer lives HERE, in the display component, and not in `use-seat-focus.tsx` — the C-06 client
 * audit statically bans every self-firing construct from the file that owns the focus fetch, and a
 * display expiry is not worth a hole in that fence.
 */
export const FOCUS_SUCCESS_LINGER_MS = 4_000;

export function FocusResult({
  placement,
  testIdPrefix = 'focus-result',
}: {
  placement: SeatPlacement;
  testIdPrefix?: string;
}) {
  const focus = useSeatFocus();
  const outcome = focus?.outcomes[placement.id];
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(false);
    if (!outcome?.focused) return;
    const timer = setTimeout(() => setExpired(true), FOCUS_SUCCESS_LINGER_MS);
    return () => clearTimeout(timer);
  }, [outcome]);

  if (!outcome || (outcome.focused && expired)) return null;

  return (
    <span
      data-testid={`${testIdPrefix}-${placement.id}`}
      data-reason={outcome.focused ? 'focused' : (outcome.reason ?? 'failed')}
      className={`max-w-[220px] text-right text-[10px] ${outcome.focused ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}`}
    >
      {outcome.observation}
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
      <div className="flex flex-col items-end gap-0.5">
        <Freshness at={row?.lastEventAt} now={now} />
        {row?.contextCurrent ? (
          <span className="text-[10px] text-muted-foreground">
            <ContextGauge row={row} />
          </span>
        ) : null}
        {/* Stacked here rather than given its own column: the column headings are shared with the
            global list, which has no focus affordance, and a "focus" heading over empty cells there
            would advertise something the page cannot do. */}
        <FocusButton placement={placement} />
      </div>
    </div>
  );
}
