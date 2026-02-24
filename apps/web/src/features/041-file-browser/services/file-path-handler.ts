/**
 * File Path BarHandler
 *
 * Normalizes user input, strips worktree prefix if present,
 * verifies the file exists, and navigates on success.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 * Per workshop: file-path-utility-bar.md
 */

import type { BarHandler } from '@/features/_platform/panel-layout';

/**
 * Creates a BarHandler that navigates to file paths.
 * First handler in the ExplorerPanel chain.
 */
export function createFilePathHandler(): BarHandler {
  return async (input, context) => {
    let normalized = input.trim();
    if (!normalized) return false;

    // Strip worktree prefix if present (user pasted absolute path)
    if (normalized === context.worktreePath || normalized.startsWith(`${context.worktreePath}/`)) {
      normalized = normalized.slice(context.worktreePath.length);
    }

    // Strip leading ./ or /
    if (normalized.startsWith('./')) normalized = normalized.slice(2);
    if (normalized.startsWith('/')) normalized = normalized.slice(1);
    // Strip trailing /
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);

    if (!normalized) return false;

    const pathType = await context.pathExists(normalized);
    if (pathType === 'file') {
      context.navigateToFile(normalized);
      return true;
    }
    if (pathType === 'directory') {
      context.navigateToDirectory(normalized);
      return true;
    }

    return false;
  };
}
