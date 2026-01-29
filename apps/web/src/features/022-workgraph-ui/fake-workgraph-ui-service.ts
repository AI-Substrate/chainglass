/**
 * FakeWorkGraphUIService - Phase 1 (T005)
 *
 * Fake implementation of IWorkGraphUIService for testing.
 *
 * Per Constitution Principle 4: Fakes over Mocks
 * - Includes assertion helpers for test verification
 * - Configurable with preset results
 * - Tracks all method calls
 *
 * Per DYK#3 Naming Convention: Use as `fakeUIService` in tests
 */

import type { WorkspaceContext } from '@chainglass/workflow';

import { FakeWorkGraphUIInstance } from './fake-workgraph-ui-instance';
import type {
  CreateGraphResult,
  DeleteGraphResult,
  IWorkGraphUIInstanceCore,
  IWorkGraphUIService,
  ListGraphsResult,
} from './workgraph-ui.types';

// ============================================
// Call Types
// ============================================

export interface GetInstanceCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  timestamp: string;
}

export interface ListGraphsCall {
  ctx: WorkspaceContext;
  timestamp: string;
}

export interface CreateGraphCall {
  ctx: WorkspaceContext;
  slug: string;
  timestamp: string;
}

export interface DeleteGraphCall {
  ctx: WorkspaceContext;
  slug: string;
  timestamp: string;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkGraphUIService for testing.
 *
 * Per DYK#3: Use as `fakeUIService` in tests.
 *
 * Usage:
 * ```typescript
 * const fakeUIService = new FakeWorkGraphUIService();
 * fakeUIService.setPresetInstance(ctx, 'my-graph', fakeUIInstance);
 * const instance = await fakeUIService.getInstance(ctx, 'my-graph');
 * expect(fakeUIService.getInstanceCalls()).toHaveLength(1);
 * ```
 */
export class FakeWorkGraphUIService implements IWorkGraphUIService {
  private getInstanceCalls: GetInstanceCall[] = [];
  private listGraphsCalls: ListGraphsCall[] = [];
  private createGraphCalls: CreateGraphCall[] = [];
  private deleteGraphCalls: DeleteGraphCall[] = [];

  private presetInstances = new Map<string, IWorkGraphUIInstanceCore>();
  private presetListResults = new Map<string, ListGraphsResult>();
  private presetCreateResults = new Map<string, CreateGraphResult>();
  private presetDeleteResults = new Map<string, DeleteGraphResult>();

  // Cache for instances (simulates real caching behavior)
  private instanceCache = new Map<string, IWorkGraphUIInstanceCore>();

  // ==================== Key Helper ====================

  private getKey(ctx: WorkspaceContext, slug?: string): string {
    const base = ctx?.worktreePath ?? 'unknown';
    return slug ? `${base}|${slug}` : base;
  }

  // ==================== getInstance ====================

  getInstanceCallHistory(): GetInstanceCall[] {
    return [...this.getInstanceCalls];
  }

  getLastInstanceCall(): GetInstanceCall | null {
    return this.getInstanceCalls.length > 0
      ? this.getInstanceCalls[this.getInstanceCalls.length - 1]
      : null;
  }

  /**
   * Configure a preset instance to return.
   */
  setPresetInstance(
    ctx: WorkspaceContext,
    graphSlug: string,
    instance: IWorkGraphUIInstanceCore
  ): void {
    this.presetInstances.set(this.getKey(ctx, graphSlug), instance);
  }

  async getInstance(ctx: WorkspaceContext, graphSlug: string): Promise<IWorkGraphUIInstanceCore> {
    const key = this.getKey(ctx, graphSlug);

    this.getInstanceCalls.push({
      ctx,
      graphSlug,
      timestamp: new Date().toISOString(),
    });

    // Check cache first (simulates real caching)
    const cached = this.instanceCache.get(key);
    if (cached) {
      return cached;
    }

    // Check for preset
    const preset = this.presetInstances.get(key);
    if (preset) {
      this.instanceCache.set(key, preset);
      return preset;
    }

    // Default: create a simple fake instance
    const instance = FakeWorkGraphUIInstance.withGraph(graphSlug);
    this.instanceCache.set(key, instance);
    return instance;
  }

  // ==================== listGraphs ====================

