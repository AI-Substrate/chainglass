/**
 * Phase service interface for managing phase lifecycle operations.
 *
 * Per Phase 3: Phase Operations - Provides prepare() and validate() methods
 * for orchestrating phase execution.
 *
 * Implementations:
 * - PhaseService: Real implementation using IFileSystem, IYamlParser, ISchemaValidator
 * - FakePhaseService: Configurable implementation for testing with call capture
 */

import type { PrepareResult, ValidateResult } from '@chainglass/shared';

/**
 * Check mode for validate() operation.
 *
 * - 'inputs': Validates input files exist and are schema-valid
 * - 'outputs': Validates output files exist, are non-empty, and schema-valid
 */
export type ValidateCheckMode = 'inputs' | 'outputs';

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
}
