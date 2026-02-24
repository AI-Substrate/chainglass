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

/** Imperative handle for ExplorerPanel ref (Ctrl+P integration) */
export interface ExplorerPanelHandle {
  focusInput: () => void;
}
