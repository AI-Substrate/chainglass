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
 */

import type { IFileSystem } from '@chainglass/shared';
import type {
  IWorkspaceContextResolver,
  WorkspaceContext,
  WorkspaceContextResult,
  WorkspaceInfo,
  WorkspaceInfoResult,
} from '../interfaces/workspace-context.interface.js';
import type { IWorkspaceRegistryAdapter } from '../interfaces/workspace-registry-adapter.interface.js';

/**
 * Real implementation of IWorkspaceContextResolver.
 *
 * Resolves workspace context from filesystem paths by:
 * 1. Loading all registered workspaces from registry
 * 2. Sorting by path length descending (longest first - DYK-03)
 * 3. Finding first workspace whose path is a prefix of the input path
 *
 * Per ADR-0004: Use DI container for injection.
 */
export class WorkspaceContextResolver implements IWorkspaceContextResolver {
  constructor(
    private readonly registryAdapter: IWorkspaceRegistryAdapter,
    private readonly fileSystem: IFileSystem
  ) {}

  /**
   * Resolve workspace context from a filesystem path.
   *
   * Per DYK-03: Sort workspaces by path.length descending before matching
   * to ensure the most specific (longest) path wins.
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

    // Find first workspace whose path is a prefix of the input path
    const matchedWorkspace = sorted.find((ws) => this.isPathInWorkspace(path, ws.path));

    if (!matchedWorkspace) {
      return null;
    }

    // Check if workspace has git
    const hasGit = await this.checkHasGit(matchedWorkspace.path);

    // Build context (git worktree detection will be added in T019-T022)
    const context: WorkspaceContext = {
      workspaceSlug: matchedWorkspace.slug,
      workspaceName: matchedWorkspace.name,
      workspacePath: matchedWorkspace.path,
      worktreePath: matchedWorkspace.path, // Default: same as workspace (updated in T019)
      worktreeBranch: null, // Will be populated in T019
      isMainWorktree: true, // Will be determined in T019
      hasGit,
    };

    return context;
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

      // Build info (worktree detection will be added in T019-T022)
      const info: WorkspaceInfo = {
        slug: workspace.slug,
        name: workspace.name,
        path: workspace.path,
        createdAt: workspace.createdAt,
        hasGit,
        worktrees: [], // Will be populated in T019
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
