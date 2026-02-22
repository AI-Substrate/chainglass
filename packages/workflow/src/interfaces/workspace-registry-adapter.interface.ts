/**
 * Workspace Registry Adapter interface for managing workspace registration.
 *
 * Per Plan 014: Workspaces - IWorkspaceRegistryAdapter manages the global
 * workspace registry stored at ~/.config/chainglass/workspaces.json.
 *
 * This adapter handles CRUD operations for workspace registration:
 * - load: Get a workspace by slug
 * - save: Register a new workspace
 * - list: Get all registered workspaces
 * - remove: Unregister a workspace
 * - exists: Check if a workspace is registered
 *
 * Implementations:
 * - WorkspaceRegistryAdapter: Real implementation using IFileSystem
 * - FakeWorkspaceRegistryAdapter: Configurable implementation for testing
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 * Per spec Q7: Entities are pure data, adapters handle I/O.
 */

import type { Workspace } from '../entities/workspace.js';

/**
 * Error codes for workspace operations (E074-E081).
 *
 * Per High Discovery 06: Each error needs factory function with code, message, action, path.
 */
export type WorkspaceErrorCode =
  | 'E074' // Workspace not found
  | 'E075' // Workspace already exists
  | 'E076' // Invalid path (relative or contains ..)
  | 'E077' // Path does not exist
  | 'E078' // Registry file corrupt
  | 'E079' // Git operation failed
  | 'E080' // Config directory not writable
  | 'E081'; // Reserved for future use

/**
 * Result type for workspace adapter save operations.
 */
export interface WorkspaceSaveResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Error code if operation failed */
  errorCode?: WorkspaceErrorCode;
  /** Human-readable error message */
  errorMessage?: string;
  /** Suggested action for the user */
  errorAction?: string;
}

/**
 * Result type for workspace adapter remove operations.
 */
export interface WorkspaceRemoveResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Error code if operation failed */
  errorCode?: WorkspaceErrorCode;
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Adapter interface for workspace registry operations.
 *
 * The registry stores workspace metadata in ~/.config/chainglass/workspaces.json.
 * This adapter does NOT handle per-worktree data storage (that's WorkspaceDataAdapterBase).
 *
 * Per spec:
 * - Registry survives project deletion
 * - No caching - always fresh reads
 * - Path validation happens in save()
 */
export interface IWorkspaceRegistryAdapter {
  /**
   * Load a workspace from the registry by slug.
   *
   * @param slug - Workspace slug (URL-safe identifier)
   * @returns Workspace if found
   * @throws EntityNotFoundError if workspace with slug not found
   */
  load(slug: string): Promise<Workspace>;

  /**
   * Save a workspace to the registry.
   *
   * Creates the config directory if needed. Validates the path before saving.
   * Returns error result if workspace with same slug already exists.
   *
   * @param workspace - Workspace to save
   * @returns WorkspaceSaveResult with ok=true on success, or error details
   */
  save(workspace: Workspace): Promise<WorkspaceSaveResult>;

  /**
   * List all registered workspaces.
   *
   * Returns empty array if no workspaces registered or registry doesn't exist.
   *
   * @returns Array of all registered workspaces
   */
  list(): Promise<Workspace[]>;

  /**
   * Remove a workspace from the registry by slug.
   *
   * Does not delete the actual workspace folder, only unregisters it.
   *
   * @param slug - Workspace slug to remove
   * @returns WorkspaceRemoveResult with ok=true on success, or error details
   */
  remove(slug: string): Promise<WorkspaceRemoveResult>;

  /**
   * Check if a workspace with the given slug is registered.
   *
   * @param slug - Workspace slug to check
   * @returns true if workspace is registered, false otherwise
   */
  exists(slug: string): Promise<boolean>;

  /**
   * Update a workspace in the registry.
   *
   * Replaces the workspace entry matching the slug.
   * Returns error result if workspace with slug not found.
   *
   * Per Plan 041: Used for updating workspace preferences.
   *
   * @param workspace - Workspace with updated data
   * @returns WorkspaceSaveResult with ok=true on success, or error details
   */
  update(workspace: Workspace): Promise<WorkspaceSaveResult>;
}
