/**
 * Fake workflow registry for testing.
 *
 * Per Phase 1 T008: Test double for IWorkflowRegistry.
 * Follows the FakeWorkflowService pattern with:
 * - Call capture for assertions
 * - Preset configuration for deterministic results
 * - Error injection for failure testing
 */

import type {
  CheckpointResult,
  InfoResult,
  ListResult,
  RestoreResult,
  VersionsResult,
  WorkflowInfo,
  WorkflowSummary,
} from '@chainglass/shared';
import type {
  CheckpointOptions,
  IWorkflowRegistry,
} from '../interfaces/workflow-registry.interface.js';

/**
 * Recorded list() call for test inspection.
 */
export interface ListCall {
  /** Workflows directory passed to list() */
  workflowsDir: string;
  /** Result returned from list() */
  result: ListResult;
  /** Timestamp when list() was called */
  timestamp: string;
}

/**
 * Recorded info() call for test inspection.
 */
export interface InfoCall {
  /** Workflows directory passed to info() */
  workflowsDir: string;
  /** Workflow slug passed to info() */
  slug: string;
  /** Result returned from info() */
  result: InfoResult;
  /** Timestamp when info() was called */
  timestamp: string;
}

/**
 * Recorded checkpoint() call for test inspection.
 */
export interface CheckpointCall {
  /** Workflows directory passed to checkpoint() */
  workflowsDir: string;
  /** Workflow slug passed to checkpoint() */
  slug: string;
  /** Options passed to checkpoint() */
  options: CheckpointOptions;
  /** Result returned from checkpoint() */
  result: CheckpointResult;
  /** Timestamp when checkpoint() was called */
  timestamp: string;
}

/**
 * Recorded restore() call for test inspection.
 */
export interface RestoreCall {
  /** Workflows directory passed to restore() */
  workflowsDir: string;
  /** Workflow slug passed to restore() */
  slug: string;
  /** Version passed to restore() */
  version: string;
  /** Result returned from restore() */
  result: RestoreResult;
  /** Timestamp when restore() was called */
  timestamp: string;
}

/**
 * Recorded versions() call for test inspection.
 */
export interface VersionsCall {
  /** Workflows directory passed to versions() */
  workflowsDir: string;
  /** Workflow slug passed to versions() */
  slug: string;
  /** Result returned from versions() */
  result: VersionsResult;
  /** Timestamp when versions() was called */
  timestamp: string;
}

/**
 * Fake workflow registry for testing.
 *
 * Captures all list() and info() calls for inspection.
 * Can be configured with preset results or use default responses.
 */
export class FakeWorkflowRegistry implements IWorkflowRegistry {
  /** Recorded list calls */
  private listCalls: ListCall[] = [];

  /** Recorded info calls */
  private infoCalls: InfoCall[] = [];

  /** Recorded checkpoint calls */
  private checkpointCalls: CheckpointCall[] = [];

  /** Recorded restore calls */
  private restoreCalls: RestoreCall[] = [];

  /** Recorded versions calls */
  private versionsCalls: VersionsCall[] = [];

  /** Preset list results (keyed by workflowsDir) */
  private listResults = new Map<string, ListResult>();

  /** Preset info results (keyed by `${workflowsDir}:${slug}`) */
  private infoResults = new Map<string, InfoResult>();

  /** Preset checkpoint results (keyed by `${workflowsDir}:${slug}`) */
  private checkpointResults = new Map<string, CheckpointResult>();

  /** Preset restore results (keyed by `${workflowsDir}:${slug}:${version}`) */
  private restoreResults = new Map<string, RestoreResult>();

  /** Preset versions results (keyed by `${workflowsDir}:${slug}`) */
  private versionsResults = new Map<string, VersionsResult>();

  /** Default list result to return if no preset matches */
  private defaultListResult: ListResult | null = null;

  /** Default info result to return if no preset matches */
  private defaultInfoResult: InfoResult | null = null;

  /** Default checkpoint result to return if no preset matches */
  private defaultCheckpointResult: CheckpointResult | null = null;

  /** Default versions result to return if no preset matches */
  private defaultVersionsResult: VersionsResult | null = null;

  /** Counter for auto-generating ordinals */
  private checkpointOrdinal = 1;

  // ==================== Test Helpers: State Setup ====================

  /**
   * Set a preset list result for a specific workflows directory (test helper).
   *
   * @param workflowsDir - Workflows directory to match
   * @param result - ListResult to return
   */
  setListResult(workflowsDir: string, result: ListResult): void {
    this.listResults.set(workflowsDir, result);
  }

