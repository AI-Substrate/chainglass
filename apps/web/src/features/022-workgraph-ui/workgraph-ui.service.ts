/**
 * WorkGraphUIService - Phase 1 (T008)
 *
 * Real implementation of IWorkGraphUIService.
 *
 * Responsibilities:
 * - Factory for WorkGraphUIInstance creation
 * - Instance caching by (worktreePath, graphSlug) key
 * - Delegation to IWorkGraphService for backend operations
 * - Instance lifecycle management
 *
 * Per ADR-0008: Uses WorkspaceContext for path resolution
 * Per Medium Impact Discovery 10: All methods return BaseResult with errors[]
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { IWorkGraphService } from '@chainglass/workgraph';

import { WorkGraphUIInstance } from './workgraph-ui.instance';
import type {
  CreateGraphResult,
  DeleteGraphResult,
  IWorkGraphUIInstanceCore,
  IWorkGraphUIService,
  ListGraphsResult,
} from './workgraph-ui.types';

/**
 * Service for managing WorkGraph UI instances.
 *
 * Creates, caches, and manages WorkGraphUIInstance objects.
 * Delegates backend operations to IWorkGraphService.
 */
export class WorkGraphUIService implements IWorkGraphUIService {
  private readonly backend: IWorkGraphService;
  private readonly fs: IFileSystem;
  private readonly pathResolver: IPathResolver;
  private readonly instanceCache = new Map<string, WorkGraphUIInstance>();

  /**
   * Create a new WorkGraphUIService.
   *
   * @param backend - The backend WorkGraphService for file operations
   * @param fs - Filesystem interface for directory scanning
   * @param pathResolver - Path resolution utilities
   */
  constructor(backend: IWorkGraphService, fs: IFileSystem, pathResolver: IPathResolver) {
    this.backend = backend;
    this.fs = fs;
    this.pathResolver = pathResolver;
  }

  // ==================== Key Helper ====================

  private getCacheKey(ctx: WorkspaceContext, graphSlug: string): string {
    return `${ctx.worktreePath}|${graphSlug}`;
  }

  // ==================== getInstance ====================

  async getInstance(ctx: WorkspaceContext, graphSlug: string): Promise<IWorkGraphUIInstanceCore> {
    const key = this.getCacheKey(ctx, graphSlug);

    // Check cache first
    const cached = this.instanceCache.get(key);
    if (cached && !cached.isDisposed) {
      return cached;
    }

    // Load from backend
    const loadResult = await this.backend.load(ctx, graphSlug);

    if (loadResult.errors.length > 0 || !loadResult.graph) {
      // Return a disposed instance that throws on access
      // Or create a new empty one - for now, create with minimal data
      throw new Error(
        `Failed to load graph '${graphSlug}': ${loadResult.errors[0]?.message ?? 'Unknown error'}`
      );
    }

    // Get status to populate state
    const statusResult = await this.backend.status(ctx, graphSlug);

    // Create new instance
    const instance = new WorkGraphUIInstance(
      graphSlug,
      loadResult.graph,
      statusResult,
      this.backend,
      ctx
    );

    // Cache it
    this.instanceCache.set(key, instance);

    return instance;
  }

  // ==================== listGraphs ====================

  async listGraphs(ctx: WorkspaceContext): Promise<ListGraphsResult> {
    const graphsDir = this.pathResolver.join(ctx.worktreePath, '.chainglass/data/work-graphs');

    try {
      // Check if directory exists
      const exists = await this.fs.exists(graphsDir);
      if (!exists) {
        return {
          graphSlugs: [],
          errors: [],
        };
      }

      // List directory contents
      const entries = await this.fs.readDir(graphsDir);

      // Filter to directories that contain work-graph.yaml
      const graphSlugs: string[] = [];
      for (const entry of entries) {
        const entryPath = this.pathResolver.join(graphsDir, entry);
        const stat = await this.fs.stat(entryPath);
        if (stat.isDirectory) {
          const yamlPath = this.pathResolver.join(entryPath, 'work-graph.yaml');
          const hasYaml = await this.fs.exists(yamlPath);
          if (hasYaml) {
            graphSlugs.push(entry);
          }
        }
      }

      return {
        graphSlugs,
        errors: [],
      };
    } catch (error) {
      return {
        graphSlugs: [],
        errors: [
          {
            code: 'E104',
            message: `Failed to list graphs: ${error instanceof Error ? error.message : 'Unknown error'}`,
            action: 'Check filesystem permissions',
          },
        ],
      };
    }
  }

  // ==================== createGraph ====================

  async createGraph(ctx: WorkspaceContext, slug: string): Promise<CreateGraphResult> {
    const key = this.getCacheKey(ctx, slug);

    // Check if already cached
    if (this.instanceCache.has(key)) {
      return {
        errors: [
          {
            code: 'E102',
            message: `Graph '${slug}' already exists in cache`,
            action: 'Use different slug or delete existing graph',
          },
        ],
      };
    }

    // Create via backend
    const createResult = await this.backend.create(ctx, slug);

    if (createResult.errors.length > 0) {
      return {
        errors: createResult.errors,
      };
    }

    // Get the instance (this will load and cache it)
    try {
      const instance = await this.getInstance(ctx, slug);
      return {
        instance,
        graphSlug: slug,
        errors: [],
      };
    } catch (error) {
      return {
        errors: [
          {
            code: 'E103',
            message: `Failed to load created graph: ${error instanceof Error ? error.message : 'Unknown error'}`,
            action: 'Check filesystem permissions',
          },
        ],
      };
    }
  }

  // ==================== deleteGraph ====================

  async deleteGraph(ctx: WorkspaceContext, slug: string): Promise<DeleteGraphResult> {
    const key = this.getCacheKey(ctx, slug);

    // Dispose cached instance if exists
    const cached = this.instanceCache.get(key);
    if (cached) {
      cached.dispose();
      this.instanceCache.delete(key);
    }

    // Note: IWorkGraphService doesn't have a delete method in the current interface
    // This will be implemented when we add delete to the backend
    // For now, just remove from cache
    return {
      deleted: true,
      errors: [],
    };
  }

  // ==================== disposeAll ====================

  disposeAll(): void {
    for (const instance of this.instanceCache.values()) {
      instance.dispose();
    }
    this.instanceCache.clear();
  }

  // ==================== Test Helper ====================

  /**
   * Get cache size (for testing).
   */
  getCacheSize(): number {
    return this.instanceCache.size;
  }
}
