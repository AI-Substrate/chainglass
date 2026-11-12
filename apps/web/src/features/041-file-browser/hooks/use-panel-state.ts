'use client';

/**
 * usePanelState — Left panel mode, changes data, lazy fetch.
 *
 * Extracted from BrowserClient for separation of concerns (DYK-P3-05).
 * Owns: panel mode, workingChanges, recentFiles, changedFiles, diffStats.
 *
 * Git state arrives in one `fetchChangesSnapshot` action (nav-speed PRD item 6):
 * - tree parts (changed files, diff stats) on mount and on every refresh;
 * - changes parts (working changes, recent files) only while the Changes panel shows;
 *   a refresh while it is hidden marks them stale and they reload on the next switch.
 * File-change refreshes go through {@link scheduleRefreshChanges}: trailing-throttled, and
 * deferred while the tab is hidden, then run once when it is shown again.
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
  const treeLoadedRef = useRef(false);
  const changesLoadedRef = useRef(false);
  const panelRef = useRef(panel);
  panelRef.current = panel;

  const load = useCallback(
    async (parts: ChangesSnapshotParts) => {
      const snapshot = await fetchChangesSnapshotFn(worktreePath, parts);
      if (snapshot.changedFiles?.ok) setChangedFiles(snapshot.changedFiles.files);
      if (snapshot.diffStats?.ok) setDiffStats(snapshot.diffStats.stats);
      if (snapshot.workingChanges?.ok) setWorkingChanges(snapshot.workingChanges.files);
      if (snapshot.recentFiles?.ok) setRecentFiles(snapshot.recentFiles.files);
    },
    [worktreePath, fetchChangesSnapshotFn]
  );

  // Tree parts once on mount; changes parts the first time the Changes panel shows (and again
  // after a refresh marked them stale). One action carries whatever is due.
  useEffect(() => {
    if (!isGit) return;
    const tree = !treeLoadedRef.current;
    const changes = panel === 'changes' && !changesLoadedRef.current;
    if (!tree && !changes) return;
    treeLoadedRef.current = true;
    if (changes) changesLoadedRef.current = true;
    void load({ tree, changes });
  }, [panel, isGit, load]);

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

  /** Refresh now (the panel's refresh button). */
  const handleRefreshChanges = useCallback(() => {
    if (!isGit) return;
    const changes = panelRef.current === 'changes';
    // Not shown: drop the loaded mark so the next switch to Changes reads fresh data.
    if (!changes) changesLoadedRef.current = false;
    void load({ tree: true, changes });
  }, [isGit, load]);

  const refreshRef = useRef(handleRefreshChanges);
  refreshRef.current = handleRefreshChanges;
  const throttleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const staleWhileHiddenRef = useRef(false);

  /** Refresh after file changes: trailing throttle, deferred while the tab is hidden. */
  const scheduleRefreshChanges = useCallback(() => {
    if (document.hidden) {
      staleWhileHiddenRef.current = true;
      return;
    }
    if (throttleRef.current !== undefined) return;
    throttleRef.current = setTimeout(() => {
      throttleRef.current = undefined;
      if (document.hidden) {
        staleWhileHiddenRef.current = true;
        return;
      }
      refreshRef.current();
    }, refreshThrottleMs);
  }, [refreshThrottleMs]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden || !staleWhileHiddenRef.current) return;
      staleWhileHiddenRef.current = false;
      refreshRef.current();
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