  /**
   * Set a preset info result for a specific workflow (test helper).
   *
   * @param workflowsDir - Workflows directory
   * @param slug - Workflow slug
   * @param result - InfoResult to return
   */
  setInfoResult(workflowsDir: string, slug: string, result: InfoResult): void {
    this.infoResults.set(`${workflowsDir}:${slug}`, result);
  }

  /**
   * Set a default list result to return for all list calls (test helper).
   *
   * @param result - Default ListResult to return
   */
  setDefaultListResult(result: ListResult): void {
    this.defaultListResult = result;
  }

  /**
   * Set a default info result to return for all info calls (test helper).
   *
   * @param result - Default InfoResult to return
   */
  setDefaultInfoResult(result: InfoResult): void {
    this.defaultInfoResult = result;
  }

  /**
   * Set a preset checkpoint result for a specific workflow (test helper).
   *
   * @param workflowsDir - Workflows directory
   * @param slug - Workflow slug
   * @param result - CheckpointResult to return
   */
  setCheckpointResult(workflowsDir: string, slug: string, result: CheckpointResult): void {
    this.checkpointResults.set(`${workflowsDir}:${slug}`, result);
  }

  /**
   * Set a default checkpoint result to return for all checkpoint calls (test helper).
   *
   * @param result - Default CheckpointResult to return
   */
  setDefaultCheckpointResult(result: CheckpointResult): void {
    this.defaultCheckpointResult = result;
  }

  /**
   * Set a preset restore result for a specific workflow/version (test helper).
   *
   * @param workflowsDir - Workflows directory
   * @param slug - Workflow slug
   * @param version - Version string
   * @param result - RestoreResult to return
   */
  setRestoreResult(
    workflowsDir: string,
    slug: string,
    version: string,
    result: RestoreResult
  ): void {
    this.restoreResults.set(`${workflowsDir}:${slug}:${version}`, result);
  }

  /**
   * Set a preset versions result for a specific workflow (test helper).
   *
   * @param workflowsDir - Workflows directory
   * @param slug - Workflow slug
   * @param result - VersionsResult to return
   */
  setVersionsResult(workflowsDir: string, slug: string, result: VersionsResult): void {
    this.versionsResults.set(`${workflowsDir}:${slug}`, result);
  }

  /**
   * Set a default versions result to return for all versions calls (test helper).
   *
   * @param result - Default VersionsResult to return
   */
  setDefaultVersionsResult(result: VersionsResult): void {
    this.defaultVersionsResult = result;
  }

  // ==================== Test Helpers: Error Injection ====================

  /**
   * Set a preset error result for info() (test helper).
   *
   * Convenience method to configure E030 (not found) errors.
   *
   * @param workflowsDir - Workflows directory
   * @param slug - Workflow slug
   * @param code - Error code (e.g., 'E030')
   * @param message - Error message
   * @param action - Suggested fix action
   */
  setInfoError(
    workflowsDir: string,
    slug: string,
    code: string,
    message: string,
    action?: string
  ): void {
    this.setInfoResult(workflowsDir, slug, {
      errors: [{ code, message, action }],
      workflow: undefined,
    });
  }

  // ==================== Test Helpers: State Inspection ====================

  /**
   * Get the last list call (test helper).
   *
   * @returns Last ListCall, or null if no calls made
   */
  getLastListCall(): ListCall | null {
    return this.listCalls.length > 0 ? this.listCalls[this.listCalls.length - 1] : null;
  }

  /**
   * Get all list calls in order (test helper).
   *
   * @returns Array of all recorded list calls
   */
  getListCalls(): ListCall[] {
    return [...this.listCalls];
  }

  /**
   * Get the number of list calls (test helper).
   */
  getListCallCount(): number {
    return this.listCalls.length;
  }

  /**
   * Get the last info call (test helper).
   *
   * @returns Last InfoCall, or null if no calls made
   */
  getLastInfoCall(): InfoCall | null {
    return this.infoCalls.length > 0 ? this.infoCalls[this.infoCalls.length - 1] : null;
  }

  /**
   * Get all info calls in order (test helper).
   *
   * @returns Array of all recorded info calls
   */
  getInfoCalls(): InfoCall[] {
    return [...this.infoCalls];
  }

  /**
   * Get the number of info calls (test helper).
   */
  getInfoCallCount(): number {
    return this.infoCalls.length;
  }

