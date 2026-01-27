/**
 * WorkspaceService implementation for managing workspace operations.
 *
 * Per Plan 014: Workspaces - Phase 4: Service Layer + DI Integration
 *
 * This service provides the business logic layer for workspace operations:
 * - add: Register a new workspace
 * - list: Get all registered workspaces
 * - remove: Unregister a workspace
 * - getInfo: Get workspace details including worktrees
 * - resolveContext: Resolve workspace context from a path
 *
 * Per DYK-P4-04: Service validates paths for early-fail UX.
 * Per ADR-0004: Uses constructor injection for testability.
 */

import { Workspace } from '../entities/workspace.js';
import { type WorkspaceError, WorkspaceErrors } from '../errors/workspace-errors.js';
import type { IGitWorktreeResolver } from '../interfaces/git-worktree-resolver.interface.js';
import type {
  IWorkspaceContextResolver,
  WorkspaceContext,
  WorkspaceInfo,
} from '../interfaces/workspace-context.interface.js';
import type { IWorkspaceRegistryAdapter } from '../interfaces/workspace-registry-adapter.interface.js';
import type {
  AddWorkspaceOptions,
  AddWorkspaceResult,
  IWorkspaceService,
  RemoveWorkspaceResult,
} from '../interfaces/workspace-service.interface.js';

/**
 * WorkspaceService implements workspace management.
 *
 * Per ADR-0004: Uses constructor injection for all dependencies.
 */
export class WorkspaceService implements IWorkspaceService {
  constructor(
    private readonly registryAdapter: IWorkspaceRegistryAdapter,
    private readonly contextResolver: IWorkspaceContextResolver,
    private readonly gitResolver: IGitWorktreeResolver
  ) {}

  /**
   * Register a new workspace.
   *
   * Per DYK-P4-04: Validates paths at service level for early-fail UX.
   */
  async add(
    name: string,
    path: string,
    options?: AddWorkspaceOptions
  ): Promise<AddWorkspaceResult> {
    // 1. Validate path format
    const pathError = this.validatePath(path);
    if (pathError) {
      return { success: false, errors: [pathError] };
    }

    // 2. Create workspace entity
    const workspace = Workspace.create({
      name,
      path,
      slug: options?.slug,
    });

    // 3. Check if slug already exists
    const exists = await this.registryAdapter.exists(workspace.slug);
    if (exists) {
      return {
        success: false,
        errors: [WorkspaceErrors.exists(workspace.slug)],
      };
    }

    // 4. Save to registry
    const saveResult = await this.registryAdapter.save(workspace);
    if (!saveResult.ok) {
      return {
        success: false,
        errors: [
          {
            code: saveResult.errorCode ?? 'E074',
            message: saveResult.errorMessage ?? 'Unknown error',
            action: saveResult.errorAction ?? 'Check the error message',
            path: path,
          },
        ],
      };
    }

    return { success: true, workspace, errors: [] };
  }

  /**
   * List all registered workspaces.
   */
  async list(): Promise<Workspace[]> {
    return this.registryAdapter.list();
  }

  /**
   * Remove a workspace from the registry.
   */
  async remove(slug: string): Promise<RemoveWorkspaceResult> {
    const result = await this.registryAdapter.remove(slug);

    if (!result.ok) {
      return {
        success: false,
        errors: [WorkspaceErrors.notFound(slug)],
      };
    }

    return { success: true, removedSlug: slug, errors: [] };
  }

  /**
   * Get detailed workspace information including worktrees.
   */
  async getInfo(slug: string): Promise<WorkspaceInfo | null> {
    // Delegate to context resolver which handles worktree detection
    return this.contextResolver.getWorkspaceInfo(slug);
  }

  /**
   * Resolve workspace context from a filesystem path.
   */
  async resolveContext(path: string): Promise<WorkspaceContext | null> {
    return this.contextResolver.resolveFromPath(path);
  }

  /**
   * Validate path format.
   *
   * Per DYK-P4-04: Defense in depth - service validates for early-fail UX.
   *
   * @returns WorkspaceError if path is invalid, undefined if valid
   */
  private validatePath(path: string): WorkspaceError | undefined {
    // Check for relative path (doesn't start with / or ~)
    if (!path.startsWith('/') && !path.startsWith('~')) {
      return WorkspaceErrors.invalidPath(
        path,
        'Path must be absolute (start with / or ~), not relative'
      );
    }

    // Check for directory traversal
    if (path.includes('..')) {
      return WorkspaceErrors.invalidPath(path, 'Path cannot contain directory traversal (..)');
    }

    return undefined;
  }
}
