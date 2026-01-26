/**
 * Phase Adapter interface for loading Phase entities.
 *
 * Per Plan 010: Entity Upgrade - Unified Phase entity where the same structure
 * is used for template phases (unpopulated) and run phases (populated).
 *
 * Per DYK-04: Uses loadFromPath() naming convention to maintain single idiom.
 *
 * Implementations:
 * - PhaseAdapter: Real implementation using IFileSystem, IPathResolver (Phase 3)
 * - FakePhaseAdapter: Configurable implementation for testing (Phase 2)
 */

import type { Phase } from '../entities/phase.js';
import type { Workflow } from '../entities/workflow.js';

/**
 * Adapter for loading Phase entities from the filesystem.
 *
 * The Phase entity model is unified: template phases and run phases have the
 * same structure, only the populated values differ:
 *
 * - Template phase: exists=false, values=undefined, status='pending'
 * - Run phase: exists=true/false, values=populated, status=runtime state
 *
 * Per spec Q5: No caching - always fresh filesystem reads.
 * Per spec Q7: Entities are pure data, adapters handle I/O.
 */
export interface IPhaseAdapter {
  /**
   * Load a Phase entity from a phase directory.
   *
   * Reads phase definition from wf-phase.yaml and runtime state from
   * wf-data/wf-phase.json (if present). The returned Phase has all fields
   * populated based on filesystem state.
   *
   * @param phaseDir - Absolute path to the phase directory
   * @returns Phase entity with data loaded from phaseDir
   * @throws EntityNotFoundError if phase directory doesn't exist
   * @throws Error if phase definition (wf-phase.yaml) is missing or invalid
   */
  loadFromPath(phaseDir: string): Promise<Phase>;

  /**
   * List all phases for a workflow.
   *
   * Returns Phase entities ordered by their defined execution order.
   * For template workflows, phases have unpopulated values.
   * For run workflows, phases have runtime state.
   *
   * @param workflow - Workflow entity to list phases for
   * @returns Array of Phase entities sorted by order
   * @throws EntityNotFoundError if workflow directory doesn't exist
   */
  listForWorkflow(workflow: Workflow): Promise<Phase[]>;
}