  getListGraphsCallHistory(): ListGraphsCall[] {
    return [...this.listGraphsCalls];
  }

  /**
   * Configure preset list result for a workspace.
   */
  setPresetListResult(ctx: WorkspaceContext, result: ListGraphsResult): void {
    this.presetListResults.set(this.getKey(ctx), result);
  }

  async listGraphs(ctx: WorkspaceContext): Promise<ListGraphsResult> {
    this.listGraphsCalls.push({
      ctx,
      timestamp: new Date().toISOString(),
    });

    const preset = this.presetListResults.get(this.getKey(ctx));
    if (preset) {
      return preset;
    }

    return {
      graphSlugs: [],
      errors: [],
    };
  }

  // ==================== createGraph ====================

  getCreateGraphCallHistory(): CreateGraphCall[] {
    return [...this.createGraphCalls];
  }

  /**
   * Check if createGraph was called with specific slug.
   */
  wasCreatedWith(slug: string): boolean {
    return this.createGraphCalls.some((call) => call.slug === slug);
  }

  /**
   * Configure preset create result.
   */
  setPresetCreateResult(ctx: WorkspaceContext, slug: string, result: CreateGraphResult): void {
    this.presetCreateResults.set(this.getKey(ctx, slug), result);
  }

  async createGraph(ctx: WorkspaceContext, slug: string): Promise<CreateGraphResult> {
    this.createGraphCalls.push({
      ctx,
      slug,
      timestamp: new Date().toISOString(),
    });

    const key = this.getKey(ctx, slug);

    // Check for preset
    const preset = this.presetCreateResults.get(key);
    if (preset) {
      if (preset.instance) {
        this.instanceCache.set(key, preset.instance);
      }
      return preset;
    }

    // Check if already exists (simulate error)
    if (this.instanceCache.has(key)) {
      return {
        errors: [{ code: 'E102', message: 'Graph already exists', action: 'Use different slug' }],
      };
    }

    // Create new instance
    const instance = FakeWorkGraphUIInstance.withGraph(slug);
    this.instanceCache.set(key, instance);

    return {
      instance,
      graphSlug: slug,
      errors: [],
    };
  }

  // ==================== deleteGraph ====================

  getDeleteGraphCallHistory(): DeleteGraphCall[] {
    return [...this.deleteGraphCalls];
  }

  /**
   * Check if deleteGraph was called with specific slug.
   */
  wasDeleted(slug: string): boolean {
    return this.deleteGraphCalls.some((call) => call.slug === slug);
  }

  /**
   * Configure preset delete result.
   */
  setPresetDeleteResult(ctx: WorkspaceContext, slug: string, result: DeleteGraphResult): void {
    this.presetDeleteResults.set(this.getKey(ctx, slug), result);
  }

  async deleteGraph(ctx: WorkspaceContext, slug: string): Promise<DeleteGraphResult> {
    this.deleteGraphCalls.push({
      ctx,
      slug,
      timestamp: new Date().toISOString(),
    });

    const key = this.getKey(ctx, slug);

    // Check for preset
    const preset = this.presetDeleteResults.get(key);
    if (preset) {
      if (preset.deleted) {
        const cached = this.instanceCache.get(key);
        cached?.dispose();
        this.instanceCache.delete(key);
      }
      return preset;
    }

    // Default behavior: dispose and remove from cache
    const cached = this.instanceCache.get(key);
    if (cached) {
      cached.dispose();
      this.instanceCache.delete(key);
      return { deleted: true, errors: [] };
    }

    return {
      deleted: false,
      errors: [{ code: 'E101', message: 'Graph not found', action: 'Create graph first' }],
    };
  }

  // ==================== disposeAll ====================

  disposeAll(): void {
    for (const instance of this.instanceCache.values()) {
      instance.dispose();
    }
    this.instanceCache.clear();
  }

  // ==================== Reset ====================

  /**
   * Reset all state for test isolation.
   */
  reset(): void {
    this.getInstanceCalls = [];
    this.listGraphsCalls = [];
    this.createGraphCalls = [];
    this.deleteGraphCalls = [];
    this.presetInstances.clear();
    this.presetListResults.clear();
    this.presetCreateResults.clear();
    this.presetDeleteResults.clear();
    this.disposeAll();
  }
}
