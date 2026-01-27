/**
 * SampleService implementation for managing sample operations.
 *
 * Per Plan 014: Workspaces - Phase 4: Service Layer + DI Integration
 *
 * This service provides the business logic layer for sample operations:
 * - add: Create a new sample in a workspace context
 * - list: Get all samples in a workspace context
 * - get: Get a sample by slug
 * - delete: Remove a sample by slug
 *
 * All methods require a WorkspaceContext to determine storage location.
 * Per ADR-0004: Uses constructor injection for testability.
 */

import { Sample } from '../entities/sample.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import { type SampleError, SampleErrors } from '../errors/sample-errors.js';
import type { ISampleAdapter } from '../interfaces/sample-adapter.interface.js';
import type {
  AddSampleResult,
  DeleteSampleResult,
  ISampleService,
} from '../interfaces/sample-service.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';

/**
 * SampleService implements sample management.
 *
 * Per ADR-0004: Uses constructor injection for all dependencies.
 */
export class SampleService implements ISampleService {
  constructor(private readonly adapter: ISampleAdapter) {}

  /**
   * Create a new sample in a workspace context.
   */
  async add(ctx: WorkspaceContext, name: string, description: string): Promise<AddSampleResult> {
    // Create sample entity
    const sample = Sample.create({ name, description });

    // Check if sample with same slug already exists
    const exists = await this.adapter.exists(ctx, sample.slug);
    if (exists) {
      return {
        success: false,
        errors: [SampleErrors.exists(sample.slug, `${ctx.worktreePath}/.chainglass/data/samples`)],
      };
    }

    // Save to adapter
    const saveResult = await this.adapter.save(ctx, sample);
    if (!saveResult.ok) {
      return {
        success: false,
        errors: [
          {
            code: saveResult.errorCode ?? 'E082',
            message: saveResult.errorMessage ?? 'Unknown error',
            action: 'Check the error message',
            path: `${ctx.worktreePath}/.chainglass/data/samples`,
          },
        ],
      };
    }

    return { success: true, sample: saveResult.sample, errors: [] };
  }

  /**
   * List all samples in a workspace context.
   */
  async list(ctx: WorkspaceContext): Promise<Sample[]> {
    return this.adapter.list(ctx);
  }

  /**
   * Get a sample by slug.
   */
  async get(ctx: WorkspaceContext, slug: string): Promise<Sample | null> {
    try {
      return await this.adapter.load(ctx, slug);
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a sample by slug.
   */
  async delete(ctx: WorkspaceContext, slug: string): Promise<DeleteSampleResult> {
    const result = await this.adapter.remove(ctx, slug);

    if (!result.ok) {
      return {
        success: false,
        errors: [SampleErrors.notFound(slug, `${ctx.worktreePath}/.chainglass/data/samples`)],
      };
    }

    return { success: true, deletedSlug: slug, errors: [] };
  }
}
