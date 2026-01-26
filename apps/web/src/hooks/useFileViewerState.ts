/**
 * useFileViewerState - File viewer state management hook
 *
 * Pure logic hook for managing file viewer state.
 * Follows useBoardState pattern: pure state management, useCallback for mutations.
 * Uses createViewerStateBase utility per DYK Insight #1.
 */

import { useCallback, useState } from 'react';

import type { ViewerFile } from '../lib/language-detection';

import { type ViewerStateBase, createViewerStateBase } from '../lib/viewer-state-utils';

export interface UseFileViewerStateReturn extends ViewerStateBase {
  toggleLineNumbers: () => void;
  setFile: (file: ViewerFile | undefined) => void;
}

/**
 * Hook for managing file viewer state with language detection.
 *
 * @param initialFile - Initial file to display, or undefined
 * @returns File viewer state and mutation functions
 *
 * @example
 * const { file, language, showLineNumbers, toggleLineNumbers, setFile } = useFileViewerState(file);
 * toggleLineNumbers(); // Toggle line numbers on/off
 * setFile(newFile); // Switch to a different file
 */
export function useFileViewerState(initialFile: ViewerFile | undefined): UseFileViewerStateReturn {
  const [state, setState] = useState<ViewerStateBase>(() => createViewerStateBase(initialFile));

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
   * Set a new file and recompute language.
   */
  const setFile = useCallback((file: ViewerFile | undefined) => {
    setState(createViewerStateBase(file));
  }, []);

  return {
    file: state.file,
    language: state.language,
    showLineNumbers: state.showLineNumbers,
    toggleLineNumbers,
    setFile,
  };
}
