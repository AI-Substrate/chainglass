/**
 * Fake workspace registry adapter for testing.
 *
 * Per Phase 1: Workspace Entity + Registry Adapter + Contract Tests
 * Per DYK Session: Uses three-part API pattern (state setup, inspection, error injection).
 *
 * Follows the established FakeWorkflowAdapter pattern with:
 * - In-memory workspace storage (Map<slug, Workspace>)
 * - Call tracking arrays with spread operator getters
 * - reset() helper for test isolation
 * - Error injection for testing error paths
 */

import type { Workspace } from '../entities/workspace.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import { WorkspaceErrorCodes } from '../errors/workspace-errors.js';
import type {
  IWorkspaceRegistryAdapter,
  WorkspaceRemoveResult,
  WorkspaceSaveResult,
} from '../interfaces/workspace-registry-adapter.interface.js';

// ==================== Call Recording Types ====================

/**
 * Recorded load() call for test inspection.
 */
export interface WorkspaceLoadCall {
  /** Workspace slug passed to load() */
  slug: string;
}

/**
 * Recorded save() call for test inspection.
 */
export interface WorkspaceSaveCall {
  /** Workspace passed to save() */
  workspace: Workspace;
}

/**
 * Recorded list() call for test inspection.
 */
export interface WorkspaceListCall {
  /** Timestamp of the call */
  timestamp: Date;
}

/**
 * Recorded remove() call for test inspection.
 */
export interface WorkspaceRemoveCall {
  /** Workspace slug passed to remove() */
  slug: string;
}

/**
 * Recorded exists() call for test inspection.
 */
export interface WorkspaceExistsCall {
  /** Workspace slug passed to exists() */
  slug: string;
}

// ==================== Fake Implementation ====================

/**
 * Fake workspace registry adapter for testing.
 *
 * Implements IWorkspaceRegistryAdapter with in-memory storage and call tracking.
 * Use in unit tests to avoid filesystem I/O and control adapter behavior.
 *
 * Three-part API:
 * 1. State Setup: Add workspaces via addWorkspace() or save()
 * 2. State Inspection: Read calls via *Calls getters
 * 3. Error Injection: Set inject* flags to simulate errors
 *
 * @example
 * ```typescript
 * const adapter = new FakeWorkspaceRegistryAdapter();
 *
 * // State setup
 * adapter.addWorkspace(Workspace.create({ name: 'Test', path: '/tmp' }));
 *
 * // Use adapter
 * const workspaces = await adapter.list();
 * expect(workspaces).toHaveLength(1);
 *
 * // Inspect calls
 * expect(adapter.listCalls).toHaveLength(1);
 *
 * // Error injection
 * adapter.injectSaveError = { code: 'E080', message: 'Permission denied' };
 * const result = await adapter.save(workspace);
 * expect(result.ok).toBe(false);
 * ```
 */
export class FakeWorkspaceRegistryAdapter implements IWorkspaceRegistryAdapter {
  // ==================== In-Memory Storage ====================

  /** In-memory workspace storage by slug */
  private _workspaces: Map<string, Workspace> = new Map();

  // ==================== Error Injection ====================

  /**
   * Inject a save error. When set, save() will return this error.
   * Set to undefined to disable error injection.
   */
  injectSaveError?: { code: string; message: string; action?: string };

  /**
   * Inject a remove error. When set, remove() will return this error.
   * Set to undefined to disable error injection.
   */
  injectRemoveError?: { code: string; message: string };

  // ==================== Private Call Tracking ====================

  private _loadCalls: WorkspaceLoadCall[] = [];
  private _saveCalls: WorkspaceSaveCall[] = [];
  private _listCalls: WorkspaceListCall[] = [];
  private _removeCalls: WorkspaceRemoveCall[] = [];
  private _existsCalls: WorkspaceExistsCall[] = [];

  // ==================== Call Tracking Getters (immutable copies) ====================

  /**
   * Get all load() calls (returns a copy to prevent mutation).
   */
  get loadCalls(): WorkspaceLoadCall[] {
    return [...this._loadCalls];
  }

  /**
   * Get all save() calls (returns a copy to prevent mutation).
   */
  get saveCalls(): WorkspaceSaveCall[] {
    return [...this._saveCalls];
  }

  /**
   * Get all list() calls (returns a copy to prevent mutation).
   */
  get listCalls(): WorkspaceListCall[] {
    return [...this._listCalls];
  }

