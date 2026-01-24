/**
 * Fake workflow registry for testing.
 *
 * Per Phase 1 T008: Test double for IWorkflowRegistry.
 * Follows the FakeWorkflowService pattern with:
 * - Call capture for assertions
 * - Preset configuration for deterministic results
 * - Error injection for failure testing
 */

import type { InfoResult, ListResult, WorkflowInfo, WorkflowSummary } from '@chainglass/shared';
import type { IWorkflowRegistry } from '../interfaces/workflow-registry.interface.js';

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

  /** Preset list results (keyed by workflowsDir) */
  private listResults = new Map<string, ListResult>();

  /** Preset info results (keyed by `${workflowsDir}:${slug}`) */
  private infoResults = new Map<string, InfoResult>();

  /** Default list result to return if no preset matches */
  private defaultListResult: ListResult | null = null;

  /** Default info result to return if no preset matches */
  private defaultInfoResult: InfoResult | null = null;

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
   * Reset all state (test helper).
   */
  reset(): void {
    this.listCalls = [];
    this.infoCalls = [];
    this.listResults.clear();
    this.infoResults.clear();
    this.defaultListResult = null;
    this.defaultInfoResult = null;
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
}
