/**
 * Phase service interface for managing phase lifecycle operations.
 *
 * Per Phase 3: Phase Operations - Provides prepare() and validate() methods
 * for orchestrating phase execution.
 *
 * Per Phase 3 Subtask 002: Adds accept(), preflight(), handover() methods
 * for agent↔orchestrator control transfer.
 *
 * Implementations:
 * - PhaseService: Real implementation using IFileSystem, IYamlParser, ISchemaValidator
 * - FakePhaseService: Configurable implementation for testing with call capture
 */

import type {
  AcceptResult,
  FinalizeResult,
  HandoverResult,
  PreflightResult,
  PrepareResult,
  ValidateResult,
} from '@chainglass/shared';

/**
 * Check mode for validate() operation.
 *
 * - 'inputs': Validates input files exist and are schema-valid
 * - 'outputs': Validates output files exist, are non-empty, and schema-valid
 */
export type ValidateCheckMode = 'inputs' | 'outputs';

/**
 * Options for accept() operation.
 */
export interface AcceptOptions {
  /** Optional comment explaining why accepting */
  comment?: string;
}

/**
 * Options for preflight() operation.
 */
export interface PreflightOptions {
  /** Optional comment for the preflight check */
  comment?: string;
}

/**
 * Options for handover() operation.
 */
export interface HandoverOptions {
  /** Reason for handover */
  reason?: string;
  /** Whether handover is due to an error */
  dueToError?: boolean;
}

/**
 * Interface for phase lifecycle operations.
 */
export interface IPhaseService {
  /**
   * Prepare a phase for execution.
   *
   * Validates inputs exist, copies files from prior phases, resolves parameters,
   * and transitions phase status to 'ready'. The orchestrator calls this before
   * handing off to an agent.
   *
   * Algorithm:
   * 1. Load wf-phase.yaml for the phase
   * 2. Check if prior phase is finalized (if applicable)
   * 3. Copy from_phase files to inputs/files/
   * 4. Resolve parameters to inputs/params.json
   * 5. Check all required inputs exist
   * 6. Update phase status to 'ready' in wf-status.json
   *
   * Idempotency (AC-37): Calling prepare twice returns the same success result.
   * If phase is already 'ready' or beyond, returns success without re-preparing.
   *
   * @param phase - Phase name (e.g., 'gather', 'process')
   * @param runDir - Path to run directory (contains wf.yaml, phases/, wf-run/)
   * @returns PrepareResult with status, resolved inputs, copied files, and errors
   *
   * @example
   * ```typescript
   * const result = await service.prepare('process', '.chainglass/runs/run-2026-01-22-001');
   * if (result.errors.length === 0) {
   *   console.log('Phase ready:', result.status); // 'ready'
   *   console.log('Copied files:', result.copiedFromPrior);
   * }
   * ```
   *
   * @throws Never throws - all errors returned in PrepareResult.errors:
   * - E001: Missing required input file
   * - E031: Prior phase not finalized
   * - E020: Phase not found
   */
  prepare(phase: string, runDir: string): Promise<PrepareResult>;

  /**
   * Validate phase inputs or outputs.
   *
   * Checks that files exist, are non-empty (for outputs), and conform to their
   * declared schemas. Mode determines whether to check inputs or outputs.
   *
   * Algorithm:
   * 1. Load wf-phase.yaml for the phase
   * 2. List required files (inputs or outputs based on check mode)
   * 3. For each file:
   *    a. Check existence (E010 if missing)
   *    b. Check non-empty (E011 if empty, outputs only)
   *    c. Validate against schema if declared (E012 if invalid)
   * 4. Return ValidateResult with validated files and errors
   *
   * Idempotency (AC-38): Returns identical results for identical file states.
   *
   * @param phase - Phase name (e.g., 'gather', 'process')
   * @param runDir - Path to run directory
   * @param check - What to validate: 'inputs' or 'outputs' (required)
   * @returns ValidateResult with check mode, validated files, and errors
   *
   * @example
   * ```typescript
   * // Validate inputs before accepting phase
   * const inputResult = await service.validate('process', runDir, 'inputs');
   *
   * // Validate outputs before finalizing
   * const outputResult = await service.validate('process', runDir, 'outputs');
   * if (outputResult.errors.length === 0) {
   *   console.log('All outputs valid:', outputResult.files.validated);
   * }
   * ```
   *
   * @throws Never throws - all errors returned in ValidateResult.errors:
   * - E010: Missing required file
   * - E011: Empty output file
   * - E012: Schema validation failure (with expected/actual)
   * - E020: Phase not found
   */
  validate(phase: string, runDir: string, check: ValidateCheckMode): Promise<ValidateResult>;

