'use client';

/**
 * usePanelState — Left panel mode, changes data, lazy fetch.
 *
 * Extracted from BrowserClient for separation of concerns (DYK-P3-05).
 * Owns: panel mode, workingChanges, recentFiles, changesLoaded.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import type { ChangedFile } from '@/features/041-file-browser/services/working-changes';
import type { PanelMode } from '@/features/_platform/panel-layout';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface UsePanelStateOptions {
  isGit: boolean;
  worktreePath: string;
  panel: PanelMode;
  setUrlPanel: (panel: PanelMode) => void;
  fetchWorkingChanges: (
    worktreePath: string
  ) => Promise<{ ok: true; files: ChangedFile[] } | { ok: false; error: string }>;
  fetchRecentFiles: (
    worktreePath: string,
    limit?: number
  ) => Promise<{ ok: true; files: string[] } | { ok: false; error: string }>;
  fetchChangedFiles: (
    worktreePath: string
  ) => Promise<{ ok: true; files: string[] } | { ok: false; error: string }>;
}

export function usePanelState(options: UsePanelStateOptions) {
  const {
    isGit,
    worktreePath,
    panel,
    setUrlPanel,
    fetchWorkingChanges: fetchWorkingChangesFn,
    fetchRecentFiles: fetchRecentFilesFn,
    fetchChangedFiles: fetchChangedFilesFn,
  } = options;

  const [workingChanges, setWorkingChanges] = useState<ChangedFile[]>([]);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [changesLoaded, setChangesLoaded] = useState(false);

  // Fetch changed files on mount for amber highlighting in tree view
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(() => {
    if (isGit) {
      fetchChangedFilesFn(worktreePath).then((result) => {
        if (result.ok) setChangedFiles(result.files);
      });
    }
  }, []);

  // Lazy fetch changes data on first switch to changes mode
  useEffect(() => {
    if (panel === 'changes' && !changesLoaded && isGit) {
      setChangesLoaded(true);
      Promise.all([fetchWorkingChangesFn(worktreePath), fetchRecentFilesFn(worktreePath)]).then(
        ([wcResult, rfResult]) => {
          if (wcResult.ok) setWorkingChanges(wcResult.files);
          if (rfResult.ok) setRecentFiles(rfResult.files);
        }
      );
    }
  }, [panel, changesLoaded, isGit, worktreePath, fetchWorkingChangesFn, fetchRecentFilesFn]);

  const handlePanelModeChange = useCallback(
    (newMode: PanelMode) => {
      setUrlPanel(newMode);
      toast.info(newMode === 'tree' ? 'Tree view' : 'Changes view');
    },
    [setUrlPanel]
  );

  const handleRefreshChanges = useCallback(() => {
    if (!isGit) return;
    Promise.all([
      fetchWorkingChangesFn(worktreePath),
      fetchRecentFilesFn(worktreePath),
      fetchChangedFilesFn(worktreePath),
    ]).then(([wcResult, rfResult, cfResult]) => {
      if (wcResult.ok) setWorkingChanges(wcResult.files);
      if (rfResult.ok) setRecentFiles(rfResult.files);
      if (cfResult.ok) setChangedFiles(cfResult.files);
    });
  }, [isGit, worktreePath, fetchWorkingChangesFn, fetchRecentFilesFn, fetchChangedFilesFn]);

  // Available modes for LeftPanel
  const panelModes = isGit
    ? [
        { key: 'tree' as const, icon: null, label: 'Tree view' },
        { key: 'changes' as const, icon: null, label: 'Changes view' },
      ]
    : [{ key: 'tree' as const, icon: null, label: 'Tree view' }];

  return {
    panel,
    workingChanges,
    recentFiles,
    changedFiles,
    panelModes,
    handlePanelModeChange,
    handleRefreshChanges,
  };
}
