/**
 * Diff Interface - Types for DiffViewer component
 *
 * Defines the DiffResult type returned by getGitDiff server action,
 * and the IGitDiffService interface for dependency injection.
 *
 * @see DiffViewer component in apps/web
 * @see useDiffViewerState hook for client-side state management
 */

/**
 * Error types that can occur when fetching a git diff.
 *
 * - 'not-git': File is not in a git repository
 * - 'no-changes': File has no uncommitted changes
 * - 'git-not-available': Git binary is not installed or accessible
 */
export type DiffError = 'not-git' | 'no-changes' | 'git-not-available';

/**
 * Result of a git diff operation.
 *
 * @example Success case
 * const result: DiffResult = {
 *   diff: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
 *   error: null,
 * };
 *
 * @example Error case
 * const result: DiffResult = {
 *   diff: null,
 *   error: 'not-git',
 * };
 */
export interface DiffResult {
  /** The git diff output, or null if an error occurred */
  diff: string | null;

  /** Error type if diff failed, or null on success */
  error: DiffError | null;
}

/**
 * Interface for git diff service.
 *
 * Used for dependency injection in testing. The real implementation
 * is the getGitDiff server action; FakeDiffAction implements this
 * for unit tests.
 */
export interface IGitDiffService {
  /**
   * Get the git diff for a file path.
   *
   * @param filePath - Path to the file, relative to project root
   * @returns Promise resolving to DiffResult
   */
  getGitDiff(filePath: string): Promise<DiffResult>;
}
