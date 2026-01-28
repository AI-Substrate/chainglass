/**
 * Fake git worktree resolver for testing.
 *
 * Per Phase 4: Service Layer + DI Integration
 * Per DYK-P4-03: Git ops need proper DI - extracted from GitWorktreeResolver.
 *
 * Follows the established FakeWorkspaceRegistryAdapter pattern with:
 * - In-memory worktree storage (Map<path, Worktree[]>)
 * - Call tracking arrays with spread operator getters
 * - reset() helper for test isolation
 * - Error injection for testing error paths
 */

import type { IGitWorktreeResolver } from '../interfaces/git-worktree-resolver.interface.js';
import type { Worktree } from '../interfaces/workspace-context.interface.js';

// ==================== Call Recording Types ====================

/**
 * Recorded detectWorktrees() call for test inspection.
 */
export interface DetectWorktreesCall {
  /** Repository path passed to detectWorktrees() */
  repoPath: string;
}

/**
 * Recorded getMainRepoPath() call for test inspection.
 */
export interface GetMainRepoPathCall {
  /** Path passed to getMainRepoPath() */
  path: string;
}

/**
 * Recorded isMainWorktree() call for test inspection.
 */
export interface IsMainWorktreeCall {
  /** Path passed to isMainWorktree() */
  path: string;
}

// ==================== Fake Implementation ====================

/**
 * Fake git worktree resolver for testing.
 *
 * Implements IGitWorktreeResolver with in-memory storage and call tracking.
 * Use in unit tests to avoid spawning git processes.
 *
 * Three-part API:
 * 1. State Setup: setWorktrees(), setMainRepoPath(), setIsMainWorktree()
 * 2. State Inspection: Read calls via *Calls getters
 * 3. Error Injection: Set inject* flags to simulate errors
 *
 * @example
 * ```typescript
 * const resolver = new FakeGitWorktreeResolver();
 *
 * // State setup - simulate git available
 * resolver.gitVersion = '2.45.0';
 * resolver.setWorktrees('/home/user/project', [
 *   { path: '/home/user/project', head: 'abc123', branch: 'main', isDetached: false, isBare: false, isPrunable: false }
 * ]);
 *
 * // Use resolver
 * const worktrees = await resolver.detectWorktrees('/home/user/project');
 * expect(worktrees).toHaveLength(1);
 *
 * // Inspect calls
 * expect(resolver.detectWorktreesCalls).toHaveLength(1);
 *
 * // Error injection
 * resolver.injectDetectError = new Error('Git failed');
 * await expect(resolver.detectWorktrees('/any')).rejects.toThrow('Git failed');
 * ```
 */
export class FakeGitWorktreeResolver implements IGitWorktreeResolver {
  // ==================== Configuration ====================

  /**
   * Simulated git version. Set to null to simulate git not installed.
   * Default: '2.45.0' (supports worktree --porcelain)
   */
  gitVersion: string | null = '2.45.0';

  // ==================== In-Memory Storage ====================

  /**
   * In-memory worktree storage by repository path.
   */
  private _worktrees: Map<string, Worktree[]> = new Map();

  /**
   * In-memory main repo path mapping.
   * Maps a path to its main repository root.
   */
  private _mainRepoPaths: Map<string, string> = new Map();

  /**
   * In-memory main worktree flags.
   * Maps a path to whether it's the main worktree.
   */
  private _isMainWorktree: Map<string, boolean> = new Map();

  // ==================== Error Injection ====================

  /**
   * Inject a detectWorktrees error. When set, detectWorktrees() will throw.
   */
  injectDetectError?: Error;

  /**
   * Inject a getMainRepoPath error. When set, getMainRepoPath() will throw.
   */
  injectMainRepoError?: Error;

  // ==================== Private Call Tracking ====================

  private _detectWorktreesCalls: DetectWorktreesCall[] = [];
  private _getMainRepoPathCalls: GetMainRepoPathCall[] = [];
  private _isMainWorktreeCalls: IsMainWorktreeCall[] = [];
  private _getGitVersionCalls = 0;
  private _isWorktreeSupportedCalls = 0;

  // ==================== Call Tracking Getters (immutable copies) ====================

  /**
   * Get all detectWorktrees() calls (returns a copy to prevent mutation).
   */
  get detectWorktreesCalls(): DetectWorktreesCall[] {
    return [...this._detectWorktreesCalls];
  }

