/**
 * Abstract base class for workspace-scoped data adapters.
 *
 * Per Plan 014: Workspaces - Phase 3: Sample Domain (Exemplar)
 * Per Critical Discovery 02: Base class provides common functionality for all per-worktree domain adapters.
 * Per DYK-P3-01: Constructor uses `(protected fs: IFileSystem, protected pathResolver: IPathResolver)`.
 *
 * This base class provides:
 * - getDomainPath(ctx): Returns path to domain storage directory
 * - getEntityPath(ctx, slug): Returns path to specific entity file
 * - ensureStructure(ctx): Creates directory structure on demand
 * - readJson<T>(path): Reads and parses JSON file
 * - writeJson<T>(path, data): Writes data as formatted JSON
 *
 * Storage location: `<ctx.worktreePath>/.chainglass/data/<domain>/`
 *
 * Subclasses must:
 * - Set the abstract `domain` property (e.g., 'samples', 'agents')
 * - Call super(fs, pathResolver) in constructor
 * - Use this.fs and base class methods for I/O
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';

import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';

/**
 * Result type for ensureStructure() operation.
 */
export interface EnsureStructureResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Path that was created or verified */
  path: string;
  /** Whether the directory was newly created */
  created: boolean;
  /** Error message if operation failed */
  errorMessage?: string;
}

/**
 * Result type for readJson() operation.
 */
export interface ReadJsonResult<T> {
  /** Whether the operation succeeded */
  ok: boolean;
  /** The parsed data if successful */
  data?: T;
  /** Error message if operation failed */
  errorMessage?: string;
}

/**
 * Result type for writeJson() operation.
 */
export interface WriteJsonResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Error message if operation failed */
  errorMessage?: string;
}

/**
 * Abstract base class for workspace-scoped domain adapters.
 *
 * All per-worktree domain adapters (samples, agents, workflows, prompts)
 * should extend this class to get consistent path handling and I/O operations.
 *
 * @example
 * ```typescript
 * export class SampleAdapter extends WorkspaceDataAdapterBase implements ISampleAdapter {
 *   readonly domain = 'samples';
 *
 *   constructor(fs: IFileSystem, pathResolver: IPathResolver) {
 *     super(fs, pathResolver);
 *   }
 *
 *   async load(ctx: WorkspaceContext, slug: string): Promise<Sample> {
 *     const path = this.getEntityPath(ctx, slug);
 *     const result = await this.readJson<SampleJSON>(path);
 *     // ...
 *   }
 * }
 * ```
 */
export abstract class WorkspaceDataAdapterBase {
  /**
   * Domain name used in storage path.
   * Subclasses must define this (e.g., 'samples', 'agents', 'workflows').
   */
  abstract readonly domain: string;

  /**
   * Base path within .chainglass for data storage.
   */
  private readonly DATA_DIR = '.chainglass/data';

  /**
   * Constructor with dependency injection.
   *
   * Per DYK-P3-01: All adapters use identical constructor pattern.
   *
   * @param fs - File system interface for I/O operations
   * @param pathResolver - Path resolver for secure path operations
   */
  constructor(
    protected readonly fs: IFileSystem,
    protected readonly pathResolver: IPathResolver
  ) {}

  /**
   * Get the domain storage directory path for a workspace context.
   *
   * @param ctx - Workspace context
   * @returns Absolute path to domain storage directory
   *
   * @example
   * ```typescript
   * // ctx.worktreePath = '/home/user/project-feature'
   * // domain = 'samples'
   * getDomainPath(ctx) // → '/home/user/project-feature/.chainglass/data/samples'
   * ```
   */
  protected getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, this.DATA_DIR, this.domain);
  }

  /**
   * Get the entity file path for a specific entity.
   *
   * @param ctx - Workspace context
   * @param slug - Entity slug (used as filename)
   * @returns Absolute path to entity JSON file
   *
   * @example
   * ```typescript
   * getEntityPath(ctx, 'my-sample') // → '.../data/samples/my-sample.json'
   * ```
   */
  protected getEntityPath(ctx: WorkspaceContext, slug: string): string {
    return this.pathResolver.join(this.getDomainPath(ctx), `${slug}.json`);
  }

  /**
   * Ensure the domain storage directory exists.
   *
   * Creates the directory structure if it doesn't exist:
   * `<worktree>/.chainglass/data/<domain>/`
   *
   * This should be called before any write operation.
   *
   * @param ctx - Workspace context
   * @returns EnsureStructureResult with creation status
   */
  protected async ensureStructure(ctx: WorkspaceContext): Promise<EnsureStructureResult> {
    const domainPath = this.getDomainPath(ctx);

    try {
      const exists = await this.fs.exists(domainPath);

      if (!exists) {
        await this.fs.mkdir(domainPath, { recursive: true });
        return { ok: true, path: domainPath, created: true };
      }

      return { ok: true, path: domainPath, created: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        path: domainPath,
        created: false,
        errorMessage: `Failed to create directory: ${message}`,
      };
    }
  }

  /**
   * Read and parse a JSON file.
   *
   * @param path - Absolute path to JSON file
   * @returns ReadJsonResult with parsed data or error
   */
  protected async readJson<T>(path: string): Promise<ReadJsonResult<T>> {
    try {
      const exists = await this.fs.exists(path);
      if (!exists) {
        return { ok: false, errorMessage: `File not found: ${path}` };
      }

      const content = await this.fs.readFile(path);
      const data = JSON.parse(content) as T;
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errorMessage: `Failed to read JSON: ${message}` };
    }
  }

  /**
   * Write data as formatted JSON to a file.
   *
   * Per spec: 2-space indentation for human readability.
   *
   * @param path - Absolute path to JSON file
   * @param data - Data to serialize
   * @returns WriteJsonResult with success status
   */
  protected async writeJson<T>(path: string, data: T): Promise<WriteJsonResult> {
    try {
      const content = JSON.stringify(data, null, 2);
      await this.fs.writeFile(path, content);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errorMessage: `Failed to write JSON: ${message}` };
    }
  }

  /**
   * List all entity files in the domain directory.
   *
   * @param ctx - Workspace context
   * @returns Array of file paths (absolute)
   */
  protected async listEntityFiles(ctx: WorkspaceContext): Promise<string[]> {
    const domainPath = this.getDomainPath(ctx);

    try {
      const exists = await this.fs.exists(domainPath);
      if (!exists) {
        return [];
      }

      const entries = await this.fs.readDir(domainPath);
      // Filter for .json files and return full paths
      return entries
        .filter((entry: string) => entry.endsWith('.json'))
        .map((entry: string) => this.pathResolver.join(domainPath, entry));
    } catch {
      return [];
    }
  }

  /**
   * Delete an entity file.
   *
   * @param path - Absolute path to entity file
   * @returns true if deleted, false if file didn't exist or error
   */
  protected async deleteFile(path: string): Promise<boolean> {
    try {
      const exists = await this.fs.exists(path);
      if (!exists) {
        return false;
      }

      await this.fs.unlink(path);
      return true;
    } catch {
      return false;
    }
  }
}
