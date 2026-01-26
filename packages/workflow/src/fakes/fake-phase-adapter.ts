/**
 * Fake phase adapter for testing.
 *
 * Per Phase 2: Fake Adapters for Testing.
 * Per DYK Session: Uses call capture pattern (not FakeFileSystem).
 * Per DYK Session: Throws EntityNotFoundError for entity lookups, returns empty arrays for collections.
 *
 * Follows the established FakeWorkflowAdapter pattern with:
 * - Configurable result properties for each method
 * - Private call tracking arrays with spread operator getters
 * - reset() helper for test isolation
 */

import type { Phase } from '../entities/phase.js';
import type { Workflow } from '../entities/workflow.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import type { IPhaseAdapter } from '../interfaces/phase-adapter.interface.js';

/**
 * Recorded loadFromPath() call for test inspection.
 */
export interface LoadFromPathCall {
  /** Phase directory passed to loadFromPath() */
  phaseDir: string;
}

/**
 * Recorded listForWorkflow() call for test inspection.
 */
export interface ListForWorkflowCall {
  /** Workflow passed to listForWorkflow() */
  workflow: Workflow;
}

/**
 * Fake phase adapter for testing.
 *
 * Implements IPhaseAdapter with configurable responses and call tracking.
 * Use in unit tests by setting result properties before calling methods.
 *
 * @example
 * ```typescript
 * const adapter = new FakePhaseAdapter();
 *
 * // Configure response
 * adapter.loadFromPathResult = new Phase({ name: 'gather', ... });
 *
 * // Call method
 * const phase = await adapter.loadFromPath('/path/to/gather');
 *
 * // Assert on calls
 * expect(adapter.loadFromPathCalls).toHaveLength(1);
 * expect(adapter.loadFromPathCalls[0].phaseDir).toBe('/path/to/gather');
 * ```
 */
export class FakePhaseAdapter implements IPhaseAdapter {
  // ==================== Configurable Results ====================

  /** Result to return from loadFromPath(). If not set, throws EntityNotFoundError. */
  loadFromPathResult: Phase | undefined;

  /** Result to return from listForWorkflow(). If not set, returns []. */
  listForWorkflowResult: Phase[] | undefined;

  // ==================== Private Call Tracking ====================

  private _loadFromPathCalls: LoadFromPathCall[] = [];
  private _listForWorkflowCalls: ListForWorkflowCall[] = [];

  // ==================== Call Tracking Getters (immutable copies) ====================

  /**
   * Get all loadFromPath() calls (returns a copy to prevent mutation).
   */
  get loadFromPathCalls(): LoadFromPathCall[] {
    return [...this._loadFromPathCalls];
  }

  /**
   * Get all listForWorkflow() calls (returns a copy to prevent mutation).
   */
  get listForWorkflowCalls(): ListForWorkflowCall[] {
    return [...this._listForWorkflowCalls];
  }

  // ==================== Test Helpers ====================

  /**
   * Reset all state (results and call tracking).
   * Call in beforeEach for test isolation.
   */
  reset(): void {
    // Clear results
    this.loadFromPathResult = undefined;
    this.listForWorkflowResult = undefined;

    // Clear call tracking
    this._loadFromPathCalls = [];
    this._listForWorkflowCalls = [];
  }

  // ==================== IPhaseAdapter Implementation ====================

  /**
   * Load a Phase entity from a phase directory.
   *
   * Returns loadFromPathResult if set, otherwise throws EntityNotFoundError.
   *
   * @param phaseDir - Absolute path to the phase directory
   * @returns Phase entity with data loaded from phaseDir
   * @throws EntityNotFoundError if loadFromPathResult not set
   */
  async loadFromPath(phaseDir: string): Promise<Phase> {
    this._loadFromPathCalls.push({ phaseDir });

    if (this.loadFromPathResult !== undefined) {
      return this.loadFromPathResult;
    }

    // Extract phase name from path for error message
    const phaseName = phaseDir.split('/').pop() ?? phaseDir;
    throw new EntityNotFoundError('Phase', phaseName, phaseDir);
  }

  /**
   * List all phases for a workflow.
   *
   * Returns listForWorkflowResult if set, otherwise returns empty array.
   *
   * @param workflow - Workflow entity to list phases for
   * @returns Array of Phase entities sorted by order
   */
  async listForWorkflow(workflow: Workflow): Promise<Phase[]> {
    this._listForWorkflowCalls.push({ workflow });

    if (this.listForWorkflowResult !== undefined) {
      return this.listForWorkflowResult;
    }

    return [];
  }
}
