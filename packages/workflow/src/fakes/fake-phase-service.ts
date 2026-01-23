/**
 * Fake phase service for testing.
 *
 * Per DYK-04: FakePhaseService needs call capture (like FakeWorkflowService),
 * not just state storage (like FakeFileSystem), to enable CLI testing.
 *
 * This fake captures all prepare(), validate(), finalize(), accept(), preflight(),
 * and handover() calls for test assertions and can be configured with preset results.
 */

import type {
  AcceptResult,
  CopiedFile,
  FinalizeResult,
  HandoverResult,
  PreflightResult,
  PrepareResult,
  ResolvedInput,
  StatusEntry as SharedStatusEntry,
  ValidateResult,
  ValidatedFile,
} from '@chainglass/shared';
import type {
  AcceptOptions,
  HandoverOptions,
  IPhaseService,
  PreflightOptions,
  ValidateCheckMode,
} from '../interfaces/phase-service.interface.js';

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
 * Recorded finalize() call for test inspection.
 */
export interface FinalizeCall {
  /** Phase name passed to finalize() */
  phase: string;
  /** Run directory passed to finalize() */
  runDir: string;
  /** Result returned from finalize() */
  result: FinalizeResult;
  /** Timestamp when finalize() was called */
  timestamp: string;
}

/**
 * Recorded accept() call for test inspection.
 */
export interface AcceptCall {
  /** Phase name passed to accept() */
  phase: string;
  /** Run directory passed to accept() */
  runDir: string;
  /** Options passed to accept() */
  options: AcceptOptions;
  /** Result returned from accept() */
  result: AcceptResult;
  /** Timestamp when accept() was called */
  timestamp: string;
}

/**
 * Recorded preflight() call for test inspection.
 */
export interface PreflightCall {
  /** Phase name passed to preflight() */
  phase: string;
  /** Run directory passed to preflight() */
  runDir: string;
  /** Options passed to preflight() */
  options: PreflightOptions;
  /** Result returned from preflight() */
  result: PreflightResult;
  /** Timestamp when preflight() was called */
  timestamp: string;
}

/**
 * Recorded handover() call for test inspection.
 */
export interface HandoverCall {
  /** Phase name passed to handover() */
  phase: string;
  /** Run directory passed to handover() */
  runDir: string;
  /** Options passed to handover() */
  options: HandoverOptions;
  /** Result returned from handover() */
  result: HandoverResult;
  /** Timestamp when handover() was called */
  timestamp: string;
}

/**
 * Fake phase service for testing.
 *
 * Captures all prepare(), validate(), finalize(), accept(), preflight(),
 * and handover() calls for inspection.
 * Can be configured with preset results or use default success responses.
 */
export class FakePhaseService implements IPhaseService {
  /** Recorded prepare calls */
  private prepareCalls: PrepareCall[] = [];

  /** Recorded validate calls */
  private validateCalls: ValidateCall[] = [];

  /** Recorded finalize calls */
  private finalizeCalls: FinalizeCall[] = [];

  /** Recorded accept calls */
  private acceptCalls: AcceptCall[] = [];

  /** Recorded preflight calls */
  private preflightCalls: PreflightCall[] = [];

  /** Recorded handover calls */
  private handoverCalls: HandoverCall[] = [];

  /** Preset prepare results for specific phases */
  private prepareResults = new Map<string, PrepareResult>();

  /** Preset validate results for specific phases and modes */
  private validateResults = new Map<string, ValidateResult>();

  /** Preset finalize results for specific phases */
  private finalizeResults = new Map<string, FinalizeResult>();

  /** Preset accept results for specific phases */
  private acceptResults = new Map<string, AcceptResult>();

  /** Preset preflight results for specific phases */
  private preflightResults = new Map<string, PreflightResult>();

  /** Preset handover results for specific phases */
  private handoverResults = new Map<string, HandoverResult>();

