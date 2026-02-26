/**
 * Panel Layout Types
 *
 * Core types for the _platform/panel-layout domain.
 * Plan 043: Panel Layout System
 */

/** Left panel view mode — extensible union for future modes (search, bookmarks, recent) */
export type PanelMode = 'tree' | 'changes';

/** Context passed to ExplorerPanel input handlers */
export interface BarContext {
  slug: string;
  worktreePath: string;
  /** Check if a file exists at this relative path (server call) */
  fileExists: (relativePath: string) => Promise<boolean>;
  /** Check if a path exists (file or directory) */
  pathExists: (relativePath: string) => Promise<'file' | 'directory' | false>;
  /** Navigate to a file */
  navigateToFile: (relativePath: string) => void;
  /** Navigate to a directory (expand in tree, scroll into view) */
  navigateToDirectory: (relativePath: string) => void;
  /** Show an error in the bar */
  showError: (message: string) => void;
}

/**
 * A handler that tries to process the ExplorerPanel input.
 * Returns true if it handled the input (stops the chain).
 */
export type BarHandler = (input: string, context: BarContext) => Promise<boolean>;

/** Imperative handle for ExplorerPanel ref (Ctrl+P integration + command palette) */
export interface ExplorerPanelHandle {
  focusInput: () => void;
  openPalette: () => void;
}

// --- File search types (Plan 049 Feature 2) ---
// Defined here so infra (panel-layout) doesn't import from business (file-browser).

/** Sort mode for file search results */
export type FileSearchSortMode = 'recent' | 'alpha-asc' | 'alpha-desc';

/** A file entry from the search cache */
export interface FileSearchEntry {
  path: string;
  mtime: number;
  modified: boolean;
  lastChanged: number | null;
}

/** Minimal file change info for status badge lookup */
export interface FileChangeInfo {
  path: string;
  status: string;
}
