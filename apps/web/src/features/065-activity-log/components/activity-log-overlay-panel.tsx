'use client';

/**
 * Activity Log Overlay Panel — fixed-position panel anchored to workspace content area.
 *
 * Mirrors terminal-overlay-panel.tsx pattern: anchor measurement via ResizeObserver,
 * Escape key close, lazy loading on first open.
 *
 * DYK-04: Caches fetch response with 10s staleness window.
 * DYK-05: z-index map — 44 = terminal/activity-log overlay, 45 = agent overlay, 50 = CRT effect
 *
 * Plan 065: Worktree Activity Log — Phase 3
 */

import { ScrollText, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useActivityLogOverlay } from '../hooks/use-activity-log-overlay';
import type { ActivityLogEntry } from '../types';
import { ActivityLogEntryList } from './activity-log-entry-list';

const CACHE_STALENESS_MS = 10_000; // 10 seconds — matches sidecar poll interval

export function ActivityLogOverlayPanel() {
  const { isOpen, worktreePath, closeActivityLog } = useActivityLogOverlay();
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  // DYK-04: Cache response to avoid redundant fetches on rapid toggle
  const cacheRef = useRef<{
    entries: ActivityLogEntry[];
    timestamp: number;
    worktree: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  // Measure anchor element
  const measureRef = useRef<() => void>();
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

  // Re-measure when overlay opens
  useEffect(() => {
    if (isOpen) measureRef.current?.();
  }, [isOpen]);

  // Fetch entries when overlay opens
  useEffect(() => {
    if (!isOpen || !worktreePath) return;

    // DYK-04: Use cached data if fresh enough
    const cache = cacheRef.current;
    if (
      cache &&
      cache.worktree === worktreePath &&
      Date.now() - cache.timestamp < CACHE_STALENESS_MS
    ) {
      setEntries(cache.entries);
      return;
    }

    setLoading(true);
    fetch(`/api/activity-log?worktree=${encodeURIComponent(worktreePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ActivityLogEntry[]) => {
        setEntries(data);
        cacheRef.current = { entries: data, timestamp: Date.now(), worktree: worktreePath };
      })
      .catch((err) => {
        console.error('[activity-log-overlay] Fetch failed:', err);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, worktreePath]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeActivityLog();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeActivityLog]);

  if (!hasOpened) return null;

  return (
    <div
      ref={panelRef}
      className="fixed flex flex-col border-l bg-background shadow-2xl"
      style={{
        // DYK-05: z-index 44 = terminal/activity-log, 45 = agent, 50 = CRT
        zIndex: 44,
        top: `${anchorRect.top}px`,
        left: `${anchorRect.left}px`,
        width: `${anchorRect.width}px`,
        height: `${anchorRect.height}px`,
        display: isOpen ? 'flex' : 'none',
      }}
      data-testid="activity-log-overlay-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Activity Log</span>
        </div>
        <button
          type="button"
          onClick={closeActivityLog}
          className="rounded-sm p-1 hover:bg-accent"
          aria-label="Close activity log"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading...
          </div>
        ) : (
          <ActivityLogEntryList entries={entries} />
        )}
      </div>
    </div>
  );
}