  /** Default prepare result to return if no preset matches */
  private defaultPrepareResult: PrepareResult | null = null;

  /** Default validate result to return if no preset matches */
  private defaultValidateResult: ValidateResult | null = null;

  /** Default finalize result to return if no preset matches */
  private defaultFinalizeResult: FinalizeResult | null = null;

  /** Default accept result to return if no preset matches */
  private defaultAcceptResult: AcceptResult | null = null;

  /** Default preflight result to return if no preset matches */
  private defaultPreflightResult: PreflightResult | null = null;

  /** Default handover result to return if no preset matches */
  private defaultHandoverResult: HandoverResult | null = null;

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

  // ==================== Finalize Test Helpers ====================

  /**
   * Get the last finalize call (test helper).
   *
   * @returns Last FinalizeCall, or null if no calls made
   */
  getLastFinalizeCall(): FinalizeCall | null {
    return this.finalizeCalls.length > 0 ? this.finalizeCalls[this.finalizeCalls.length - 1] : null;
  }

  /**
   * Get all finalize calls in order (test helper).
   *
   * @returns Array of all recorded finalize calls
   */
  getFinalizeCalls(): FinalizeCall[] {
    return [...this.finalizeCalls];
  }

  /**
   * Get number of finalize calls (test helper).
   */
  getFinalizeCallCount(): number {
    return this.finalizeCalls.length;
  }

  /**
   * Set a preset finalize result for a specific phase (test helper).
   *
   * When finalize() is called with this phase, it returns the preset result.
   *
   * @param phase - Phase name to match
   * @param result - FinalizeResult to return
   */
  setFinalizeResult(phase: string, result: FinalizeResult): void {
    this.finalizeResults.set(phase, result);
  }

  /**
   * Set a default finalize result for all calls (test helper).
   *
   * Used when no preset result matches the phase.
   *
   * @param result - Default FinalizeResult to return
   */
  setDefaultFinalizeResult(result: FinalizeResult): void {
    this.defaultFinalizeResult = result;
  }

