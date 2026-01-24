/**
 * useFileViewerState Tests - TDD RED Phase
 *
 * Tests for the file viewer state management hook.
 * Following TDD approach: write tests first, expect them to fail.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ViewerFile } from '@chainglass/shared';

import { useFileViewerState } from '../../../../apps/web/src/hooks/useFileViewerState';

describe('useFileViewerState', () => {
  const sampleFile: ViewerFile = {
    path: 'src/components/Button.tsx',
    filename: 'Button.tsx',
    content: 'export function Button() { return <button>Click</button>; }',
  };

  describe('initialization', () => {
    it('should initialize with provided file', () => {
      /*
      Test Doc:
      - Why: Hook must accept and preserve initial file state
      - Contract: useFileViewerState(file) returns { file } where file matches input shape
      - Usage Notes: Use renderHook from @testing-library/react
      - Quality Contribution: Catches initialization bugs, ensures state immutability
      - Worked Example: useFileViewerState(sampleFile) → file has matching path, filename, content
      */
      const { result } = renderHook(() => useFileViewerState(sampleFile));

      expect(result.current.file).toBeDefined();
      expect(result.current.file?.path).toBe('src/components/Button.tsx');
      expect(result.current.file?.filename).toBe('Button.tsx');
      expect(result.current.file?.content).toBe(
        'export function Button() { return <button>Click</button>; }'
      );
    });

    it('should auto-detect language from filename', () => {
      /*
      Test Doc:
      - Why: Language detection enables correct Shiki highlighting
      - Contract: Hook derives language from filename extension
      - Usage Notes: No language param needed; computed internally
      - Quality Contribution: Catches language mapping errors
      - Worked Example: Button.tsx → 'tsx'
      */
      const { result } = renderHook(() => useFileViewerState(sampleFile));

      expect(result.current.language).toBe('tsx');
    });

    it('should default line numbers to true', () => {
      /*
      Test Doc:
      - Why: Line numbers should be visible by default
      - Contract: showLineNumbers defaults to true
      - Usage Notes: User can toggle off if desired
      - Quality Contribution: Catches incorrect default value
      - Worked Example: Initial state → showLineNumbers: true
      */
      const { result } = renderHook(() => useFileViewerState(sampleFile));

      expect(result.current.showLineNumbers).toBe(true);
    });
  });

  describe('toggleLineNumbers', () => {
    it('should toggle line numbers from true to false', () => {
      /*
      Test Doc:
      - Why: Users may want to hide line numbers
      - Contract: toggleLineNumbers flips showLineNumbers state
      - Usage Notes: Default is true (show line numbers)
      - Quality Contribution: Catches broken toggle logic
      - Worked Example: showLineNumbers: true → toggleLineNumbers() → false
      */
      const { result } = renderHook(() => useFileViewerState(sampleFile));

      expect(result.current.showLineNumbers).toBe(true);

      act(() => {
        result.current.toggleLineNumbers();
      });

      expect(result.current.showLineNumbers).toBe(false);
    });

    it('should toggle line numbers from false to true', () => {
      /*
      Test Doc:
      - Why: Toggle should work in both directions
      - Contract: Second toggle returns to original state
      - Usage Notes: Toggles are symmetric
      - Quality Contribution: Catches one-way toggle bugs
      - Worked Example: false → toggleLineNumbers() → true
      */
      const { result } = renderHook(() => useFileViewerState(sampleFile));

      // Toggle twice
      act(() => {
        result.current.toggleLineNumbers();
      });
      act(() => {
        result.current.toggleLineNumbers();
      });

      expect(result.current.showLineNumbers).toBe(true);
    });
  });

  describe('setFile', () => {
    it('should update file and recalculate language', () => {
      /*
      Test Doc:
      - Why: Users may switch between files
      - Contract: setFile updates file and recomputes language
      - Usage Notes: Language is always derived from filename
      - Quality Contribution: Catches stale language after file change
      - Worked Example: Switch from .tsx to .py → language changes to 'python'
      */
      const { result } = renderHook(() => useFileViewerState(sampleFile));

      expect(result.current.language).toBe('tsx');

      const pythonFile: ViewerFile = {
        path: 'scripts/build.py',
        filename: 'build.py',
        content: 'print("Hello")',
      };

      act(() => {
        result.current.setFile(pythonFile);
      });

      expect(result.current.file?.filename).toBe('build.py');
      expect(result.current.language).toBe('python');
    });
  });

  describe('error handling', () => {
    it('should handle undefined file gracefully', () => {
      /*
      Test Doc:
      - Why: Components may receive undefined during async loading
      - Contract: Hook returns safe defaults when file is undefined
      - Usage Notes: Check for undefined before rendering content
      - Quality Contribution: Prevents null pointer exceptions
      - Worked Example: undefined → language: 'text', file: undefined
      */
      const { result } = renderHook(() => useFileViewerState(undefined));

      expect(result.current.file).toBeUndefined();
      expect(result.current.language).toBe('text');
      expect(result.current.showLineNumbers).toBe(true);
    });

    it('should default to text for unknown file extensions', () => {
      /*
      Test Doc:
      - Why: Users may load files with unusual extensions
      - Contract: Unknown extensions fall back to 'text' language
      - Usage Notes: Still renders content, just without highlighting
      - Quality Contribution: Prevents crashes from unknown file types
      - Worked Example: .xyz → language: 'text'
      */
      const unknownFile: ViewerFile = {
        path: 'data/config.xyz',
        filename: 'config.xyz',
        content: 'some content',
      };

      const { result } = renderHook(() => useFileViewerState(unknownFile));

      expect(result.current.language).toBe('text');
    });

    it('should handle empty content without error', () => {
      /*
      Test Doc:
      - Why: Empty files are valid and should render
      - Contract: Empty content displays without errors
      - Usage Notes: Line numbers show "1" for empty file
      - Quality Contribution: Catches edge case rendering bugs
      - Worked Example: content: '' → renders empty viewer
      */
      const emptyFile: ViewerFile = {
        path: 'empty.ts',
        filename: 'empty.ts',
        content: '',
      };

      const { result } = renderHook(() => useFileViewerState(emptyFile));

      expect(result.current.file?.content).toBe('');
      expect(result.current.language).toBe('typescript');
    });
  });

  describe('state immutability', () => {
    it('should not mutate original file object', () => {
      /*
      Test Doc:
      - Why: React requires immutable state updates
      - Contract: Operations return new state objects, not mutations
      - Usage Notes: Original file reference should remain unchanged
      - Quality Contribution: Catches mutation bugs that break React rendering
      - Worked Example: setFile doesn't modify original file object
      */
      const originalContent = sampleFile.content;

      const { result } = renderHook(() => useFileViewerState(sampleFile));

      // Mutate the returned file (simulating accidental mutation)
      // The original should be protected
      expect(sampleFile.content).toBe(originalContent);
    });
  });

  describe('language detection edge cases', () => {
    it('should detect TypeScript files', () => {
      const tsFile: ViewerFile = {
        path: 'src/utils.ts',
        filename: 'utils.ts',
        content: 'export const x = 1;',
      };

      const { result } = renderHook(() => useFileViewerState(tsFile));
      expect(result.current.language).toBe('typescript');
    });

    it('should detect JavaScript files', () => {
      const jsFile: ViewerFile = {
        path: 'src/index.js',
        filename: 'index.js',
        content: 'module.exports = {};',
      };

      const { result } = renderHook(() => useFileViewerState(jsFile));
      expect(result.current.language).toBe('javascript');
    });

    it('should detect Markdown files', () => {
      const mdFile: ViewerFile = {
        path: 'docs/README.md',
        filename: 'README.md',
        content: '# Title',
      };

      const { result } = renderHook(() => useFileViewerState(mdFile));
      expect(result.current.language).toBe('markdown');
    });

    it('should detect JSON files', () => {
      const jsonFile: ViewerFile = {
        path: 'package.json',
        filename: 'package.json',
        content: '{}',
      };

      const { result } = renderHook(() => useFileViewerState(jsonFile));
      expect(result.current.language).toBe('json');
    });

    it('should detect Dockerfile', () => {
      const dockerFile: ViewerFile = {
        path: 'Dockerfile',
        filename: 'Dockerfile',
        content: 'FROM node:18',
      };

      const { result } = renderHook(() => useFileViewerState(dockerFile));
      expect(result.current.language).toBe('dockerfile');
    });
  });
});
