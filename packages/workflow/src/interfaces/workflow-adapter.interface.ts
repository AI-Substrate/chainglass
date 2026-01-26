/**
 * Unified Workflow Adapter interface for loading workflows from any source.
 *
 * Per Plan 010: Entity Upgrade - Unified entity model where Workflow represents
 * current/, checkpoint/, or run/ (same model, different populated state).
 *
 * Per DYK-04: Uses load*() naming convention (not from*()) to maintain
 * single idiom in the codebase. "load" communicates filesystem hydration clearly.
 *
 * Implementations:
 * - WorkflowAdapter: Real implementation using IFileSystem, IPathResolver (Phase 3)
 * - FakeWorkflowAdapter: Configurable implementation for testing (Phase 2)
 */

import type { Workflow } from '../entities/workflow.js';
import type { RunStatus } from '../types/wf-status.types.js';

/**
 * Filter options for listing runs.
 *
 * All fields are optional. When multiple fields are specified, they are ANDed together.
 */
export interface RunListFilter {
  /** Filter by run status. Can be a single status or array of statuses (ORed). */
  status?: RunStatus | RunStatus[];

  /** Include only runs created after this date. */
  createdAfter?: Date;

  /** Include only runs created before this date. */
  createdBefore?: Date;

  /** Maximum number of results to return (for pagination). */
  limit?: number;
}

/**
 * Unified adapter for loading Workflow entities from any source.
 *
 * The Workflow entity model is unified: current, checkpoint, and run are all
 * workflows with the same structure but different populated state.
 *
 * Source types:
 * - "current" folder: isCurrent=true, checkpoint=null, run=null (editable template)
 * - "checkpoints" folder: isCheckpoint=true, checkpoint=populated, run=null (frozen)
 * - "runs" folder: isRun=true, checkpoint=populated, run=populated (runtime)
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 * Per spec Q7: Entities are pure data, adapters handle I/O.
 */
export interface IWorkflowAdapter {
  /**
   * Load a workflow from the current/ directory (editable template).
   *
   * Current is the working copy that can be edited before checkpointing.
   * Phases have unpopulated runtime values (exists=false, status='pending').
   *
   * @param slug - Workflow slug (directory name under .chainglass/workflows/)
   * @returns Workflow with isCurrent=true, checkpoint=null, run=null
   * @throws EntityNotFoundError if workflow doesn't exist
   */
  loadCurrent(slug: string): Promise<Workflow>;

  /**
   * Load a workflow from a checkpoint directory (immutable snapshot).
   *
   * Checkpoints are frozen versions of the template. They cannot be edited
   * but can be restored to current/ or used to create runs.
   *
   * @param slug - Workflow slug
   * @param version - Version identifier (e.g., 'v001', 'v001-abc12345')
   * @returns Workflow with isCheckpoint=true, checkpoint metadata populated, run=null
   * @throws EntityNotFoundError if workflow or version doesn't exist
   */
  loadCheckpoint(slug: string, version: string): Promise<Workflow>;

  /**
   * Load a workflow from a run directory (execution with runtime state).
   *
   * Runs have populated phase runtime values from wf-status.json.
   * The checkpoint field is also populated to track which version the run is based on.
   *
   * @param runDir - Absolute path to the run directory
   * @returns Workflow with isRun=true, both checkpoint and run metadata populated
   * @throws EntityNotFoundError if run directory doesn't exist
   * @throws RunCorruptError if wf-status.json is missing or invalid
   */
  loadRun(runDir: string): Promise<Workflow>;

  /**
   * List all checkpoint versions for a workflow.
   *
   * Returns Workflow entities with isCheckpoint=true, sorted by ordinal descending
   * (newest first).
   *
   * @param slug - Workflow slug
   * @returns Array of Workflow entities (all isCheckpoint=true)
   * @throws EntityNotFoundError if workflow doesn't exist
   */
  listCheckpoints(slug: string): Promise<Workflow[]>;

  /**
   * List runs for a workflow, optionally filtered.
   *
   * Returns Workflow entities with isRun=true. Can filter by status, date range,
   * and limit results for pagination.
   *
   * @param slug - Workflow slug
   * @param filter - Optional filter criteria
   * @returns Array of Workflow entities (all isRun=true)
   * @throws EntityNotFoundError if workflow doesn't exist
   */
  listRuns(slug: string, filter?: RunListFilter): Promise<Workflow[]>;

  /**
   * Check if a workflow exists in the registry.
   *
   * Returns true if the workflow directory exists with a valid workflow.json.
   * Does not validate the template contents.
   *
   * @param slug - Workflow slug
   * @returns true if workflow exists, false otherwise
   */
  exists(slug: string): Promise<boolean>;
}
