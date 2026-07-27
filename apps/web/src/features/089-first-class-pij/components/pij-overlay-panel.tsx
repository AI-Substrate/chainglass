/**
 * pij overlay panel — Plan 089 Phase 4 (T003).
 *
 * The quick-glance surface: a condensed seat list for the current workspace, over whatever the user
 * is doing. Geometry copied from `pr-view-overlay-panel.tsx` line for line — anchor measurement via
 * `ResizeObserver` on `[data-terminal-overlay-anchor]`, `zIndex: 44`, `hasOpened` lazy guard,
 * `display: none` rather than unmount so state survives a close, Escape to close.
 *
 * **`zIndex: 44` is the same as the terminal's, not higher.** "Over" is established by opening later
 * plus the `overlay:close-all` mutual exclusion, not by a z-index race. A higher number here would
 * win the wrong argument and put pij permanently above a terminal the user is typing into.
 *
 * **Structure, not a second implementation** (Jordan's ruling 2026-07-27, superseding this panel's
 * original flat-list design). The panel shows the same prime → section → seat shape as the page,
 * because "what is my fleet doing" is unanswerable without knowing who governs whom. The duplication
 * the flat design was avoiding is avoided a better way: `groupFleet` is imported, not reimplemented —
 * ONE grouping, two presentations. This one is denser, drops the meta lines, and never scrolls the
 * page's stage strips into a space this narrow.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePijFleet } from '../hooks/use-pij-fleet';
import { usePijOverlay } from '../hooks/use-pij-overlay';
import { type SeatPlacement, groupFleet, seatTask } from '../lib/fleet-grouping';
import { formatElapsed } from '../lib/relative-time';
import { RoleChip, seatRole } from './role-chip';

/** The dot vocabulary is the seat row's — the same daemon word must not look different here. */
const STATE_DOT: Record<string, string> = {
  working: 'bg-emerald-600',
  idle: 'bg-muted-foreground',
  stalled: 'bg-amber-500',
  starting: 'bg-blue-600',
  stopped: 'bg-muted-foreground/40 border border-muted-foreground',
  dead: 'bg-muted-foreground/40 border border-muted-foreground',
};

/**
 * One seat line. `depth` is the grouping's own nesting, so the indent is a record of structure
 * rather than a guess from ids. The testid is unchanged from the flat design — a seat is still
 * addressable by id, which is what the overlay's tests and any future focus action key on.
 */
function OverlaySeat({ placement, now }: { placement: SeatPlacement; now: number }) {
  const { row, node, depth } = placement;
  const task = seatTask(placement);
  return (
    <div
      data-testid={`pij-overlay-row-${placement.id}`}
      className="flex items-center gap-1.5 border-b border-border/40 px-3 py-1 text-[12px] last:border-b-0"
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
      <span
        className={`inline-block size-2 shrink-0 rounded-full ${STATE_DOT[row?.state ?? ''] ?? 'bg-muted-foreground'}`}
        aria-hidden="true"
      />
      <span className="shrink-0 truncate font-mono text-[11.5px]">{placement.id}</span>
      <RoleChip role={seatRole({ node, row })} />
      {/* Rendered verbatim, never re-derived (AC-03); absent means absent. */}
      {row?.badge ? (
        <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
          {row.badge}
        </span>
      ) : null}
      {/* What it is doing — the reason this panel gained structure. Absent stays visibly absent. */}
      <span
        className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
        title={task ?? undefined}
      >
        {task ?? <span className="italic opacity-60">no assignment on record</span>}
      </span>
      <span className="shrink-0 text-[10.5px] text-muted-foreground">
        {formatElapsed(row?.lastEventAt, now)}
      </span>
    </div>
  );
}

