/**
 * PhaseService implementation for managing phase lifecycle operations.
 *
 * Per Phase 3: Phase Operations - Provides the prepare() and validate() methods
 * that enable orchestrators and agents to manage phase execution.
 *
 * Per Phase 3 Subtask 002: Adds accept(), preflight(), handover() methods
 * for agent↔orchestrator control transfer.
 */

import * as path from 'node:path';
import type {
  AcceptResult,
  CopiedFile,
  FinalizeResult,
  HandoverResult,
  IFileSystem,
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
  IPhaseAdapter,
  IPhaseService,
  ISchemaValidator,
  IYamlParser,
  PreflightOptions,
  ValidateCheckMode,
} from '../interfaces/index.js';
import type {
  AcceptResultWithEntity,
  FinalizeResultWithEntity,
  HandoverResultWithEntity,
  PreflightResultWithEntity,
  PrepareResultWithEntity,
  ValidateResultWithEntity,
} from './phase-service.types.js';
import type { PhaseRunStatus, StatusEntry, WfPhaseState, WfStatus } from '../types/index.js';
import { extractValue } from '../utils/index.js';

/**
 * Error codes for phase operations.
 */
export const PhaseErrorCodes = {
  /** Missing required input file */
  MISSING_INPUT: 'E001',
  /** Missing required output file */
  MISSING_OUTPUT: 'E010',
  /** Empty output file */
  EMPTY_OUTPUT: 'E011',
  /** Schema validation failure */
  SCHEMA_FAILURE: 'E012',
  /** Phase not found */
  PHASE_NOT_FOUND: 'E020',
  /** Prior phase not finalized */
  PRIOR_NOT_FINALIZED: 'E031',

  // Handover error codes (Phase 3 Subtask 002)
  /** Wrong facilitator attempting operation */
  WRONG_FACILITATOR: 'E070',
  /** Invalid state transition (e.g., preflight before accept) */
  INVALID_STATE_TRANSITION: 'E071',
  /** Preflight validation failed */
  PREFLIGHT_FAILED: 'E072',
  /** Handover rejected (e.g., cannot hand over incomplete phase) */
  HANDOVER_REJECTED: 'E073',
} as const;

/**
 * Phase definition parsed from wf-phase.yaml.
 */
interface PhaseDefinition {
  phase: string;
  description: string;
  order: number;
  inputs?: {
    files?: Array<{
      name: string;
      required: boolean;
      from_phase?: string;
      description?: string;
    }>;
    parameters?: Array<{
      name: string;
      required: boolean;
      from_phase?: string;
      description?: string;
    }>;
    messages?: Array<{
      id: string;
      type: string;
      from: string;
      required: boolean;
    }>;
  };
  outputs?: Array<{
    name: string;
    type: string;
    required: boolean;
    schema?: string;
    description?: string;
  }>;
  output_parameters?: Array<{
    name: string;
    source: string;
    query: string;
    description?: string;
  }>;
}

/**
 * PhaseService implements phase lifecycle operations.
 *
 * Depends on:
 * - IFileSystem: File operations (read, write, copy, mkdir, exists)
 * - IYamlParser: Parse wf-phase.yaml
 * - ISchemaValidator: Validate outputs against schemas
 * - IPhaseAdapter (optional): Load Phase entities after operations (Phase 6)
 *
 * Per Phase 6 / DYK-02: When IPhaseAdapter is injected, service methods will
 * include the Phase entity in their results via the optional `phaseEntity` field.
 */
