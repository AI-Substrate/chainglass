import type { DiffError, DiffResult, IGitDiffService } from '../interfaces/diff.interface.js';

/**
 * Fake implementation of IGitDiffService for testing.
 *
 * Provides test helpers to simulate different git diff scenarios:
 * - `setDiff(diff)`: Simulate a successful diff with changes
 * - `setNoChanges()`: Simulate a file with no uncommitted changes
 * - `setNotInGitRepo()`: Simulate a file not in a git repository
 * - `setGitNotAvailable()`: Simulate git binary not being available
 *
 * @example
 * const fake = new FakeDiffAction();
 * fake.setDiff('--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new');
 * const result = await fake.getGitDiff('src/file.ts');
 * expect(result.diff).toContain('+new');
 */
export class FakeDiffAction implements IGitDiffService {
  /** The simulated diff content */
  private diff: string | null = null;

  /** The simulated error type */
  private error: DiffError | null = null;

  /** Delay in ms before returning result (for testing loading states) */
  private delay = 0;

  /** Track which files were requested */
  private requestedFiles: string[] = [];

  // ========== Test Helpers ==========

  /**
   * Set a successful diff response.
   *
   * @param diff - The git diff output to return
   */
  setDiff(diff: string): void {
    this.diff = diff;
    this.error = null;
  }

  /**
   * Simulate a file with no uncommitted changes.
   */
  setNoChanges(): void {
    this.diff = null;
    this.error = 'no-changes';
  }

  /**
   * Simulate a file not in a git repository.
   */
  setNotInGitRepo(): void {
    this.diff = null;
    this.error = 'not-git';
  }

  /**
   * Simulate git binary not being available.
   */
  setGitNotAvailable(): void {
    this.diff = null;
    this.error = 'git-not-available';
  }

  /**
   * Set a delay before returning results (for testing loading states).
   *
   * @param ms - Delay in milliseconds
   */
  setDelay(ms: number): void {
    this.delay = ms;
  }

  /**
   * Get the list of files that were requested via getGitDiff.
   * Useful for verifying test behavior.
   */
  getRequestedFiles(): string[] {
    return [...this.requestedFiles];
  }

  /**
   * Reset all state to initial values.
   */
  reset(): void {
    this.diff = null;
    this.error = null;
    this.delay = 0;
    this.requestedFiles = [];
  }

  // ========== IGitDiffService Implementation ==========

  /**
   * Get the git diff for a file path.
   *
   * Returns the configured response (diff or error).
   *
   * @param filePath - Path to the file
   * @returns Promise resolving to DiffResult
   */
  async getGitDiff(filePath: string): Promise<DiffResult> {
    this.requestedFiles.push(filePath);

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    return {
      diff: this.diff,
      error: this.error,
    };
  }
}
