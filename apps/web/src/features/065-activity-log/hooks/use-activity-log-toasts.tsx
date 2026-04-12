'use client';

/**
 * Activity Log Toast Hook — polls for new entries and shows toast notifications.
 *
 * Uses `since` parameter to fetch only entries newer than the last poll.
 * First poll establishes the baseline timestamp — no toasts on page load.
 * Shows a toast for every new entry across all windows/panes.
 * Skips toasts when the overlay is open (you can already see entries there).
 *
 * SSE integration is the proper future path — this polling approach is a v1 bridge.
 *
 * Plan 065: Worktree Activity Log — Phase 3
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { ActivityLogEntry } from '../types';

const TOAST_POLL_MS = 15_000; // 15 seconds

interface UseActivityLogToastsOptions {
  worktreePath: string | null;
  isOverlayOpen: boolean;
  enabled?: boolean;
}

export function useActivityLogToasts({
  worktreePath,
  isOverlayOpen,
  enabled = true,
}: UseActivityLogToastsOptions) {
  // ISO timestamp of the most recent entry we've seen
  const sinceRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !worktreePath) return;

    const poll = async () => {
      try {
        let url = `/api/activity-log?worktree=${encodeURIComponent(worktreePath)}`;

        if (!initializedRef.current) {
          // First poll — just get the latest entry to establish baseline timestamp
          url += '&limit=1';
        } else if (sinceRef.current) {
          // Subsequent polls — only entries newer than last seen
          url += `&since=${encodeURIComponent(sinceRef.current)}`;
        }

        const res = await fetch(url);
        if (!res.ok) return;
        const entries: ActivityLogEntry[] = await res.json();

        if (!initializedRef.current) {
          // Record baseline timestamp, don't toast
          if (entries.length > 0) {
            sinceRef.current = entries[0].timestamp;
          } else {
            sinceRef.current = new Date().toISOString();
          }
          initializedRef.current = true;
          return;
        }

        if (entries.length === 0) return;

        // Update since to the newest entry's timestamp (entries are newest-first)
        sinceRef.current = entries[0].timestamp;

        // Toast each new entry (oldest first so they appear in order)
        // Skip tmux entries — those are polled telemetry, not actionable events
        if (!isOverlayOpen) {
          for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            if (entry.source === 'tmux') continue;
            const icon = entry.source === 'agent' ? '🤖' : '🖥';
            const windowInfo = entry.meta?.windowName ? ` ${entry.meta.windowName}` : '';
            toast(`${icon}${windowInfo} ${entry.label}`, { duration: 4000 });
          }
        }
      } catch {
        // Silently ignore fetch errors
      }
    };

    poll();
    const interval = setInterval(poll, TOAST_POLL_MS);
    return () => clearInterval(interval);
  }, [enabled, worktreePath, isOverlayOpen]);
}
