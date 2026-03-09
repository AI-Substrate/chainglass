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

import { WORKSPACE_COLOR_NAMES, WORKSPACE_EMOJI_SET } from '../constants/workspace-palettes.js';
import { Workspace } from '../entities/workspace.js';
import type { WorkspacePreferences } from '../entities/workspace.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import { type WorkspaceError, WorkspaceErrors } from '../errors/workspace-errors.js';
import type { IGitWorktreeManager } from '../interfaces/git-worktree-manager.interface.js';
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
  BootstrapStatus,
  CreateWorktreeRequest,
  CreateWorktreeResult,
  IWorkspaceService,
  PreviewCreateWorktreeRequest,
  PreviewCreateWorktreeResult,
  RemoveWorkspaceResult,
  WorkspaceOperationResult,
} from '../interfaces/workspace-service.interface.js';
import type { WorktreeBootstrapRunner } from './worktree-bootstrap-runner.js';
import { buildWorktreeName, hasBranchConflict, resolveWorktreeName } from './worktree-name.js';
import type { OrdinalSources } from './worktree-name.js';

/**
 * WorkspaceService implements workspace management.
 *
 * Per ADR-0004: Uses constructor injection for all dependencies.
 */
export class WorkspaceService implements IWorkspaceService {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly registryAdapter: IWorkspaceRegistryAdapter,
    private readonly contextResolver: IWorkspaceContextResolver,
    private readonly gitResolver: IGitWorktreeResolver,
    private readonly gitManager: IGitWorktreeManager,
    private readonly bootstrapRunner: WorktreeBootstrapRunner
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
   * Resolve workspace context from URL parameters.
   *
   * Per Plan 014 Phase 6: Web API routes need to construct WorkspaceContext
   * from URL params. This handles workspace lookup, worktree matching, and
   * populating context fields correctly.
   *
   * @param slug - Workspace slug from URL
   * @param worktreePath - Optional worktree path (defaults to workspace root/main worktree)
   * @returns WorkspaceContext if found, null if workspace not found
   */
  async resolveContextFromParams(
    slug: string,
    worktreePath?: string
  ): Promise<WorkspaceContext | null> {
    // 1. Get workspace info
    const info = await this.getInfo(slug);
    if (!info) {
      return null;
    }

    // 2. Determine which worktree to use
    // If no worktreePath specified, use the main worktree or workspace root
    let targetWorktree = info.worktrees.find((w) => !worktreePath || w.path === worktreePath);

    // If worktreePath specified but not found in worktrees, check if it matches workspace path
    if (worktreePath && !targetWorktree) {
      // Normalize paths for comparison (remove trailing slashes)
      const normalizedWorktreePath = worktreePath.replace(/\/+$/, '');
      const normalizedWorkspacePath = info.path.replace(/\/+$/, '');

      if (normalizedWorktreePath === normalizedWorkspacePath) {
        // The worktreePath is the workspace root
        targetWorktree = info.worktrees.find((w) => w.path === info.path) || undefined;
      } else {
        // Try to find by normalized path
        targetWorktree = info.worktrees.find(
          (w) => w.path.replace(/\/+$/, '') === normalizedWorktreePath
        );
      }
    }

    // 3. Determine if we're in the main worktree
    // Main worktree is either: the workspace path itself, or the worktree without a linked path
    const mainWorktree = info.worktrees.find(
      (w) => w.path === info.path || (!w.isDetached && !w.isBare && w.branch !== null)
    );
    const isMainWorktree = targetWorktree
      ? targetWorktree.path === info.path || targetWorktree === mainWorktree
      : true;

    // 4. Build context
    return {
      workspaceSlug: info.slug,
      workspaceName: info.name,
      workspacePath: info.path,
      worktreePath: targetWorktree?.path ?? worktreePath ?? info.path,
      worktreeBranch: targetWorktree?.branch ?? null,
      isMainWorktree,
      hasGit: info.hasGit,
    };
  }

