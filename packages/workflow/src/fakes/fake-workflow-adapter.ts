/**
 * Fake workflow adapter for testing.
 *
 * Per Phase 2: Fake Adapters for Testing.
 * Per DYK Session: Uses call capture pattern (not FakeFileSystem).
 * Per DYK Session: Throws EntityNotFoundError for entity lookups, returns empty arrays for collections.
 *
 * Follows the established FakeWorkflowRegistry pattern with:
 * - Configurable result properties for each method
 * - Private call tracking arrays with spread operator getters
 * - Status-only filtering for listRuns (per DYK decision)
 * - reset() helper for test isolation
 */

import type { Workflow } from '../entities/workflow.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import type { IWorkflowAdapter, RunListFilter } from '../interfaces/workflow-adapter.interface.js';

/**
 * Recorded loadCurrent() call for test inspection.
 */
export interface LoadCurrentCall {
  /** Workflow slug passed to loadCurrent() */
  slug: string;
}

/**
 * Recorded loadCheckpoint() call for test inspection.
 */
export interface LoadCheckpointCall {
  /** Workflow slug passed to loadCheckpoint() */
  slug: string;
  /** Version passed to loadCheckpoint() */
  version: string;
}

/**
 * Recorded loadRun() call for test inspection.
 */
export interface LoadRunCall {
  /** Run directory passed to loadRun() */
  runDir: string;
}

/**
 * Recorded listCheckpoints() call for test inspection.
 */
export interface ListCheckpointsCall {
  /** Workflow slug passed to listCheckpoints() */
  slug: string;
}

/**
 * Recorded listRuns() call for test inspection.
 */
export interface ListRunsCall {
  /** Workflow slug passed to listRuns() */
  slug: string;
  /** Optional filter passed to listRuns() */
  filter?: RunListFilter;
}

/**
 * Recorded exists() call for test inspection.
 */
export interface ExistsCall {
  /** Workflow slug passed to exists() */
  slug: string;
}

/**
 * Fake workflow adapter for testing.
 *
 * Implements IWorkflowAdapter with configurable responses and call tracking.
 * Use in unit tests by setting result properties before calling methods.
 *
 * @example
 * ```typescript
 * const adapter = new FakeWorkflowAdapter();
 *
 * // Configure response
 * adapter.loadCurrentResult = Workflow.createCurrent({ ... });
 *
 * // Call method
 * const workflow = await adapter.loadCurrent('hello-wf');
 *
 * // Assert on calls
 * expect(adapter.loadCurrentCalls).toHaveLength(1);
 * expect(adapter.loadCurrentCalls[0].slug).toBe('hello-wf');
 * ```
 */
export class FakeWorkflowAdapter implements IWorkflowAdapter {
  // ==================== Configurable Results ====================

  /** Result to return from loadCurrent(). If not set, throws EntityNotFoundError. */
  loadCurrentResult: Workflow | undefined;

  /** Result to return from loadCheckpoint(). If not set, throws EntityNotFoundError. */
  loadCheckpointResult: Workflow | undefined;

  /** Result to return from loadRun(). If not set, throws EntityNotFoundError. */
  loadRunResult: Workflow | undefined;

  /** Result to return from listCheckpoints(). If not set, returns []. */
  listCheckpointsResult: Workflow[] | undefined;

  /** Result to return from listRuns(). If not set, returns []. */
  listRunsResult: Workflow[] | undefined;

  /** Result to return from exists(). If not set, returns false. */
  existsResult: boolean | undefined;

  // ==================== Private Call Tracking ====================

  private _loadCurrentCalls: LoadCurrentCall[] = [];
  private _loadCheckpointCalls: LoadCheckpointCall[] = [];
  private _loadRunCalls: LoadRunCall[] = [];
  private _listCheckpointsCalls: ListCheckpointsCall[] = [];
  private _listRunsCalls: ListRunsCall[] = [];
  private _existsCalls: ExistsCall[] = [];

  // ==================== Call Tracking Getters (immutable copies) ====================

  /**
   * Get all loadCurrent() calls (returns a copy to prevent mutation).
   */
  get loadCurrentCalls(): LoadCurrentCall[] {
    return [...this._loadCurrentCalls];
  }

  /**
   * Get all loadCheckpoint() calls (returns a copy to prevent mutation).
   */
  get loadCheckpointCalls(): LoadCheckpointCall[] {
    return [...this._loadCheckpointCalls];
  }

  /**
   * Get all loadRun() calls (returns a copy to prevent mutation).
   */
  get loadRunCalls(): LoadRunCall[] {
    return [...this._loadRunCalls];
  }

  /**
   * Get all listCheckpoints() calls (returns a copy to prevent mutation).
   */
  get listCheckpointsCalls(): ListCheckpointsCall[] {
    return [...this._listCheckpointsCalls];
  }

