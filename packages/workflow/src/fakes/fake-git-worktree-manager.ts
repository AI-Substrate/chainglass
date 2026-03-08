/**
 * Fake git worktree manager for testing.
 *
 * Per Plan 069 Phase 1: Provides a configurable test double for IGitWorktreeManager.
 * Per DYK D3: State model covers the full Workshop 002 error taxonomy.
 *
 * The fake's configurable states ARE the behavioral specification for the
 * real adapter in Phase 2. Every scenario modeled here must be handled
 * by GitWorktreeManagerAdapter.
 *
 * Follows the established FakeGitWorktreeResolver pattern with:
 * - Call tracking arrays with spread operator getters
 * - State configuration via direct setters
 * - Error injection for testing error paths
 * - reset() helper for test isolation
 */

import type {
  CreateWorktreeGitResult,
  CreateWorktreeGitStatusCode,
  IGitWorktreeManager,
  MainStatusCode,
  MainStatusResult,
  SyncMainResult,
  SyncStatusCode,
} from '../interfaces/git-worktree-manager.interface.js';

// ==================== Call Recording Types ====================

/** Recorded checkMainStatus() call for test inspection. */
export interface CheckMainStatusCall {
  mainRepoPath: string;
}

/** Recorded syncMain() call for test inspection. */
export interface SyncMainCall {
  mainRepoPath: string;
}

/** Recorded createWorktree() call for test inspection. */
export interface CreateWorktreeManagerCall {
  mainRepoPath: string;
  branchName: string;
  worktreePath: string;
}

/** Recorded listBranches() call for test inspection. */
export interface ListBranchesCall {
  mainRepoPath: string;
}

/** Recorded listPlanFolders() call for test inspection. */
export interface ListPlanFoldersCall {
  mainRepoPath: string;
}

// ==================== Fake Implementation ====================

/**
 * Fake git worktree manager for testing.
 *
 * Three-part API:
 * 1. State Setup: setMainStatus(), setSyncResult(), setCreateResult()
 * 2. State Inspection: Read calls via *Calls getters
 * 3. Error Injection: Set inject* flags to simulate unexpected errors
 *
 * @example
 * ```typescript
 * const manager = new FakeGitWorktreeManager();
 *
 * // State setup - clean main, ready to create
 * manager.setMainStatus('clean', { localRef: 'abc123', remoteRef: 'abc123' });
 * manager.setSyncResult('already-up-to-date');
 * manager.setCreateResult('created', {
 *   worktreePath: '/repos/069-my-feature',
 *   branchName: '069-my-feature',
 * });
 *
 * // Use manager
 * const status = await manager.checkMainStatus('/repos/main');
 * expect(status.status).toBe('clean');
 *
 * // Inspect calls
 * expect(manager.checkMainStatusCalls).toHaveLength(1);
 *
 * // Error injection
 * manager.injectCheckError = new Error('Git crashed');
 * await expect(manager.checkMainStatus('/any')).rejects.toThrow();
 * ```
 */
export class FakeGitWorktreeManager implements IGitWorktreeManager {
  // ==================== State Configuration ====================

  private _mainStatus: MainStatusResult = {
    status: 'clean',
    mainRepoPath: '/fake/main',
    localRef: 'abc123',
    remoteRef: 'abc123',
  };

  private _syncResult: SyncMainResult = {
    status: 'already-up-to-date',
    localRef: 'abc123',
  };

  private _createResult: CreateWorktreeGitResult = {
    status: 'created',
    worktreePath: '/fake/worktree',
    branchName: '000-fake-branch',
  };

  private _localBranches: string[] = ['main'];
  private _remoteBranches: string[] = ['origin/main'];
  private _planFolders: string[] = [];

  // ==================== Error Injection ====================

  /** When set, checkMainStatus() throws this error. */
  injectCheckError?: Error;

  /** When set, syncMain() throws this error. */
  injectSyncError?: Error;

  /** When set, createWorktree() throws this error. */
  injectCreateError?: Error;

  // ==================== Private Call Tracking ====================

  private _checkMainStatusCalls: CheckMainStatusCall[] = [];
  private _syncMainCalls: SyncMainCall[] = [];
  private _createWorktreeCalls: CreateWorktreeManagerCall[] = [];
  private _listBranchesCalls: ListBranchesCall[] = [];
  private _listPlanFoldersCalls: ListPlanFoldersCall[] = [];

  // ==================== Call Tracking Getters (immutable copies) ====================

  /** All checkMainStatus() calls (returns a copy). */
  get checkMainStatusCalls(): CheckMainStatusCall[] {
    return [...this._checkMainStatusCalls];
  }

  /** All syncMain() calls (returns a copy). */
  get syncMainCalls(): SyncMainCall[] {
    return [...this._syncMainCalls];
  }

  /** All createWorktree() calls (returns a copy). */
  get createWorktreeCalls(): CreateWorktreeManagerCall[] {
    return [...this._createWorktreeCalls];
  }

