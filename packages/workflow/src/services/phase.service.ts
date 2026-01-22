/**
 * PhaseService implementation for managing phase lifecycle operations.
 *
 * Per Phase 3: Phase Operations - Provides the prepare() and validate() methods
 * that enable orchestrators and agents to manage phase execution.
 */

import * as path from 'node:path';
import type {
  CopiedFile,
  IFileSystem,
  PrepareResult,
  ResolvedInput,
  ValidateResult,
  ValidatedFile,
} from '@chainglass/shared';
import type {
  IPhaseService,
  ISchemaValidator,
  IYamlParser,
  ValidateCheckMode,
} from '../interfaces/index.js';
import type { PhaseRunStatus, WfStatus } from '../types/index.js';

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
 */
export class PhaseService implements IPhaseService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly yamlParser: IYamlParser,
    private readonly schemaValidator: ISchemaValidator
  ) {}

  /**
   * Prepare a phase for execution.
   *
   * Per Phase 3 spec - validates inputs, copies from_phase files,
   * resolves parameters, and transitions to 'ready' status.
   */
  async prepare(phase: string, runDir: string): Promise<PrepareResult> {
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

    return this.createPrepareSuccessResult(phase, runDir, resolvedInputs, copiedFromPrior);
  }

  /**
   * Validate phase inputs or outputs.
   *
   * Per Phase 3 spec - checks files exist, are non-empty (outputs),
   * and conform to declared schemas.
   */
  async validate(phase: string, runDir: string, check: ValidateCheckMode): Promise<ValidateResult> {
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

    return {
      phase,
      runDir,
      check,
      files: { required, validated },
      errors,
    };
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

  private createPrepareErrorResult(
    phase: string,
    runDir: string,
    code: string,
    error: { message: string; path?: string; action?: string }
  ): PrepareResult {
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
  ): ValidateResult {
    return {
      phase,
      runDir,
      check,
      files: { required: [], validated: [] },
      errors: [{ code, ...error }],
    };
  }
}
