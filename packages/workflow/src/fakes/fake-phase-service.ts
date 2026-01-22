/**
 * Fake phase service for testing.
 *
 * Per DYK-04: FakePhaseService needs call capture (like FakeWorkflowService),
 * not just state storage (like FakeFileSystem), to enable CLI testing.
 *
 * This fake captures all prepare() and validate() calls for test assertions
 * and can be configured with preset results.
 */

import type {
  CopiedFile,
  PrepareResult,
  ResolvedInput,
  ValidateResult,
  ValidatedFile,
} from '@chainglass/shared';
import type { IPhaseService, ValidateCheckMode } from '../interfaces/phase-service.interface.js';

/**
 * Recorded prepare() call for test inspection.
 */
export interface PrepareCall {
  /** Phase name passed to prepare() */
  phase: string;
  /** Run directory passed to prepare() */
  runDir: string;
  /** Result returned from prepare() */
  result: PrepareResult;
  /** Timestamp when prepare() was called */
  timestamp: string;
}

/**
 * Recorded validate() call for test inspection.
 */
export interface ValidateCall {
  /** Phase name passed to validate() */
  phase: string;
  /** Run directory passed to validate() */
  runDir: string;
  /** Check mode passed to validate() */
  check: ValidateCheckMode;
  /** Result returned from validate() */
  result: ValidateResult;
  /** Timestamp when validate() was called */
  timestamp: string;
}

/**
 * Fake phase service for testing.
 *
 * Captures all prepare() and validate() calls for inspection.
 * Can be configured with preset results or use default success responses.
 */
export class FakePhaseService implements IPhaseService {
  /** Recorded prepare calls */
  private prepareCalls: PrepareCall[] = [];

  /** Recorded validate calls */
  private validateCalls: ValidateCall[] = [];

  /** Preset prepare results for specific phases */
  private prepareResults = new Map<string, PrepareResult>();

  /** Preset validate results for specific phases and modes */
  private validateResults = new Map<string, ValidateResult>();

  /** Default prepare result to return if no preset matches */
  private defaultPrepareResult: PrepareResult | null = null;

  /** Default validate result to return if no preset matches */
  private defaultValidateResult: ValidateResult | null = null;

  // ==================== Prepare Test Helpers ====================

  /**
   * Get the last prepare call (test helper).
   *
   * @returns Last PrepareCall, or null if no calls made
   */
  getLastPrepareCall(): PrepareCall | null {
    return this.prepareCalls.length > 0 ? this.prepareCalls[this.prepareCalls.length - 1] : null;
  }

  /**
   * Get all prepare calls in order (test helper).
   *
   * @returns Array of all recorded prepare calls
   */
  getPrepareCalls(): PrepareCall[] {
    return [...this.prepareCalls];
  }

  /**
   * Get number of prepare calls (test helper).
   */
  getPrepareCallCount(): number {
    return this.prepareCalls.length;
  }

  /**
   * Set a preset prepare result for a specific phase (test helper).
   *
   * When prepare() is called with this phase, it returns the preset result.
   *
   * @param phase - Phase name to match
   * @param result - PrepareResult to return
   */
  setPrepareResult(phase: string, result: PrepareResult): void {
    this.prepareResults.set(phase, result);
  }

  /**
   * Set a default prepare result for all calls (test helper).
   *
   * Used when no preset result matches the phase.
   *
   * @param result - Default PrepareResult to return
   */
  setDefaultPrepareResult(result: PrepareResult): void {
    this.defaultPrepareResult = result;
  }

  /**
   * Set a preset error result for prepare (test helper).
   *
   * Convenience method to set up error responses.
   *
   * @param phase - Phase name to match
   * @param code - Error code (e.g., 'E001')
   * @param message - Error message
   * @param action - Suggested fix action
   */
  setPrepareError(phase: string, code: string, message: string, action?: string): void {
    this.setPrepareResult(phase, {
      phase,
      runDir: '',
      status: 'failed',
      inputs: { required: [], resolved: [] },
      copiedFromPrior: [],
      errors: [{ code, message, action }],
    });
  }

  // ==================== Validate Test Helpers ====================

  /**
   * Get the last validate call (test helper).
   *
   * @returns Last ValidateCall, or null if no calls made
   */
  getLastValidateCall(): ValidateCall | null {
    return this.validateCalls.length > 0 ? this.validateCalls[this.validateCalls.length - 1] : null;
  }

  /**
   * Get all validate calls in order (test helper).
   *
   * @returns Array of all recorded validate calls
   */
  getValidateCalls(): ValidateCall[] {
    return [...this.validateCalls];
  }

  /**
   * Get number of validate calls (test helper).
   */
  getValidateCallCount(): number {
    return this.validateCalls.length;
  }

  /**
   * Set a preset validate result for a specific phase and mode (test helper).
   *
   * When validate() is called with this phase and mode, it returns the preset result.
   *
   * @param phase - Phase name to match
   * @param check - Check mode to match ('inputs' or 'outputs')
   * @param result - ValidateResult to return
   */
  setValidateResult(phase: string, check: ValidateCheckMode, result: ValidateResult): void {
    const key = `${phase}:${check}`;
    this.validateResults.set(key, result);
  }

  /**
   * Set a default validate result for all calls (test helper).
   *
   * Used when no preset result matches the phase/mode.
   *
   * @param result - Default ValidateResult to return
   */
  setDefaultValidateResult(result: ValidateResult): void {
    this.defaultValidateResult = result;
  }

