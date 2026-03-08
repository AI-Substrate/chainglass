/**
 * Git Worktree Manager interface for mutating git worktree operations.
 *
 * Per Plan 069 Phase 1: Separate mutation boundary from read-only IGitWorktreeResolver.
 * Per Finding 02: Git mutation support must stay separate from the existing read-only resolver.
 * Per Workshop 002: Main sync strategy and git safety.
 *
 * This interface abstracts git write operations:
 * - checkMainStatus: Preflight checks on the main branch state
 * - syncMain: Fetch and fast-forward main to match origin
 * - createWorktree: Create a new git worktree with a branch
 *
 * The read-only IGitWorktreeResolver remains untouched.
 *
 * Implementations:
 * - GitWorktreeManagerAdapter: Real implementation using IProcessManager (Phase 2)
 * - FakeGitWorktreeManager: Configurable implementation for testing (Phase 1)
 */

// ==================== Status Codes ====================

/**
 * Status codes from checking the main branch state.
 *
 * Per Workshop 002: Preflight checks cover dirty state, branch existence,
 * divergence, concurrent operations, and git availability.
 */
export type MainStatusCode =
  | 'clean'
  | 'dirty'
  | 'ahead'
  | 'diverged'
  | 'no-main-branch'
  | 'lock-held'
  | 'git-failure';

/**
 * Status codes from syncing main with origin.
 */
export type SyncStatusCode =
  | 'synced'
  | 'already-up-to-date'
  | 'fetch-failed'
  | 'fast-forward-failed'
  | 'git-failure';

/**
 * Status codes from creating a worktree.
 */
export type CreateWorktreeGitStatusCode =
  | 'created'
  | 'branch-exists'
  | 'path-exists'
  | 'git-failure';

// ==================== Result Types ====================

/**
 * Result from checking the main branch status.
 *
 * Per Workshop 002: Must distinguish dirty, ahead, diverged, lock-held,
 * and no-main-branch so the service can return specific blocking errors.
 */
export interface MainStatusResult {
  status: MainStatusCode;
  /** The resolved main repo path (present when status !== 'git-failure') */
  mainRepoPath?: string;
  /** The local main branch ref (present when status !== 'no-main-branch') */
  localRef?: string;
  /** The remote main branch ref (present after fetch comparison) */
  remoteRef?: string;
  /** Human-readable detail for error states */
  detail?: string;
}

/**
 * Result from syncing the main branch.
 *
 * Per Workshop 002: Fetch origin/main, compare, fast-forward only if behind.
 */
export interface SyncMainResult {
  status: SyncStatusCode;
  /** The local ref after sync (present on success) */
  localRef?: string;
  /** Human-readable detail for error states */
  detail?: string;
}

/**
 * Result from creating a git worktree.
 */
export interface CreateWorktreeGitResult {
  status: CreateWorktreeGitStatusCode;
  /** Absolute path to the created worktree (present on success) */
  worktreePath?: string;
  /** Branch name that was created/checked out (present on success) */
  branchName?: string;
  /** Human-readable detail for error states */
  detail?: string;
}

// ==================== Manager Interface ====================

/**
 * Interface for mutating git worktree operations.
 *
 * Per ADR-0004: Use DI container with interface for testability.
 * Per Finding 02: Separate from IGitWorktreeResolver (read-only).
 *
 * Methods are focused on git plumbing only — no naming logic,
 * no bootstrap execution, no workspace registration. Those
 * responsibilities belong to WorkspaceService orchestration (Phase 2).
 */
export interface IGitWorktreeManager {
  /**
   * Check the status of the local main branch.
   *
   * Runs preflight checks per Workshop 002:
   * 1. Verify local branch 'main' exists
   * 2. Check for tracked local changes (dirty state)
   * 3. Check for in-progress git operations (lock files)
   * 4. Compare local main vs origin/main (ahead/behind/diverged)
   *
   * @param mainRepoPath - Absolute path to the main repository root
   * @returns MainStatusResult with status code and refs
   */
  checkMainStatus(mainRepoPath: string): Promise<MainStatusResult>;

  /**
   * Fetch origin and fast-forward the local main branch.
   *
   * Per Workshop 002: Fetch origin/main, compare, fast-forward only
   * if behind. Block if ahead or diverged (caller handles that).
   *
   * Should only be called after checkMainStatus() returns 'clean'.
   *
   * @param mainRepoPath - Absolute path to the main repository root
   * @returns SyncMainResult with status and updated ref
   */
  syncMain(mainRepoPath: string): Promise<SyncMainResult>;

  /**
   * Create a new git worktree with a new branch.
   *
   * Runs `git worktree add` to create the worktree directory
   * and branch from the current HEAD of local main.
   *
   * Should only be called after syncMain() succeeds.
   *
   * @param mainRepoPath - Absolute path to the main repository root
   * @param branchName - Name for the new branch (e.g., "069-my-feature")
   * @param worktreePath - Absolute path for the new worktree directory
   * @returns CreateWorktreeGitResult with status and paths
   */
  createWorktree(
    mainRepoPath: string,
    branchName: string,
    worktreePath: string
  ): Promise<CreateWorktreeGitResult>;

  // ==================== Read Methods for Naming Allocator (Plan 069 DYK D13) ====================
  // These reads exist to serve the create workflow — they're part of the
  // mutation lifecycle, not general-purpose discovery.

  /**
   * List local and remote branch names.
   *
   * Used by the naming allocator to scan for ordinal collisions.
   *
   * @param mainRepoPath - Absolute path to the main repository root
   * @returns Object with localBranches and remoteBranches string arrays
   */
  listBranches(
    mainRepoPath: string
  ): Promise<{ localBranches: string[]; remoteBranches: string[] }>;

  /**
   * List plan folder names under docs/plans/ on the main branch.
   *
   * Used by the naming allocator to scan for ordinal collisions
   * from planning work that may not have branches yet.
   *
   * @param mainRepoPath - Absolute path to the main repository root
   * @returns Array of folder names (e.g., ["067-foo", "068-bar"])
   */
  listPlanFolders(mainRepoPath: string): Promise<string[]>;
}
