/**
 * Viewer Components
 *
 * This barrel file exports all viewer components for source file,
 * markdown, and diff display.
 *
 * Phase 2: FileViewer - Syntax highlighted source code display
 * Phase 3: MarkdownViewer - Markdown preview with source/preview toggle
 * Phase 4: MermaidRenderer - Mermaid diagram rendering
 * Phase 5: DiffViewer - Git diff visualization (future)
 */

export { FileViewer } from './file-viewer';
export { MarkdownViewer } from './markdown-viewer';
export { MarkdownServer } from './markdown-server';
export { MermaidRenderer } from './mermaid-renderer';
export { CodeBlock } from './code-block';
export { DiffViewer } from './diff-viewer';
export type { ViewerFile } from '../../lib/language-detection';
