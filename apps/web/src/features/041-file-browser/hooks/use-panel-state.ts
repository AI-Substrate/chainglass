'use client';

/**
 * usePanelState — Left panel mode, changes data, lazy fetch.
 *
 * Extracted from BrowserClient for separation of concerns (DYK-P3-05).
 * Owns: panel mode, workingChanges, recentFiles, changedFiles, diffStats.
 *
 * Git state arrives in one `fetchChangesSnapshot` action (nav-speed PRD item 6):
 * - status parts (changed files, diff stats, working changes) on mount and on every refresh:
 *   besides the Changes list, working changes feed the tab-title attention and the explorer;
 * - recent files only while the Changes panel shows; a refresh while it is hidden marks them
 *   stale and they reload on the next switch.
 * Loaded marks reset when the worktree changes. File-change refreshes go through
 * {@link scheduleRefreshChanges}: trailing-throttled, and deferred while the tab is hidden,
 * then run once when it is shown again. Every automatic refresh keeps the throttle's spacing
 * from the last refresh, whichever path started it.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import type {
  ChangesSnapshot,
  ChangesSnapshotParts,
} from '@/features/041-file-browser/services/changes-snapshot';
import type { DiffStats } from '@/features/041-file-browser/services/diff-stats';
import type { ChangedFile } from '@/features/041-file-browser/services/working-changes';
import type { PanelMode } from '@/features/_platform/panel-layout';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** Minimum spacing between file-change refreshes. */
export const CHANGES_REFRESH_THROTTLE_MS = 2_000;

interface UsePanelStateOptions {
  isGit: boolean;
  worktreePath: string;
  panel: PanelMode;
  setUrlPanel: (panel: PanelMode) => void;
  fetchChangesSnapshot: (
    worktreePath: string,
    parts: ChangesSnapshotParts
  ) => Promise<ChangesSnapshot>;
  refreshThrottleMs?: number;
}

export function usePanelState(options: UsePanelStateOptions) {
  const {
    isGit,
    worktreePath,
    panel,
    setUrlPanel,
    fetchChangesSnapshot: fetchChangesSnapshotFn,
    refreshThrottleMs = CHANGES_REFRESH_THROTTLE_MS,
  } = options;

  const [workingChanges, setWorkingChanges] = useState<ChangedFile[]>([]);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [diffStats, setDiffStats] = useState<DiffStats | null>(null);
  // Refs, not state: they survive StrictMode's effect replay, so dev does not load twice.
  const loadedForRef = useRef<string | null>(null);
  const recentLoadedRef = useRef(false);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const worktreeRef = useRef(worktreePath);
  worktreeRef.current = worktreePath;

  const load = useCallback(
    async (parts: ChangesSnapshotParts) => {
      const snapshot = await fetchChangesSnapshotFn(worktreePath, parts);
      // A worktree switch while this was in flight: the answer is for the old one.
      if (worktreeRef.current !== worktreePath) return;
      if (snapshot.changedFiles?.ok) setChangedFiles(snapshot.changedFiles.files);
      if (snapshot.diffStats?.ok) setDiffStats(snapshot.diffStats.stats);
      if (snapshot.workingChanges?.ok) setWorkingChanges(snapshot.workingChanges.files);
      if (snapshot.recentFiles?.ok) setRecentFiles(snapshot.recentFiles.files);
    },
    [worktreePath, fetchChangesSnapshotFn]
  );

  // Status parts once per worktree; recent files the first time the Changes panel shows (and
  // again after a refresh marked them stale). One action carries whatever is due.
  useEffect(() => {
    if (!isGit) return;
    const status = loadedForRef.current !== worktreePath;
    if (status) {
      loadedForRef.current = worktreePath;
      recentLoadedRef.current = false;
    }
    const recent = panel === 'changes' && !recentLoadedRef.current;
    if (!status && !recent) return;
    if (recent) recentLoadedRef.current = true;
    void load({ status, recent });
  }, [panel, isGit, worktreePath, load]);

  const handlePanelModeChange = useCallback(
    (newMode: PanelMode) => {
      setUrlPanel(newMode);
      const modeNames: Record<PanelMode, string> = {
        tree: 'Tree view',
        changes: 'Changes view',
        sessions: 'Sessions',
        pij: 'PIJ',
      };
      toast.info(modeNames[newMode]);
    },
    [setUrlPanel]
  );

  const throttleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const staleWhileHiddenRef = useRef(false);
  // When the last refresh started: every refresh path keeps `refreshThrottleMs` from it.
  const lastRefreshAtRef = useRef(Number.NEGATIVE_INFINITY);

  const runRefresh = useCallback(() => {
    if (!isGit) return;
    clearTimeout(throttleRef.current);
    throttleRef.current = undefined;
    lastRefreshAtRef.current = Date.now();
    const recent = panelRef.current === 'changes';
    // Not shown: drop the loaded mark so the next switch to Changes reads fresh data.
    if (!recent) recentLoadedRef.current = false;
    void load({ status: true, recent });
  }, [isGit, load]);
  const runRefreshRef = useRef(runRefresh);
  runRefreshRef.current = runRefresh;

  /**
   * The one scheduler for automatic refreshes. Waits at least `minDelayMs`, and at least
   * `refreshThrottleMs` after the last refresh started, whichever is later. A refresh already
   * pending covers the request. While the tab is hidden it only marks the data stale.
   */
  const requestRefresh = useCallback(
    (minDelayMs: number) => {
      if (document.hidden) {
        staleWhileHiddenRef.current = true;
        return;
      }
      if (throttleRef.current !== undefined) return;
      const sinceLast = Date.now() - lastRefreshAtRef.current;
      const delay = Math.max(minDelayMs, refreshThrottleMs - sinceLast);
      if (delay <= 0) {
        runRefreshRef.current();
        return;
      }
      throttleRef.current = setTimeout(() => {
        throttleRef.current = undefined;
        if (document.hidden) {
          staleWhileHiddenRef.current = true;
          return;
        }
        runRefreshRef.current();
      }, delay);
    },
    [refreshThrottleMs]
  );
  const requestRefreshRef = useRef(requestRefresh);
  requestRefreshRef.current = requestRefresh;

  /** Refresh now (the panel's refresh button). */
  const handleRefreshChanges = runRefresh;

  /** Refresh after file changes: trailing throttle, deferred while the tab is hidden. */
  const scheduleRefreshChanges = useCallback(
    () => requestRefresh(refreshThrottleMs),
    [requestRefresh, refreshThrottleMs]
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden || !staleWhileHiddenRef.current) return;
      staleWhileHiddenRef.current = false;
      // As soon as the spacing from the last refresh allows; a pending one already covers it.
      requestRefreshRef.current(0);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(throttleRef.current);
      throttleRef.current = undefined;
    };
  }, []);

  // Available modes for LeftPanel
  const panelModes = [
    { key: 'tree' as const, icon: null, label: 'Tree view' },
    ...(isGit ? [{ key: 'changes' as const, icon: null, label: 'Changes view' }] : []),
    { key: 'pij' as const, icon: null, label: 'PIJ' },
  ];

  return {
    panel,
    workingChanges,
    recentFiles,
    changedFiles,
    diffStats,
    panelModes,
    handlePanelModeChange,
    handleRefreshChanges,
    scheduleRefreshChanges,
  };
}
