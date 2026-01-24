/**
 * Viewer State Utilities
 *
 * Shared utility functions for viewer hooks.
 * Per DYK Insight #1: Use shared utility pattern instead of hook composition.
 */

import { type ViewerFile, detectLanguage } from './language-detection';

/**
 * Base state shape shared by all viewer hooks.
 */
export interface ViewerStateBase {
  /** The file being viewed (deep cloned to prevent mutation) */
  file: ViewerFile | undefined;

  /** Detected language for syntax highlighting */
  language: string;

  /** Whether to show line numbers */
  showLineNumbers: boolean;
}

/**
 * Creates the base viewer state from a file input.
 *
 * This pure function extracts common initialization logic used by
 * useFileViewerState, useMarkdownViewerState, and useDiffViewerState.
 *
 * @param file - The file to create state for, or undefined
 * @returns Base viewer state with detected language and defaults
 *
 * @example
 * const baseState = createViewerStateBase({ path: 'src/app.ts', filename: 'app.ts', content: '...' });
 * // → { file: {...}, language: 'typescript', showLineNumbers: true }
 */
export function createViewerStateBase(file: ViewerFile | undefined): ViewerStateBase {
  // Handle undefined file gracefully
  if (!file) {
    return {
      file: undefined,
      language: 'text',
      showLineNumbers: true,
    };
  }

  // Deep clone to prevent mutating original (per useBoardState pattern)
  const clonedFile: ViewerFile = {
    path: file.path,
    filename: file.filename,
    content: file.content,
  };

  return {
    file: clonedFile,
    language: detectLanguage(file.filename),
    showLineNumbers: true,
  };
}
