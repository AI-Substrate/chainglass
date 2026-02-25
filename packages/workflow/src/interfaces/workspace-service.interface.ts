/**
 * Workspace Service interface for managing workspace operations.
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
 * Per DYK-P4-01: Service result types use errors[] array pattern.
 * Per DYK-P4-04: Service validates paths for early-fail UX.
 *
 * Implementations:
 * - WorkspaceService: Real implementation using adapters
 */

import type { Workspace } from '../entities/workspace.js';
import type { WorkspacePreferences } from '../entities/workspace.js';
import type { WorkspaceError } from '../errors/workspace-errors.js';
import type { WorkspaceContext, WorkspaceInfo } from './workspace-context.interface.js';

// ==================== Result Types ====================

/**
 * Base result type for workspace operations.
 * Per DYK-P4-01: Uses errors[] array pattern from workflow-service.types.ts.
 */
export interface WorkspaceOperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error details if operation failed (never throws) */
  errors: WorkspaceError[];
}

/**
 * Result from WorkspaceService.add().
 */
export interface AddWorkspaceResult extends WorkspaceOperationResult {
  /** The created workspace (only present on success) */
  workspace?: Workspace;
}

/**
 * Result from WorkspaceService.remove().
 */
export interface RemoveWorkspaceResult extends WorkspaceOperationResult {
  /** Slug of the removed workspace (only present on success) */
  removedSlug?: string;
}

/**
 * Options for WorkspaceService.add().
 */
export interface AddWorkspaceOptions {
  /** Override auto-generated slug with custom slug */
  slug?: string;
  /** Allow adding a git worktree (normally rejected) */
  allowWorktree?: boolean;
}

// ==================== Service Interface ====================

/**
 * Service interface for workspace operations.
 *
 * Per ADR-0004: Use DI container with interface for testability.
 * Per spec Q5: No caching - always fresh reads.
 *
 * All methods return Result types and never throw for expected errors.
 * Unexpected errors (e.g., filesystem failures) may still throw.
 */
export interface IWorkspaceService {
  /**
   * Register a new workspace.
   *
   * Validates the path before registration:
   * - Path must be absolute (start with / or ~)
   * - Path must not contain .. (directory traversal)
   * - Path must exist on filesystem
   * - Path should not be inside an existing registered workspace
   *
   * Per DYK-P4-04: Service validates for early-fail UX.
   *
   * @param name - Display name for the workspace
   * @param path - Absolute path to the workspace directory
   * @param options - Optional: custom slug, allow worktree
   * @returns AddWorkspaceResult with workspace on success, errors on failure
   *
   * @example
   * ```typescript
   * const result = await workspaceService.add('My Project', '/home/user/project');
   * if (result.success) {
   *   console.log(`Registered: ${result.workspace!.slug}`);
   * } else {
   *   console.error(result.errors[0].message);
   * }
   * ```
   */
  add(name: string, path: string, options?: AddWorkspaceOptions): Promise<AddWorkspaceResult>;

  /**
   * List all registered workspaces.
   *
   * @returns Array of all registered workspaces (empty if none)
   */
  list(): Promise<Workspace[]>;

  /**
   * Remove a workspace from the registry.
   *
   * Does not delete the actual workspace directory, only unregisters it.
   *
   * @param slug - Workspace slug to remove
   * @returns RemoveWorkspaceResult with removedSlug on success, errors on failure
   */
  remove(slug: string): Promise<RemoveWorkspaceResult>;

  /**
   * Get detailed workspace information including worktrees.
   *
   * @param slug - Workspace slug to look up
   * @returns WorkspaceInfo if found, null otherwise
   */
  getInfo(slug: string): Promise<WorkspaceInfo | null>;

  /**
   * Resolve workspace context from a filesystem path.
   *
   * Walks up the directory tree from the given path to find a matching
   * registered workspace. Useful for determining "which workspace am I in?"
   *
   * @param path - Absolute filesystem path (typically process.cwd())
   * @returns WorkspaceContext if path is in a registered workspace, null otherwise
   */
  resolveContext(path: string): Promise<WorkspaceContext | null>;

  /**
   * Resolve workspace context from URL parameters.
   *
   * Per Plan 014 Phase 6: Web API routes need to construct WorkspaceContext
   * from URL params (slug, optional worktreePath). This method handles:
   * - Looking up workspace by slug
   * - Finding matching worktree by path
   * - Populating isMainWorktree, worktreeBranch correctly
   *
   * @param slug - Workspace slug from URL
   * @param worktreePath - Optional worktree path from query param (defaults to main worktree)
   * @returns WorkspaceContext if found, null if workspace not found
   */
  resolveContextFromParams(slug: string, worktreePath?: string): Promise<WorkspaceContext | null>;

  /**
   * Update workspace preferences (emoji, color, starred, sortOrder).
   *
   * Per Plan 041: Partial update — only provided fields are changed.
   * Validates emoji/color against palette if non-empty.
   *
   * @param slug - Workspace slug to update
   * @param prefs - Partial preferences to merge with existing
   * @returns WorkspaceOperationResult with success/errors
   */
  updatePreferences(
    slug: string,
    prefs: Partial<WorkspacePreferences>
  ): Promise<WorkspaceOperationResult>;
}
