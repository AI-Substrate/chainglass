/**
 * Git Worktree Resolver interface for detecting git worktrees.
 *
 * Per Plan 014: Workspaces - Phase 4: Service Layer + DI Integration
 * Per DYK-P4-03: Git ops need proper DI for testability.
 *
 * This interface abstracts git worktree detection:
 * - detectWorktrees: List all worktrees for a repository
 * - getMainRepoPath: Find the main repository path
 * - isMainWorktree: Check if path is main or linked worktree
 * - getGitVersion: Get installed git version
 * - isWorktreeSupported: Check if git supports worktree --porcelain
 *
 * Implementations:
 * - GitWorktreeResolver: Real implementation using IProcessManager
 * - FakeGitWorktreeResolver: Configurable implementation for testing
 *
 * Per High Discovery 04: Graceful degradation when git unavailable or too old.
 */

import type { Worktree } from './workspace-context.interface.js';

/**
 * Interface for git worktree detection.
 *
 * Per ADR-0004: Use DI container with interface for testability.
 */
export interface IGitWorktreeResolver {
  /**
   * Get the installed git version string.
   *
   * @returns Version string (e.g., "2.45.0") or null if git unavailable
   */
  getGitVersion(): Promise<string | null>;

  /**
   * Check if git worktree --porcelain is supported.
   *
   * @returns true if git is available and version >= 2.13
   */
  isWorktreeSupported(): Promise<boolean>;

  /**
   * Detect all worktrees for a git repository.
   *
   * @param repoPath - Path to git repository
   * @returns Array of Worktree objects, empty if git unavailable/unsupported/not a repo
   * @throws GitOperationError (E079) for unexpected git failures
   */
  detectWorktrees(repoPath: string): Promise<Worktree[]>;

  /**
   * Get the main repository path for a directory.
   *
   * @param path - Directory path (may be in worktree or main repo)
   * @returns Absolute path to main repository root, or null if not in a git repo
   */
  getMainRepoPath(path: string): Promise<string | null>;

  /**
   * Check if a path is in the main worktree (not a linked worktree).
   *
   * @param path - Directory path
   * @returns true if in main worktree, false if in linked worktree or not in git repo
   */
  isMainWorktree(path: string): Promise<boolean>;
}
