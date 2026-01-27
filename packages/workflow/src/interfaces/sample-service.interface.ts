/**
 * Sample Service interface for managing sample operations.
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
 * Per DYK-P4-01: Service result types use errors[] array pattern.
 *
 * Implementations:
 * - SampleService: Real implementation using ISampleAdapter
 */

import type { Sample } from '../entities/sample.js';
import type { SampleError } from '../errors/sample-errors.js';
import type { WorkspaceContext } from './workspace-context.interface.js';

// ==================== Result Types ====================

/**
 * Base result type for sample operations.
 * Per DYK-P4-01: Uses errors[] array pattern.
 */
export interface SampleOperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error details if operation failed (never throws) */
  errors: SampleError[];
}

/**
 * Result from SampleService.add().
 */
export interface AddSampleResult extends SampleOperationResult {
  /** The created sample (only present on success) */
  sample?: Sample;
}

/**
 * Result from SampleService.delete().
 */
export interface DeleteSampleResult extends SampleOperationResult {
  /** Slug of the deleted sample (only present on success) */
  deletedSlug?: string;
}

// ==================== Service Interface ====================

/**
 * Service interface for sample operations.
 *
 * Per ADR-0004: Use DI container with interface for testability.
 * Per spec Q5: No caching - always fresh reads.
 *
 * All methods require a WorkspaceContext to determine storage location.
 * All methods return Result types and never throw for expected errors.
 */
export interface ISampleService {
  /**
   * Create a new sample in a workspace context.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param name - Display name for the sample
   * @param description - Sample description
   * @returns AddSampleResult with sample on success, errors on failure
   *
   * @example
   * ```typescript
   * const ctx = await workspaceService.resolveContext(process.cwd());
   * const result = await sampleService.add(ctx!, 'My Sample', 'A sample description');
   * if (result.success) {
   *   console.log(`Created: ${result.sample!.slug}`);
   * }
   * ```
   */
  add(ctx: WorkspaceContext, name: string, description: string): Promise<AddSampleResult>;

  /**
   * List all samples in a workspace context.
   *
   * @param ctx - Workspace context (determines storage location)
   * @returns Array of all samples (empty if none)
   */
  list(ctx: WorkspaceContext): Promise<Sample[]>;

  /**
   * Get a sample by slug.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param slug - Sample slug
   * @returns Sample if found, null otherwise
   */
  get(ctx: WorkspaceContext, slug: string): Promise<Sample | null>;

  /**
   * Delete a sample by slug.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param slug - Sample slug to delete
   * @returns DeleteSampleResult with deletedSlug on success, errors on failure
   */
  delete(ctx: WorkspaceContext, slug: string): Promise<DeleteSampleResult>;
}
