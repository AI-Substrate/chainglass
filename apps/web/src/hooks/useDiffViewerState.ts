/**
 * useDiffViewerState - Diff viewer state management hook
 *
 * Manages view mode (split/unified), loading state, error handling, and diff data.
 * Follows useBoardState pattern: pure state management, useCallback for mutations.
 * Uses createViewerStateBase utility per DYK Insight #1.
 */

import { useCallback, useState } from 'react';

import type { ViewerFile } from '../lib/language-detection';

import { type ViewerStateBase, createViewerStateBase } from '../lib/viewer-state-utils';

export type DiffViewMode = 'split' | 'unified';
export type DiffError = 'not-git' | 'no-changes' | 'git-not-available' | null;

export interface UseDiffViewerStateReturn extends ViewerStateBase {
  /** Current view mode (split or unified) */
  viewMode: DiffViewMode;
  /** Whether currently loading diff data */
  isLoading: boolean;
  /** Error state, if any */
  error: DiffError;
  /** The diff data, if loaded */
  diffData: string | null;
  /** Toggle between split and unified views */
  toggleViewMode: () => void;
  /** Explicitly set view mode */
  setViewMode: (mode: DiffViewMode) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set error state */
  setError: (error: DiffError) => void;
  /** Set diff data */
  setDiffData: (data: string | null) => void;
  /** Set a new file (resets diff state) */
  setFile: (file: ViewerFile | undefined) => void;
}

interface DiffViewerState extends ViewerStateBase {
  viewMode: DiffViewMode;
  isLoading: boolean;
  error: DiffError;
  diffData: string | null;
}

/**
 * Hook for managing diff viewer state.
 *
 * @param initialFile - Initial file to display, or undefined
 * @returns Diff viewer state and mutation functions
 *
 * @example
 * const { viewMode, isLoading, error, diffData, toggleViewMode, setDiffData } = useDiffViewerState(file);
 * toggleViewMode(); // Toggle between split and unified
 * setDiffData('+ added\n- removed'); // Set diff content
 */
export function useDiffViewerState(initialFile: ViewerFile | undefined): UseDiffViewerStateReturn {
  const [state, setState] = useState<DiffViewerState>(() => ({
    ...createViewerStateBase(initialFile),
    viewMode: 'split',
    isLoading: false,
    error: null,
    diffData: null,
  }));

  /**
   * Toggle between split and unified views.
   */
  const toggleViewMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      viewMode: prev.viewMode === 'split' ? 'unified' : 'split',
    }));
  }, []);

  /**
   * Explicitly set the view mode.
   */
  const setViewMode = useCallback((mode: DiffViewMode) => {
    setState((prev) => ({
      ...prev,
      viewMode: mode,
    }));
  }, []);

  /**
   * Set loading state.
   */
  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({
      ...prev,
      isLoading: loading,
    }));
  }, []);

  /**
   * Set error state.
   */
  const setError = useCallback((error: DiffError) => {
    setState((prev) => ({
      ...prev,
      error,
    }));
  }, []);

  /**
   * Set diff data.
   */
  const setDiffData = useCallback((data: string | null) => {
    setState((prev) => ({
      ...prev,
      diffData: data,
    }));
  }, []);

  /**
   * Set a new file, resetting diff state.
   */
  const setFile = useCallback((file: ViewerFile | undefined) => {
    setState((prev) => ({
      ...createViewerStateBase(file),
      viewMode: prev.viewMode, // Preserve view mode
      isLoading: prev.isLoading, // Preserve loading state
      error: null, // Reset error
      diffData: null, // Reset diff data
    }));
  }, []);

  return {
    file: state.file,
    language: state.language,
    showLineNumbers: state.showLineNumbers,
    viewMode: state.viewMode,
    isLoading: state.isLoading,
    error: state.error,
    diffData: state.diffData,
    toggleViewMode,
    setViewMode,
    setLoading,
    setError,
    setDiffData,
    setFile,
  };
}
