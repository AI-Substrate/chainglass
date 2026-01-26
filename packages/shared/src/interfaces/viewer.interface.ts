/**
 * ViewerFile - Shared interface for file viewer components
 *
 * Represents a file to be displayed in FileViewer, MarkdownViewer, or DiffViewer.
 * Pure data structure with no behavior - follows Shared by Default principle.
 */

/**
 * Represents a file to be displayed in a viewer component.
 *
 * @example
 * const file: ViewerFile = {
 *   path: 'src/components/Button.tsx',
 *   filename: 'Button.tsx',
 *   content: 'export function Button() { return <button>Click</button>; }',
 * };
 */
export interface ViewerFile {
  /** Full path to the file, relative to project root */
  path: string;

  /** Filename only (e.g., 'Button.tsx') - used for language detection */
  filename: string;

  /** File content as string */
  content: string;
}