export class PhaseService implements IPhaseService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly yamlParser: IYamlParser,
    private readonly schemaValidator: ISchemaValidator,
    private readonly phaseAdapter?: IPhaseAdapter
  ) {}

  /**
   * Prepare a phase for execution.
   *
   * Per Phase 3 spec - validates inputs, copies from_phase files,
   * resolves parameters, and transitions to 'ready' status.
   *
   * Per Phase 6 / DYK-02: When IPhaseAdapter is injected, includes Phase entity
   * in result reflecting the post-prepare state.
   */
  async prepare(phase: string, runDir: string): Promise<PrepareResultWithEntity> {
    // 1. Check if phase exists
    const phaseDir = path.join(runDir, 'phases', phase);
    const phaseYamlPath = path.join(phaseDir, 'wf-phase.yaml');

    if (!(await this.fs.exists(phaseYamlPath))) {
      return this.createPrepareErrorResult(phase, runDir, PhaseErrorCodes.PHASE_NOT_FOUND, {
        message: `Phase not found: ${phase}`,
        path: phaseYamlPath,
        action: 'Verify the phase name exists in the workflow',
      });
    }

    // 2. Load wf-status.json and check current phase status
    const wfStatus = await this.loadWfStatus(runDir);
    const phaseStatus = wfStatus.phases[phase]?.status;

    // Idempotency: if already ready or beyond, return success
    if (phaseStatus && this.isStatusAtOrBeyond(phaseStatus, 'ready')) {
      return this.createPrepareSuccessResult(phase, runDir, [], []);
    }

    // 3. Parse wf-phase.yaml
    const phaseYamlContent = await this.fs.readFile(phaseYamlPath);
    const phaseDef = this.yamlParser.parse<PhaseDefinition>(phaseYamlContent, phaseYamlPath);

    // 4. Check prior phase is finalized (if this phase has from_phase dependencies)
    const priorPhases = this.getPriorPhases(phaseDef);
    for (const priorPhase of priorPhases) {
      const priorStatus = wfStatus.phases[priorPhase]?.status;
      if (!priorStatus || priorStatus !== 'complete') {
        return this.createPrepareErrorResult(phase, runDir, PhaseErrorCodes.PRIOR_NOT_FINALIZED, {
          message: `Prior phase '${priorPhase}' is not finalized (status: ${priorStatus || 'unknown'})`,
          path: priorPhase,
          action: `Finalize phase '${priorPhase}' before preparing '${phase}'`,
        });
      }
    }

    // 5. Copy from_phase files
    const copiedFromPrior: CopiedFile[] = [];
    const errors: PrepareResult['errors'] = [];

    if (phaseDef.inputs?.files) {
      for (const fileInput of phaseDef.inputs.files) {
        if (fileInput.from_phase) {
          const sourcePath = path.join(
            runDir,
            'phases',
            fileInput.from_phase,
            'run',
            'outputs',
            fileInput.name
          );
          const destPath = path.join(
            runDir,
            'phases',
            phase,
            'run',
            'inputs',
            'files',
            fileInput.name
          );

          // Check source exists
          if (!(await this.fs.exists(sourcePath))) {
            if (fileInput.required) {
              errors.push({
                code: PhaseErrorCodes.MISSING_INPUT,
                message: `Missing required input file: ${fileInput.name} from phase '${fileInput.from_phase}'`,
                path: sourcePath,
                action: `Ensure phase '${fileInput.from_phase}' produces output '${fileInput.name}'`,
              });
            }
          } else {
            // Copy file (always overwrite per DYK Insight #4)
            const content = await this.fs.readFile(sourcePath);
            await this.fs.writeFile(destPath, content);
            copiedFromPrior.push({ from: sourcePath, to: destPath });
          }
        }
      }
    }

    // If there were errors copying files, return failure
    if (errors.length > 0) {
      return {
        phase,
        runDir,
        status: 'failed',
        inputs: {
          required: this.getRequiredInputNames(phaseDef),
          resolved: [],
        },
        copiedFromPrior,
        errors,
      };
    }

    // 6. Resolve parameters to inputs/params.json
    if (phaseDef.inputs?.parameters && phaseDef.inputs.parameters.length > 0) {
      const params: Record<string, unknown> = {};

      for (const paramInput of phaseDef.inputs.parameters) {
        if (paramInput.from_phase) {
          const priorParamsPath = path.join(
            runDir,
            'phases',
            paramInput.from_phase,
            'run',
            'wf-data',
            'output-params.json'
          );

          if (await this.fs.exists(priorParamsPath)) {
            const priorParamsContent = await this.fs.readFile(priorParamsPath);
            const priorParams = JSON.parse(priorParamsContent);
            if (paramInput.name in priorParams) {
              params[paramInput.name] = priorParams[paramInput.name];
            }
          }
        }
      }

      // Write params.json
      const paramsPath = path.join(runDir, 'phases', phase, 'run', 'inputs', 'params.json');
      await this.fs.writeFile(paramsPath, JSON.stringify(params, null, 2));
    }

    // 7. Build resolved inputs list
    const resolvedInputs = await this.resolveInputs(phaseDef, runDir, phase);

    // 8. Update wf-status.json to 'ready'
    wfStatus.phases[phase].status = 'ready';
    await this.saveWfStatus(runDir, wfStatus);

    // 9. Load Phase entity if adapter is injected (Phase 6 / DYK-02)
    const result = this.createPrepareSuccessResult(phase, runDir, resolvedInputs, copiedFromPrior);
    if (this.phaseAdapter) {
      try {
        result.phaseEntity = await this.phaseAdapter.loadFromPath(phaseDir);
      } catch {
        // Entity loading failure is non-fatal - result is still valid
      }
    }
    return result;
  }

  /**
   * Validate phase inputs or outputs.
   *
   * Per Phase 3 spec - checks files exist, are non-empty (outputs),
   * and conform to declared schemas.
   *
   * Per Phase 6 / DYK-02: When IPhaseAdapter is injected, includes Phase entity
   * in result reflecting the post-validate state.
   */
  async validate(phase: string, runDir: string, check: ValidateCheckMode): Promise<ValidateResultWithEntity> {
    // 1. Check if phase exists
    const phaseDir = path.join(runDir, 'phases', phase);
    const phaseYamlPath = path.join(phaseDir, 'wf-phase.yaml');

    if (!(await this.fs.exists(phaseYamlPath))) {
      return this.createValidateErrorResult(phase, runDir, check, PhaseErrorCodes.PHASE_NOT_FOUND, {
        message: `Phase not found: ${phase}`,
        path: phaseYamlPath,
        action: 'Verify the phase name exists in the workflow',
      });
    }

    // 2. Parse wf-phase.yaml
    const phaseYamlContent = await this.fs.readFile(phaseYamlPath);
    const phaseDef = this.yamlParser.parse<PhaseDefinition>(phaseYamlContent, phaseYamlPath);

    // 3. Get files to validate based on check mode
    const filesToValidate =
      check === 'inputs'
        ? this.getInputFilesToValidate(phaseDef)
        : this.getOutputFilesToValidate(phaseDef);

    const required = filesToValidate.map((f) => f.name);
    const validated: ValidatedFile[] = [];
    const errors: ValidateResult['errors'] = [];

    // 4. Validate each file
    for (const file of filesToValidate) {
      const filePath =
        check === 'inputs'
          ? path.join(runDir, 'phases', phase, 'run', 'inputs', 'files', file.name)
          : path.join(runDir, 'phases', phase, 'run', 'outputs', file.name);

      // Check exists
      if (!(await this.fs.exists(filePath))) {
        errors.push({
          code: PhaseErrorCodes.MISSING_OUTPUT,
          message: `Missing required ${check === 'inputs' ? 'input' : 'output'}: ${file.name}`,
          path: filePath,
          action:
            check === 'inputs'
              ? 'Ensure the file exists in inputs/files/'
              : 'Create the required output file',
        });
        continue;
      }

      // Check non-empty (for outputs only)
      if (check === 'outputs') {
        const content = await this.fs.readFile(filePath);
        if (!content || content.trim().length === 0) {
          errors.push({
            code: PhaseErrorCodes.EMPTY_OUTPUT,
            message: `Empty output file: ${file.name}`,
            path: filePath,
            action: 'Write content to the output file',
          });
          continue;
        }
      }

      // Schema validation (if schema declared)
      let valid = true;
      if (file.schema) {
        const schemaPath = path.join(phaseDir, file.schema);
        if (await this.fs.exists(schemaPath)) {
          const schemaContent = await this.fs.readFile(schemaPath);
          const schema = JSON.parse(schemaContent);
          const fileContent = await this.fs.readFile(filePath);

          try {
            const data = JSON.parse(fileContent);
            const result = this.schemaValidator.validate(schema, data);
            if (!result.valid) {
              valid = false;
              for (const err of result.errors) {
                errors.push({
                  code: PhaseErrorCodes.SCHEMA_FAILURE,
                  message: err.message,
                  path: filePath + (err.path ? err.path : ''),
                  expected: err.expected,
                  actual: err.actual,
                  action: err.action || 'Fix the schema validation error',
                });
              }
            }
          } catch {
            // JSON parse error
            errors.push({
              code: PhaseErrorCodes.SCHEMA_FAILURE,
              message: `Invalid JSON in file: ${file.name}`,
              path: filePath,
              action: 'Ensure the file contains valid JSON',
            });
            valid = false;
          }
        }
      }

      if (valid) {
        validated.push({
          name: file.name,
          path: filePath,
          valid: true,
        });
      }
    }

    // Load Phase entity if adapter is injected (Phase 6 / DYK-02)
    const result: ValidateResultWithEntity = {
      phase,
      runDir,
      check,
      files: { required, validated },
      errors,
    };
    if (this.phaseAdapter) {
      try {
        result.phaseEntity = await this.phaseAdapter.loadFromPath(phaseDir);
      } catch {
        // Entity loading failure is non-fatal - result is still valid
      }
    }
    return result;
  }

  /**
   * Finalize a phase, extracting output parameters.
   *
   * Per Phase 4 spec - extracts parameters from output JSON files,
   * writes output-params.json, and transitions to 'complete' status.
   *
   * Per DYK Insight #4: No status checks - just do the job every time.
   * Always re-extracts and overwrites (idempotent via same inputs → same outputs).
   *
   * Per Phase 6 / DYK-02: When IPhaseAdapter is injected, includes Phase entity
   * in result reflecting the post-finalize state (complete).
   */
  async finalize(phase: string, runDir: string): Promise<FinalizeResultWithEntity> {
    // 1. Check if phase exists
    const phaseDir = path.join(runDir, 'phases', phase);
    const phaseYamlPath = path.join(phaseDir, 'wf-phase.yaml');

    if (!(await this.fs.exists(phaseYamlPath))) {
      return this.createFinalizeErrorResult(phase, runDir, PhaseErrorCodes.PHASE_NOT_FOUND, {
        message: `Phase not found: ${phase}`,
        path: phaseYamlPath,
        action: 'Verify the phase name exists in the workflow',
      });
    }

    // 2. Parse wf-phase.yaml
    const phaseYamlContent = await this.fs.readFile(phaseYamlPath);
    const phaseDef = this.yamlParser.parse<PhaseDefinition>(phaseYamlContent, phaseYamlPath);

    // 3. Extract output_parameters
    const extractedParams: Record<string, unknown> = {};
    const errors: FinalizeResult['errors'] = [];

    if (phaseDef.output_parameters && phaseDef.output_parameters.length > 0) {
      for (const paramDef of phaseDef.output_parameters) {
        const sourcePath = path.join(runDir, 'phases', phase, 'run', 'outputs', paramDef.source);

        // Check source file exists
        if (!(await this.fs.exists(sourcePath))) {
          errors.push({
            code: PhaseErrorCodes.MISSING_OUTPUT,
            message: `Missing source file for output_parameter '${paramDef.name}': ${paramDef.source}`,
            path: sourcePath,
            action: `Create output file '${paramDef.source}' before finalizing`,
          });
          continue;
        }

        // Read and parse JSON
        const sourceContent = await this.fs.readFile(sourcePath);
        let sourceData: unknown;
        try {
          sourceData = JSON.parse(sourceContent);
        } catch {
          errors.push({
            code: PhaseErrorCodes.SCHEMA_FAILURE,
            message: `Invalid JSON in source file for output_parameter '${paramDef.name}': ${paramDef.source}`,
            path: sourcePath,
            action: `Ensure '${paramDef.source}' contains valid JSON`,
          });
          continue;
        }

        // Extract value using query path
        const value = extractValue(sourceData, paramDef.query);
        // Per DYK Insight #3: undefined → null (not an error)
        extractedParams[paramDef.name] = value === undefined ? null : value;
      }
    }

    // If there were errors, return failure
    if (errors.length > 0) {
      return {
        phase,
        runDir,
        extractedParams,
        phaseStatus: 'complete',
        errors,
      };
    }

    // 4. Write output-params.json
    const outputParamsPath = path.join(
      runDir,
      'phases',
      phase,
      'run',
      'wf-data',
      'output-params.json'
    );
    await this.fs.writeFile(outputParamsPath, JSON.stringify(extractedParams, null, 2));

    // 5. Update wf-phase.json (per DYK Insight #1: dual state file updates)
    const wfPhasePath = path.join(runDir, 'phases', phase, 'run', 'wf-data', 'wf-phase.json');
    let wfPhaseState: WfPhaseState;
    if (await this.fs.exists(wfPhasePath)) {
      const wfPhaseContent = await this.fs.readFile(wfPhasePath);
      wfPhaseState = JSON.parse(wfPhaseContent);
    } else {
      // Initialize if doesn't exist
      wfPhaseState = {
        phase,
        facilitator: 'agent',
        state: 'active',
        status: [],
      };
    }
    wfPhaseState.state = 'complete';
    wfPhaseState.status.push({
      timestamp: new Date().toISOString(),
      from: 'agent',
      action: 'finalize',
    });
    await this.fs.writeFile(wfPhasePath, JSON.stringify(wfPhaseState, null, 2));

    // 6. Update wf-status.json to 'complete'
    const wfStatus = await this.loadWfStatus(runDir);
    wfStatus.phases[phase].status = 'complete';
    await this.saveWfStatus(runDir, wfStatus);

    // 7. Load Phase entity if adapter is injected (Phase 6 / DYK-02)
    const result: FinalizeResultWithEntity = {
      phase,
      runDir,
      extractedParams,
      phaseStatus: 'complete',
      errors: [],
    };
    if (this.phaseAdapter) {
      try {
        result.phaseEntity = await this.phaseAdapter.loadFromPath(phaseDir);
      } catch {
        // Entity loading failure is non-fatal - result is still valid
      }
    }
    return result;
  }

  // ==================== Private Helpers ====================

  private async loadWfStatus(runDir: string): Promise<WfStatus> {
    const statusPath = path.join(runDir, 'wf-run', 'wf-status.json');
    const content = await this.fs.readFile(statusPath);
    return JSON.parse(content);
  }

  private async saveWfStatus(runDir: string, status: WfStatus): Promise<void> {
    const statusPath = path.join(runDir, 'wf-run', 'wf-status.json');
    await this.fs.writeFile(statusPath, JSON.stringify(status, null, 2));
  }

  private isStatusAtOrBeyond(current: PhaseRunStatus, target: PhaseRunStatus): boolean {
    const statusOrder: PhaseRunStatus[] = [
      'pending',
      'ready',
      'active',
      'blocked',
      'accepted',
      'complete',
      'failed',
    ];
    return statusOrder.indexOf(current) >= statusOrder.indexOf(target);
  }

  private getPriorPhases(phaseDef: PhaseDefinition): string[] {
    const priorPhases = new Set<string>();

    if (phaseDef.inputs?.files) {
      for (const file of phaseDef.inputs.files) {
        if (file.from_phase) {
          priorPhases.add(file.from_phase);
        }
      }
    }

    if (phaseDef.inputs?.parameters) {
      for (const param of phaseDef.inputs.parameters) {
        if (param.from_phase) {
          priorPhases.add(param.from_phase);
        }
      }
    }

    return Array.from(priorPhases);
  }

  private getRequiredInputNames(phaseDef: PhaseDefinition): string[] {
    const names: string[] = [];

    if (phaseDef.inputs?.files) {
      for (const file of phaseDef.inputs.files) {
        if (file.required) {
          names.push(file.name);
        }
      }
    }

    return names;
  }

  private async resolveInputs(
    phaseDef: PhaseDefinition,
    runDir: string,
    phase: string
  ): Promise<ResolvedInput[]> {
    const resolved: ResolvedInput[] = [];

    if (phaseDef.inputs?.files) {
      for (const file of phaseDef.inputs.files) {
        const filePath = path.join(runDir, 'phases', phase, 'run', 'inputs', 'files', file.name);
        resolved.push({
          name: file.name,
          path: filePath,
          exists: await this.fs.exists(filePath),
        });
      }
    }

    return resolved;
  }

  private getInputFilesToValidate(
    phaseDef: PhaseDefinition
  ): Array<{ name: string; schema?: string }> {
    const files: Array<{ name: string; schema?: string }> = [];

    if (phaseDef.inputs?.files) {
      for (const file of phaseDef.inputs.files) {
        if (file.required) {
          files.push({ name: file.name });
        }
      }
    }

    return files;
  }

  private getOutputFilesToValidate(
    phaseDef: PhaseDefinition
  ): Array<{ name: string; schema?: string }> {
    const files: Array<{ name: string; schema?: string }> = [];

    if (phaseDef.outputs) {
      for (const output of phaseDef.outputs) {
        if (output.required) {
          files.push({ name: output.name, schema: output.schema });
        }
      }
    }

    return files;
  }

  private createPrepareSuccessResult(
    phase: string,
    runDir: string,
    resolved: ResolvedInput[],
    copiedFromPrior: CopiedFile[]
  ): PrepareResultWithEntity {
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

  private createPrepareErrorResult(
    phase: string,
    runDir: string,
    code: string,
    error: { message: string; path?: string; action?: string }
  ): PrepareResultWithEntity {
    return {
      phase,
      runDir,
      status: 'failed',
      inputs: { required: [], resolved: [] },
      copiedFromPrior: [],
      errors: [{ code, ...error }],
    };
  }

  private createValidateErrorResult(
    phase: string,
    runDir: string,
    check: ValidateCheckMode,
    code: string,
    error: { message: string; path?: string; action?: string }
  ): ValidateResultWithEntity {
    return {
      phase,
      runDir,
      check,
      files: { required: [], validated: [] },
      errors: [{ code, ...error }],
    };
  }

  private createFinalizeErrorResult(
    phase: string,
    runDir: string,
    code: string,
    error: { message: string; path?: string; action?: string }
  ): FinalizeResultWithEntity {
    return {
      phase,
      runDir,
      extractedParams: {},
      phaseStatus: 'complete',
      errors: [{ code, ...error }],
    };
  }

  // ==================== Handover Methods (Phase 3 Subtask 002) ====================

  /**
   * Accept a phase (agent takes control from orchestrator).
   *
   * Per DYK Insight #1: `from` is inferred (always 'agent' for accept).
   * Per DYK Insight #2: Lazy initialization of wf-phase.json if missing.
   * Per DYK Insight #3: Idempotent - returns wasNoOp=true if already agent.
   *
   * Per Phase 6 / DYK-02: When IPhaseAdapter is injected, includes Phase entity
   * in result reflecting the post-accept state.
   */
  async accept(phase: string, runDir: string, options?: AcceptOptions): Promise<AcceptResultWithEntity> {
    const opts = options ?? {};

    // 1. Check phase exists
    const phaseDir = path.join(runDir, 'phases', phase);
    const phaseYamlPath = path.join(phaseDir, 'wf-phase.yaml');

    if (!(await this.fs.exists(phaseYamlPath))) {
      return this.createAcceptErrorResult(phase, runDir, PhaseErrorCodes.PHASE_NOT_FOUND, {
        message: `Phase '${phase}' not found`,
        action: `Check phase name and ensure wf-phase.yaml exists in phases/${phase}/`,
      });
    }

    // 2. Load or create wf-phase.json (lazy init)
    const wfPhasePath = path.join(runDir, 'phases', phase, 'run', 'wf-data', 'wf-phase.json');
    let wfPhaseState: WfPhaseState;

    if (await this.fs.exists(wfPhasePath)) {
      const content = await this.fs.readFile(wfPhasePath);
      wfPhaseState = JSON.parse(content);
    } else {
      // Lazy initialization
      wfPhaseState = {
        phase,
        facilitator: 'orchestrator',
        state: 'ready',
        status: [],
      };
    }

    // 3. Check idempotency - already agent?
    if (wfPhaseState.facilitator === 'agent') {
      const statusEntry: StatusEntry = {
        timestamp: new Date().toISOString(),
        from: 'agent',
        action: 'accept',
        comment: opts.comment,
      };
      return {
        phase,
        runDir,
        facilitator: 'agent',
        state: wfPhaseState.state as AcceptResult['state'],
        statusEntry: statusEntry as SharedStatusEntry,
        wasNoOp: true,
        errors: [],
      };
    }

    // 4. Update state
    wfPhaseState.facilitator = 'agent';
    wfPhaseState.state = 'accepted';

    const statusEntry: StatusEntry = {
      timestamp: new Date().toISOString(),
      from: 'agent',
      action: 'accept',
      comment: opts.comment,
    };
    wfPhaseState.status.push(statusEntry);

    // 5. Write back
    await this.fs.writeFile(wfPhasePath, JSON.stringify(wfPhaseState, null, 2));

    // 6. Load Phase entity if adapter is injected (Phase 6 / DYK-02)
    const result: AcceptResultWithEntity = {
      phase,
      runDir,
      facilitator: 'agent',
      state: 'accepted',
      statusEntry: statusEntry as SharedStatusEntry,
      errors: [],
    };
    if (this.phaseAdapter) {
      try {
        result.phaseEntity = await this.phaseAdapter.loadFromPath(phaseDir);
      } catch {
        // Entity loading failure is non-fatal - result is still valid
      }
    }
    return result;
  }

  /**
   * Preflight check before starting phase work.
   *
   * Per DYK Insight #1: `from` is inferred (always 'agent' for preflight).
   * Per DYK Insight #3: Returns E071 if called before accept.
   * Per DYK Insight #3: Idempotent - returns wasNoOp=true if already preflighted.
   *
   * Per Phase 6 / DYK-02: When IPhaseAdapter is injected, includes Phase entity
   * in result reflecting the post-preflight state.
   */
  async preflight(
    phase: string,
    runDir: string,
    options?: PreflightOptions
  ): Promise<PreflightResultWithEntity> {
    const opts = options ?? {};

    // 1. Check phase exists
    const phaseDir = path.join(runDir, 'phases', phase);
    const phaseYamlPath = path.join(phaseDir, 'wf-phase.yaml');

    if (!(await this.fs.exists(phaseYamlPath))) {
      return this.createPreflightErrorResult(phase, runDir, PhaseErrorCodes.PHASE_NOT_FOUND, {
        message: `Phase '${phase}' not found`,
        action: `Check phase name and ensure wf-phase.yaml exists in phases/${phase}/`,
      });
    }

    // 2. Load wf-phase.json (must exist since accept creates it)
    const wfPhasePath = path.join(runDir, 'phases', phase, 'run', 'wf-data', 'wf-phase.json');
    let wfPhaseState: WfPhaseState;

    if (await this.fs.exists(wfPhasePath)) {
      const content = await this.fs.readFile(wfPhasePath);
      wfPhaseState = JSON.parse(content);
    } else {
      // If no wf-phase.json, agent hasn't accepted yet
      return this.createPreflightErrorResult(
        phase,
        runDir,
        PhaseErrorCodes.INVALID_STATE_TRANSITION,
        {
          message: 'Cannot preflight: agent must accept phase first',
          action: 'Run `cg phase accept` before preflight',
        }
      );
    }

    // 3. Check facilitator is agent (E071 if orchestrator)
    if (wfPhaseState.facilitator !== 'agent') {
      return this.createPreflightErrorResult(
        phase,
        runDir,
        PhaseErrorCodes.INVALID_STATE_TRANSITION,
        {
          message: 'Cannot preflight: facilitator must be agent',
          action: 'Run `cg phase accept` before preflight',
        }
      );
    }

    // 4. Check idempotency - already preflighted?
    const alreadyPreflighted = wfPhaseState.status.some((s) => s.action === 'preflight');
    if (alreadyPreflighted) {
      const statusEntry: StatusEntry = {
        timestamp: new Date().toISOString(),
        from: 'agent',
        action: 'preflight',
        comment: opts.comment,
      };
      return {
        phase,
        runDir,
        checks: { configValid: true, inputsExist: true, schemasValid: true },
        statusEntry: statusEntry as SharedStatusEntry,
        wasNoOp: true,
        errors: [],
      };
    }

    // 5. Run validation on inputs (wraps validate --check inputs)
    const validateResult = await this.validate(phase, runDir, 'inputs');
    const inputsValid = validateResult.errors.length === 0;

    // 6. Append preflight status entry
    const statusEntry: StatusEntry = {
      timestamp: new Date().toISOString(),
      from: 'agent',
      action: 'preflight',
      comment: opts.comment,
      data: {
        checks: {
          configValid: true, // We passed if we got here
          inputsExist: inputsValid,
          schemasValid: inputsValid,
        },
      },
    };
    wfPhaseState.status.push(statusEntry);

    // 7. Write back
    await this.fs.writeFile(wfPhasePath, JSON.stringify(wfPhaseState, null, 2));

    // 8. Return result (include validation errors if any)
    // 9. Load Phase entity if adapter is injected (Phase 6 / DYK-02)
    const result: PreflightResultWithEntity = {
      phase,
      runDir,
      checks: {
        configValid: true,
        inputsExist: inputsValid,
        schemasValid: inputsValid,
      },
      statusEntry: statusEntry as SharedStatusEntry,
      errors:
        validateResult.errors.length > 0
          ? [
              {
                code: PhaseErrorCodes.PREFLIGHT_FAILED,
                message: 'Preflight validation failed',
                action: 'Check input files and schemas',
              },
              ...validateResult.errors,
            ]
          : [],
    };
    if (this.phaseAdapter) {
      try {
        result.phaseEntity = await this.phaseAdapter.loadFromPath(phaseDir);
      } catch {
        // Entity loading failure is non-fatal - result is still valid
      }
    }
    return result;
  }

  /**
   * Handover phase control to the other party.
   *
   * Per DYK Insight #1: `from` is inferred from current facilitator.
   * Per DYK Insight #3: Idempotent - returns wasNoOp=true if already target.
   *
   * Per Phase 6 / DYK-02: When IPhaseAdapter is injected, includes Phase entity
   * in result reflecting the post-handover state.
   */
  async handover(
    phase: string,
    runDir: string,
    options?: HandoverOptions
  ): Promise<HandoverResultWithEntity> {
    const opts = options ?? {};

    // 1. Check phase exists
    const phaseDir = path.join(runDir, 'phases', phase);
    const phaseYamlPath = path.join(phaseDir, 'wf-phase.yaml');

    if (!(await this.fs.exists(phaseYamlPath))) {
      return this.createHandoverErrorResult(phase, runDir, PhaseErrorCodes.PHASE_NOT_FOUND, {
        message: `Phase '${phase}' not found`,
        action: `Check phase name and ensure wf-phase.yaml exists in phases/${phase}/`,
      });
    }

    // 2. Load or create wf-phase.json (lazy init similar to accept)
    const wfPhasePath = path.join(runDir, 'phases', phase, 'run', 'wf-data', 'wf-phase.json');
    let wfPhaseState: WfPhaseState;

    if (await this.fs.exists(wfPhasePath)) {
      const content = await this.fs.readFile(wfPhasePath);
      wfPhaseState = JSON.parse(content);
    } else {
      // Initialize with orchestrator as facilitator
      wfPhaseState = {
        phase,
        facilitator: 'orchestrator',
        state: 'ready',
        status: [],
      };
    }

    // 3. Determine from/to facilitators
    const fromFacilitator = wfPhaseState.facilitator;
    const toFacilitator = fromFacilitator === 'agent' ? 'orchestrator' : 'agent';

    // 4. Check idempotency - would this be a no-op?
    // If we're orchestrator trying to hand to agent but facilitator is already agent (or vice versa)
    // This happens when the handover has already been done
    if (wfPhaseState.facilitator === toFacilitator) {
      const statusEntry: StatusEntry = {
        timestamp: new Date().toISOString(),
        from: fromFacilitator,
        action: 'handover',
        comment: opts.reason,
      };
      return {
        phase,
        runDir,
        fromFacilitator,
        toFacilitator,
        state: wfPhaseState.state as HandoverResult['state'],
        statusEntry: statusEntry as SharedStatusEntry,
        wasNoOp: true,
        errors: [],
      };
    }

    // 5. Update state
    wfPhaseState.facilitator = toFacilitator;
    if (opts.dueToError) {
      wfPhaseState.state = 'blocked';
    }

    // 6. Append handover status entry
    const statusEntry: StatusEntry = {
      timestamp: new Date().toISOString(),
      from: fromFacilitator,
      action: 'handover',
      comment: opts.reason,
    };
    wfPhaseState.status.push(statusEntry);

    // 7. Write back
    await this.fs.writeFile(wfPhasePath, JSON.stringify(wfPhaseState, null, 2));

    // 8. Load Phase entity if adapter is injected (Phase 6 / DYK-02)
    const result: HandoverResultWithEntity = {
      phase,
      runDir,
      fromFacilitator,
      toFacilitator,
      state: wfPhaseState.state as HandoverResult['state'],
      statusEntry: statusEntry as SharedStatusEntry,
      errors: [],
    };
    if (this.phaseAdapter) {
      try {
        result.phaseEntity = await this.phaseAdapter.loadFromPath(phaseDir);
      } catch {
        // Entity loading failure is non-fatal - result is still valid
      }
    }
    return result;
  }

  private createAcceptErrorResult(
    phase: string,
    runDir: string,
    code: string,
    error: { message: string; path?: string; action?: string }
  ): AcceptResultWithEntity {
    const statusEntry: StatusEntry = {
      timestamp: new Date().toISOString(),
      from: 'agent',
      action: 'accept',
    };
    return {
      phase,
      runDir,
      facilitator: 'orchestrator',
      state: 'ready',
      statusEntry: statusEntry as SharedStatusEntry,
      errors: [{ code, ...error }],
    };
  }

  private createPreflightErrorResult(
    phase: string,
    runDir: string,
    code: string,
    error: { message: string; path?: string; action?: string }
  ): PreflightResultWithEntity {
    const statusEntry: StatusEntry = {
      timestamp: new Date().toISOString(),
      from: 'agent',
      action: 'preflight',
    };
    return {
      phase,
      runDir,
      checks: { configValid: false, inputsExist: false, schemasValid: false },
      statusEntry: statusEntry as SharedStatusEntry,
      errors: [{ code, ...error }],
    };
  }

  private createHandoverErrorResult(
    phase: string,
    runDir: string,
    code: string,
    error: { message: string; path?: string; action?: string }
  ): HandoverResultWithEntity {
    const statusEntry: StatusEntry = {
      timestamp: new Date().toISOString(),
      from: 'orchestrator',
      action: 'handover',
    };
    return {
      phase,
      runDir,
      fromFacilitator: 'orchestrator',
      toFacilitator: 'agent',
      state: 'ready',
      statusEntry: statusEntry as SharedStatusEntry,
      errors: [{ code, ...error }],
    };
  }
}
