/**
 * GitWorktreeManagerAdapter — real git mutation implementation.
 *
 * Per Plan 069 Phase 2, Workshop 002, Finding 02:
 * Implements IGitWorktreeManager using IProcessManager.spawn().
 * Mirrors the GitWorktreeResolver.execGit() pattern for git command execution.
 *
 * This adapter owns:
 * - Preflight safety checks on the main branch
 * - Fetch and fast-forward sync
 * - Worktree creation via git worktree add
 * - Branch and plan folder listing for the naming allocator
 *
 * It does NOT own naming logic, bootstrap execution, or workspace registration.
 */

import type { IProcessManager, SpawnOptions } from '@chainglass/shared';
import type {
  CreateWorktreeGitResult,
  IGitWorktreeManager,
  MainStatusResult,
  SyncMainResult,
} from '../interfaces/git-worktree-manager.interface.js';

/** Result from git command execution. */
interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Real git worktree manager implementation.
 *
 * Per ADR-0004: Uses constructor injection for testability.
 * Per Workshop 002: Implements the full preflight/sync/create safety sequence.
 */
export class GitWorktreeManagerAdapter implements IGitWorktreeManager {
  constructor(private readonly processManager: IProcessManager) {}

  // ==================== IGitWorktreeManager Implementation ====================

