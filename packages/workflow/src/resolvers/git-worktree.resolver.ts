/**
 * GitWorktreeResolver for detecting git worktrees.
 *
 * Per Plan 014: Workspaces - Phase 2: WorkspaceContext Resolution + Worktree Discovery
 *
 * This resolver handles git worktree detection:
 * - Version checking (≥ 2.13 required for --porcelain)
 * - Parsing `git worktree list --porcelain` output
 * - Finding main repository path via `git rev-parse --show-toplevel`
 *
 * Per High Discovery 04: Graceful degradation when git unavailable or too old.
 * Per DYK-01: Uses IProcessManager for testable git command execution.
 * Per DYK-05: Handles all porcelain output variants.
 */

import type { IProcessManager, SpawnOptions } from '@chainglass/shared';
import { GitOperationError, WorkspaceErrors } from '../errors/workspace-errors.js';
import type { Worktree } from '../interfaces/workspace-context.interface.js';

/**
 * Result from git command execution.
 */
interface GitResult {
  /** Whether command succeeded (exit code 0) */
  success: boolean;
  /** stdout content */
  stdout: string;
  /** stderr content (for error messages) */
  stderr: string;
}

/**
 * GitWorktreeResolver handles git worktree detection.
 *
 * Per ADR-0004: Use DI container for injection.
 */
export class GitWorktreeResolver {
  /** Minimum git version for worktree --porcelain support */
  private static readonly MIN_GIT_VERSION = '2.13.0';

  constructor(private readonly processManager: IProcessManager) {}

  /**
   * Get the git version string.
   *
   * @returns Version string (e.g., "2.45.0") or null if git unavailable
   */
  async getGitVersion(): Promise<string | null> {
    try {
      const result = await this.execGit(['--version']);

      if (!result.success) {
        return null;
      }

      // Parse "git version X.Y.Z" → "X.Y.Z"
      const match = result.stdout.match(/git version (\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    } catch {
      // Git not installed or other error
      return null;
    }
  }

  /**
   * Check if git worktree --porcelain is supported.
   *
   * @returns true if git is available and version >= 2.13
   */
  async isWorktreeSupported(): Promise<boolean> {
    const version = await this.getGitVersion();
    if (!version) {
      return false;
    }

    return this.compareVersions(version, GitWorktreeResolver.MIN_GIT_VERSION) >= 0;
  }

  /**
   * Detect all worktrees for a git repository.
   *
   * @param repoPath - Path to git repository
   * @returns Array of Worktree objects, empty if git unavailable/unsupported/not a repo
   * @throws GitOperationError (E079) for unexpected git failures
   */
  async detectWorktrees(repoPath: string): Promise<Worktree[]> {
    // Check git availability and version
    const supported = await this.isWorktreeSupported();
    if (!supported) {
      return [];
    }

    try {
      const result = await this.execGit(['worktree', 'list', '--porcelain'], repoPath);

      if (!result.success) {
        // Not a git repo or other non-fatal error - return empty
        return [];
      }

      return this.parseWorktreeOutput(result.stdout);
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      // Unexpected error - throw E079
      throw new GitOperationError(
        repoPath,
        `Failed to detect worktrees: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the main repository path for a directory.
   *
   * @param path - Directory path (may be in worktree or main repo)
   * @returns Absolute path to main repository root, or null if not in a git repo
   */
  async getMainRepoPath(path: string): Promise<string | null> {
    const version = await this.getGitVersion();
    if (!version) {
      return null;
    }

    try {
      const result = await this.execGit(['rev-parse', '--show-toplevel'], path);

      if (!result.success) {
        return null;
      }

      return result.stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Check if a path is in the main worktree (not a linked worktree).
   *
   * @param path - Directory path
   * @returns true if in main worktree, false if in linked worktree or not in git repo
   */
  async isMainWorktree(path: string): Promise<boolean> {
    const version = await this.getGitVersion();
    if (!version) {
      return true; // Default to true if we can't determine
    }

    try {
      // Get the git dir for current path
      const gitDirResult = await this.execGit(['rev-parse', '--git-dir'], path);

      if (!gitDirResult.success) {
        return true; // Not in git repo, default to true
      }

      const gitDir = gitDirResult.stdout.trim();

      // Main worktree has .git as directory
      // Linked worktree has .git as file pointing to main's .git/worktrees/<name>
      return !gitDir.includes('/worktrees/');
    } catch {
      return true;
    }
  }

  /**
   * Parse git worktree list --porcelain output.
   *
   * Per DYK-05: Handles all variants (normal, detached, bare, prunable).
   *
   * @param output - Raw porcelain output
   * @returns Array of parsed Worktree objects
   */
  parseWorktreeOutput(output: string): Worktree[] {
    if (!output.trim()) {
      return [];
    }

    // Split into blocks separated by blank lines
    const blocks = output.split(/\n\n+/).filter((block) => block.trim());

    return blocks.map((block) => this.parseWorktreeBlock(block));
  }

  /**
   * Parse a single worktree block from porcelain output.
   */
  private parseWorktreeBlock(block: string): Worktree {
    const lines = block.split('\n').filter((line) => line.trim());

    let path = '';
    let head = '';
    let branch: string | null = null;
    let isDetached = false;
    let isBare = false;
    let isPrunable = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        // Strip refs/heads/ prefix
        const fullRef = line.slice('branch '.length);
        branch = fullRef.replace(/^refs\/heads\//, '');
      } else if (line === 'detached') {
        isDetached = true;
      } else if (line === 'bare') {
        isBare = true;
      } else if (line.startsWith('prunable')) {
        isPrunable = true;
      }
    }

    return {
      path,
      head,
      branch,
      isDetached,
      isBare,
      isPrunable,
    };
  }

  /**
   * Execute a git command.
   *
   * @param args - Git command arguments
   * @param cwd - Working directory (optional)
   * @returns GitResult with success status and output
   */
  private async execGit(args: string[], cwd?: string): Promise<GitResult> {
    const options: SpawnOptions = {
      command: 'git',
      args,
      cwd,
    };

    let stdout = '';

    try {
      const handle = await this.processManager.spawn({
        ...options,
        onStdoutLine: (line: string) => {
          stdout += `${line}\n`;
        },
      });

      const result = await handle.waitForExit();
      const success = result.exitCode === 0;

      // Also get buffered output if available
      const bufferedOutput = this.processManager.getProcessOutput?.(handle.pid) ?? '';
      if (bufferedOutput && !stdout) {
        stdout = bufferedOutput;
      }

      return { success, stdout, stderr: '' };
    } catch (error) {
      // Check for ENOENT (command not found)
      if (error instanceof Error) {
        const errnoError = error as NodeJS.ErrnoException;
        if (errnoError.code === 'ENOENT') {
          return { success: false, stdout: '', stderr: 'git not found' };
        }
      }
      throw error;
    }
  }

  /**
   * Compare two version strings.
   *
   * @returns negative if a < b, 0 if equal, positive if a > b
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] ?? 0;
      const bVal = bParts[i] ?? 0;

      if (aVal !== bVal) {
        return aVal - bVal;
      }
    }

    return 0;
  }
}