  /**
   * Get all listRuns() calls (returns a copy to prevent mutation).
   */
  get listRunsCalls(): ListRunsCall[] {
    return [...this._listRunsCalls];
  }

  /**
   * Get all exists() calls (returns a copy to prevent mutation).
   */
  get existsCalls(): ExistsCall[] {
    return [...this._existsCalls];
  }

  // ==================== Test Helpers ====================

  /**
   * Reset all state (results and call tracking).
   * Call in beforeEach for test isolation.
   */
  reset(): void {
    // Clear results
    this.loadCurrentResult = undefined;
    this.loadCheckpointResult = undefined;
    this.loadRunResult = undefined;
    this.listCheckpointsResult = undefined;
    this.listRunsResult = undefined;
    this.existsResult = undefined;

    // Clear call tracking
    this._loadCurrentCalls = [];
    this._loadCheckpointCalls = [];
    this._loadRunCalls = [];
    this._listCheckpointsCalls = [];
    this._listRunsCalls = [];
    this._existsCalls = [];
  }

  // ==================== IWorkflowAdapter Implementation ====================

  /**
   * Load a workflow from the current/ directory.
   *
   * Returns loadCurrentResult if set, otherwise throws EntityNotFoundError.
   *
   * @param slug - Workflow slug
   * @returns Workflow with isCurrent=true
   * @throws EntityNotFoundError if loadCurrentResult not set
   */
  async loadCurrent(slug: string): Promise<Workflow> {
    this._loadCurrentCalls.push({ slug });

    if (this.loadCurrentResult !== undefined) {
      return this.loadCurrentResult;
    }

    throw new EntityNotFoundError('Workflow', slug, `(fake)/${slug}/current`);
  }

  /**
   * Load a workflow from a checkpoint directory.
   *
   * Returns loadCheckpointResult if set, otherwise throws EntityNotFoundError.
   *
   * @param slug - Workflow slug
   * @param version - Version identifier
   * @returns Workflow with isCheckpoint=true
   * @throws EntityNotFoundError if loadCheckpointResult not set
   */
  async loadCheckpoint(slug: string, version: string): Promise<Workflow> {
    this._loadCheckpointCalls.push({ slug, version });

    if (this.loadCheckpointResult !== undefined) {
      return this.loadCheckpointResult;
    }

    throw new EntityNotFoundError('Checkpoint', version, `(fake)/${slug}/checkpoints/${version}`);
  }

  /**
   * Load a workflow from a run directory.
   *
   * Returns loadRunResult if set, otherwise throws EntityNotFoundError.
   *
   * @param runDir - Absolute path to the run directory
   * @returns Workflow with isRun=true
   * @throws EntityNotFoundError if loadRunResult not set
   */
  async loadRun(runDir: string): Promise<Workflow> {
    this._loadRunCalls.push({ runDir });

    if (this.loadRunResult !== undefined) {
      return this.loadRunResult;
    }

    throw new EntityNotFoundError('Run', runDir, runDir);
  }

  /**
   * List all checkpoint versions for a workflow.
   *
   * Returns listCheckpointsResult if set, otherwise returns empty array.
   *
   * @param slug - Workflow slug
   * @returns Array of Workflow entities (all isCheckpoint=true)
   */
  async listCheckpoints(slug: string): Promise<Workflow[]> {
    this._listCheckpointsCalls.push({ slug });

    if (this.listCheckpointsResult !== undefined) {
      return this.listCheckpointsResult;
    }

    return [];
  }

  /**
   * List runs for a workflow, optionally filtered.
   *
   * Returns listRunsResult if set (filtered by status if filter provided),
   * otherwise returns empty array.
   *
   * Per DYK Session: Only status filtering is implemented.
   *
   * @param slug - Workflow slug
   * @param filter - Optional filter criteria (only status is used)
   * @returns Array of Workflow entities (all isRun=true)
   */
  async listRuns(slug: string, filter?: RunListFilter): Promise<Workflow[]> {
    this._listRunsCalls.push({ slug, filter });

    if (this.listRunsResult === undefined) {
      return [];
    }

    // If no status filter, return all
    if (!filter?.status) {
      return this.listRunsResult;
    }

    // Apply status filter
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];

    return this.listRunsResult.filter((workflow) => {
      const runStatus = workflow.run?.status;
      return runStatus !== undefined && statuses.includes(runStatus);
    });
  }

  /**
   * Check if a workflow exists.
   *
   * Returns existsResult if set, otherwise returns false.
   *
   * @param slug - Workflow slug
   * @returns true if workflow exists, false otherwise
   */
  async exists(slug: string): Promise<boolean> {
    this._existsCalls.push({ slug });

    if (this.existsResult !== undefined) {
      return this.existsResult;
    }

    return false;
  }
}
