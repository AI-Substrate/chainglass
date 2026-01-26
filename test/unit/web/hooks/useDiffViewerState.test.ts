/**
 * useDiffViewerState Tests - TDD RED Phase
 *
 * Tests for the diff viewer state management hook.
 * Manages view mode (split/unified), loading state, and error handling.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ViewerFile } from '@chainglass/shared';

import { useDiffViewerState } from '../../../../apps/web/src/hooks/useDiffViewerState';

describe('useDiffViewerState', () => {
  const sampleFile: ViewerFile = {
    path: 'src/utils.ts',
    filename: 'utils.ts',
    content: 'export const add = (a: number, b: number) => a + b;',
  };

  describe('initialization', () => {
    it('should initialize with provided file', () => {
      /*
      Test Doc:
      - Why: DiffViewer needs file info for display
      - Contract: Hook preserves file data
      - Usage Notes: File is the base for diff comparison
      - Quality Contribution: Ensures file data is accessible
      - Worked Example: Same file initialization as useFileViewerState
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      expect(result.current.file).toBeDefined();
      expect(result.current.file?.filename).toBe('utils.ts');
    });

    it('should auto-detect language from filename', () => {
      /*
      Test Doc:
      - Why: Syntax highlighting needs language detection
      - Contract: Language is derived from filename
      - Usage Notes: Uses shared detectLanguage utility
      - Quality Contribution: Verifies language detection works for diff
      - Worked Example: utils.ts → 'typescript'
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      expect(result.current.language).toBe('typescript');
    });

    it('should start in split view mode', () => {
      /*
      Test Doc:
      - Why: Split view is the default for readability
      - Contract: viewMode defaults to 'split'
      - Usage Notes: User can toggle to unified
      - Quality Contribution: Catches incorrect default mode
      - Worked Example: Initial state → viewMode: 'split'
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      expect(result.current.viewMode).toBe('split');
    });

    it('should start with loading state false', () => {
      /*
      Test Doc:
      - Why: No automatic loading on initialization
      - Contract: isLoading defaults to false
      - Usage Notes: Loading is triggered by external action
      - Quality Contribution: Prevents premature loading indicators
      - Worked Example: Initial state → isLoading: false
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      expect(result.current.isLoading).toBe(false);
    });

    it('should start with no error', () => {
      /*
      Test Doc:
      - Why: Initial state should be clean
      - Contract: error defaults to null
      - Usage Notes: Error is set by external action
      - Quality Contribution: Prevents spurious error displays
      - Worked Example: Initial state → error: null
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      expect(result.current.error).toBeNull();
    });

    it('should start with no diff data', () => {
      /*
      Test Doc:
      - Why: Diff data is loaded asynchronously
      - Contract: diffData defaults to null
      - Usage Notes: Set via setDiffData after fetch
      - Quality Contribution: Prevents undefined access errors
      - Worked Example: Initial state → diffData: null
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      expect(result.current.diffData).toBeNull();
    });
  });

  describe('view mode toggle', () => {
    it('should toggle between split and unified views', () => {
      /*
      Test Doc:
      - Why: Users need both view options
      - Contract: toggleViewMode flips viewMode state
      - Usage Notes: Split ↔ Unified
      - Quality Contribution: Catches broken toggle logic
      - Worked Example: 'split' → toggleViewMode() → 'unified'
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      expect(result.current.viewMode).toBe('split');

      act(() => {
        result.current.toggleViewMode();
      });

      expect(result.current.viewMode).toBe('unified');

      act(() => {
        result.current.toggleViewMode();
      });

      expect(result.current.viewMode).toBe('split');
    });

    it('should have setViewMode for explicit mode setting', () => {
      /*
      Test Doc:
      - Why: Sometimes explicit mode setting is clearer
      - Contract: setViewMode(mode) sets mode directly
      - Usage Notes: Accepts 'split' or 'unified'
      - Quality Contribution: Enables programmatic mode control
      - Worked Example: setViewMode('unified') → viewMode: 'unified'
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      act(() => {
        result.current.setViewMode('unified');
      });

      expect(result.current.viewMode).toBe('unified');

      act(() => {
        result.current.setViewMode('split');
      });

      expect(result.current.viewMode).toBe('split');
    });
  });

  describe('loading state', () => {
    it('should track loading state', () => {
      /*
      Test Doc:
      - Why: UI needs to show loading indicators
      - Contract: setLoading updates isLoading state
      - Usage Notes: Call before/after async operations
      - Quality Contribution: Enables loading spinners
      - Worked Example: setLoading(true) → isLoading: true
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('error states', () => {
    it('should handle not-git error state', () => {
      /*
      Test Doc:
      - Why: DiffViewer needs graceful fallback without git
      - Contract: setError('not-git') sets error state
      - Usage Notes: Check error before rendering diff
      - Quality Contribution: Prevents crashes in non-git environments
      - Worked Example: setError('not-git') → error: 'not-git'
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      act(() => {
        result.current.setError('not-git');
      });

      expect(result.current.error).toBe('not-git');
    });

    it('should handle no-changes state', () => {
      /*
      Test Doc:
      - Why: Unchanged files should show clear status
      - Contract: setError('no-changes') sets error state
      - Usage Notes: Distinct from other error states
      - Quality Contribution: Catches missing empty-diff handling
      - Worked Example: setError('no-changes') → error: 'no-changes'
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      act(() => {
        result.current.setError('no-changes');
      });

      expect(result.current.error).toBe('no-changes');
    });

    it('should handle git-not-available state', () => {
      /*
      Test Doc:
      - Why: Git binary may not be installed
      - Contract: setError('git-not-available') sets error state
      - Usage Notes: Display appropriate message to user
      - Quality Contribution: Handles environment limitations
      - Worked Example: setError('git-not-available') → error: 'git-not-available'
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      act(() => {
        result.current.setError('git-not-available');
      });

      expect(result.current.error).toBe('git-not-available');
    });

    it('should clear error state', () => {
      /*
      Test Doc:
      - Why: Errors should be clearable for retry
      - Contract: setError(null) clears error
      - Usage Notes: Clear before retry attempt
      - Quality Contribution: Enables error recovery
      - Worked Example: setError(null) → error: null
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      act(() => {
        result.current.setError('not-git');
      });

      expect(result.current.error).toBe('not-git');

      act(() => {
        result.current.setError(null);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('diff data management', () => {
    it('should set diff data', () => {
      /*
      Test Doc:
      - Why: Diff data needs to be stored for display
      - Contract: setDiffData(diff) updates diffData state
      - Usage Notes: Call after successful git diff fetch
      - Quality Contribution: Enables diff display
      - Worked Example: setDiffData('...diff...') → diffData: '...diff...'
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      const sampleDiff = '- old line\n+ new line';

      act(() => {
        result.current.setDiffData(sampleDiff);
      });

      expect(result.current.diffData).toBe(sampleDiff);
    });

    it('should clear diff data', () => {
      /*
      Test Doc:
      - Why: Diff data should be clearable
      - Contract: setDiffData(null) clears diffData
      - Usage Notes: Clear when changing files
      - Quality Contribution: Prevents stale diff display
      - Worked Example: setDiffData(null) → diffData: null
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      act(() => {
        result.current.setDiffData('some diff');
      });

      expect(result.current.diffData).toBe('some diff');

      act(() => {
        result.current.setDiffData(null);
      });

      expect(result.current.diffData).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle undefined file gracefully', () => {
      /*
      Test Doc:
      - Why: Components may receive undefined during async loading
      - Contract: Hook returns safe defaults when file is undefined
      - Usage Notes: All state management should still work
      - Quality Contribution: Prevents null pointer exceptions
      - Worked Example: undefined → file: undefined, viewMode: 'split'
      */
      const { result } = renderHook(() => useDiffViewerState(undefined));

      expect(result.current.file).toBeUndefined();
      expect(result.current.viewMode).toBe('split');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('setFile', () => {
    it('should update file and reset diff state', () => {
      /*
      Test Doc:
      - Why: File change should clear stale diff data
      - Contract: setFile updates file and clears diff/error
      - Usage Notes: Loading state is not affected
      - Quality Contribution: Prevents stale data display
      - Worked Example: setFile(newFile) → new file, diffData: null
      */
      const { result } = renderHook(() => useDiffViewerState(sampleFile));

      // Set some state
      act(() => {
        result.current.setDiffData('old diff');
        result.current.setError('no-changes');
      });

      expect(result.current.diffData).toBe('old diff');
      expect(result.current.error).toBe('no-changes');

      // Change file
      const newFile: ViewerFile = {
        path: 'src/other.ts',
        filename: 'other.ts',
        content: 'export const x = 1;',
      };

      act(() => {
        result.current.setFile(newFile);
      });

      // File should change, diff state should reset
      expect(result.current.file?.filename).toBe('other.ts');
      expect(result.current.diffData).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });
});
