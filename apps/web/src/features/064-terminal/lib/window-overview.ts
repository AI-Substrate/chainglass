/**
 * Which windows the window overview lists, and in what order.
 *
 * Primes are pinned: every prime window is listed first whatever the filter or search says
 * (Jordan, 2026-09-29). Everything else is filtered, searched (name, last line, seat id), and
 * sorted most recently active first; windows never seen working sort last.
 */

import type { TerminalWindow } from '../types';

export type OverviewFilter = 'recent' | 'asking' | 'working' | 'background' | 'all';

export const OVERVIEW_FILTERS: Array<{ key: OverviewFilter; label: string }> = [
  { key: 'recent', label: 'Recent' },
  { key: 'asking', label: 'Asking' },
  { key: 'working', label: 'Working' },
  { key: 'background', label: 'BG jobs' },
  { key: 'all', label: 'All' },
];

/** "Recently active": working now, or last worked within this many seconds. */
export const RECENT_SECONDS = 30 * 60;

export function isWorking(window: TerminalWindow): boolean {
  return window.activeSeconds !== null;
}

export function isAsking(window: TerminalWindow): boolean {
  return !isWorking(window) && window.question;
}

function matchesFilter(window: TerminalWindow, filter: OverviewFilter): boolean {
  switch (filter) {
    case 'recent':
      return (
        isWorking(window) || (window.idleSeconds !== null && window.idleSeconds <= RECENT_SECONDS)
      );
    case 'asking':
      return isAsking(window);
    case 'working':
      return isWorking(window);
    case 'background':
      return window.background !== null;
    case 'all':
      return true;
  }
}

function matchesQuery(window: TerminalWindow, query: string): boolean {
  if (query.length === 0) return true;
  return [window.name, window.lastLine, window.seatId].some((text) =>
    text?.toLowerCase().includes(query)
  );
}

/** Working first, then by seconds since last active; never-seen-active last; then by index. */
function recency(window: TerminalWindow): number {
  if (isWorking(window)) return -1;
  return window.idleSeconds ?? Number.POSITIVE_INFINITY;
}

function byRecency(a: TerminalWindow, b: TerminalWindow): number {
  return recency(a) - recency(b) || a.index - b.index;
}

export function overviewWindows(
  windows: readonly TerminalWindow[],
  filter: OverviewFilter,
  query: string,
  isPrime: (window: TerminalWindow) => boolean
): TerminalWindow[] {
  const needle = query.trim().toLowerCase();
  const primes = windows.filter(isPrime).sort(byRecency);
  const rest = windows
    .filter(
      (window) => !isPrime(window) && matchesFilter(window, filter) && matchesQuery(window, needle)
    )
    .sort(byRecency);
  return [...primes, ...rest];
}
