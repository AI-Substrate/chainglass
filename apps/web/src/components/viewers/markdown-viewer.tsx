'use client';

/**
 * MarkdownViewer Component
 *
 * Displays markdown files with source/preview toggle functionality.
 * Source mode uses FileViewer (Phase 2), Preview mode shows pre-rendered markdown.
 *
 * Features:
 * - Source mode: raw markdown with syntax highlighting
 * - Preview mode: formatted markdown with prose styling
 * - Toggle buttons with accessible state indicators
 * - Mode persistence via useMarkdownViewerState hook
 *
 * @see useMarkdownViewerState for state management
 * @see MarkdownServer for server-side preview rendering
 */

import type { ReactNode } from 'react';

import { useMarkdownViewerState } from '../../hooks/useMarkdownViewerState';
import type { ViewerFile } from '../../lib/language-detection';
import { FileViewer } from './file-viewer';
import './markdown-viewer.css';

export interface MarkdownViewerProps {
  /** The markdown file to display */
  file: ViewerFile | undefined;
  /** Pre-highlighted HTML for source mode (from Shiki) */
  highlightedHtml: string;
  /** Pre-rendered preview content (from MarkdownServer) */
  preview: ReactNode;
}

/**
 * MarkdownViewer component for displaying markdown with source/preview toggle.
 *
 * @example
 * // In a Server Component
 * const highlightedHtml = await highlightCode(file.content, 'markdown');
 * const preview = <MarkdownServer content={file.content} />;
 * return <MarkdownViewer file={file} highlightedHtml={highlightedHtml} preview={preview} />;
 */
export function MarkdownViewer({ file, highlightedHtml, preview }: MarkdownViewerProps) {
  const { isPreviewMode, setMode } = useMarkdownViewerState(file);

  const filename = file?.filename ?? 'Untitled.md';

  return (
    <div className="markdown-viewer" aria-label={`Markdown viewer for ${filename}`}>
      {/* Toolbar with filename and mode toggle */}
      <div className="markdown-viewer-toolbar">
        <span className="markdown-viewer-filename">{filename}</span>
        {/* biome-ignore lint/a11y/useSemanticElements: Toggle button group semantically correct with role="group" */}
        <div className="markdown-viewer-toggle-group" role="group" aria-label="View mode toggle">
          <button
            type="button"
            className="markdown-viewer-toggle"
            aria-pressed={!isPreviewMode}
            onClick={() => setMode('source')}
          >
            Source
          </button>
          <button
            type="button"
            className="markdown-viewer-toggle"
            aria-pressed={isPreviewMode}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Content area: Source or Preview */}
      {isPreviewMode ? (
        <div className="markdown-viewer-preview">{preview}</div>
      ) : (
        <FileViewer file={file} highlightedHtml={highlightedHtml} />
      )}
    </div>
  );
}

/**
 * MarkdownServer - Server Component for rendering markdown preview.
 *
 * Uses react-markdown with @shikijs/rehype for syntax-highlighted code blocks.
 * Configuration follows DYK Insight #2: cssVariablePrefix matches Phase 2 FileViewer.
 *
 * @example
 * // In a Server Component page
 * const preview = await MarkdownServer({ content: file.content });
 */
export { MarkdownServer } from './markdown-server';