  /**
   * Set a preset error result for validate (test helper).
   *
   * Convenience method to set up error responses.
   *
   * @param phase - Phase name to match
   * @param check - Check mode to match
   * @param code - Error code (e.g., 'E010')
   * @param message - Error message
   * @param action - Suggested fix action
   */
  setValidateError(
    phase: string,
    check: ValidateCheckMode,
    code: string,
    message: string,
    action?: string
  ): void {
    this.setValidateResult(phase, check, {
      phase,
      runDir: '',
      check,
      files: { required: [], validated: [] },
      errors: [{ code, message, action }],
    });
  }

  // ==================== General Test Helpers ====================

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.prepareCalls = [];
    this.validateCalls = [];
    this.prepareResults.clear();
    this.validateResults.clear();
    this.defaultPrepareResult = null;
    this.defaultValidateResult = null;
  }

  /**
   * Create a success prepare result for testing (test helper).
   *
   * @param phase - Phase name
   * @param runDir - Run directory path
   * @param resolved - Resolved inputs
   * @param copiedFromPrior - Files copied from prior phase
   * @returns PrepareResult with no errors
   */
  static createPrepareSuccessResult(
    phase: string,
    runDir: string,
    resolved: ResolvedInput[] = [],
    copiedFromPrior: CopiedFile[] = []
  ): PrepareResult {
    return {
      phase,
      runDir,
      status: 'ready',
      inputs: {
        required: resolved.map((r) => r.name),
        resolved,
      },
      copiedFromPrior,
      errors: [],
    };
  }

  /**
   * Create a success validate result for testing (test helper).
   *
   * @param phase - Phase name
   * @param runDir - Run directory path
   * @param check - Check mode
   * @param validated - Validated files
   * @returns ValidateResult with no errors
   */
  static createValidateSuccessResult(
    phase: string,
    runDir: string,
    check: ValidateCheckMode,
    validated: ValidatedFile[] = []
  ): ValidateResult {
    return {
      phase,
      runDir,
      check,
      files: {
        required: validated.map((f) => f.name),
        validated,
      },
      errors: [],
    };
  }

  /**
   * Create an error prepare result for testing (test helper).
   *
   * @param phase - Phase name
   * @param code - Error code (e.g., 'E001')
   * @param message - Error message
   * @param action - Suggested fix action
   * @returns PrepareResult with error
   */
  static createPrepareErrorResult(
    phase: string,
    code: string,
    message: string,
    action?: string
  ): PrepareResult {
    return {
      phase,
      runDir: '',
      status: 'failed',
      inputs: { required: [], resolved: [] },
      copiedFromPrior: [],
      errors: [{ code, message, action }],
    };
  }

  /**
   * Create an error validate result for testing (test helper).
   *
   * @param phase - Phase name
   * @param check - Check mode
   * @param code - Error code (e.g., 'E010')
   * @param message - Error message
   * @param action - Suggested fix action
   * @returns ValidateResult with error
   */
  static createValidateErrorResult(
    phase: string,
    check: ValidateCheckMode,
    code: string,
    message: string,
    action?: string
  ): ValidateResult {
    return {
      phase,
      runDir: '',
      check,
      files: { required: [], validated: [] },
      errors: [{ code, message, action }],
    };
  }

  // ==================== IPhaseService Implementation ====================

  /**
   * Prepare a phase for execution.
   *
   * Captures the call and returns either:
   * - Preset result (if configured for this phase)
   * - Default result (if set)
   * - Auto-generated success result (otherwise)
   *
   * @param phase - Phase name
   * @param runDir - Run directory path
   * @returns PrepareResult (preset or generated)
   */
  async prepare(phase: string, runDir: string): Promise<PrepareResult> {
    // Check for preset result
    const presetResult = this.prepareResults.get(phase);
    if (presetResult) {
      this.prepareCalls.push({
        phase,
        runDir,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultPrepareResult) {
      this.prepareCalls.push({
        phase,
        runDir,
        result: this.defaultPrepareResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultPrepareResult;
    }

    // Generate auto success result
    const result: PrepareResult = {
      phase,
      runDir,
      status: 'ready',
      inputs: { required: [], resolved: [] },
      copiedFromPrior: [],
      errors: [],
    };

    this.prepareCalls.push({ phase, runDir, result, timestamp: new Date().toISOString() });
    return result;
  }

  /**
   * Validate phase inputs or outputs.
   *
   * Captures the call and returns either:
   * - Preset result (if configured for this phase/mode)
   * - Default result (if set)
   * - Auto-generated success result (otherwise)
   *
   * @param phase - Phase name
   * @param runDir - Run directory path
   * @param check - Check mode ('inputs' or 'outputs')
   * @returns ValidateResult (preset or generated)
   */
  async validate(phase: string, runDir: string, check: ValidateCheckMode): Promise<ValidateResult> {
    const key = `${phase}:${check}`;

    // Check for preset result
    const presetResult = this.validateResults.get(key);
    if (presetResult) {
      this.validateCalls.push({
        phase,
        runDir,
        check,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultValidateResult) {
      this.validateCalls.push({
        phase,
        runDir,
        check,
        result: this.defaultValidateResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultValidateResult;
    }

    // Generate auto success result
    const result: ValidateResult = {
      phase,
      runDir,
      check,
      files: { required: [], validated: [] },
      errors: [],
    };

    this.validateCalls.push({ phase, runDir, check, result, timestamp: new Date().toISOString() });
    return result;
  }
}
