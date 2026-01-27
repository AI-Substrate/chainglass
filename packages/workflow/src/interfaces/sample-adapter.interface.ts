/**
 * Sample Adapter interface for workspace-scoped sample storage.
 *
 * Per Plan 014: Workspaces - Phase 3: Sample Domain (Exemplar)
 * This adapter handles CRUD operations for Sample entities stored in per-worktree storage.
 *
 * Storage location: `<worktree>/.chainglass/data/samples/<slug>.json`
 *
 * Implementations:
 * - SampleAdapter: Real implementation using IFileSystem
 * - FakeSampleAdapter: Configurable implementation for testing
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 * Per spec Q7: Entities are pure data, adapters handle I/O.
 * Per DYK-P3-02: Adapter overwrites updatedAt on every save.
 */

import type { Sample } from '../entities/sample.js';
import type { WorkspaceContext } from './workspace-context.interface.js';

/**
 * Error codes for sample operations (E082-E089).
 *
 * Per DYK-P3-03: Allocated E082-E089 for Sample domain errors.
 */
export type SampleErrorCode =
  | 'E082' // Sample not found
  | 'E083' // Sample already exists
  | 'E084' // Invalid sample data
  | 'E085' // Reserved
  | 'E086' // Reserved
  | 'E087' // Reserved
  | 'E088' // Reserved
  | 'E089'; // Reserved

/**
 * Result type for sample adapter save operations.
 */
export interface SampleSaveResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** The saved sample with updated timestamp */
  sample?: Sample;
  /** Whether this was a new creation (true) or update (false) */
  created?: boolean;
  /** Error code if operation failed */
  errorCode?: SampleErrorCode;
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Result type for sample adapter remove operations.
 */
export interface SampleRemoveResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Error code if operation failed */
  errorCode?: SampleErrorCode;
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Adapter interface for sample operations.
 *
 * All methods require a WorkspaceContext to determine the storage location.
 * Data is stored in `<ctx.worktreePath>/.chainglass/data/samples/`.
 *
 * Per spec:
 * - Data stored per-worktree for git isolation
 * - No caching - always fresh reads
 * - ensureStructure() creates directories on first write
 */
export interface ISampleAdapter {
  /**
   * Load a sample from storage by slug.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param slug - Sample slug (URL-safe identifier)
   * @returns Sample if found
   * @throws EntityNotFoundError if sample with slug not found
   */
  load(ctx: WorkspaceContext, slug: string): Promise<Sample>;

  /**
   * Save a sample to storage.
   *
   * Creates the storage directory if needed. Updates the sample's updatedAt timestamp.
   * If sample with same slug exists, updates it; otherwise creates new.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param sample - Sample to save
   * @returns SampleSaveResult with ok=true on success, or error details
   */
  save(ctx: WorkspaceContext, sample: Sample): Promise<SampleSaveResult>;

  /**
   * List all samples in the workspace context.
   *
   * Returns empty array if no samples exist or storage directory doesn't exist.
   *
   * @param ctx - Workspace context (determines storage location)
   * @returns Array of all samples
   */
  list(ctx: WorkspaceContext): Promise<Sample[]>;

  /**
   * Remove a sample from storage by slug.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param slug - Sample slug to remove
   * @returns SampleRemoveResult with ok=true on success, or error details
   */
  remove(ctx: WorkspaceContext, slug: string): Promise<SampleRemoveResult>;

  /**
   * Check if a sample with the given slug exists.
   *
   * @param ctx - Workspace context (determines storage location)
   * @param slug - Sample slug to check
   * @returns true if sample exists, false otherwise
   */
  exists(ctx: WorkspaceContext, slug: string): Promise<boolean>;
}
