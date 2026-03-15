'use client';

/**
 * Copilot Session Badges — polls activity log for copilot session metadata.
 *
 * Returns one badge per copilot session detected in tmux panes,
 * sorted by window index. Polls every 15s, only when enabled.
 *
 * Plan 075: tmux Copilot Status Bar
 */

import type { ActivityLogEntry } from '@/features/065-activity-log/types';
import { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 15_000;

export interface CopilotSessionBadge {
  windowIndex: string;
  windowName: string;
  model: string | null;
  reasoningEffort: string | null;
  promptTokens: number | null;
  contextWindow: number | null;
  pct: number | null;
  lastActivityAgo: string | null;
}

interface UseCopilotSessionBadgesOptions {
  cwd: string | null;
  enabled: boolean;
}

function formatTimeAgo(isoTime: string | null | undefined): string | null {
  if (!isoTime) return null;
  const diffMs = Date.now() - new Date(isoTime).getTime();
  if (diffMs < 0) return 'now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function useCopilotSessionBadges({
  cwd,
  enabled,
}: UseCopilotSessionBadgesOptions): CopilotSessionBadge[] {
  const [badges, setBadges] = useState<CopilotSessionBadge[]>([]);
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

        const url = `/api/activity-log?worktree=${encodeURIComponent(cwd)}&source=copilot&limit=50`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;

        const entries: ActivityLogEntry[] = await res.json();

        // Entries arrive newest-first. Take first occurrence per window index.
        // Only include entries from the last 2 minutes to avoid showing stale
        // sessions from previous tmux layouts.
        const staleThresholdMs = 2 * 60 * 1000;
        const now = Date.now();
        const latestByWindow = new Map<string, CopilotSessionBadge>();
        for (const entry of entries) {
          const entryAge = now - new Date(entry.timestamp).getTime();
          if (entryAge > staleThresholdMs) continue;

          const pane = (entry.meta?.pane as string) ?? '';
          const windowIndex = pane.split('.')[0];
          if (!windowIndex || latestByWindow.has(windowIndex)) continue;
          latestByWindow.set(windowIndex, {
            windowIndex,
            windowName: (entry.meta?.windowName as string) ?? '',
            model: (entry.meta?.model as string) ?? null,
            reasoningEffort: (entry.meta?.reasoningEffort as string) ?? null,
            promptTokens: (entry.meta?.promptTokens as number) ?? null,
            contextWindow: (entry.meta?.contextWindow as number) ?? null,
            pct: (entry.meta?.pct as number) ?? null,
            lastActivityAgo: formatTimeAgo(entry.meta?.lastActivityTime as string),
          });
        }

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
