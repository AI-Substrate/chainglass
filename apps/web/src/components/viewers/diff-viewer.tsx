'use client';

/**
 * DiffViewer Component
 *
 * Displays git diff output with GitHub-style formatting.
 * Uses @git-diff-view/react for rendering and @git-diff-view/shiki for
 * syntax highlighting (consistent with FileViewer's Shiki usage).
 *
 * Features:
 * - Split (side-by-side) and Unified (+/-) view modes
 * - Syntax highlighting via Shiki
 * - Theme-aware (light/dark mode)
 * - Error states: not-git, no-changes, git-not-available
 * - Loading state
 *
 * Per Critical Insights:
 * - Decision #1: Client-side Shiki via @git-diff-view/shiki
 * - Decision #3: Uses useDiffViewerState hook from Phase 1
 * - Decision #5: Receives diffData as prop (props-based pattern)
 *
 * @see useDiffViewerState for state management
 * @see getGitDiff for server action that fetches diff
 */

import { DiffFile, DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';

import type { DiffError } from '@chainglass/shared';

import { useDiffViewerState } from '../../hooks/useDiffViewerState';
import type { ViewerFile } from '../../lib/language-detection';
import './diff-viewer.css';

export interface DiffViewerProps {
  /** The file to display diff for */
  file: ViewerFile | undefined;
  /** The git diff output, or null if error/no-changes */
  diffData: string | null;
  /** Error type if diff failed */
  error: DiffError | null;
  /** Whether diff is currently loading */
  isLoading?: boolean;
  /** View mode override (default: from hook state) */
  viewMode?: 'split' | 'unified';
}

/**
 * Parse a git diff string and extract file info.
 */
function parseGitDiffHeader(diffString: string): {
  oldFileName: string;
  newFileName: string;
  lang: string;
} {
  const lines = diffString.split('\n');
  let oldFileName = 'file';
  let newFileName = 'file';

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      oldFileName = line.slice(4).replace(/^a\//, '');
    } else if (line.startsWith('+++ ')) {
      newFileName = line.slice(4).replace(/^b\//, '');
      break;
    }
  }

  // Detect language from file extension
  const ext = newFileName.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    go: 'go',
    rs: 'rust',
    md: 'markdown',
    json: 'json',
    css: 'css',
    html: 'html',
  };

  return {
    oldFileName,
    newFileName,
    lang: langMap[ext] ?? 'text',
  };
}

/**
 * DiffViewer component for displaying git diffs with syntax highlighting.
 *
 * @example
 * // In a Server Component
 * const result = await getGitDiff(file.path);
 * return <DiffViewer file={file} diffData={result.diff} error={result.error} />;
 */
export function DiffViewer({
  file,
  diffData,
  error,
  isLoading = false,
  viewMode: viewModeProp,
}: DiffViewerProps) {
  const { resolvedTheme } = useTheme();
  const hookState = useDiffViewerState(file);
  const [diffFile, setDiffFile] = useState<DiffFile | null>(null);

  // Use prop viewMode if provided, otherwise use hook state
  const viewMode = viewModeProp ?? hookState.viewMode;

  // Theme for @git-diff-view
  const diffViewTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  // Parse diff data and create DiffFile instance
  useEffect(() => {
    if (!diffData) {
      setDiffFile(null);
      return;
    }

    let mounted = true;

    const initDiff = async () => {
      try {
        const { oldFileName, newFileName, lang } = parseGitDiffHeader(diffData);

        // Create DiffFile from the git diff output
        // When using hunks (git diff output), we pass empty content and the diff hunks
        const file = DiffFile.createInstance({
          oldFile: {
            fileName: oldFileName,
            fileLang: lang,
            content: '',
          },
          newFile: {
            fileName: newFileName,
            fileLang: lang,
            content: '',
          },
          hunks: [diffData],
        });

        // Initialize the diff file
        file.initTheme(diffViewTheme);
        file.init();

        // Try to load Shiki highlighter for syntax highlighting
        try {
          const { getDiffViewHighlighter, highlighterReady } = await import('@git-diff-view/shiki');
          await highlighterReady;
          const highlighter = await getDiffViewHighlighter({
            themes: ['github-light', 'github-dark'],
            langs: ['typescript', 'javascript', 'tsx', 'jsx', 'python', 'go', 'rust'],
          });
          file.initSyntax({ registerHighlighter: highlighter });
        } catch {
          // Fall back to plain text if Shiki fails
          file.initRaw();
        }

        // Build the view
        file.buildSplitDiffLines();
        file.buildUnifiedDiffLines();

        if (mounted) {
          setDiffFile(file);
        }
      } catch (err) {
        console.error('Failed to parse diff:', err);
        if (mounted) {
          setDiffFile(null);
        }
      }
    };

    initDiff();

    return () => {
      mounted = false;
    };
  }, [diffData, diffViewTheme]);

  // Determine the view mode enum
  const diffViewMode = viewMode === 'unified' ? DiffModeEnum.Unified : DiffModeEnum.Split;

  const filename = file?.filename ?? 'Untitled';

  // Loading state
  if (isLoading) {
    return (
      <section
        className="diff-viewer diff-viewer-loading"
        aria-label={`Diff viewer for ${filename}`}
      >
        <div className="diff-viewer-toolbar">
          <span className="diff-viewer-filename">{filename}</span>
        </div>
        <div className="diff-viewer-message">
          <span className="diff-viewer-loading-text">Loading diff...</span>
        </div>
      </section>
    );
  }

  // Error states
  if (error) {
    let errorMessage = '';
    switch (error) {
      case 'not-git':
        errorMessage = 'This file is not in a git repository';
        break;
      case 'no-changes':
        errorMessage = 'No changes detected';
        break;
      case 'git-not-available':
        errorMessage = 'Git is not available on this system';
        break;
      default:
        errorMessage = 'An error occurred';
    }

    return (
      <section className="diff-viewer diff-viewer-error" aria-label={`Diff viewer for ${filename}`}>
        <div className="diff-viewer-toolbar">
          <span className="diff-viewer-filename">{filename}</span>
        </div>
        <div className="diff-viewer-message">
          <span className="diff-viewer-error-text">{errorMessage}</span>
        </div>
      </section>
    );
  }

  // No diff data or still initializing
  if (!diffFile) {
    return (
      <section className="diff-viewer diff-viewer-empty" aria-label={`Diff viewer for ${filename}`}>
        <div className="diff-viewer-toolbar">
          <span className="diff-viewer-filename">{filename}</span>
        </div>
        <div className="diff-viewer-message">
          <span className="diff-viewer-empty-text">
            {diffData ? 'Initializing diff...' : 'No diff to display'}
          </span>
        </div>
      </section>
    );
  }

  // Success state - render diff
  return (
    <section className="diff-viewer" aria-label={`Diff viewer for ${filename}`}>
      <div className="diff-viewer-toolbar">
        <span className="diff-viewer-filename">{filename}</span>
        <button
          type="button"
          className="diff-viewer-toggle"
          onClick={hookState.toggleViewMode}
          aria-pressed={viewMode === 'unified'}
          aria-label="Toggle view mode"
        >
          {viewMode === 'split' ? 'Unified view' : 'Split view'}
        </button>
      </div>
      <div className="diff-viewer-content">
        <DiffView diffFile={diffFile} diffViewMode={diffViewMode} diffViewWrap={false} />
      </div>
    </section>
  );
}
