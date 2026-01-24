'use client';

/**
 * FileViewer Component
 *
 * Displays source code files with syntax highlighting and line numbers.
 * Receives pre-highlighted HTML from a Server Component (Shiki runs server-side only).
 *
 * Features:
 * - CSS counter-based line numbers (don't copy with selection)
 * - Dual-theme support via Shiki CSS variables
 * - Keyboard navigation (Arrow keys, Home/End)
 * - ARIA labels for accessibility
 * - Toggle for line numbers visibility
 *
 * @see useFileViewerState for state management
 * @see highlightCode in lib/server/shiki-processor.ts for syntax highlighting
 */

import type { KeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';

import { useFileViewerState } from '../../hooks/useFileViewerState';
import type { ViewerFile } from '../../lib/language-detection';
import './file-viewer.css';

export interface FileViewerProps {
  /** The file to display */
  file: ViewerFile | undefined;
  /** Pre-highlighted HTML from Shiki (generated server-side) */
  highlightedHtml: string;
}

/**
 * FileViewer component for displaying syntax-highlighted source code.
 *
 * @example
 * // In a Server Component
 * const html = await highlightCode(file.content, detectLanguage(file.filename));
 * return <FileViewer file={file} highlightedHtml={html} />;
 */
export function FileViewer({ file, highlightedHtml }: FileViewerProps) {
  const containerRef = useRef<HTMLElement>(null);
  const { showLineNumbers, toggleLineNumbers } = useFileViewerState(file);

  /**
   * Handle keyboard navigation within the viewer.
   * - ArrowUp/ArrowDown: Scroll by line height
   * - Home: Jump to start
   * - End: Jump to end
   */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const lineHeight = 24; // Approximate line height in pixels

    switch (event.key) {
      case 'ArrowDown':
        container.scrollTop += lineHeight;
        event.preventDefault();
        break;
      case 'ArrowUp':
        container.scrollTop -= lineHeight;
        event.preventDefault();
        break;
      case 'Home':
        container.scrollTop = 0;
        event.preventDefault();
        break;
      case 'End':
        container.scrollTop = container.scrollHeight;
        event.preventDefault();
        break;
    }
  }, []);

  const filename = file?.filename ?? 'Untitled';
  const containerClasses = ['file-viewer', !showLineNumbers && 'hide-line-numbers']
    .filter(Boolean)
    .join(' ');

  return (
    <section
      ref={containerRef}
      className={containerClasses}
      aria-label={`Code viewer for ${filename}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: tabIndex required for keyboard navigation (AC-6)
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Toolbar with filename and line numbers toggle */}
      <div className="file-viewer-toolbar">
        <span className="file-viewer-filename">{filename}</span>
        <button
          type="button"
          className="file-viewer-toggle"
          onClick={toggleLineNumbers}
          aria-pressed={showLineNumbers}
          aria-label="Toggle line numbers"
        >
          {showLineNumbers ? 'Hide' : 'Show'} line numbers
        </button>
      </div>

      {/* Syntax highlighted code */}
      {highlightedHtml ? (
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki HTML is safe (server-generated)
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre>
          <code>{file?.content ?? ''}</code>
        </pre>
      )}
    </section>
  );
}
