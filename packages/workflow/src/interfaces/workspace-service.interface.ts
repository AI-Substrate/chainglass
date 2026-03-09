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

// ==================== Worktree Creation Types ====================
// Per Plan 069 Phase 1: Preview/create worktree contracts.
// Per DYK D2: CreateWorktreeResult is a discriminated union, NOT WorkspaceOperationResult.

/**
 * Request to preview a new worktree before creation.
 *
 * @param workspaceSlug - Slug of the workspace to create the worktree in
 * @param requestedName - User-provided name: either plain slug ("my-feature")
 *   or pasted ordinal-slug format ("069-my-feature")
 */
export interface PreviewCreateWorktreeRequest {
  workspaceSlug: string;
  requestedName: string;
}

/**
 * Preview data showing what a worktree creation would produce.
 * Returned from previewCreateWorktree() and embedded in blocked results
 * so the form can show refreshed suggestions after naming conflicts.
 */
export interface PreviewCreateWorktreeResult {
  /** The normalized slug after applying naming rules */
  normalizedSlug: string;
  /** The allocated ordinal number */
  ordinal: number;
  /** The full branch name (e.g., "069-my-feature") */
  branchName: string;
  /** The predicted worktree directory path */
  worktreePath: string;
  /** Whether a .chainglass/new-worktree.sh hook exists in the main repo */
  hasBootstrapHook: boolean;
}

/**
 * Request to create a new worktree.
 *
 * @param workspaceSlug - Slug of the workspace
 * @param requestedName - User-provided name (same rules as preview)
 */
export interface CreateWorktreeRequest {
  workspaceSlug: string;
  requestedName: string;
}

/**
 * Outcome of the optional .chainglass/new-worktree.sh bootstrap hook.
 *
 * Bootstrap is informational only — a failed hook does NOT block
 * the user from opening the created worktree.
 *
 * Per Workshop 001: Hook runs with cwd=newWorktreePath, structured env vars,
 * 60s timeout, and returns bounded log tail on failure.
 */
export interface BootstrapStatus {
  /** Whether the hook was skipped (not present), succeeded, or failed */
  outcome: 'skipped' | 'succeeded' | 'failed';
  /** Bounded tail of hook stdout/stderr (present on failure) */
  logTail?: string;
}

/**
 * Result from WorkspaceService.createWorktree().
 *
 * Discriminated union on `status`:
 * - `'created'`: Worktree was created. Bootstrap outcome is informational.
 *   Carries all data needed for the web layer to derive a redirect URL.
 * - `'blocked'`: Creation was blocked by a safety check (dirty main, naming
 *   conflict, etc.). Carries structured errors and an optional refreshed preview
 *   so the form can show an updated suggestion.
 *
 * Per DYK D2: This intentionally does NOT extend WorkspaceOperationResult.
 * The binary success/failure pattern cannot express "created with bootstrap warning."
 */
export type CreateWorktreeResult =
  | {
      status: 'created';
      /** The git branch name that was created (e.g., "069-my-feature") */
      branchName: string;
      /** Absolute path to the new worktree directory */
      worktreePath: string;
      /** Bootstrap hook outcome — informational, not blocking */
      bootstrapStatus: BootstrapStatus;
    }
  | {
      status: 'blocked';
      /** Structured errors describing why creation was blocked */
      errors: WorkspaceError[];
      /** Refreshed preview with next available name (e.g., after naming conflict) */
      refreshedPreview?: PreviewCreateWorktreeResult;
    };

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

  // ==================== Worktree Creation (Plan 069) ====================

  /**
   * Preview what a new worktree creation would produce.
   *
   * Resolves the workspace, scans for the next available ordinal,
   * normalizes the slug, and checks for a bootstrap hook — without
   * touching git or creating anything.
   *
   * @param request - Workspace slug and requested name
   * @returns Preview data with computed branch name, path, and hook status
   */
  previewCreateWorktree(
    request: PreviewCreateWorktreeRequest
  ): Promise<PreviewCreateWorktreeResult>;

  /**
   * Create a new git worktree from refreshed canonical main.
   *
   * Performs preflight safety checks, syncs main, allocates the ordinal,
   * creates the worktree, and optionally runs the bootstrap hook.
   *
   * Returns a discriminated union: `'created'` (with bootstrap status)
   * or `'blocked'` (with structured errors and optional refreshed preview).
   *
   * @param request - Workspace slug and requested name
   * @returns CreateWorktreeResult discriminated on `status`
   */
  createWorktree(request: CreateWorktreeRequest): Promise<CreateWorktreeResult>;
}
