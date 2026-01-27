/**
 * Fake workspace context resolver for testing.
 *
 * Per Phase 2: WorkspaceContext Resolution + Worktree Discovery
 * Per DYK-02: Implements IWorkspaceContextResolver for DI per ADR-0004.
 *
 * Follows the established FakeWorkspaceRegistryAdapter pattern with:
 * - In-memory context storage (Map<path, WorkspaceContext>)
 * - Call tracking arrays with spread operator getters
 * - reset() helper for test isolation
 * - Error injection for testing error paths
 */

import type {
  IWorkspaceContextResolver,
  WorkspaceContext,
  WorkspaceContextResult,
  WorkspaceInfo,
  WorkspaceInfoResult,
} from '../interfaces/workspace-context.interface.js';

// ==================== Call Recording Types ====================

/**
 * Recorded resolveFromPath() call for test inspection.
 */
export interface ResolveFromPathCall {
  /** Path passed to resolveFromPath() */
  path: string;
}

/**
 * Recorded getWorkspaceInfo() call for test inspection.
 */
export interface GetWorkspaceInfoCall {
  /** Slug passed to getWorkspaceInfo() */
  slug: string;
}

// ==================== Fake Implementation ====================

/**
 * Fake workspace context resolver for testing.
 *
 * Implements IWorkspaceContextResolver with in-memory storage and call tracking.
 * Use in unit tests to avoid filesystem I/O and control resolver behavior.
 *
 * Three-part API:
 * 1. State Setup: Set contexts via setContext(), setWorkspaceInfo()
 * 2. State Inspection: Read calls via *Calls getters
 * 3. Error Injection: Set inject* flags to simulate errors
 *
 * @example
 * ```typescript
 * const resolver = new FakeWorkspaceContextResolver();
 *
 * // State setup
 * resolver.setContext('/home/user/project', {
 *   workspaceSlug: 'my-project',
 *   workspaceName: 'My Project',
 *   workspacePath: '/home/user/project',
 *   worktreePath: '/home/user/project',
 *   worktreeBranch: 'main',
 *   isMainWorktree: true,
 *   hasGit: true,
 * });
 *
 * // Use resolver
 * const ctx = await resolver.resolveFromPath('/home/user/project/src');
 * expect(ctx?.workspaceSlug).toBe('my-project');
 *
 * // Inspect calls
 * expect(resolver.resolveFromPathCalls).toHaveLength(1);
 *
 * // Error injection
 * resolver.injectResolveError = new Error('Simulated error');
 * await expect(resolver.resolveFromPath('/any')).rejects.toThrow('Simulated error');
 * ```
 */
export class FakeWorkspaceContextResolver implements IWorkspaceContextResolver {
  // ==================== In-Memory Storage ====================

  /**
   * In-memory context storage by path prefix.
   *
   * When resolveFromPath() is called, it checks if the input path
   * starts with any stored path (longest match wins).
   */
  private _contexts: Map<string, WorkspaceContext> = new Map();

  /**
   * In-memory workspace info storage by slug.
   */
  private _workspaceInfos: Map<string, WorkspaceInfo> = new Map();

  // ==================== Error Injection ====================

  /**
   * Inject a resolve error. When set, resolveFromPath() will throw this error.
   * Set to undefined to disable error injection.
   */
  injectResolveError?: Error;

  /**
   * Inject a getWorkspaceInfo error. When set, getWorkspaceInfo() will throw this error.
   * Set to undefined to disable error injection.
   */
  injectGetInfoError?: Error;

  // ==================== Private Call Tracking ====================

  private _resolveFromPathCalls: ResolveFromPathCall[] = [];
  private _getWorkspaceInfoCalls: GetWorkspaceInfoCall[] = [];

  // ==================== Call Tracking Getters (immutable copies) ====================

  /**
   * Get all resolveFromPath() calls (returns a copy to prevent mutation).
   */
  get resolveFromPathCalls(): ResolveFromPathCall[] {
    return [...this._resolveFromPathCalls];
  }

  /**
   * Get all getWorkspaceInfo() calls (returns a copy to prevent mutation).
   */
  get getWorkspaceInfoCalls(): GetWorkspaceInfoCall[] {
    return [...this._getWorkspaceInfoCalls];
  }

  // ==================== State Setup Helpers ====================

  /**
   * Set context for a path prefix.
   *
   * When resolveFromPath() is called with a path that starts with
   * this prefix, this context will be returned.
   *
   * @param pathPrefix - Path prefix to match (e.g., '/home/user/project')
   * @param context - WorkspaceContext to return for matching paths
   */
  setContext(pathPrefix: string, context: WorkspaceContext): void {
    this._contexts.set(pathPrefix, context);
  }

  /**
   * Set workspace info for a slug.
   *
   * @param slug - Workspace slug
   * @param info - WorkspaceInfo to return
   */
  setWorkspaceInfo(slug: string, info: WorkspaceInfo): void {
    this._workspaceInfos.set(slug, info);
  }

  /**
   * Get all stored contexts directly.
   * Use for test assertions without going through resolveFromPath().
   */
  getContexts(): Map<string, WorkspaceContext> {
    return new Map(this._contexts);
  }

  // ==================== Test Helpers ====================

  /**
   * Reset all state (storage, call tracking, error injection).
   * Call in beforeEach for test isolation.
   */
  reset(): void {
    // Clear storage
    this._contexts.clear();
    this._workspaceInfos.clear();

    // Clear error injection
    this.injectResolveError = undefined;
    this.injectGetInfoError = undefined;

    // Clear call tracking
    this._resolveFromPathCalls = [];
    this._getWorkspaceInfoCalls = [];
  }

  // ==================== IWorkspaceContextResolver Implementation ====================

  /**
   * Resolve workspace context from a path.
   *
   * Finds the longest matching path prefix from stored contexts.
   *
   * @param path - Path to resolve
   * @returns WorkspaceContext if found, null otherwise
   * @throws If injectResolveError is set
   */
  async resolveFromPath(path: string): Promise<WorkspaceContextResult> {
    this._resolveFromPathCalls.push({ path });

    // Check for injected error
    if (this.injectResolveError) {
      throw this.injectResolveError;
    }

    // Normalize path: remove trailing slash
    const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

    // Find longest matching prefix
    let longestMatch: WorkspaceContext | null = null;
    let longestLength = 0;

    for (const [prefix, context] of this._contexts) {
      // Check if path is exactly the prefix or starts with prefix/
      const isMatch = normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);

      if (isMatch && prefix.length > longestLength) {
        longestMatch = context;
        longestLength = prefix.length;
      }
    }

    return longestMatch;
  }

  /**
   * Get workspace info by slug.
   *
   * @param slug - Workspace slug
   * @returns WorkspaceInfo if found, null otherwise
   * @throws If injectGetInfoError is set
   */
  async getWorkspaceInfo(slug: string): Promise<WorkspaceInfoResult> {
    this._getWorkspaceInfoCalls.push({ slug });

    // Check for injected error
    if (this.injectGetInfoError) {
      throw this.injectGetInfoError;
    }

    return this._workspaceInfos.get(slug) ?? null;
  }
}