  /**
   * Update workspace preferences (emoji, color, starred, sortOrder).
   *
   * Per Plan 041: Partial update — only provided fields are changed.
   * Validates emoji/color against palette if non-empty.
   * Per DYK-P1-05: Empty string is valid (means "unset").
   */
  async updatePreferences(
    slug: string,
    prefs: Partial<WorkspacePreferences>
  ): Promise<WorkspaceOperationResult> {
    // Validate emoji against palette (if provided and non-empty)
    if (prefs.emoji !== undefined && prefs.emoji !== '' && !WORKSPACE_EMOJI_SET.has(prefs.emoji)) {
      return {
        success: false,
        errors: [
          {
            code: 'E076',
            message: `Invalid emoji '${prefs.emoji}': not in workspace palette`,
            action: 'Choose an emoji from the workspace palette',
            path: slug,
          },
        ],
      };
    }

    // Validate color against palette (if provided and non-empty)
    if (
      prefs.color !== undefined &&
      prefs.color !== '' &&
      !WORKSPACE_COLOR_NAMES.has(prefs.color)
    ) {
      return {
        success: false,
        errors: [
          {
            code: 'E076',
            message: `Invalid color '${prefs.color}': not in workspace palette`,
            action: 'Choose a color from the workspace palette',
            path: slug,
          },
        ],
      };
    }

    // Validate sortOrder (if provided) — must be non-negative finite integer
    if (
      prefs.sortOrder !== undefined &&
      (!Number.isFinite(prefs.sortOrder) || prefs.sortOrder < 0)
    ) {
      return {
        success: false,
        errors: [
          {
            code: 'E076',
            message: `Invalid sortOrder '${prefs.sortOrder}': must be a non-negative integer`,
            action: 'Provide a non-negative integer for sortOrder',
            path: slug,
          },
        ],
      };
    }

    // Load workspace
    let workspace: Workspace;
    try {
      workspace = await this.registryAdapter.load(slug);
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return {
          success: false,
          errors: [WorkspaceErrors.notFound(slug)],
        };
      }
      throw error;
    }

    // Apply preference update (immutable)
    const updated = workspace.withPreferences(prefs);

    // Persist
    const result = await this.registryAdapter.update(updated);
    if (!result.ok) {
      return {
        success: false,
        errors: [
          {
            code: result.errorCode ?? 'E074',
            message: result.errorMessage ?? 'Unknown error',
            action: 'Check the error message',
            path: slug,
          },
        ],
      };
    }

    return { success: true, errors: [] };
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

  // ==================== Worktree Creation (Plan 069 Phase 2) ====================

  async previewCreateWorktree(
    request: PreviewCreateWorktreeRequest
  ): Promise<PreviewCreateWorktreeResult> {
    // 1. Resolve workspace to get main repo path
    const info = await this.getInfo(request.workspaceSlug);
    if (!info) {
      throw new EntityNotFoundError('Workspace', request.workspaceSlug, 'workspace-registry');
    }

    const mainRepoPath = info.path;

    // 2. Fetch branch and plan data for naming
    const sources = await this.fetchOrdinalSources(mainRepoPath);

    // 3. Resolve the worktree name
    const nameResult = resolveWorktreeName(request.requestedName, sources);
    if (!nameResult) {
      throw new Error(`Invalid worktree name: '${request.requestedName}'`);
    }

    // 4. Compute worktree path (sibling of main repo)
    const parentDir = mainRepoPath.replace(/\/[^/]+$/, '');
    const worktreePath = `${parentDir}/${nameResult.branchName}`;

    // 5. Check for bootstrap hook
    const hasBootstrapHook = await this.bootstrapRunner.hasHook(mainRepoPath);

    return {
      normalizedSlug: nameResult.slug,
      ordinal: nameResult.ordinal,
      branchName: nameResult.branchName,
      worktreePath,
      hasBootstrapHook,
    };
  }

