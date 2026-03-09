'use client';

/**
 * Terminal Window Badges — polls activity log for latest tmux window statuses.
 *
 * Returns one badge per tmux window (latest activity label), sorted by window index.
 * Polls every 15s, only when the terminal overlay is visible.
 */

import type { ActivityLogEntry } from '@/features/065-activity-log/types';
import { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 15_000;

export interface WindowBadge {
  windowIndex: string;
  windowName: string;
  label: string;
}

interface UseTerminalWindowBadgesOptions {
  cwd: string | null;
  enabled: boolean;
}

export function useTerminalWindowBadges({
  cwd,
  enabled,
}: UseTerminalWindowBadgesOptions): WindowBadge[] {
  const [badges, setBadges] = useState<WindowBadge[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !cwd) {
      setBadges([]);
      return;
    }

    const poll = async () => {
      try {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const url = `/api/activity-log?worktree=${encodeURIComponent(cwd)}&source=tmux&limit=50`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;

        const entries: ActivityLogEntry[] = await res.json();

        // Entries arrive newest-first. Take first occurrence per window index.
        const latestByWindow = new Map<string, WindowBadge>();
        for (const entry of entries) {
          const pane = (entry.meta?.pane as string) ?? '';
          const windowIndex = pane.split('.')[0];
          if (!windowIndex || latestByWindow.has(windowIndex)) continue;
          latestByWindow.set(windowIndex, {
            windowIndex,
            windowName: (entry.meta?.windowName as string) ?? '',
            label: entry.label,
          });
        }

        // Sort by window index numerically
        const sorted = [...latestByWindow.values()].sort(
          (a, b) => Number(a.windowIndex) - Number(b.windowIndex)
        );
        setBadges(sorted);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [cwd, enabled]);

  return badges;
}