  /**
   * Get the last checkpoint call (test helper).
   *
   * @returns Last CheckpointCall, or null if no calls made
   */
  getLastCheckpointCall(): CheckpointCall | null {
    return this.checkpointCalls.length > 0
      ? this.checkpointCalls[this.checkpointCalls.length - 1]
      : null;
  }

  /**
   * Get all checkpoint calls in order (test helper).
   *
   * @returns Array of all recorded checkpoint calls
   */
  getCheckpointCalls(): CheckpointCall[] {
    return [...this.checkpointCalls];
  }

  /**
   * Get the number of checkpoint calls (test helper).
   */
  getCheckpointCallCount(): number {
    return this.checkpointCalls.length;
  }

  /**
   * Get the last restore call (test helper).
   *
   * @returns Last RestoreCall, or null if no calls made
   */
  getLastRestoreCall(): RestoreCall | null {
    return this.restoreCalls.length > 0 ? this.restoreCalls[this.restoreCalls.length - 1] : null;
  }

  /**
   * Get all restore calls in order (test helper).
   *
   * @returns Array of all recorded restore calls
   */
  getRestoreCalls(): RestoreCall[] {
    return [...this.restoreCalls];
  }

  /**
   * Get the number of restore calls (test helper).
   */
  getRestoreCallCount(): number {
    return this.restoreCalls.length;
  }

  /**
   * Get the last versions call (test helper).
   *
   * @returns Last VersionsCall, or null if no calls made
   */
  getLastVersionsCall(): VersionsCall | null {
    return this.versionsCalls.length > 0 ? this.versionsCalls[this.versionsCalls.length - 1] : null;
  }

  /**
   * Get all versions calls in order (test helper).
   *
   * @returns Array of all recorded versions calls
   */
  getVersionsCalls(): VersionsCall[] {
    return [...this.versionsCalls];
  }

  /**
   * Get the number of versions calls (test helper).
   */
  getVersionsCallCount(): number {
    return this.versionsCalls.length;
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.listCalls = [];
    this.infoCalls = [];
    this.checkpointCalls = [];
    this.restoreCalls = [];
    this.versionsCalls = [];
    this.listResults.clear();
    this.infoResults.clear();
    this.checkpointResults.clear();
    this.restoreResults.clear();
    this.versionsResults.clear();
    this.defaultListResult = null;
    this.defaultInfoResult = null;
    this.defaultCheckpointResult = null;
    this.defaultVersionsResult = null;
    this.checkpointOrdinal = 1;
  }

  // ==================== Test Helpers: Factory Methods ====================

  /**
   * Create a success ListResult for testing (static helper).
   *
   * @param workflows - Array of workflow summaries
   * @returns ListResult with no errors
   */
  static createListResult(workflows: WorkflowSummary[]): ListResult {
    return { errors: [], workflows };
  }

  /**
   * Create a success InfoResult for testing (static helper).
   *
   * @param workflow - Workflow info
   * @returns InfoResult with no errors
   */
  static createInfoResult(workflow: WorkflowInfo): InfoResult {
    return { errors: [], workflow };
  }

  /**
   * Create an error InfoResult for testing (static helper).
   *
   * @param code - Error code (e.g., 'E030')
   * @param message - Error message
   * @param action - Suggested fix action
   * @returns InfoResult with error
   */
  static createInfoError(code: string, message: string, action?: string): InfoResult {
    return { errors: [{ code, message, action }], workflow: undefined };
  }

  // ==================== IWorkflowRegistry Implementation ====================

