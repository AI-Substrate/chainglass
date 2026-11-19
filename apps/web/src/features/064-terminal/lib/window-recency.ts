'use client';

/**
 * Window recency heat: how recently this browser had each tmux window selected. The window
 * strip draws a thin bar along each button's top edge whose strength fades from full (selected
 * now) to nothing over RECENCY_FADE_MS.
 *
 * Per-viewer by design: stored in localStorage keyed by session, so it survives reloads but is
 * never shared. Storage can be missing or throw (private mode, blocked site data); the heat
 * then lasts only for the page's lifetime.
 */

import { useEffect, useRef, useState } from 'react';

/** How long a window takes to fade from full heat to none. Tune here. */
export const RECENCY_FADE_MS = 30 * 60 * 1000;
/** How often the bars re-fade while nothing else changes. */
const TICK_MS = 30 * 1000;
const STORAGE_PREFIX = 'chainglass:terminal-window-recency:';

/** 1 at `lastSelectedMs === now`, falling linearly to 0 at RECENCY_FADE_MS old. */
export function recencyHeat(lastSelectedMs: number | undefined, nowMs: number): number {
  if (lastSelectedMs === undefined) return 0;
  const age = nowMs - lastSelectedMs;
  if (age <= 0) return 1;
  return Math.max(0, 1 - age / RECENCY_FADE_MS);
}

type RecencyMap = Record<string, number>;

function readStored(sessionName: string): RecencyMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + sessionName);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: RecencyMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number') result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function writeStored(sessionName: string, map: RecencyMap): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + sessionName, JSON.stringify(map));
  } catch {
    // Storage unavailable: heat stays in memory only.
  }
}

/**
 * Tracks when each window (by tmux window id) was last the selected one. Callers draw the
 * active window at full heat; this hook stamps a window at the moment it STOPS being active
 * (and when it becomes active), so its fade starts when you leave it — whether you left by
 * clicking the strip or by a tmux key binding.
 */
export function useWindowRecency(
  sessionName: string,
  activeWindowId: string | null
): { lastSelected: RecencyMap; now: number } {
  const [lastSelected, setLastSelected] = useState<RecencyMap>({});
  const [now, setNow] = useState(() => Date.now());
  const previousActive = useRef<string | null>(null);

  useEffect(() => {
    setLastSelected(readStored(sessionName));
    previousActive.current = null;
  }, [sessionName]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const left = previousActive.current;
    previousActive.current = activeWindowId;
    if (!activeWindowId && !left) return;
    const stamp = Date.now();
    setNow(stamp);
    setLastSelected((prev) => {
      // Drop entries that have fully faded so storage does not grow with closed windows.
      const next: RecencyMap = {};
      for (const [key, value] of Object.entries(prev)) {
        if (recencyHeat(value, stamp) > 0) next[key] = value;
      }
      if (left) next[left] = stamp;
      if (activeWindowId) next[activeWindowId] = stamp;
      writeStored(sessionName, next);
      return next;
    });
  }, [sessionName, activeWindowId]);

  return { lastSelected, now };
}