  /**
   * Set a preset error result for finalize (test helper).
   *
   * Convenience method to set up error responses.
   *
   * @param phase - Phase name to match
   * @param code - Error code (e.g., 'E020')
   * @param message - Error message
   * @param action - Suggested fix action
   */
  setFinalizeError(phase: string, code: string, message: string, action?: string): void {
    this.setFinalizeResult(phase, {
      phase,
      runDir: '',
      extractedParams: {},
      phaseStatus: 'complete',
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
    this.finalizeCalls = [];
    this.acceptCalls = [];
    this.preflightCalls = [];
    this.handoverCalls = [];
    this.prepareResults.clear();
    this.validateResults.clear();
    this.finalizeResults.clear();
    this.acceptResults.clear();
    this.preflightResults.clear();
    this.handoverResults.clear();
    this.defaultPrepareResult = null;
    this.defaultValidateResult = null;
    this.defaultFinalizeResult = null;
    this.defaultAcceptResult = null;
    this.defaultPreflightResult = null;
    this.defaultHandoverResult = null;
  }

  // ==================== Accept Test Helpers ====================

  /**
   * Get the last accept call (test helper).
   */
  getLastAcceptCall(): AcceptCall | null {
    return this.acceptCalls.length > 0 ? this.acceptCalls[this.acceptCalls.length - 1] : null;
  }

  /**
   * Get all accept calls in order (test helper).
   */
  getAcceptCalls(): AcceptCall[] {
    return [...this.acceptCalls];
  }

  /**
   * Get number of accept calls (test helper).
   */
  getAcceptCallCount(): number {
    return this.acceptCalls.length;
  }

  /**
   * Set a preset accept result for a specific phase (test helper).
   */
  setAcceptResult(phase: string, result: AcceptResult): void {
    this.acceptResults.set(phase, result);
  }

  /**
   * Set a default accept result for all calls (test helper).
   */
  setDefaultAcceptResult(result: AcceptResult): void {
    this.defaultAcceptResult = result;
  }

  // ==================== Preflight Test Helpers ====================

  /**
   * Get the last preflight call (test helper).
   */
  getLastPreflightCall(): PreflightCall | null {
    return this.preflightCalls.length > 0
      ? this.preflightCalls[this.preflightCalls.length - 1]
      : null;
  }

  /**
   * Get all preflight calls in order (test helper).
   */
  getPreflightCalls(): PreflightCall[] {
    return [...this.preflightCalls];
  }

  /**
   * Get number of preflight calls (test helper).
   */
  getPreflightCallCount(): number {
    return this.preflightCalls.length;
  }

  /**
   * Set a preset preflight result for a specific phase (test helper).
   */
  setPreflightResult(phase: string, result: PreflightResult): void {
    this.preflightResults.set(phase, result);
  }

  /**
   * Set a default preflight result for all calls (test helper).
   */
  setDefaultPreflightResult(result: PreflightResult): void {
    this.defaultPreflightResult = result;
  }

  // ==================== Handover Test Helpers ====================

  /**
   * Get the last handover call (test helper).
   */
  getLastHandoverCall(): HandoverCall | null {
    return this.handoverCalls.length > 0 ? this.handoverCalls[this.handoverCalls.length - 1] : null;
  }

  /**
   * Get all handover calls in order (test helper).
   */
  getHandoverCalls(): HandoverCall[] {
    return [...this.handoverCalls];
  }

  /**
   * Get number of handover calls (test helper).
   */
  getHandoverCallCount(): number {
    return this.handoverCalls.length;
  }

  /**
   * Set a preset handover result for a specific phase (test helper).
   */
  setHandoverResult(phase: string, result: HandoverResult): void {
    this.handoverResults.set(phase, result);
  }

  /**
   * Set a default handover result for all calls (test helper).
   */
  setDefaultHandoverResult(result: HandoverResult): void {
    this.defaultHandoverResult = result;
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

  /**
   * Create a success finalize result for testing (test helper).
   *
   * @param phase - Phase name
   * @param runDir - Run directory path
   * @param extractedParams - Extracted parameters
   * @returns FinalizeResult with no errors
   */
  static createFinalizeSuccessResult(
    phase: string,
    runDir: string,
    extractedParams: Record<string, unknown> = {}
  ): FinalizeResult {
    return {
      phase,
      runDir,
      extractedParams,
      phaseStatus: 'complete',
      errors: [],
    };
  }

  /**
   * Create an error finalize result for testing (test helper).
   *
   * @param phase - Phase name
   * @param code - Error code (e.g., 'E020')
   * @param message - Error message
   * @param action - Suggested fix action
   * @returns FinalizeResult with error
   */
  static createFinalizeErrorResult(
    phase: string,
    code: string,
    message: string,
    action?: string
  ): FinalizeResult {
    return {
      phase,
      runDir: '',
      extractedParams: {},
      phaseStatus: 'complete',
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

  /**
   * Finalize a phase, extracting output parameters.
   *
   * Captures the call and returns either:
   * - Preset result (if configured for this phase)
   * - Default result (if set)
   * - Auto-generated success result (otherwise)
   *
   * @param phase - Phase name
   * @param runDir - Run directory path
   * @returns FinalizeResult (preset or generated)
   */
  async finalize(phase: string, runDir: string): Promise<FinalizeResult> {
    // Check for preset result
    const presetResult = this.finalizeResults.get(phase);
    if (presetResult) {
      this.finalizeCalls.push({
        phase,
        runDir,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultFinalizeResult) {
      this.finalizeCalls.push({
        phase,
        runDir,
        result: this.defaultFinalizeResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultFinalizeResult;
    }

    // Generate auto success result
    const result: FinalizeResult = {
      phase,
      runDir,
      extractedParams: {},
      phaseStatus: 'complete',
      errors: [],
    };

    this.finalizeCalls.push({ phase, runDir, result, timestamp: new Date().toISOString() });
    return result;
  }

  // ==================== Handover Methods (Phase 3 Subtask 002) ====================

  /**
   * Accept a phase.
   *
   * Captures the call and returns either:
   * - Preset result (if configured for this phase)
   * - Default result (if set)
   * - Auto-generated success result (otherwise)
   */
  async accept(phase: string, runDir: string, options?: AcceptOptions): Promise<AcceptResult> {
    const opts = options ?? {};

    // Check for preset result
    const presetResult = this.acceptResults.get(phase);
    if (presetResult) {
      this.acceptCalls.push({
        phase,
        runDir,
        options: opts,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultAcceptResult) {
      this.acceptCalls.push({
        phase,
        runDir,
        options: opts,
        result: this.defaultAcceptResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultAcceptResult;
    }

    // Generate auto success result
    const statusEntry: SharedStatusEntry = {
      timestamp: new Date().toISOString(),
      from: 'agent',
      action: 'accept',
      comment: opts.comment,
    };
    const result: AcceptResult = {
      phase,
      runDir,
      facilitator: 'agent',
      state: 'accepted',
      statusEntry,
      errors: [],
    };

    this.acceptCalls.push({
      phase,
      runDir,
      options: opts,
      result,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  /**
   * Preflight check.
   *
   * Captures the call and returns either:
   * - Preset result (if configured for this phase)
   * - Default result (if set)
   * - Auto-generated success result (otherwise)
   */
  async preflight(
    phase: string,
    runDir: string,
    options?: PreflightOptions
  ): Promise<PreflightResult> {
    const opts = options ?? {};

    // Check for preset result
    const presetResult = this.preflightResults.get(phase);
    if (presetResult) {
      this.preflightCalls.push({
        phase,
        runDir,
        options: opts,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultPreflightResult) {
      this.preflightCalls.push({
        phase,
        runDir,
        options: opts,
        result: this.defaultPreflightResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultPreflightResult;
    }

    // Generate auto success result
    const statusEntry: SharedStatusEntry = {
      timestamp: new Date().toISOString(),
      from: 'agent',
      action: 'preflight',
      comment: opts.comment,
    };
    const result: PreflightResult = {
      phase,
      runDir,
      checks: { configValid: true, inputsExist: true, schemasValid: true },
      statusEntry,
      errors: [],
    };

    this.preflightCalls.push({
      phase,
      runDir,
      options: opts,
      result,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  /**
   * Handover.
   *
   * Captures the call and returns either:
   * - Preset result (if configured for this phase)
   * - Default result (if set)
   * - Auto-generated success result (otherwise)
   */
  async handover(
    phase: string,
    runDir: string,
    options?: HandoverOptions
  ): Promise<HandoverResult> {
    const opts = options ?? {};

    // Check for preset result
    const presetResult = this.handoverResults.get(phase);
    if (presetResult) {
      this.handoverCalls.push({
        phase,
        runDir,
        options: opts,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultHandoverResult) {
      this.handoverCalls.push({
        phase,
        runDir,
        options: opts,
        result: this.defaultHandoverResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultHandoverResult;
    }

    // Generate auto success result
    const statusEntry: SharedStatusEntry = {
      timestamp: new Date().toISOString(),
      from: 'agent',
      action: 'handover',
      comment: opts.reason,
    };
    const result: HandoverResult = {
      phase,
      runDir,
      fromFacilitator: 'agent',
      toFacilitator: 'orchestrator',
      state: opts.dueToError ? 'blocked' : 'ready',
      statusEntry,
      errors: [],
    };

    this.handoverCalls.push({
      phase,
      runDir,
      options: opts,
      result,
      timestamp: new Date().toISOString(),
    });
    return result;
  }
}
