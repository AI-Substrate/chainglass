/**
 * File Path BarHandler
 *
 * Normalizes user input, strips worktree prefix if present,
 * verifies the file exists, and navigates on success.
 * Supports go-to-line syntax: path:42 and path#L42.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 * Phase 6: Go-to-line syntax — Plan 047, DYK-P6-04
 * Per workshop: file-path-utility-bar.md
 */

import type { BarHandler } from '@/features/_platform/panel-layout';

/**
 * Parse a line suffix from a path string.
 * Supports :42 and #L42 syntax.
 * Returns null if no valid line suffix found.
 *
 * Exported for testing.
 */
export function parseLineSuffix(path: string): { cleanPath: string; line: number } | null {
  // Try #L42 syntax first
  const hashMatch = path.match(/^(.+)#L(\d+)$/);
  if (hashMatch) {
    return { cleanPath: hashMatch[1], line: Number.parseInt(hashMatch[2], 10) };
  }

  // Try :42 syntax — only if suffix is purely numeric (DYK-P6-04)
  const colonMatch = path.match(/^(.+):(\d+)$/);
  if (colonMatch) {
    return { cleanPath: colonMatch[1], line: Number.parseInt(colonMatch[2], 10) };
  }

  return null;
}

/**
 * Creates a BarHandler that navigates to file paths.
 * First handler in the ExplorerPanel chain.
 *
 * @param onLineDetected - callback when a line number is parsed from input
 */
export function createFilePathHandler(onLineDetected?: (line: number) => void): BarHandler {
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

    // DYK-P6-04: Path-first resolution — try the full string as-is first
    const pathType = await context.pathExists(normalized);
    if (pathType === 'file') {
      context.navigateToFile(normalized);
      return true;
    }
    if (pathType === 'directory') {
      context.navigateToDirectory(normalized);
      return true;
    }

    // Full path didn't match — try parsing line suffix
    const lineParsed = parseLineSuffix(normalized);
    if (lineParsed) {
      const cleanPathType = await context.pathExists(lineParsed.cleanPath);
      if (cleanPathType === 'file') {
        context.navigateToFile(lineParsed.cleanPath);
        onLineDetected?.(lineParsed.line);
        return true;
      }
    }

    return false;
  };
}
