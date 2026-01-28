/**
 * Workspace Context interfaces for resolving workspaces from paths.
 *
 * Per Plan 014: Workspaces - Phase 2: WorkspaceContext Resolution + Worktree Discovery
 *
 * This module provides:
 * - WorkspaceContext: Resolution result containing workspace + worktree info
 * - Worktree: Git worktree metadata from `git worktree list --porcelain`
 * - WorkspaceInfo: Extended workspace info including all worktrees
 * - IWorkspaceContextResolver: Interface for context resolution (per DYK-02)
 *
 * Implementations:
 * - WorkspaceContextResolver: Real implementation using registry + git
 * - FakeWorkspaceContextResolver: Configurable implementation for testing
 *
 * Per spec Q5: No caching - always fresh resolution.
 * Per ADR-0004: Use DI container with interface for testability.
 */

/**
 * Git worktree metadata parsed from `git worktree list --porcelain`.
 *
 * Per High Discovery 04: Worktree detection requires git ≥ 2.13.
 *
 * Porcelain output format:
 * ```
 * worktree /path/to/worktree
 * HEAD abc123...
 * branch refs/heads/feature-branch
 * ```
 *
 * Or for detached HEAD:
 * ```
 * worktree /path/to/worktree
 * HEAD abc123...
 * detached
 * ```
 *
 * Or for bare repo:
 * ```
 * worktree /path/to/bare
 * bare
 * ```
 */
export interface Worktree {
  /** Absolute path to the worktree */
  path: string;

  /** Current HEAD commit SHA (40 characters) */
  head: string;

  /** Branch name if checked out (e.g., "feature-branch", not "refs/heads/...") */
  branch: string | null;

  /** True if worktree is in detached HEAD state */
  isDetached: boolean;

  /** True if this is a bare repository */
  isBare: boolean;

  /** True if worktree needs pruning (missing from filesystem) */
  isPrunable: boolean;
}

/**
 * Context resolved from a filesystem path.
 *
 * This is the primary result from resolving "which workspace am I in?"
 * based on the current working directory.
 *
 * Per the plan:
 * - workspaceSlug: URL-safe identifier from Workspace entity
 * - workspacePath: Root path of the registered workspace
 * - worktreePath: Current worktree (may differ from workspacePath in git worktrees)
 * - worktreeBranch: Current branch if in git worktree
 * - isMainWorktree: True if in the main checkout (not a linked worktree)
 */
export interface WorkspaceContext {
  /** Workspace slug (URL-safe identifier) */
  workspaceSlug: string;

  /** Workspace display name */
  workspaceName: string;

  /** Root path of the registered workspace */
  workspacePath: string;

  /** Current worktree path (equals workspacePath if not in a git worktree) */
  worktreePath: string;

  /** Current branch name if in git worktree, null otherwise */
  worktreeBranch: string | null;

  /** True if in the main checkout (not a linked worktree) */
  isMainWorktree: boolean;

  /** True if workspace has git initialized */
  hasGit: boolean;
}

/**
 * Extended workspace information including all discovered worktrees.
 *
 * Use this when you need the full workspace metadata with worktree list,
 * not just the current context.
 */
export interface WorkspaceInfo {
  /** Workspace slug (URL-safe identifier) */
  slug: string;

  /** Workspace display name */
  name: string;

  /** Root path of the registered workspace */
  path: string;

  /** When the workspace was registered */
  createdAt: Date;

  /** True if workspace has git initialized */
  hasGit: boolean;

  /** All discovered worktrees (empty if not a git repo or git < 2.13) */
  worktrees: Worktree[];
}

/**
 * Result from IWorkspaceContextResolver.resolveFromPath().
 *
 * Returns null when the path is not inside any registered workspace.
 */
export type WorkspaceContextResult = WorkspaceContext | null;

/**
 * Result from IWorkspaceContextResolver.getWorkspaceInfo().
 *
 * Returns null when the workspace slug is not found.
 */
export type WorkspaceInfoResult = WorkspaceInfo | null;

/**
 * Interface for workspace context resolution.
 *
 * Per DYK-02: Use DI container for resolvers per ADR-0004.
 *
 * Implementations:
 * - WorkspaceContextResolver: Real implementation
 * - FakeWorkspaceContextResolver: Configurable test double
 *
 * Per spec Q5: No caching - always fresh resolution.
 */
export interface IWorkspaceContextResolver {
  /**
   * Resolve workspace context from a filesystem path.
   *
   * Walks up the directory tree from the given path to find a matching
   * registered workspace. If multiple workspaces match (overlapping paths),
   * returns the most specific match (longest path).
   *
   * Per DYK-03: Sort workspaces by path.length descending before matching.
   *
   * @param path - Absolute filesystem path (typically CWD)
   * @returns WorkspaceContext if path is in a registered workspace, null otherwise
   */
  resolveFromPath(path: string): Promise<WorkspaceContextResult>;

  /**
   * Get full workspace information by slug.
   *
   * Includes all discovered worktrees for git repositories.
   *
   * @param slug - Workspace slug to look up
   * @returns WorkspaceInfo if found, null otherwise
   */
  getWorkspaceInfo(slug: string): Promise<WorkspaceInfoResult>;
}