  /** All listBranches() calls (returns a copy). */
  get listBranchesCalls(): ListBranchesCall[] {
    return [...this._listBranchesCalls];
  }

  /** All listPlanFolders() calls (returns a copy). */
  get listPlanFoldersCalls(): ListPlanFoldersCall[] {
    return [...this._listPlanFoldersCalls];
  }

  // ==================== State Setup Helpers ====================

  /**
   * Configure the main status check result.
   *
   * Workshop 002 taxonomy:
   * - 'clean': main is up-to-date, no local changes
   * - 'dirty': tracked local changes present
   * - 'ahead': local main has unpushed commits
   * - 'diverged': local and remote main have diverged
   * - 'no-main-branch': local 'main' branch doesn't exist
   * - 'lock-held': git lock file present (concurrent operation)
   * - 'git-failure': unexpected git error
   */
  setMainStatus(
    status: MainStatusCode,
    options?: { mainRepoPath?: string; localRef?: string; remoteRef?: string; detail?: string }
  ): void {
    this._mainStatus = {
      status,
      mainRepoPath: options?.mainRepoPath ?? '/fake/main',
      localRef: options?.localRef,
      remoteRef: options?.remoteRef,
      detail: options?.detail,
    };
  }

  /**
   * Configure the sync result.
   *
   * - 'synced': fast-forward succeeded
   * - 'already-up-to-date': no sync needed
   * - 'fetch-failed': could not reach origin
   * - 'fast-forward-failed': fast-forward rejected (diverged)
   * - 'git-failure': unexpected git error
   */
  setSyncResult(status: SyncStatusCode, options?: { localRef?: string; detail?: string }): void {
    this._syncResult = {
      status,
      localRef: options?.localRef,
      detail: options?.detail,
    };
  }

  /**
   * Configure the create worktree result.
   *
   * - 'created': worktree successfully created
   * - 'branch-exists': branch name already taken
   * - 'path-exists': worktree directory already exists
   * - 'git-failure': unexpected git error
   */
  setCreateResult(
    status: CreateWorktreeGitStatusCode,
    options?: { worktreePath?: string; branchName?: string; detail?: string }
  ): void {
    this._createResult = {
      status,
      worktreePath: options?.worktreePath,
      branchName: options?.branchName,
      detail: options?.detail,
    };
  }

  /**
   * Configure branch lists returned by listBranches().
   */
  setBranches(localBranches: string[], remoteBranches: string[]): void {
    this._localBranches = localBranches;
    this._remoteBranches = remoteBranches;
  }

  /**
   * Configure plan folders returned by listPlanFolders().
   */
  setPlanFolders(folders: string[]): void {
    this._planFolders = folders;
  }

  // ==================== Test Helpers ====================

  /** Reset all state (configuration, call tracking, error injection). */
  reset(): void {
    this._mainStatus = {
      status: 'clean',
      mainRepoPath: '/fake/main',
      localRef: 'abc123',
      remoteRef: 'abc123',
    };
    this._syncResult = { status: 'already-up-to-date', localRef: 'abc123' };
    this._createResult = {
      status: 'created',
      worktreePath: '/fake/worktree',
      branchName: '000-fake-branch',
    };

    this.injectCheckError = undefined;
    this.injectSyncError = undefined;
    this.injectCreateError = undefined;

    this._checkMainStatusCalls = [];
    this._syncMainCalls = [];
    this._createWorktreeCalls = [];
    this._listBranchesCalls = [];
    this._listPlanFoldersCalls = [];
    this._localBranches = ['main'];
    this._remoteBranches = ['origin/main'];
    this._planFolders = [];
  }

  // ==================== IGitWorktreeManager Implementation ====================

  async checkMainStatus(mainRepoPath: string): Promise<MainStatusResult> {
    this._checkMainStatusCalls.push({ mainRepoPath });

    if (this.injectCheckError) {
      throw this.injectCheckError;
    }

    return { ...this._mainStatus };
  }

  async syncMain(mainRepoPath: string): Promise<SyncMainResult> {
    this._syncMainCalls.push({ mainRepoPath });

    if (this.injectSyncError) {
      throw this.injectSyncError;
    }

    return { ...this._syncResult };
  }

  async createWorktree(
    mainRepoPath: string,
    branchName: string,
    worktreePath: string
  ): Promise<CreateWorktreeGitResult> {
    this._createWorktreeCalls.push({ mainRepoPath, branchName, worktreePath });

    if (this.injectCreateError) {
      throw this.injectCreateError;
    }

    return { ...this._createResult };
  }

  async listBranches(
    mainRepoPath: string
  ): Promise<{ localBranches: string[]; remoteBranches: string[] }> {
    this._listBranchesCalls.push({ mainRepoPath });
    return {
      localBranches: [...this._localBranches],
      remoteBranches: [...this._remoteBranches],
    };
  }

  async listPlanFolders(mainRepoPath: string): Promise<string[]> {
    this._listPlanFoldersCalls.push({ mainRepoPath });
    return [...this._planFolders];
  }
}