  /**
   * List all workflows in the registry.
   *
   * Returns preset result if configured, otherwise default or empty list.
   *
   * @param workflowsDir - Path to workflows directory
   * @returns ListResult (preset or default)
   */
  async list(workflowsDir: string): Promise<ListResult> {
    // Check for preset result
    const presetResult = this.listResults.get(workflowsDir);
    if (presetResult !== undefined) {
      this.listCalls.push({
        workflowsDir,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultListResult) {
      this.listCalls.push({
        workflowsDir,
        result: this.defaultListResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultListResult;
    }

    // Return empty list as default
    const result: ListResult = { errors: [], workflows: [] };
    this.listCalls.push({
      workflowsDir,
      result,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  /**
   * Get detailed information about a specific workflow.
   *
   * Returns preset result if configured, otherwise default or E030 error.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns InfoResult (preset or default)
   */
  async info(workflowsDir: string, slug: string): Promise<InfoResult> {
    const key = `${workflowsDir}:${slug}`;

    // Check for preset result
    const presetResult = this.infoResults.get(key);
    if (presetResult !== undefined) {
      this.infoCalls.push({
        workflowsDir,
        slug,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultInfoResult) {
      this.infoCalls.push({
        workflowsDir,
        slug,
        result: this.defaultInfoResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultInfoResult;
    }

    // Return E030 error as default
    const result: InfoResult = {
      errors: [
        {
          code: 'E030',
          message: `Workflow not found: ${slug}`,
          action: `Create workflow at ${workflowsDir}/${slug}/`,
        },
      ],
      workflow: undefined,
    };
    this.infoCalls.push({
      workflowsDir,
      slug,
      result,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  /**
   * Get the checkpoint directory path for a workflow.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns Path to checkpoints directory
   */
  getCheckpointDir(workflowsDir: string, slug: string): string {
    return `${workflowsDir}/${slug}/checkpoints`;
  }

  // ==================== Phase 2 Methods ====================

  /**
   * Create a checkpoint of the current template.
   *
   * Returns preset result if configured, otherwise generates auto-incrementing checkpoint.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @param options - Checkpoint options
   * @returns CheckpointResult (preset or auto-generated)
   */
  async checkpoint(
    workflowsDir: string,
    slug: string,
    options: CheckpointOptions
  ): Promise<CheckpointResult> {
    const key = `${workflowsDir}:${slug}`;
    const timestamp = new Date().toISOString();

    // Check for preset result
    const presetResult = this.checkpointResults.get(key);
    if (presetResult !== undefined) {
      this.checkpointCalls.push({
        workflowsDir,
        slug,
        options,
        result: presetResult,
        timestamp,
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultCheckpointResult) {
      this.checkpointCalls.push({
        workflowsDir,
        slug,
        options,
        result: this.defaultCheckpointResult,
        timestamp,
      });
      return this.defaultCheckpointResult;
    }

    // Generate auto-incrementing checkpoint
    const ordinal = this.checkpointOrdinal++;
    const paddedOrdinal = ordinal.toString().padStart(3, '0');
    const hash = `fake${paddedOrdinal}00`;
    const version = `v${paddedOrdinal}-${hash}`;
    const result: CheckpointResult = {
      errors: [],
      ordinal,
      hash,
      version,
      checkpointPath: `${workflowsDir}/${slug}/checkpoints/${version}`,
      createdAt: timestamp,
    };

    this.checkpointCalls.push({
      workflowsDir,
      slug,
      options,
      result,
      timestamp,
    });

    return result;
  }

  /**
   * Restore a checkpoint to current/.
   *
   * Returns preset result if configured, otherwise default success.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @param version - Version to restore
   * @returns RestoreResult (preset or default success)
   */
  async restore(workflowsDir: string, slug: string, version: string): Promise<RestoreResult> {
    const key = `${workflowsDir}:${slug}:${version}`;
    const timestamp = new Date().toISOString();

    // Check for preset result
    const presetResult = this.restoreResults.get(key);
    if (presetResult !== undefined) {
      this.restoreCalls.push({
        workflowsDir,
        slug,
        version,
        result: presetResult,
        timestamp,
      });
      return presetResult;
    }

    // Return default success
    const result: RestoreResult = {
      errors: [],
      slug,
      version,
      currentPath: `${workflowsDir}/${slug}/current`,
    };

    this.restoreCalls.push({
      workflowsDir,
      slug,
      version,
      result,
      timestamp,
    });

    return result;
  }

  /**
   * List all checkpoint versions for a workflow.
   *
   * Returns preset result if configured, otherwise empty versions list.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns VersionsResult (preset or default empty)
   */
  async versions(workflowsDir: string, slug: string): Promise<VersionsResult> {
    const key = `${workflowsDir}:${slug}`;
    const timestamp = new Date().toISOString();

    // Check for preset result
    const presetResult = this.versionsResults.get(key);
    if (presetResult !== undefined) {
      this.versionsCalls.push({
        workflowsDir,
        slug,
        result: presetResult,
        timestamp,
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultVersionsResult) {
      this.versionsCalls.push({
        workflowsDir,
        slug,
        result: this.defaultVersionsResult,
        timestamp,
      });
      return this.defaultVersionsResult;
    }

    // Return empty versions
    const result: VersionsResult = {
      errors: [],
      slug,
      versions: [],
    };

    this.versionsCalls.push({
      workflowsDir,
      slug,
      result,
      timestamp,
    });

    return result;
  }
}
