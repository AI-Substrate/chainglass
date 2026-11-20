'use client';

/**
 * Window recency heat: the order in which this browser visited each tmux window. The window
 * strip draws a thin bar along each button's top edge in RECENCY_STEPS distinct strengths:
 * the active window is strongest, the one visited before it a step weaker, and so on; windows
 * further back than RECENCY_STEPS get no bar at all.
 *
 * Per-viewer by design: stored in localStorage keyed by session, so it survives reloads but is
 * never shared. Storage can be missing or throw (private mode, blocked site data); the order
 * then lasts only for the page's lifetime.
 */

import { useEffect, useState } from 'react';

/** How many windows get a bar (the active one included). Tune here. */
export const RECENCY_STEPS = 8;
/** Opacity of the weakest visible step; the strongest is 1. */
const WEAKEST_OPACITY = 0.2;
const STORAGE_PREFIX = 'chainglass:terminal-window-recency:';

/**
 * Bar strength for a window at `rank` in the visit order (0 = active / most recent), or 0 when
 * it is unranked or ranked beyond RECENCY_STEPS. Steps are evenly spaced from 1 down to
 * WEAKEST_OPACITY so each one is distinguishable.
 */
export function recencyHeat(rank: number): number {
  if (rank < 0 || rank >= RECENCY_STEPS) return 0;
  return 1 - (rank * (1 - WEAKEST_OPACITY)) / (RECENCY_STEPS - 1);
}

/** Move `windowId` to the front of `order`, keeping at most RECENCY_STEPS entries. */
export function bumpRecency(order: readonly string[], windowId: string): string[] {
  return [windowId, ...order.filter((id) => id !== windowId)].slice(0, RECENCY_STEPS);
}

/**
 * Windows this viewer already knows about. `known === null` means this browser has never seen
 * the session: everything currently open becomes known (no flood of "new" markers on first
 * visit). Otherwise the active window becomes known (selecting it clears its marker), and
 * windows that no longer exist are dropped so the list stays bounded. An empty `current`
 * (still loading) changes nothing.
 */
export function updateKnown(
  known: readonly string[] | null,
  current: readonly string[],
  activeWindowId: string | null
): string[] | null {
  if (current.length === 0) return known === null ? null : [...known];
  if (known === null) return [...current];
  const live = new Set(current);
  const next = known.filter((id) => live.has(id));
  if (activeWindowId && live.has(activeWindowId) && !next.includes(activeWindowId)) {
    next.push(activeWindowId);
  }
  return next;
}

function readStored(sessionName: string, suffix = ''): unknown {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + suffix + sessionName);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStoredKnown(sessionName: string): string[] | null {
  const parsed = readStored(sessionName, 'known:');
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((id): id is string => typeof id === 'string');
}

function readStoredOrder(sessionName: string): string[] {
  const parsed = readStored(sessionName);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENCY_STEPS);
}

function writeStored(sessionName: string, value: readonly string[], suffix = ''): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + suffix + sessionName, JSON.stringify(value));
  } catch {
    // Storage unavailable: the state stays in memory only.
  }
}

/**
 * Visit order of windows (by tmux window id), most recent first, plus the windows this viewer
 * has not seen yet. The active window is moved to the front whenever it changes — whether by
 * clicking the strip or by a tmux key binding — and stops being new.
 */
export function useWindowRecency(
  sessionName: string,
  windowIds: readonly string[],
  activeWindowId: string | null
): { order: string[]; unseen: ReadonlySet<string> } {
  const [order, setOrder] = useState<string[]>([]);
  // undefined = not yet read from storage for this session.
  const [known, setKnown] = useState<string[] | null | undefined>(undefined);
  const windowKey = windowIds.join(',');

  useEffect(() => {
    setOrder(readStoredOrder(sessionName));
    setKnown(readStoredKnown(sessionName));
  }, [sessionName]);

  useEffect(() => {
    if (!activeWindowId) return;
    setOrder((prev) => {
      if (prev[0] === activeWindowId) return prev;
      const next = bumpRecency(prev, activeWindowId);
      writeStored(sessionName, next);
      return next;
    });
  }, [sessionName, activeWindowId]);

  useEffect(() => {
    if (known === undefined) return;
    const next = updateKnown(known, windowKey ? windowKey.split(',') : [], activeWindowId);
    if (next === null || (known !== null && next.join(',') === known.join(','))) return;
    setKnown(next);
    writeStored(sessionName, next, 'known:');
  }, [sessionName, windowKey, activeWindowId, known]);

  const unseen = new Set<string>();
  if (known) {
    const knownSet = new Set(known);
    for (const id of windowIds) {
      if (!knownSet.has(id) && id !== activeWindowId) unseen.add(id);
    }
  }
  return { order, unseen };
}