  /**
   * Get all remove() calls (returns a copy to prevent mutation).
   */
  get removeCalls(): WorkspaceRemoveCall[] {
    return [...this._removeCalls];
  }

  /**
   * Get all exists() calls (returns a copy to prevent mutation).
   */
  get existsCalls(): WorkspaceExistsCall[] {
    return [...this._existsCalls];
  }

  // ==================== State Setup Helpers ====================

  /**
   * Add a workspace directly to the in-memory storage.
   * Use for test setup without going through save().
   *
   * @param workspace - Workspace to add
   */
  addWorkspace(workspace: Workspace): void {
    this._workspaces.set(workspace.slug, workspace);
  }

  /**
   * Get all workspaces directly from in-memory storage.
   * Use for test assertions without going through list().
   */
  getWorkspaces(): Workspace[] {
    return Array.from(this._workspaces.values());
  }

  // ==================== Test Helpers ====================

  /**
   * Reset all state (storage, call tracking, error injection).
   * Call in beforeEach for test isolation.
   */
  reset(): void {
    // Clear storage
    this._workspaces.clear();

    // Clear error injection
    this.injectSaveError = undefined;
    this.injectRemoveError = undefined;

    // Clear call tracking
    this._loadCalls = [];
    this._saveCalls = [];
    this._listCalls = [];
    this._removeCalls = [];
    this._existsCalls = [];
  }

  // ==================== IWorkspaceRegistryAdapter Implementation ====================

  /**
   * Load a workspace from in-memory storage.
   *
   * @param slug - Workspace slug
   * @returns Workspace if found
   * @throws EntityNotFoundError if workspace not in storage
   */
  async load(slug: string): Promise<Workspace> {
    this._loadCalls.push({ slug });

    const workspace = this._workspaces.get(slug);
    if (!workspace) {
      throw new EntityNotFoundError(
        'Workspace',
        slug,
        '~/.config/chainglass/workspaces.json (fake)'
      );
    }

    return workspace;
  }

  /**
   * Save a workspace to in-memory storage.
   *
   * @param workspace - Workspace to save
   * @returns WorkspaceSaveResult with ok=true on success
   */
  async save(workspace: Workspace): Promise<WorkspaceSaveResult> {
    this._saveCalls.push({ workspace });

    // Check for injected error
    if (this.injectSaveError) {
      return {
        ok: false,
        errorCode: this.injectSaveError.code as WorkspaceSaveResult['errorCode'],
        errorMessage: this.injectSaveError.message,
        errorAction: this.injectSaveError.action,
      };
    }

    // Check for duplicate
    if (this._workspaces.has(workspace.slug)) {
      return {
        ok: false,
        errorCode: WorkspaceErrorCodes.WORKSPACE_EXISTS,
        errorMessage: `Workspace '${workspace.slug}' already exists`,
        errorAction: `Remove existing: cg workspace remove ${workspace.slug}`,
      };
    }

    // Save workspace
    this._workspaces.set(workspace.slug, workspace);
    return { ok: true };
  }

  /**
   * List all workspaces from in-memory storage.
   *
   * @returns Array of all workspaces
   */
  async list(): Promise<Workspace[]> {
    this._listCalls.push({ timestamp: new Date() });

    return Array.from(this._workspaces.values());
  }

  /**
   * Remove a workspace from in-memory storage.
   *
   * @param slug - Workspace slug to remove
   * @returns WorkspaceRemoveResult with ok=true on success
   */
  async remove(slug: string): Promise<WorkspaceRemoveResult> {
    this._removeCalls.push({ slug });

    // Check for injected error
    if (this.injectRemoveError) {
      return {
        ok: false,
        errorCode: this.injectRemoveError.code as WorkspaceRemoveResult['errorCode'],
        errorMessage: this.injectRemoveError.message,
      };
    }

    // Check if workspace exists
    if (!this._workspaces.has(slug)) {
      return {
        ok: false,
        errorCode: WorkspaceErrorCodes.WORKSPACE_NOT_FOUND,
        errorMessage: `Workspace '${slug}' not found`,
      };
    }

    // Remove workspace
    this._workspaces.delete(slug);
    return { ok: true };
  }

  /**
   * Check if a workspace exists in in-memory storage.
   *
   * @param slug - Workspace slug to check
   * @returns true if workspace exists
   */
  async exists(slug: string): Promise<boolean> {
    this._existsCalls.push({ slug });

    return this._workspaces.has(slug);
  }
}
