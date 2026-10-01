'use client';

/**
 * Window overview — the fold-down list under the window strip's ▾ (Jordan, 2026-09-29).
 *
 * One row per tmux window: agent colour, index and name, the pij seat's role, state and status
 * card (drawn by the pij rail's own components), working / asking / idle time, background jobs,
 * and the last line of text on its screen. Filtered to recently active windows by default;
 * prime windows are always listed first, whatever the filter. Clicking a row (or Enter on the
 * highlighted one) selects that window and folds the panel away.
 *
 * Like the prompt drawer, it is absolutely positioned under the header and owns Escape while open.
 */

import { X } from 'lucide-react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  RoleBadge,
  SeatDot,
  StatusSummary,
} from '../../089-first-class-pij/components/pij-rail-view';
import { type WindowSeat, useWindowSeats } from '../hooks/use-window-seats';
import { AGENT_MARK } from '../lib/agent-kind';
import { formatIdle } from '../lib/window-activity';
import {
  OVERVIEW_FILTERS,
  type OverviewFilter,
  isAsking,
  isWorking,
  overviewWindows,
} from '../lib/window-overview';
import type { TerminalWindow } from '../types';

export interface TerminalWindowOverviewProps {
  open: boolean;
  onClose: () => void;
  /** Header height: the panel folds down from the header's bottom edge. */
  topOffset: number;
  windows: TerminalWindow[];
  onSelect?: (windowId: string, windowIndex: number) => void;
  connected: boolean;
  /** The ▾ toggle — a click on it is not a click "outside" (it toggles by itself). */
  toggleRef: RefObject<HTMLElement | null>;
}

function isPrimeSeat(seat: WindowSeat | undefined): boolean {
  return seat?.placement.role.kind === 'known' && seat.placement.role.role === 'prime';
}

export function TerminalWindowOverview({
  open,
  onClose,
  topOffset,
  windows,
  onSelect,
  connected,
  toggleRef,
}: TerminalWindowOverviewProps) {
  const seats = useWindowSeats(open);
  const [filter, setFilter] = useState<OverviewFilter>('recent');
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      overviewWindows(windows, filter, query, (window) =>
        isPrimeSeat(window.seatId ? seats.get(window.seatId) : undefined)
      ),
    [windows, filter, query, seats]
  );
  const highlighted = Math.min(highlight, Math.max(0, rows.length - 1));

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(0);
      return;
    }
    inputRef.current?.focus();
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Stop first so neither the overlay's Escape listener nor xterm sees it.
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', handleKeyDownCapture, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDownCapture, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open, onClose, toggleRef]);

  if (!open) return null;

  const choose = (window: TerminalWindow) => {
    if (!connected) return;
    onSelect?.(window.id, window.index);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      data-testid="terminal-window-overview"
      aria-label="Windows overview"
      className="absolute inset-x-0 z-30 flex max-h-[75%] flex-col rounded-b-xl border-b bg-popover text-popover-foreground shadow-2xl animate-in fade-in-0 slide-in-from-top-2 duration-150"
      style={{ top: `${topOffset}px` }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
        {OVERVIEW_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setHighlight(0);
            }}
            className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent aria-pressed:border-foreground/40 aria-pressed:bg-accent aria-pressed:text-foreground"
          >
            {label}
          </button>
        ))}
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setHighlight(Math.min(highlighted + 1, rows.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlight(Math.max(highlighted - 1, 0));
            } else if (event.key === 'Enter' && rows[highlighted]) {
              event.preventDefault();
              choose(rows[highlighted]);
            }
          }}
          placeholder="Filter by name, text or seat…"
          aria-label="Filter windows"
          className="ml-auto h-7 w-56 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {rows.length} of {windows.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close windows overview"
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">No windows match.</p>
      ) : (
        <ul className="flex-1 overflow-y-auto py-1">
          {rows.map((window, position) => (
            <li key={`${window.id}:${window.index}`}>
              <OverviewRow
                window={window}
                seat={window.seatId ? seats.get(window.seatId) : undefined}
                highlighted={position === highlighted}
                disabled={!connected || !onSelect}
                onChoose={() => choose(window)}
                onHover={() => setHighlight(position)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverviewRow({
  window,
  seat,
  highlighted,
  disabled,
  onChoose,
  onHover,
}: {
  window: TerminalWindow;
  seat: WindowSeat | undefined;
  highlighted: boolean;
  disabled: boolean;
  onChoose: () => void;
  onHover: () => void;
}) {
  const agent = window.agent ? AGENT_MARK[window.agent] : null;
  const working = isWorking(window);
  const asking = isAsking(window);
  const idle = window.idleSeconds !== null ? formatIdle(window.idleSeconds) : null;
  const state = seat?.placement.row?.badge ?? seat?.placement.row?.state;
  const jobs = window.background?.jobs ?? [];

  return (
    <button
      type="button"
      onClick={onChoose}
      onMouseEnter={onHover}
      disabled={disabled}
      aria-current={window.active ? 'true' : undefined}
      className={`flex w-full gap-2 px-3 py-1.5 text-left disabled:cursor-not-allowed ${highlighted ? 'bg-accent' : ''}`}
    >
      <span
        aria-hidden="true"
        className="w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: agent?.color ?? 'transparent' }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className="w-5 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
            {window.index}
          </span>
          <span className={`truncate font-medium ${window.active ? 'underline' : ''}`}>
            {window.name}
          </span>
          {seat ? <RoleBadge role={seat.placement.role} /> : null}
          {seat ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
              <SeatDot placement={seat.placement} />
              {state}
            </span>
          ) : null}
          {window.seatId ? (
            <span className="truncate font-mono text-[10px] text-muted-foreground/70">
              {window.seatId}
            </span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums">
            {jobs.length > 0 ? (
              <span
                className="text-muted-foreground"
                title={jobs.map((job) => job.label).join('\n')}
              >
                ▮ {jobs[0].label} {Math.round(jobs[0].cpu * 100)}%
                {jobs.length > 1 ? ` +${jobs.length - 1}` : ''}
              </span>
            ) : null}
            {working ? (
              <span className="rounded bg-emerald-500 px-1 text-white">
                working {formatIdle(window.activeSeconds ?? 0)}
              </span>
            ) : asking ? (
              <span className="rounded bg-fuchsia-500 px-1 text-white">
                ? asking{idle ? ` ${idle}` : ''}
              </span>
            ) : idle ? (
              <span className="text-muted-foreground">idle {idle}</span>
            ) : null}
          </span>
        </span>
        {window.lastLine ? (
          <span
            className="line-clamp-2 break-words pl-6.5 text-[11px] text-muted-foreground"
            title={window.lastLine}
          >
            {window.lastLine}
          </span>
        ) : null}
        {seat ? (
          <span className="-ml-1.5 block">
            <StatusSummary placement={seat.placement} status={seat.status} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
