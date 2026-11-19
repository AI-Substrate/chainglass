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

function readStored(sessionName: string): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + sessionName);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENCY_STEPS);
  } catch {
    return [];
  }
}

function writeStored(sessionName: string, order: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + sessionName, JSON.stringify(order));
  } catch {
    // Storage unavailable: the order stays in memory only.
  }
}

/**
 * Visit order of windows (by tmux window id), most recent first. The active window is moved to
 * the front whenever it changes — whether by clicking the strip or by a tmux key binding.
 */
export function useWindowRecency(sessionName: string, activeWindowId: string | null): string[] {
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    setOrder(readStored(sessionName));
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

  return order;
}