function PijOverlayContent({
  workspacePath,
  fetchImpl,
}: {
  workspacePath: string;
  fetchImpl?: typeof fetch;
}) {
  const { rows, tree, status, phase, errors } = usePijFleet({ workspacePath, fetchImpl });
  const [now, setNow] = useState(() => Date.now());

  // The freshness column is the point of this panel, so it ticks — on the same 5s cadence the page
  // uses. It moves nothing else: no refetch, no request.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  // Same grouping the page draws, same idle window. Recomputed only when a read or the tick moves.
  const grouping = useMemo(
    () => groupFleet({ rows, tree, now, idleFilter: true }),
    [rows, tree, now]
  );

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[13px] font-medium">pij fleet</span>
        <span className="text-[11px] text-muted-foreground" data-testid="pij-overlay-count">
          {rows.length} seat{rows.length === 1 ? '' : 's'} in this workspace
        </span>
        <span className="flex-1" />
        <span
          className="text-[11px] text-muted-foreground"
          data-testid="pij-overlay-phase"
          data-phase={phase}
        >
          {phase}
        </span>
      </div>

      {errors.fleet ? (
        // A read failure is a rendered state, never an empty list: an empty list here would read as
        // "no seats", which is a different and false claim.
        <div
          className="px-3 py-3 text-[12px] text-amber-700 dark:text-amber-400"
          data-testid="pij-overlay-error"
        >
          {errors.fleet}
        </div>
      ) : rows.length === 0 ? (
        <div
          className="px-3 py-3 text-[12px] text-muted-foreground"
          data-testid="pij-overlay-empty"
        >
          {status?.running === false
            ? 'The pij poller is not running, so no seats have been read yet.'
            : 'No pij seats are working in this workspace.'}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {grouping.primes.map((shell) => (
            <div key={shell.lead.id} data-testid={`pij-overlay-prime-${shell.lead.id}`}>
              <div className="flex items-center gap-1.5 border-b border-border bg-violet-50/60 px-3 py-1 dark:bg-violet-950/20">
                <span className="truncate font-mono text-[11.5px] font-medium">
                  {shell.lead.id}
                </span>
                <RoleChip role={seatRole({ node: shell.lead.node, row: shell.lead.row })} />
                <span className="flex-1" />
                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                  {shell.sections.length} section{shell.sections.length === 1 ? '' : 's'} ·{' '}
                  {shell.seatCount} seat{shell.seatCount === 1 ? '' : 's'}
                </span>
              </div>
              {shell.sections.map((section) => (
                <div key={section.lead.id} className="border-b border-border/60 last:border-b-0">
                  <OverlaySeat placement={section.lead} now={now} />
                  {section.members.map((member) => (
                    <OverlaySeat key={member.id} placement={member} now={now} />
                  ))}
                </div>
              ))}
            </div>
          ))}

          {grouping.loose.length > 0 ? (
            <div data-testid="pij-overlay-loose">
              <div className="border-b border-border bg-muted/40 px-3 py-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                Outside any prime
              </div>
              {grouping.loose.map((section) => (
                <div key={section.lead.id}>
                  <OverlaySeat placement={section.lead} now={now} />
                  {section.members.map((member) => (
                    <OverlaySeat key={member.id} placement={member} now={now} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {/* Hidden-by-filter is reported, never silently dropped — same rule as the page. */}
          {grouping.hiddenByIdle > 0 ? (
            <div
              className="px-3 py-1.5 text-[10.5px] text-muted-foreground"
              data-testid="pij-overlay-hidden"
            >
              {grouping.hiddenByIdle} seat{grouping.hiddenByIdle === 1 ? '' : 's'} idle beyond 48h,
              hidden
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

/** `fetchImpl` is the test seam, mirroring `PijPageClient`'s. Production passes nothing. */
export function PijOverlayPanel({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  const { isOpen, workspacePath, closePij } = usePijOverlay();

  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  const measureRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const measure = () => {
      const anchor = document.querySelector('[data-terminal-overlay-anchor]');
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        setAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }
    };
    measureRef.current = measure;
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    const anchor = document.querySelector('[data-terminal-overlay-anchor]');
    if (anchor) observer.observe(anchor);
    const timer = setTimeout(measure, 200);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (isOpen) measureRef.current?.();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePij();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closePij]);

  if (!hasOpened) return null;

  return (
    <div
      className="fixed flex flex-col border-l bg-background shadow-2xl"
      style={{
        zIndex: 44,
        top: `${anchorRect.top}px`,
        left: `${anchorRect.left}px`,
        width: `${anchorRect.width}px`,
        height: `${anchorRect.height}px`,
        display: isOpen ? 'flex' : 'none',
      }}
      data-testid="pij-overlay-panel"
    >
      {/* Children unmount when closed so the closed overlay holds no SSE subscription open. The
          OPEN/CLOSED flag itself lives in the provider, which is why closing here loses nothing. */}
      {isOpen && workspacePath ? (
        <PijOverlayContent workspacePath={workspacePath} fetchImpl={fetchImpl} />
      ) : null}
    </div>
  );
}