  /**
   * Finalize a phase, extracting output parameters.
   *
   * Extracts parameters from output JSON files using dot-notation queries,
   * writes output-params.json, and transitions phase status to 'complete'.
   *
   * Algorithm:
   * 1. Load wf-phase.yaml for the phase (E020 if not found)
   * 2. For each output_parameter declaration:
   *    a. Read source file (E010 if missing)
   *    b. Parse as JSON (E012 if invalid)
   *    c. Extract value using query path
   *    d. Store null if path returns undefined (not an error)
   * 3. Write output-params.json with extracted values
   * 4. Update wf-phase.json with state='complete' and finalize action
   * 5. Update wf-status.json phases.{phase}.status to 'complete'
   * 6. Return FinalizeResult with extractedParams
   *
   * Idempotency (AC-39): Always re-extracts and overwrites. Same inputs → same outputs.
   * Per DYK Insight #4: No status checks - just do the job if phase exists.
   *
   * @param phase - Phase name (e.g., 'gather', 'process')
   * @param runDir - Path to run directory
   * @returns FinalizeResult with extractedParams and phaseStatus='complete'
   *
   * @example
   * ```typescript
   * const result = await service.finalize('gather', runDir);
   * if (result.errors.length === 0) {
   *   console.log('Extracted:', result.extractedParams); // { item_count: 3, ... }
   *   console.log('Status:', result.phaseStatus); // 'complete'
   * }
   * ```
   *
   * @throws Never throws - all errors returned in FinalizeResult.errors:
   * - E020: Phase not found
   * - E010: Missing source file for output_parameter
   * - E012: Invalid JSON in source file
   */
  finalize(phase: string, runDir: string): Promise<FinalizeResult>;

  // ==================== Handover Methods (Phase 3 Subtask 002) ====================

  /**
   * Accept a phase (agent takes control from orchestrator).
   *
   * Updates wf-phase.json to set facilitator='agent' and state='accepted'.
   * Appends a StatusEntry with action='accept'.
   *
   * Idempotency: If already facilitator='agent', returns success with wasNoOp=true.
   * Does not duplicate status entries on re-accept.
   *
   * Lazy Initialization: If wf-phase.json doesn't exist, creates it with:
   * { phase, facilitator: 'orchestrator', state: 'ready', status: [] }
   * Then immediately updates to agent/accepted.
   *
   * @param phase - Phase name (e.g., 'gather', 'process')
   * @param runDir - Path to run directory
   * @param options - Accept options (comment) - optional
   * @returns AcceptResult with facilitator, state, and statusEntry
   *
   * @throws Never throws - all errors returned in AcceptResult.errors:
   * - E020: Phase not found
   */
  accept(phase: string, runDir: string, options?: AcceptOptions): Promise<AcceptResult>;

  /**
   * Preflight check before starting phase work.
   *
   * Runs validate('inputs') and logs a 'preflight' status entry.
   * Must be called after accept() - returns E071 if facilitator is not 'agent'.
   *
   * Idempotency: If preflight already in status (and inputs still valid),
   * returns success with wasNoOp=true.
   *
   * @param phase - Phase name (e.g., 'gather', 'process')
   * @param runDir - Path to run directory
   * @param options - Preflight options (comment) - optional
   * @returns PreflightResult with checks and statusEntry
   *
   * @throws Never throws - all errors returned in PreflightResult.errors:
   * - E020: Phase not found
   * - E071: INVALID_STATE_TRANSITION (called before accept)
   * - E072: PREFLIGHT_FAILED (validation errors)
   */
  preflight(phase: string, runDir: string, options?: PreflightOptions): Promise<PreflightResult>;

  /**
   * Handover phase control to the other party.
   *
   * Switches facilitator between 'agent' and 'orchestrator'.
   * If dueToError=true, also sets state='blocked'.
   *
   * Idempotency: If already the target facilitator, returns success with wasNoOp=true.
   *
   * @param phase - Phase name (e.g., 'gather', 'process')
   * @param runDir - Path to run directory
   * @param options - Handover options (reason, dueToError) - optional
   * @returns HandoverResult with fromFacilitator, toFacilitator, state, statusEntry
   *
   * @throws Never throws - all errors returned in HandoverResult.errors:
   * - E020: Phase not found
   */
  handover(phase: string, runDir: string, options?: HandoverOptions): Promise<HandoverResult>;
}
