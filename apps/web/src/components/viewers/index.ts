/**
 * Viewer Components
 *
 * This barrel file exports all viewer components for source file,
 * markdown, and diff display.
 *
 * Phase 2: FileViewer - Syntax highlighted source code display
 * Phase 3: MarkdownViewer - Markdown preview with source/preview toggle (future)
 * Phase 5: DiffViewer - Git diff visualization (future)
 */

export { FileViewer } from './file-viewer';
export type { ViewerFile } from '../../lib/language-detection';
