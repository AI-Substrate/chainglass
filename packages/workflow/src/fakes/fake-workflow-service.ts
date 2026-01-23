/**
 * Fake workflow service for testing.
 *
 * Per DYK-04: FakeWorkflowService needs call capture (like FakeOutputAdapter),
 * not just state storage (like FakeFileSystem), to enable CLI testing.
 *
 * This fake captures all compose() calls for test assertions and can be
 * configured with preset results.
 */

import type { ComposeResult, PhaseInfo } from '@chainglass/shared';
import type { IWorkflowService } from '../interfaces/workflow-service.interface.js';

/**
 * Recorded compose() call for test inspection.
 */
export interface ComposeCall {
  /** Template name or path passed to compose() */
  template: string;
  /** Runs directory passed to compose() */
  runsDir: string;
  /** Result returned from compose() */
  result: ComposeResult;
  /** Timestamp when compose() was called */
  timestamp: string;
}

/**
 * Fake workflow service for testing.
 *
 * Captures all compose() calls for inspection.
 * Can be configured with preset results or use default success response.
 */
export class FakeWorkflowService implements IWorkflowService {
  /** Recorded compose calls */
  private calls: ComposeCall[] = [];

  /** Preset results for specific templates */
  private presetResults = new Map<string, ComposeResult>();

  /** Default result to return if no preset matches */
  private defaultResult: ComposeResult | null = null;

  /** Counter for generating unique run directories */
  private runCounter = 0;

  // ==================== Test Helpers ====================

  /**
   * Get the last compose call (test helper).
   *
   * @returns Last ComposeCall, or null if no calls made
   */
  getLastComposeCall(): ComposeCall | null {
    return this.calls.length > 0 ? this.calls[this.calls.length - 1] : null;
  }

  /**
   * Get all compose calls in order (test helper).
   *
   * @returns Array of all recorded compose calls
   */
  getComposeCalls(): ComposeCall[] {
    return [...this.calls];
  }

  /**
   * Get number of compose calls (test helper).
   */
  getComposeCallCount(): number {
    return this.calls.length;
  }

  /**
   * Set a preset result for a specific template (test helper).
   *
   * When compose() is called with this template, it returns the preset result.
   *
   * @param template - Template name or path to match
   * @param result - ComposeResult to return
   */
  setComposeResult(template: string, result: ComposeResult): void {
    this.presetResults.set(template, result);
  }

  /**
   * Set a default result to return for all compose calls (test helper).
   *
   * Used when no preset result matches the template.
   *
   * @param result - Default ComposeResult to return
   */
  setDefaultResult(result: ComposeResult): void {
    this.defaultResult = result;
  }

  /**
   * Set a preset error result for a template (test helper).
   *
   * Convenience method to set up error responses.
   *
   * @param template - Template name or path to match
   * @param code - Error code (e.g., 'E020')
   * @param message - Error message
   * @param action - Suggested fix action
   */
  setComposeError(template: string, code: string, message: string, action?: string): void {
    this.setComposeResult(template, {
      runDir: '',
      template: '',
      phases: [],
      errors: [{ code, message, action }],
    });
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.calls = [];
    this.presetResults.clear();
    this.defaultResult = null;
    this.runCounter = 0;
  }

  /**
   * Create a success result for testing (test helper).
   *
   * @param template - Template name
   * @param runDir - Run directory path
   * @param phases - Array of phase info
   * @returns ComposeResult with no errors
   */
  static createSuccessResult(template: string, runDir: string, phases: PhaseInfo[]): ComposeResult {
    return {
      template,
      runDir,
      phases,
      errors: [],
    };
  }

  /**
   * Create an error result for testing (test helper).
   *
   * @param code - Error code (e.g., 'E020')
   * @param message - Error message
   * @param action - Suggested fix action
   * @returns ComposeResult with error
   */
  static createErrorResult(code: string, message: string, action?: string): ComposeResult {
    return {
      runDir: '',
      template: '',
      phases: [],
      errors: [{ code, message, action }],
    };
  }

  // ==================== IWorkflowService Implementation ====================

  /**
   * Create a new workflow run from a template.
   *
   * Captures the call and returns either:
   * - Preset result (if configured for this template)
   * - Default result (if set)
   * - Auto-generated success result (otherwise)
   *
   * @param template - Template name or path
   * @param runsDir - Directory for run folders
   * @returns ComposeResult (preset or generated)
   */
  async compose(template: string, runsDir: string): Promise<ComposeResult> {
    // Check for preset result
    const presetResult = this.presetResults.get(template);
    if (presetResult !== undefined) {
      this.calls.push({
        template,
        runsDir,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultResult) {
      this.calls.push({
        template,
        runsDir,
        result: this.defaultResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultResult;
    }

    // Generate auto success result
    this.runCounter++;
    const today = new Date().toISOString().split('T')[0];
    const runId = `run-${today}-${this.runCounter.toString().padStart(3, '0')}`;
    const runDir = `${runsDir}/${runId}`;

    // Extract template name from path if needed
    const templateName = template.includes('/')
      ? (template.split('/').pop() ?? template)
      : template;

    const result: ComposeResult = {
      template: templateName,
      runDir,
      phases: [{ name: 'default', order: 1, status: 'pending' }],
      errors: [],
    };

    this.calls.push({ template, runsDir, result, timestamp: new Date().toISOString() });
    return result;
  }
}
