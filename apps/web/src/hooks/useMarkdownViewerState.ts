/**
 * useMarkdownViewerState - Markdown viewer state management hook
 *
 * Extends FileViewer functionality with source/preview mode toggle.
 * Follows useBoardState pattern: pure state management, useCallback for mutations.
 * Uses createViewerStateBase utility per DYK Insight #1.
 */

import { useCallback, useState } from 'react';

import type { ViewerFile } from '@chainglass/shared';

import { type ViewerStateBase, createViewerStateBase } from '../lib/viewer-state-utils';

export type MarkdownMode = 'source' | 'preview';

export interface UseMarkdownViewerStateReturn extends ViewerStateBase {
  /** Current mode as string */
  mode: MarkdownMode;
  /** Whether currently in preview mode */
  isPreviewMode: boolean;
  /** Toggle between source and preview modes */
  toggleMode: () => void;
  /** Explicitly set mode */
  setMode: (mode: MarkdownMode) => void;
  /** Toggle line numbers visibility */
  toggleLineNumbers: () => void;
  /** Set a new file (preserves mode) */
  setFile: (file: ViewerFile | undefined) => void;
}

interface MarkdownViewerState extends ViewerStateBase {
  mode: MarkdownMode;
}

/**
 * Hook for managing markdown viewer state with mode toggle.
 *
 * @param initialFile - Initial markdown file to display, or undefined
 * @returns Markdown viewer state and mutation functions
 *
 * @example
 * const { file, language, mode, isPreviewMode, toggleMode, setMode } = useMarkdownViewerState(file);
 * toggleMode(); // Toggle between source and preview
 * setMode('preview'); // Explicitly set to preview mode
 */
export function useMarkdownViewerState(
  initialFile: ViewerFile | undefined
): UseMarkdownViewerStateReturn {
  const [state, setState] = useState<MarkdownViewerState>(() => ({
    ...createViewerStateBase(initialFile),
    mode: 'source',
  }));

  /**
   * Toggle between source and preview modes.
   */
  const toggleMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: prev.mode === 'source' ? 'preview' : 'source',
    }));
  }, []);

  /**
   * Explicitly set the mode.
   */
  const setMode = useCallback((mode: MarkdownMode) => {
    setState((prev) => ({
      ...prev,
      mode,
    }));
  }, []);

  /**
   * Toggle line numbers visibility.
   */
  const toggleLineNumbers = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showLineNumbers: !prev.showLineNumbers,
    }));
  }, []);

  /**
   * Set a new file while preserving current mode.
   */
  const setFile = useCallback((file: ViewerFile | undefined) => {
    setState((prev) => ({
      ...createViewerStateBase(file),
      mode: prev.mode, // Preserve mode across file changes
    }));
  }, []);

  return {
    file: state.file,
    language: state.language,
    showLineNumbers: state.showLineNumbers,
    mode: state.mode,
    isPreviewMode: state.mode === 'preview',
    toggleMode,
    setMode,
    toggleLineNumbers,
    setFile,
  };
}