  async createWorktree(request: CreateWorktreeRequest): Promise<CreateWorktreeResult> {
    // 1. Resolve workspace
    const info = await this.getInfo(request.workspaceSlug);
    if (!info) {
      return {
        status: 'blocked',
        errors: [WorkspaceErrors.notFound(request.workspaceSlug)],
      };
    }

    const mainRepoPath = info.path;

    // 2. Serialize by mainRepoPath
    return this.withLock(mainRepoPath, async () => {
      // 3. Preflight checks
      const mainStatus = await this.gitManager.checkMainStatus(mainRepoPath);
      if (mainStatus.status !== 'clean') {
        return {
          status: 'blocked' as const,
          errors: [this.mainStatusToError(mainStatus)],
        };
      }

      // 4. Sync main
      const syncResult = await this.gitManager.syncMain(mainRepoPath);
      if (syncResult.status !== 'synced' && syncResult.status !== 'already-up-to-date') {
        return {
          status: 'blocked' as const,
          errors: [WorkspaceErrors.gitError(mainRepoPath, syncResult.detail ?? 'Sync failed')],
        };
      }

      // 5. Allocate name inside the lock (fresh sources)
      const sources = await this.fetchOrdinalSources(mainRepoPath);
      const nameResult = resolveWorktreeName(request.requestedName, sources);
      if (!nameResult) {
        return {
          status: 'blocked' as const,
          errors: [WorkspaceErrors.invalidPath(request.requestedName, 'Invalid worktree name')],
        };
      }

      const parentDir = mainRepoPath.replace(/\/[^/]+$/, '');
      const worktreePath = `${parentDir}/${nameResult.branchName}`;

      // 6. Check for conflicts (per DYK D14: hard block if allocated name conflicts)
      if (hasBranchConflict(nameResult.branchName, sources)) {
        // Try re-allocating with incremented ordinal
        const retryName = buildWorktreeName(nameResult.ordinal + 1, nameResult.slug);
        if (hasBranchConflict(retryName, sources)) {
          // Hard block — both ordinals taken, this is a bug
          return {
            status: 'blocked' as const,
            errors: [
              WorkspaceErrors.gitError(
                mainRepoPath,
                `Branch '${nameResult.branchName}' already exists and retry also conflicts`
              ),
            ],
          };
        }
        // Silent re-allocation (DYK D14)
        const retryPath = `${parentDir}/${retryName}`;
        return this.executeCreate(
          mainRepoPath,
          retryName,
          retryPath,
          request,
          nameResult.slug,
          nameResult.ordinal + 1
        );
      }

      return this.executeCreate(
        mainRepoPath,
        nameResult.branchName,
        worktreePath,
        request,
        nameResult.slug,
        nameResult.ordinal
      );
    });
  }

  // ==================== Private Helpers ====================

  private async executeCreate(
    mainRepoPath: string,
    branchName: string,
    worktreePath: string,
    request: CreateWorktreeRequest,
    slug: string,
    ordinal: number
  ): Promise<CreateWorktreeResult> {
    // Create the worktree
    const createResult = await this.gitManager.createWorktree(
      mainRepoPath,
      branchName,
      worktreePath
    );
    if (createResult.status !== 'created') {
      // FT-003: Return refreshed preview on branch/path conflicts
      if (createResult.status === 'branch-exists' || createResult.status === 'path-exists') {
        const refreshedSources = await this.fetchOrdinalSources(mainRepoPath);
        const refreshedName = resolveWorktreeName(request.requestedName, refreshedSources);
        const parentDir = mainRepoPath.replace(/\/[^/]+$/, '');
        const refreshedPreview = refreshedName
          ? {
              normalizedSlug: refreshedName.slug,
              ordinal: refreshedName.ordinal,
              branchName: refreshedName.branchName,
              worktreePath: `${parentDir}/${refreshedName.branchName}`,
              hasBootstrapHook: false,
            }
          : undefined;
        return {
          status: 'blocked',
          errors: [
            WorkspaceErrors.gitError(
              mainRepoPath,
              createResult.detail ?? 'Worktree creation conflict'
            ),
          ],
          refreshedPreview,
        };
      }
      return {
        status: 'blocked',
        errors: [
          WorkspaceErrors.gitError(mainRepoPath, createResult.detail ?? 'Worktree creation failed'),
        ],
      };
    }

    // Run bootstrap hook (informational only)
    const bootstrapStatus = await this.bootstrapRunner.run({
      mainRepoPath,
      workspaceSlug: request.workspaceSlug,
      requestedName: request.requestedName,
      normalizedSlug: slug,
      ordinal,
      branchName,
      worktreePath,
    });

    return {
      status: 'created',
      branchName,
      worktreePath,
      bootstrapStatus,
    };
  }

  private async fetchOrdinalSources(mainRepoPath: string): Promise<OrdinalSources> {
    const [branches, planFolders] = await Promise.all([
      this.gitManager.listBranches(mainRepoPath),
      this.gitManager.listPlanFolders(mainRepoPath),
    ]);
    return {
      localBranches: branches.localBranches,
      remoteBranches: branches.remoteBranches,
      planFolders,
    };
  }

  private mainStatusToError(status: { status: string; detail?: string }): WorkspaceError {
    const messages: Record<string, string> = {
      dirty: 'Main branch has uncommitted changes',
      ahead: 'Main branch has unpushed commits',
      diverged: 'Main branch has diverged from origin',
      'no-main-branch': 'Not on the main branch',
      'lock-held': 'A git operation is already in progress',
      'git-failure': 'Git operation failed',
    };
    return WorkspaceErrors.gitError(
      status.detail ?? '',
      messages[status.status] ?? `Unexpected status: ${status.status}`
    );
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((r) => {
      resolve = r;
    });
    this.locks.set(key, next);

    await prev;
    try {
      return await fn();
    } finally {
      resolve?.();
    }
  }
}
