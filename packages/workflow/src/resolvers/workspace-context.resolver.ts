/**
 * WorkspaceContext resolver for detecting workspace from filesystem paths.
 *
 * Per Plan 014: Workspaces - Phase 2: WorkspaceContext Resolution + Worktree Discovery
 *
 * This resolver walks up the directory tree from a given path to find
 * a matching registered workspace. It also detects git worktree info.
 *
 * Key behaviors:
 * - Longest matching path wins (DYK-03: sort by path.length descending)
 * - No caching - always fresh resolution (spec Q5)
 * - Graceful degradation when git unavailable
 * - Worktree detection for linked worktrees
 */

import type { IFileSystem } from '@chainglass/shared';
import type { IGitWorktreeResolver } from '../interfaces/git-worktree-resolver.interface.js';
import type {
  IWorkspaceContextResolver,
  WorkspaceContext,
  WorkspaceContextResult,
  WorkspaceInfo,
  WorkspaceInfoResult,
  Worktree,
} from '../interfaces/workspace-context.interface.js';
import type { IWorkspaceRegistryAdapter } from '../interfaces/workspace-registry-adapter.interface.js';

/**
 * Real implementation of IWorkspaceContextResolver.
 *
 * Resolves workspace context from filesystem paths by:
 * 1. Loading all registered workspaces from registry
 * 2. For each workspace, getting its worktrees (if git repo)
 * 3. Checking if the input path is inside any workspace or its worktrees
 * 4. Sorting by path length descending (longest first - DYK-03)
 *
 * Per ADR-0004: Use DI container for injection.
 */
export class WorkspaceContextResolver implements IWorkspaceContextResolver {
  constructor(
    private readonly registryAdapter: IWorkspaceRegistryAdapter,
    private readonly fileSystem: IFileSystem,
    private readonly gitResolver?: IGitWorktreeResolver
  ) {}

  /**
   * Resolve workspace context from a filesystem path.
   *
   * Per DYK-03: Sort workspaces by path.length descending before matching
   * to ensure the most specific (longest) path wins.
   *
   * Also checks if the path is inside any git worktree of a registered workspace.
   *
   * @param inputPath - Absolute filesystem path (typically CWD)
   * @returns WorkspaceContext if path is in a registered workspace, null otherwise
   */
  async resolveFromPath(inputPath: string): Promise<WorkspaceContextResult> {
    // Normalize path: remove trailing slash
    const path = this.normalizePath(inputPath);

    // Get all registered workspaces
    const workspaces = await this.registryAdapter.list();

    if (workspaces.length === 0) {
      return null;
    }

    // Sort by path length descending (DYK-03: longest match wins)
    const sorted = [...workspaces].sort((a, b) => b.path.length - a.path.length);

    // First, check if path is directly inside a workspace
    const matchedWorkspace = sorted.find((ws) => this.isPathInWorkspace(path, ws.path));

    if (matchedWorkspace) {
      // Path is in the main workspace - check for worktree info
      const hasGit = await this.checkHasGit(matchedWorkspace.path);
      let worktreePath = matchedWorkspace.path;
      let worktreeBranch: string | null = null;
      let isMainWorktree = true;

      // If git available, try to detect current worktree
      if (hasGit && this.gitResolver) {
        const worktrees = await this.gitResolver.detectWorktrees(matchedWorkspace.path);
        const currentWorktree = worktrees.find((wt) => this.isPathInWorkspace(path, wt.path));
        if (currentWorktree) {
          worktreePath = currentWorktree.path;
          worktreeBranch = currentWorktree.branch;
          isMainWorktree = worktreePath === matchedWorkspace.path;
        }
      }

      return {
        workspaceSlug: matchedWorkspace.slug,
        workspaceName: matchedWorkspace.name,
        workspacePath: matchedWorkspace.path,
        worktreePath,
        worktreeBranch,
        isMainWorktree,
        hasGit,
      };
    }

    // Path not directly in workspace - check if it's in a linked worktree
    if (this.gitResolver) {
      for (const ws of sorted) {
        const hasGit = await this.checkHasGit(ws.path);
        if (!hasGit) continue;

        const worktrees = await this.gitResolver.detectWorktrees(ws.path);
        const matchedWorktree = worktrees.find((wt) => this.isPathInWorkspace(path, wt.path));

        if (matchedWorktree) {
          return {
            workspaceSlug: ws.slug,
            workspaceName: ws.name,
            workspacePath: ws.path,
            worktreePath: matchedWorktree.path,
            worktreeBranch: matchedWorktree.branch,
            isMainWorktree: matchedWorktree.path === ws.path,
            hasGit: true,
          };
        }
      }
    }

    return null;
  }

  /**
   * Get full workspace information by slug.
   *
   * @param slug - Workspace slug to look up
   * @returns WorkspaceInfo if found, null otherwise
   */
  async getWorkspaceInfo(slug: string): Promise<WorkspaceInfoResult> {
    try {
      const workspace = await this.registryAdapter.load(slug);

      // Check if workspace has git
      const hasGit = await this.checkHasGit(workspace.path);

      // Get worktrees if git available
      let worktrees: Worktree[] = [];
      if (hasGit && this.gitResolver) {
        worktrees = await this.gitResolver.detectWorktrees(workspace.path);
      }

      // Build info
      const info: WorkspaceInfo = {
        slug: workspace.slug,
        name: workspace.name,
        path: workspace.path,
        createdAt: workspace.createdAt,
        hasGit,
        worktrees,
      };

      return info;
    } catch {
      // EntityNotFoundError - workspace not found
      return null;
    }
  }

  /**
   * Check if a path is inside a workspace (path prefix check).
   *
   * @param path - The path to check
   * @param workspacePath - The workspace root path
   * @returns true if path is inside workspace
   */
  private isPathInWorkspace(path: string, workspacePath: string): boolean {
    // Exact match
    if (path === workspacePath) {
      return true;
    }

    // Path is inside workspace: must start with workspace path followed by /
    // This prevents /home/user/test matching /home/user/test-project
    return path.startsWith(`${workspacePath}/`);
  }

  /**
   * Normalize a path by removing trailing slashes.
   *
   * @param path - Input path
   * @returns Normalized path
   */
  private normalizePath(path: string): string {
    // Remove trailing slashes (except for root /)
    if (path.length > 1 && path.endsWith('/')) {
      return path.slice(0, -1);
    }
    return path;
  }

  /**
   * Check if a path has git initialized.
   *
   * @param workspacePath - Workspace root path
   * @returns true if .git exists (file or directory)
   */
  private async checkHasGit(workspacePath: string): Promise<boolean> {
    const gitPath = `${workspacePath}/.git`;
    return this.fileSystem.exists(gitPath);
  }
}