  async checkMainStatus(mainRepoPath: string): Promise<MainStatusResult> {
    // Step 1: Verify local branch 'main' exists
    const branchResult = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], mainRepoPath);
    if (!branchResult.success) {
      return { status: 'git-failure', detail: 'Could not determine current branch' };
    }
    const currentBranch = branchResult.stdout.trim();
    if (currentBranch !== 'main') {
      return {
        status: 'no-main-branch',
        mainRepoPath,
        detail: `Expected branch 'main' but found '${currentBranch}'`,
      };
    }

    // Step 2: Check for tracked local changes
    const statusResult = await this.execGit(
      ['status', '--porcelain=v1', '--untracked-files=no'],
      mainRepoPath
    );
    if (!statusResult.success) {
      return { status: 'git-failure', mainRepoPath, detail: 'Could not check working tree status' };
    }
    if (statusResult.stdout.trim().length > 0) {
      return { status: 'dirty', mainRepoPath, detail: 'Tracked local changes present' };
    }

    // Step 3: Check for in-progress git operations (lock files)
    const lockCheck = await this.execGit(['rev-parse', '--git-dir'], mainRepoPath);
    if (lockCheck.success) {
      const gitDir = lockCheck.stdout.trim();
      const lockPath = `${gitDir}/index.lock`;
      const lockExists = await this.execGit(['ls-files', lockPath], mainRepoPath);
      // Use a simpler check: try to detect common lock indicators
      const rebaseCheck = await this.execGit(
        ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'],
        mainRepoPath
      );
      if (rebaseCheck.success) {
        return {
          status: 'lock-held',
          mainRepoPath,
          detail: 'A merge is in progress',
        };
      }
      const rebaseDir = await this.execGit(
        ['rev-parse', '--git-path', 'rebase-merge'],
        mainRepoPath
      );
      if (rebaseDir.success) {
        // Check if the rebase directory actually exists by trying to list it
        const rebasePath = rebaseDir.stdout.trim();
        const rebaseExists = await this.execGit(
          ['rev-parse', '--verify', '--quiet', 'REBASE_HEAD'],
          mainRepoPath
        );
        if (rebaseExists.success) {
          return {
            status: 'lock-held',
            mainRepoPath,
            detail: 'A rebase is in progress',
          };
        }
      }
    }

    // Step 4: Fetch origin/main
    const fetchResult = await this.execGit(['fetch', 'origin', 'main', '--prune'], mainRepoPath);
    if (!fetchResult.success) {
      return {
        status: 'git-failure',
        mainRepoPath,
        detail: 'Failed to fetch origin/main',
      };
    }

    // Step 5: Compare local main vs origin/main
    const compareResult = await this.execGit(
      ['rev-list', '--left-right', '--count', 'main...origin/main'],
      mainRepoPath
    );
    if (!compareResult.success) {
      return {
        status: 'git-failure',
        mainRepoPath,
        detail: 'Could not compare local and remote main',
      };
    }

    const parts = compareResult.stdout.trim().split(/\s+/);
    const ahead = Number.parseInt(parts[0] ?? '0', 10);
    const behind = Number.parseInt(parts[1] ?? '0', 10);

    // Get refs for result
    const localRefResult = await this.execGit(['rev-parse', 'main'], mainRepoPath);
    const remoteRefResult = await this.execGit(['rev-parse', 'origin/main'], mainRepoPath);
    const localRef = localRefResult.success ? localRefResult.stdout.trim() : undefined;
    const remoteRef = remoteRefResult.success ? remoteRefResult.stdout.trim() : undefined;

    if (ahead > 0 && behind > 0) {
      return {
        status: 'diverged',
        mainRepoPath,
        localRef,
        remoteRef,
        detail: `Local main has ${ahead} unpushed and ${behind} missing commits`,
      };
    }
    if (ahead > 0) {
      return {
        status: 'ahead',
        mainRepoPath,
        localRef,
        remoteRef,
        detail: `Local main has ${ahead} unpushed commits`,
      };
    }

    // clean or behind — both are ok for the caller
    return { status: 'clean', mainRepoPath, localRef, remoteRef };
  }

  async syncMain(mainRepoPath: string): Promise<SyncMainResult> {
    // Check if we even need to sync
    const compareResult = await this.execGit(
      ['rev-list', '--left-right', '--count', 'main...origin/main'],
      mainRepoPath
    );

    if (compareResult.success) {
      const parts = compareResult.stdout.trim().split(/\s+/);
      const behind = Number.parseInt(parts[1] ?? '0', 10);

      if (behind === 0) {
        const refResult = await this.execGit(['rev-parse', 'main'], mainRepoPath);
        return {
          status: 'already-up-to-date',
          localRef: refResult.success ? refResult.stdout.trim() : undefined,
        };
      }
    }

    // Fast-forward only
    const pullResult = await this.execGit(['pull', '--ff-only', 'origin', 'main'], mainRepoPath);
    if (!pullResult.success) {
      return {
        status: 'fast-forward-failed',
        detail: 'Could not fast-forward local main to origin/main',
      };
    }

    const refResult = await this.execGit(['rev-parse', 'main'], mainRepoPath);
    return {
      status: 'synced',
      localRef: refResult.success ? refResult.stdout.trim() : undefined,
    };
  }

  async createWorktree(
    mainRepoPath: string,
    branchName: string,
    worktreePath: string
  ): Promise<CreateWorktreeGitResult> {
    const result = await this.execGit(
      ['worktree', 'add', '-b', branchName, worktreePath, 'main'],
      mainRepoPath
    );

    if (!result.success) {
      const stderr = result.stderr || result.stdout;
      if (stderr.includes('already exists')) {
        if (stderr.includes('branch')) {
          return { status: 'branch-exists', detail: `Branch '${branchName}' already exists` };
        }
        return { status: 'path-exists', detail: `Path '${worktreePath}' already exists` };
      }
      return { status: 'git-failure', detail: stderr || 'git worktree add failed' };
    }

    return {
      status: 'created',
      worktreePath,
      branchName,
    };
  }

  async listBranches(
    mainRepoPath: string
  ): Promise<{ localBranches: string[]; remoteBranches: string[] }> {
    const localResult = await this.execGit(['branch', '--format=%(refname:short)'], mainRepoPath);
    const remoteResult = await this.execGit(
      ['branch', '-r', '--format=%(refname:short)'],
      mainRepoPath
    );

    const localBranches = localResult.success
      ? localResult.stdout.trim().split('\n').filter(Boolean)
      : [];
    const remoteBranches = remoteResult.success
      ? remoteResult.stdout.trim().split('\n').filter(Boolean)
      : [];

    return { localBranches, remoteBranches };
  }

  async listPlanFolders(mainRepoPath: string): Promise<string[]> {
    const result = await this.execGit(
      ['ls-tree', '--name-only', 'main', 'docs/plans/'],
      mainRepoPath
    );
    if (!result.success) return [];
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  // ==================== Private Helpers ====================

  /**
   * Execute a git command.
   * Mirrors GitWorktreeResolver.execGit() pattern.
   */
  private async execGit(args: string[], cwd?: string): Promise<GitResult> {
    const options: SpawnOptions = { command: 'git', args, cwd };
    let stdout = '';
    const stderr = '';

    try {
      const handle = await this.processManager.spawn({
        ...options,
        onStdoutLine: (line: string) => {
          stdout += `${line}\n`;
        },
      });

      const result = await handle.waitForExit();
      const success = result.exitCode === 0;

      const bufferedOutput = this.processManager.getProcessOutput?.(handle.pid) ?? '';
      if (bufferedOutput) {
        stdout = stdout || bufferedOutput;
      }

      return { success, stdout, stderr: bufferedOutput || '' };
    } catch (error) {
      if (error instanceof Error) {
        const errnoError = error as NodeJS.ErrnoException;
        if (errnoError.code === 'ENOENT') {
          return { success: false, stdout: '', stderr: 'git not found' };
        }
      }
      throw error;
    }
  }
}
