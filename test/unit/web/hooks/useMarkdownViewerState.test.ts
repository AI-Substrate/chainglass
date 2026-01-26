/**
 * useMarkdownViewerState Tests - TDD RED Phase
 *
 * Tests for the markdown viewer state management hook.
 * Extends FileViewer functionality with source/preview mode toggle.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ViewerFile } from '@chainglass/shared';

import { useMarkdownViewerState } from '../../../../apps/web/src/hooks/useMarkdownViewerState';

describe('useMarkdownViewerState', () => {
  const markdownFile: ViewerFile = {
    path: 'docs/README.md',
    filename: 'README.md',
    content: '# Hello World\n\nThis is a **test**.',
  };

  describe('inherits FileViewer functionality', () => {
    it('should initialize with provided file', () => {
      /*
      Test Doc:
      - Why: MarkdownViewer builds on FileViewer base functionality
      - Contract: Hook preserves file data like useFileViewerState
      - Usage Notes: All FileViewer features should work
      - Quality Contribution: Ensures base functionality isn't broken
      - Worked Example: Same file initialization as useFileViewerState
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      expect(result.current.file).toBeDefined();
      expect(result.current.file?.filename).toBe('README.md');
    });

    it('should auto-detect markdown language', () => {
      /*
      Test Doc:
      - Why: Markdown files need proper language detection
      - Contract: .md → 'markdown'
      - Usage Notes: Uses shared detectLanguage utility
      - Quality Contribution: Verifies language detection works for markdown
      - Worked Example: README.md → 'markdown'
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      expect(result.current.language).toBe('markdown');
    });

    it('should have toggleLineNumbers from FileViewer', () => {
      /*
      Test Doc:
      - Why: FileViewer features should be accessible
      - Contract: toggleLineNumbers function exists and works
      - Usage Notes: Same behavior as useFileViewerState
      - Quality Contribution: Ensures feature composition works
      - Worked Example: toggleLineNumbers() toggles showLineNumbers
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      expect(result.current.showLineNumbers).toBe(true);

      act(() => {
        result.current.toggleLineNumbers();
      });

      expect(result.current.showLineNumbers).toBe(false);
    });

    it('should have setFile from FileViewer', () => {
      /*
      Test Doc:
      - Why: File switching should work
      - Contract: setFile updates file and recomputes state
      - Usage Notes: Same behavior as useFileViewerState
      - Quality Contribution: Ensures base file management works
      - Worked Example: setFile(newFile) updates file and language
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      const newFile: ViewerFile = {
        path: 'docs/CHANGELOG.md',
        filename: 'CHANGELOG.md',
        content: '# Changelog',
      };

      act(() => {
        result.current.setFile(newFile);
      });

      expect(result.current.file?.filename).toBe('CHANGELOG.md');
    });
  });

  describe('mode toggle functionality', () => {
    it('should start in source mode by default', () => {
      /*
      Test Doc:
      - Why: Source mode shows raw markdown for editing context
      - Contract: isPreviewMode defaults to false (source mode)
      - Usage Notes: User can toggle to preview mode
      - Quality Contribution: Catches incorrect default mode
      - Worked Example: Initial state → isPreviewMode: false
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      expect(result.current.isPreviewMode).toBe(false);
    });

    it('should toggle between source and preview modes', () => {
      /*
      Test Doc:
      - Why: Users need both raw and rendered views
      - Contract: toggleMode flips isPreviewMode state
      - Usage Notes: Toggle is symmetric
      - Quality Contribution: Catches broken toggle logic
      - Worked Example: false → toggleMode() → true
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      expect(result.current.isPreviewMode).toBe(false);

      act(() => {
        result.current.toggleMode();
      });

      expect(result.current.isPreviewMode).toBe(true);

      act(() => {
        result.current.toggleMode();
      });

      expect(result.current.isPreviewMode).toBe(false);
    });

    it('should have setMode for explicit mode setting', () => {
      /*
      Test Doc:
      - Why: Sometimes explicit mode setting is clearer than toggle
      - Contract: setMode(mode) sets mode directly
      - Usage Notes: Accepts 'source' or 'preview'
      - Quality Contribution: Enables programmatic mode control
      - Worked Example: setMode('preview') → isPreviewMode: true
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      act(() => {
        result.current.setMode('preview');
      });

      expect(result.current.isPreviewMode).toBe(true);

      act(() => {
        result.current.setMode('source');
      });

      expect(result.current.isPreviewMode).toBe(false);
    });

    it('should maintain mode consistency after rapid toggles', () => {
      /*
      Test Doc:
      - Why: Rapid clicking could cause state inconsistency
      - Contract: Mode always reflects last toggle action
      - Usage Notes: No debouncing needed; state is synchronous
      - Quality Contribution: Catches race condition bugs
      - Worked Example: toggle 5x rapidly → isPreviewMode: true (odd toggles)
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.toggleMode();
        }
      });

      // Odd number of toggles from false → true
      expect(result.current.isPreviewMode).toBe(true);
    });
  });

  describe('mode property', () => {
    it('should expose mode as string property', () => {
      /*
      Test Doc:
      - Why: Components may need mode as string for styling/logic
      - Contract: mode is 'source' | 'preview'
      - Usage Notes: Use for conditional rendering
      - Quality Contribution: Enables mode-based styling
      - Worked Example: Initial → mode: 'source'
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      expect(result.current.mode).toBe('source');

      act(() => {
        result.current.toggleMode();
      });

      expect(result.current.mode).toBe('preview');
    });
  });

  describe('error handling', () => {
    it('should handle undefined file gracefully', () => {
      /*
      Test Doc:
      - Why: Components may receive undefined during async loading
      - Contract: Hook returns safe defaults when file is undefined
      - Usage Notes: Mode toggle should still work
      - Quality Contribution: Prevents null pointer exceptions
      - Worked Example: undefined → file: undefined, mode: 'source'
      */
      const { result } = renderHook(() => useMarkdownViewerState(undefined));

      expect(result.current.file).toBeUndefined();
      expect(result.current.isPreviewMode).toBe(false);
      expect(result.current.mode).toBe('source');
    });
  });

  describe('mode persistence across file changes', () => {
    it('should preserve mode when file changes', () => {
      /*
      Test Doc:
      - Why: Users expect mode to persist when switching files
      - Contract: setFile preserves current mode
      - Usage Notes: Mode is independent of file selection
      - Quality Contribution: Catches unexpected mode resets
      - Worked Example: preview mode → setFile → still preview mode
      */
      const { result } = renderHook(() => useMarkdownViewerState(markdownFile));

      // Switch to preview mode
      act(() => {
        result.current.setMode('preview');
      });

      expect(result.current.isPreviewMode).toBe(true);

      // Change file
      const newFile: ViewerFile = {
        path: 'docs/OTHER.md',
        filename: 'OTHER.md',
        content: '# Other',
      };

      act(() => {
        result.current.setFile(newFile);
      });

      // Mode should be preserved
      expect(result.current.isPreviewMode).toBe(true);
      expect(result.current.file?.filename).toBe('OTHER.md');
    });
  });
});
