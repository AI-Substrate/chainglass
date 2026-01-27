/**
 * Sample adapter for per-worktree sample storage.
 *
 * Per Plan 014: Workspaces - Phase 3: Sample Domain (Exemplar)
 * Per DYK-P3-01: Calls `super(fs, pathResolver)` in constructor; uses `this.fs` for I/O.
 * Per DYK-P3-02: Adapter owns updatedAt - overwrites on every save.
 *
 * Storage location: `<ctx.worktreePath>/.chainglass/data/samples/<slug>.json`
 *
 * This is the real implementation that reads/writes to filesystem via IFileSystem.
 * For testing, use FakeSampleAdapter instead.
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';

import { Sample } from '../entities/sample.js';
import type { SampleJSON } from '../entities/sample.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import { SampleErrorCodes } from '../errors/sample-errors.js';
import type {
  ISampleAdapter,
  SampleRemoveResult,
  SampleSaveResult,
} from '../interfaces/sample-adapter.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';
import { WorkspaceDataAdapterBase } from './workspace-data-adapter-base.js';

/**
 * Production implementation of ISampleAdapter.
 *
 * Reads/writes samples to per-worktree storage using inherited base class methods:
 * - getDomainPath(ctx) → storage directory
 * - getEntityPath(ctx, slug) → specific sample file
 * - ensureStructure(ctx) → create directories
 * - readJson<T>(path) → parse JSON file
 * - writeJson<T>(path, data) → write JSON file
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 */
export class SampleAdapter extends WorkspaceDataAdapterBase implements ISampleAdapter {
  /**
   * Domain name for sample storage.
   * Results in path: `<worktree>/.chainglass/data/samples/`
   */
  readonly domain = 'samples';

  /**
   * Load a sample from per-worktree storage.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param slug - Sample slug (filename without .json)
   * @returns Sample entity
   * @throws EntityNotFoundError if sample file doesn't exist
   */
  async load(ctx: WorkspaceContext, slug: string): Promise<Sample> {
    const path = this.getEntityPath(ctx, slug);
    const result = await this.readJson<SampleJSON>(path);

    if (!result.ok || !result.data) {
      throw new EntityNotFoundError('Sample', slug, this.getDomainPath(ctx));
    }

    // Reconstruct Sample entity from JSON
    return Sample.create({
      name: result.data.name,
      description: result.data.description,
      slug: result.data.slug,
      createdAt: new Date(result.data.createdAt),
      updatedAt: new Date(result.data.updatedAt),
    });
  }

  /**
   * Save a sample to per-worktree storage.
   *
   * Creates storage directory if needed. Updates updatedAt timestamp.
   *
   * Per DYK-P3-02: Adapter owns updatedAt - overwrites on every save.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sample - Sample to save
   * @returns SampleSaveResult with ok=true on success
   */
  async save(ctx: WorkspaceContext, sample: Sample): Promise<SampleSaveResult> {
    // Ensure storage directory exists
    const structureResult = await this.ensureStructure(ctx);
    if (!structureResult.ok) {
      return {
        ok: false,
        errorCode: SampleErrorCodes.INVALID_DATA,
        errorMessage: structureResult.errorMessage || 'Failed to create storage directory',
      };
    }

    const path = this.getEntityPath(ctx, sample.slug);

    // Check if sample already exists
    const existsResult = await this.readJson<SampleJSON>(path);
    const created = !existsResult.ok;

    // Create updated sample with fresh updatedAt timestamp
    const updatedSample = Sample.create({
      name: sample.name,
      description: sample.description,
      slug: sample.slug,
      createdAt: sample.createdAt,
      updatedAt: new Date(), // Fresh timestamp
    });

    // Write to filesystem
    const writeResult = await this.writeJson(path, updatedSample.toJSON());
    if (!writeResult.ok) {
      return {
        ok: false,
        errorCode: SampleErrorCodes.INVALID_DATA,
        errorMessage: writeResult.errorMessage || 'Failed to write sample file',
      };
    }

    return { ok: true, sample: updatedSample, created };
  }

  /**
   * List all samples in per-worktree storage.
   *
   * @param ctx - Workspace context (determines storage location)
   * @returns Array of all samples (empty if none or directory doesn't exist)
   */
  async list(ctx: WorkspaceContext): Promise<Sample[]> {
    const files = await this.listEntityFiles(ctx);
    const samples: Sample[] = [];

    for (const file of files) {
      const result = await this.readJson<SampleJSON>(file);
      if (result.ok && result.data) {
        try {
          const sample = Sample.create({
            name: result.data.name,
            description: result.data.description,
            slug: result.data.slug,
            createdAt: new Date(result.data.createdAt),
            updatedAt: new Date(result.data.updatedAt),
          });
          samples.push(sample);
        } catch {
          // Skip corrupt files
        }
      }
    }

    return samples;
  }

  /**
   * Remove a sample from per-worktree storage.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param slug - Sample slug to remove
   * @returns SampleRemoveResult with ok=true on success
   */
  async remove(ctx: WorkspaceContext, slug: string): Promise<SampleRemoveResult> {
    const path = this.getEntityPath(ctx, slug);
    const deleted = await this.deleteFile(path);

    if (!deleted) {
      return {
        ok: false,
        errorCode: SampleErrorCodes.SAMPLE_NOT_FOUND,
        errorMessage: `Sample '${slug}' not found`,
      };
    }

    return { ok: true };
  }

  /**
   * Check if a sample exists in per-worktree storage.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param slug - Sample slug to check
   * @returns true if sample file exists
   */
  async exists(ctx: WorkspaceContext, slug: string): Promise<boolean> {
    const path = this.getEntityPath(ctx, slug);
    return this.fs.exists(path);
  }
}