  /**
   * Get all getMainRepoPath() calls (returns a copy to prevent mutation).
   */
  get getMainRepoPathCalls(): GetMainRepoPathCall[] {
    return [...this._getMainRepoPathCalls];
  }

  /**
   * Get all isMainWorktree() calls (returns a copy to prevent mutation).
   */
  get isMainWorktreeCalls(): IsMainWorktreeCall[] {
    return [...this._isMainWorktreeCalls];
  }

  /**
   * Get count of getGitVersion() calls.
   */
  get getGitVersionCallCount(): number {
    return this._getGitVersionCalls;
  }

  /**
   * Get count of isWorktreeSupported() calls.
   */
  get isWorktreeSupportedCallCount(): number {
    return this._isWorktreeSupportedCalls;
  }

  // ==================== State Setup Helpers ====================

  /**
   * Set worktrees for a repository path.
   *
   * @param repoPath - Repository path
   * @param worktrees - Array of worktrees to return
   */
  setWorktrees(repoPath: string, worktrees: Worktree[]): void {
    this._worktrees.set(repoPath, worktrees);
  }

  /**
   * Set main repo path for a directory.
   *
   * @param path - Directory path
   * @param mainRepoPath - Main repository root path
   */
  setMainRepoPath(path: string, mainRepoPath: string): void {
    this._mainRepoPaths.set(path, mainRepoPath);
  }

  /**
   * Set whether a path is in the main worktree.
   *
   * @param path - Directory path
   * @param isMain - Whether it's the main worktree
   */
  setIsMainWorktree(path: string, isMain: boolean): void {
    this._isMainWorktree.set(path, isMain);
  }

  // ==================== Test Helpers ====================

  /**
   * Reset all state (storage, call tracking, error injection).
   * Call in beforeEach for test isolation.
   */
  reset(): void {
    // Reset configuration
    this.gitVersion = '2.45.0';

    // Clear storage
    this._worktrees.clear();
    this._mainRepoPaths.clear();
    this._isMainWorktree.clear();

    // Clear error injection
    this.injectDetectError = undefined;
    this.injectMainRepoError = undefined;

    // Clear call tracking
    this._detectWorktreesCalls = [];
    this._getMainRepoPathCalls = [];
    this._isMainWorktreeCalls = [];
    this._getGitVersionCalls = 0;
    this._isWorktreeSupportedCalls = 0;
  }

  // ==================== IGitWorktreeResolver Implementation ====================

  /**
   * Get the simulated git version.
   */
  async getGitVersion(): Promise<string | null> {
    this._getGitVersionCalls++;
    return this.gitVersion;
  }

  /**
   * Check if worktree --porcelain is supported.
   * Returns true if gitVersion >= 2.13.0
   */
  async isWorktreeSupported(): Promise<boolean> {
    this._isWorktreeSupportedCalls++;

    if (!this.gitVersion) {
      return false;
    }

    // Compare versions
    const parts = this.gitVersion.split('.').map(Number);
    const major = parts[0] ?? 0;
    const minor = parts[1] ?? 0;

    return major > 2 || (major === 2 && minor >= 13);
  }

  /**
   * Detect worktrees for a repository.
   */
  async detectWorktrees(repoPath: string): Promise<Worktree[]> {
    this._detectWorktreesCalls.push({ repoPath });

    // Check for injected error
    if (this.injectDetectError) {
      throw this.injectDetectError;
    }

    // Check if git is supported
    const supported = await this.isWorktreeSupported();
    if (!supported) {
      return [];
    }

    return this._worktrees.get(repoPath) ?? [];
  }

  /**
   * Get main repository path for a directory.
   */
  async getMainRepoPath(path: string): Promise<string | null> {
    this._getMainRepoPathCalls.push({ path });

    // Check for injected error
    if (this.injectMainRepoError) {
      throw this.injectMainRepoError;
    }

    if (!this.gitVersion) {
      return null;
    }

    return this._mainRepoPaths.get(path) ?? null;
  }

  /**
   * Check if path is in main worktree.
   */
  async isMainWorktree(path: string): Promise<boolean> {
    this._isMainWorktreeCalls.push({ path });

    if (!this.gitVersion) {
      return true; // Default to true per real implementation
    }

    return this._isMainWorktree.get(path) ?? true;
  }
}
