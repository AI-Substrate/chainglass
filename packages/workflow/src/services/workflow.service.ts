/**
 * WorkflowService implementation for managing workflow compositions.
 *
 * Per Phase 2: Compose Command - Provides the compose() method that creates
 * a new workflow run from a template.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type {
  CheckpointInfo,
  ComposeResult,
  IFileSystem,
  IPathResolver,
  PhaseInfo,
} from '@chainglass/shared';
import type {
  ComposeOptions,
  ISchemaValidator,
  IWorkflowRegistry,
  IYamlParser,
} from '../interfaces/index.js';
import type { IWorkflowAdapter } from '../interfaces/workflow-adapter.interface.js';
import type { ComposeResultWithEntity } from './workflow-service.types.js';
import type { IWorkflowService } from '../interfaces/workflow-service.interface.js';
import { YamlParseError } from '../interfaces/yaml-parser.interface.js';
import { MESSAGE_SCHEMA, WF_PHASE_SCHEMA, WF_SCHEMA, WF_STATUS_SCHEMA } from '../schemas/index.js';
import type { WfDefinition, WfStatus } from '../types/index.js';

/**
 * Error codes for compose operation.
 */
export const ComposeErrorCodes = {
  /** Template not found at any search location */
  TEMPLATE_NOT_FOUND: 'E020',
  /** YAML parse error in wf.yaml */
  YAML_PARSE_ERROR: 'E021',
  /** Schema validation failure for wf.yaml */
  SCHEMA_VALIDATION_ERROR: 'E022',
  /** Requested checkpoint version not found (Phase 3) */
  VERSION_NOT_FOUND: 'E033',
  /** No checkpoints exist for workflow (Phase 3) */
  NO_CHECKPOINT: 'E034',
} as const;

/**
 * WorkflowService implements workflow composition.
 *
 * Depends on:
 * - IFileSystem: File operations (read, write, copy, mkdir)
 * - IYamlParser: Parse wf.yaml
 * - ISchemaValidator: Validate wf.yaml against schema
 * - IPathResolver: Secure path resolution
 * - IWorkflowRegistry: Workflow registry for checkpoint resolution (Phase 3, DYK-01)
 * - IWorkflowAdapter: (Optional) Entity adapter for loading Workflow entities (Phase 6, DYK-02)
 */
export class WorkflowService implements IWorkflowService {
  /** Default workflows directory */
  private static readonly WORKFLOWS_DIR = '.chainglass/workflows';

  constructor(
    private readonly fs: IFileSystem,
    private readonly yamlParser: IYamlParser,
    private readonly schemaValidator: ISchemaValidator,
    private readonly pathResolver: IPathResolver,
    private readonly registry: IWorkflowRegistry,
    private readonly workflowAdapter?: IWorkflowAdapter
  ) {}

  /**
   * Create a new workflow run from a template.
   *
   * Per Phase 3: Requires checkpoint for slug-based templates.
   * Resolves checkpoint by ordinal (v001) or full version (v001-abc12345).
   * Creates runs under versioned paths: <runsDir>/<slug>/<version>/run-YYYY-MM-DD-NNN/
   *
   * @param template - Template slug (name) or path to template directory
   * @param runsDir - Directory where run folders are created
   * @param options - Compose options (Phase 3: checkpoint selection)
   * @returns ComposeResult with runDir, template name, phases array, and errors
   */
  async compose(
    template: string,
    runsDir: string,
    options?: ComposeOptions
  ): Promise<ComposeResultWithEntity> {
    const errors: ComposeResult['errors'] = [];

    // 1. Expand tilde in template path (DYK-02)
    const expandedTemplate = this.expandTilde(template);

    // Phase 3: Check if template is a slug (workflow registry) or path
    if (!this.isPath(expandedTemplate)) {
      // Workflow registry path - requires checkpoint (Phase 3)
      return this.composeFromRegistry(expandedTemplate, runsDir, options);
    }

    // Legacy path-based template (no checkpoint required)
    // 2. Resolve template path
    const templatePath = await this.resolveTemplatePath(expandedTemplate);
    if (!templatePath) {
      return this.createErrorResult(ComposeErrorCodes.TEMPLATE_NOT_FOUND, {
        message: `Template not found: ${template}`,
        path: template,
        action: this.isPath(expandedTemplate)
          ? `Verify the template directory exists at: ${expandedTemplate}`
          : `Create template at .chainglass/templates/${template}/ or ~/.config/chainglass/templates/${template}/`,
      });
    }

    // 3. Read and parse wf.yaml
    const wfYamlPath = path.join(templatePath, 'wf.yaml');
    let wfYamlContent: string;
    try {
      wfYamlContent = await this.fs.readFile(wfYamlPath);
    } catch {
      return this.createErrorResult(ComposeErrorCodes.TEMPLATE_NOT_FOUND, {
        message: `Template wf.yaml not found: ${wfYamlPath}`,
        path: wfYamlPath,
        action: 'Ensure the template directory contains a wf.yaml file',
      });
    }

    // 4. Parse YAML
    let wfDefinition: WfDefinition;
    try {
      wfDefinition = this.yamlParser.parse<WfDefinition>(wfYamlContent, wfYamlPath);
    } catch (err) {
      if (err instanceof YamlParseError) {
        return this.createErrorResult(ComposeErrorCodes.YAML_PARSE_ERROR, {
          message: `YAML parse error at ${err.filePath}:${err.line}:${err.column}: ${err.message}`,
          path: err.filePath,
          action: `Fix the YAML syntax error at line ${err.line}, column ${err.column}`,
        });
      }
      throw err;
    }

    // 5. Validate against schema
    const validationResult = this.schemaValidator.validate(WF_SCHEMA, wfDefinition);
    if (!validationResult.valid) {
      const firstError = validationResult.errors[0];
      return this.createErrorResult(ComposeErrorCodes.SCHEMA_VALIDATION_ERROR, {
        message: `Schema validation failed: ${firstError?.message || 'Unknown error'}`,
        path: firstError?.path || wfYamlPath,
        expected: firstError?.expected,
        actual: firstError?.actual,
        action: firstError?.action || 'Fix the schema validation errors in wf.yaml',
      });
    }

    // 6. Generate run folder name (legacy flat path)
    const today = new Date().toISOString().split('T')[0];
    const ordinal = await this.getNextRunOrdinal(runsDir, today);
    const runId = `run-${today}-${ordinal.toString().padStart(3, '0')}`;
    const runDir = path.join(runsDir, runId);

    // 7. Create run folder structure
    await this.fs.mkdir(runDir, { recursive: true });

    // 8. Copy wf.yaml to run folder
    await this.fs.writeFile(path.join(runDir, 'wf.yaml'), wfYamlContent);

    // 9. Create wf-run directory and wf-status.json
    const wfRunDir = path.join(runDir, 'wf-run');
    await this.fs.mkdir(wfRunDir, { recursive: true });

    // 10. Sort phases by order
    const sortedPhases = Object.entries(wfDefinition.phases)
      .map(([name, def]) => ({ name, ...def }))
      .sort((a, b) => a.order - b.order);

    // 11. Create wf-status.json
    const wfStatus: WfStatus = {
      workflow: {
        name: wfDefinition.name,
        version: wfDefinition.version,
        template_path: templatePath,
      },
      run: {
        id: runId,
        created_at: new Date().toISOString(),
        status: 'pending',
      },
      phases: Object.fromEntries(
        sortedPhases.map((phase) => [
          phase.name,
          { order: phase.order, status: 'pending' as const },
        ])
      ),
    };
    await this.fs.writeFile(
      path.join(wfRunDir, 'wf-status.json'),
      JSON.stringify(wfStatus, null, 2)
    );

    // 12. Create phase folders
    const phasesDir = path.join(runDir, 'phases');
    await this.fs.mkdir(phasesDir, { recursive: true });

    for (const phase of sortedPhases) {
      const phaseDir = path.join(phasesDir, phase.name);
      await this.fs.mkdir(phaseDir, { recursive: true });

      // 12a. Create wf-phase.yaml for this phase
      const phaseDefinition = {
        phase: phase.name,
        description: phase.description,
        order: phase.order,
        inputs: phase.inputs || {},
        outputs: phase.outputs,
        output_parameters: phase.output_parameters || [],
      };
      const phaseYaml = this.yamlParser.stringify(phaseDefinition);
      await this.fs.writeFile(path.join(phaseDir, 'wf-phase.yaml'), phaseYaml);

      // 12b. Create schemas directory and copy core schemas
      const schemasDir = path.join(phaseDir, 'schemas');
      await this.fs.mkdir(schemasDir, { recursive: true });

      // Copy core schemas from embedded modules
      await this.fs.writeFile(
        path.join(schemasDir, 'wf.schema.json'),
        JSON.stringify(WF_SCHEMA, null, 2)
      );
      await this.fs.writeFile(
        path.join(schemasDir, 'wf-phase.schema.json'),
        JSON.stringify(WF_PHASE_SCHEMA, null, 2)
      );
      await this.fs.writeFile(
        path.join(schemasDir, 'message.schema.json'),
        JSON.stringify(MESSAGE_SCHEMA, null, 2)
      );
      await this.fs.writeFile(
        path.join(schemasDir, 'wf-status.schema.json'),
        JSON.stringify(WF_STATUS_SCHEMA, null, 2)
      );

      // 12c. Copy template schemas to phase
      const templateSchemasDir = path.join(templatePath, 'schemas');
      if (await this.fs.exists(templateSchemasDir)) {
        try {
          const schemaFiles = await this.fs.readDir(templateSchemasDir);
          for (const schemaFile of schemaFiles) {
            if (schemaFile.endsWith('.json')) {
              const src = path.join(templateSchemasDir, schemaFile);
              const dest = path.join(schemasDir, schemaFile);
              await this.fs.copyFile(src, dest);
            }
          }
        } catch {
          // Schemas directory may not exist, that's OK
        }
      }

      // 12d. Create commands directory and copy commands
      const commandsDir = path.join(phaseDir, 'commands');
      await this.fs.mkdir(commandsDir, { recursive: true });

      // Copy main.md from template phase
      const templatePhaseMainMd = path.join(
        templatePath,
        'phases',
        phase.name,
        'commands',
        'main.md'
      );
      if (await this.fs.exists(templatePhaseMainMd)) {
        await this.fs.copyFile(templatePhaseMainMd, path.join(commandsDir, 'main.md'));
      } else {
        // Create a default main.md if not present
        await this.fs.writeFile(
          path.join(commandsDir, 'main.md'),
          `# ${phase.name} Phase\n\n${phase.description}\n`
        );
      }

      // Copy wf.md from template root (agent execution instructions)
      // Note: templates/wf.md is the workflow overview (renamed to README.md)
      const rootWfMd = path.join(templatePath, 'wf.md');
      if (await this.fs.exists(rootWfMd)) {
        await this.fs.copyFile(rootWfMd, path.join(commandsDir, 'wf.md'));
      }

      // 12e. Create run subdirectories
      const runSubDir = path.join(phaseDir, 'run');
      await this.fs.mkdir(runSubDir, { recursive: true });
      await this.fs.mkdir(path.join(runSubDir, 'inputs', 'files'), { recursive: true });
      await this.fs.mkdir(path.join(runSubDir, 'inputs', 'data'), { recursive: true });
      await this.fs.mkdir(path.join(runSubDir, 'outputs'), { recursive: true });
      await this.fs.mkdir(path.join(runSubDir, 'wf-data'), { recursive: true });
      await this.fs.mkdir(path.join(runSubDir, 'messages'), { recursive: true });
    }

    // 12f. Copy root-level agent files (cg.sh, AGENT-START.md)
    const rootFilesToCopy = ['cg.sh', 'AGENT-START.md'];
    for (const filename of rootFilesToCopy) {
      const src = path.join(templatePath, filename);
      if (await this.fs.exists(src)) {
        const dest = path.join(runDir, filename);
        await this.fs.copyFile(src, dest);
      }
    }

    // 13. Build result
    const phases: PhaseInfo[] = sortedPhases.map((phase) => ({
      name: phase.name,
      order: phase.order,
      status: 'pending' as const,
    }));

    const result: ComposeResultWithEntity = {
      runDir,
      template: wfDefinition.name,
      phases,
      errors: [],
    };

    // 14. Load Workflow entity if adapter is injected (Phase 6 / DYK-02)
    if (this.workflowAdapter) {
      try {
        result.workflowEntity = await this.workflowAdapter.loadRun(runDir);
      } catch {
        // Entity loading failure is non-fatal - result is still valid
      }
    }

    return result;
  }

  /**
   * Compose from workflow registry (Phase 3).
   *
   * Resolves checkpoint and creates run under versioned path.
   * Per DYK-01: Uses IWorkflowRegistry for checkpoint resolution.
   * Per DYK-02: Prefix matching with ambiguity guard.
   * Per DYK-03: Ordinal scoped to version folder.
   */
  private async composeFromRegistry(
    slug: string,
    runsDir: string,
    options?: ComposeOptions
  ): Promise<ComposeResultWithEntity> {
    const workflowsDir = WorkflowService.WORKFLOWS_DIR;

    // 1. Get versions from registry
    const versionsResult = await this.registry.versions(workflowsDir, slug);
    if (versionsResult.errors.length > 0) {
      return this.createErrorResult(versionsResult.errors[0].code, {
        message: versionsResult.errors[0].message,
        action: versionsResult.errors[0].action,
      });
    }

    // 2. Check if any checkpoints exist (T011: E034 handling)
    if (versionsResult.versions.length === 0) {
      return this.createErrorResult(ComposeErrorCodes.NO_CHECKPOINT, {
        message: `Workflow '${slug}' has no checkpoints. Cannot compose without a checkpoint.`,
        action: `Create a checkpoint first with 'cg workflow checkpoint ${slug}'`,
      });
    }

    // 3. Resolve checkpoint version (T008)
    const resolvedCheckpoint = this.resolveCheckpoint(
      versionsResult.versions,
      options?.checkpoint,
      slug
    );
    if ('error' in resolvedCheckpoint) {
      return resolvedCheckpoint.error;
    }

    const checkpoint = resolvedCheckpoint.checkpoint;
    const checkpointDir = this.pathResolver.join(
      workflowsDir,
      slug,
      'checkpoints',
      checkpoint.version
    );

    // 4. Read wf.yaml from checkpoint
    const wfYamlPath = this.pathResolver.join(checkpointDir, 'wf.yaml');
    let wfYamlContent: string;
    try {
      wfYamlContent = await this.fs.readFile(wfYamlPath);
    } catch {
      return this.createErrorResult(ComposeErrorCodes.TEMPLATE_NOT_FOUND, {
        message: `Template wf.yaml not found: ${wfYamlPath}`,
        path: wfYamlPath,
        action: 'Ensure the checkpoint contains a wf.yaml file',
      });
    }

    // 5. Parse YAML
    let wfDefinition: WfDefinition;
    try {
      wfDefinition = this.yamlParser.parse<WfDefinition>(wfYamlContent, wfYamlPath);
    } catch (err) {
      if (err instanceof YamlParseError) {
        return this.createErrorResult(ComposeErrorCodes.YAML_PARSE_ERROR, {
          message: `YAML parse error at ${err.filePath}:${err.line}:${err.column}: ${err.message}`,
          path: err.filePath,
          action: `Fix the YAML syntax error at line ${err.line}, column ${err.column}`,
        });
      }
      throw err;
    }

    // 6. Validate against schema
    const validationResult = this.schemaValidator.validate(WF_SCHEMA, wfDefinition);
    if (!validationResult.valid) {
      const firstError = validationResult.errors[0];
      return this.createErrorResult(ComposeErrorCodes.SCHEMA_VALIDATION_ERROR, {
        message: `Schema validation failed: ${firstError?.message || 'Unknown error'}`,
        path: firstError?.path || wfYamlPath,
        expected: firstError?.expected,
        actual: firstError?.actual,
        action: firstError?.action || 'Fix the schema validation errors in wf.yaml',
      });
    }

    // 7. Generate versioned run path (T009 - DYK-03: ordinal scoped to version folder)
    const today = new Date().toISOString().split('T')[0];
    const versionRunDir = this.pathResolver.join(runsDir, slug, checkpoint.version);
    const ordinal = await this.getNextRunOrdinal(versionRunDir, today);
    const runId = `run-${today}-${ordinal.toString().padStart(3, '0')}`;
    const runDir = this.pathResolver.join(versionRunDir, runId);

    // 8. Create run folder structure
    await this.fs.mkdir(runDir, { recursive: true });

    // 9. Copy wf.yaml to run folder
    await this.fs.writeFile(this.pathResolver.join(runDir, 'wf.yaml'), wfYamlContent);

    // 10. Create wf-run directory and wf-status.json (T010: extended fields)
    const wfRunDir = this.pathResolver.join(runDir, 'wf-run');
    await this.fs.mkdir(wfRunDir, { recursive: true });

    // Sort phases by order
    const sortedPhases = Object.entries(wfDefinition.phases)
      .map(([name, def]) => ({ name, ...def }))
      .sort((a, b) => a.order - b.order);

    // Create wf-status.json with Phase 3 extended fields (DYK-04, DYK-05)
    const wfStatus: WfStatus = {
      workflow: {
        name: wfDefinition.name,
        version: wfDefinition.version,
        template_path: checkpointDir, // Points to checkpoint, not current/
        slug,
        version_hash: checkpoint.hash,
        ...(checkpoint.comment ? { checkpoint_comment: checkpoint.comment } : {}),
      },
      run: {
        id: runId,
        created_at: new Date().toISOString(),
        status: 'pending',
      },
      phases: Object.fromEntries(
        sortedPhases.map((phase) => [
          phase.name,
          { order: phase.order, status: 'pending' as const },
        ])
      ),
    };
    await this.fs.writeFile(
      this.pathResolver.join(wfRunDir, 'wf-status.json'),
      JSON.stringify(wfStatus, null, 2)
    );

    // 11. Create phase folders
    const phasesDir = this.pathResolver.join(runDir, 'phases');
    await this.fs.mkdir(phasesDir, { recursive: true });

    for (const phase of sortedPhases) {
      const phaseDir = this.pathResolver.join(phasesDir, phase.name);
      await this.fs.mkdir(phaseDir, { recursive: true });

      // Create wf-phase.yaml for this phase
      const phaseDefinition = {
        phase: phase.name,
        description: phase.description,
        order: phase.order,
        inputs: phase.inputs || {},
        outputs: phase.outputs,
        output_parameters: phase.output_parameters || [],
      };
      const phaseYaml = this.yamlParser.stringify(phaseDefinition);
      await this.fs.writeFile(this.pathResolver.join(phaseDir, 'wf-phase.yaml'), phaseYaml);

      // Create schemas directory and copy core schemas
      const schemasDir = this.pathResolver.join(phaseDir, 'schemas');
      await this.fs.mkdir(schemasDir, { recursive: true });

      await this.fs.writeFile(
        this.pathResolver.join(schemasDir, 'wf.schema.json'),
        JSON.stringify(WF_SCHEMA, null, 2)
      );
      await this.fs.writeFile(
        this.pathResolver.join(schemasDir, 'wf-phase.schema.json'),
        JSON.stringify(WF_PHASE_SCHEMA, null, 2)
      );
      await this.fs.writeFile(
        this.pathResolver.join(schemasDir, 'message.schema.json'),
        JSON.stringify(MESSAGE_SCHEMA, null, 2)
      );
      await this.fs.writeFile(
        this.pathResolver.join(schemasDir, 'wf-status.schema.json'),
        JSON.stringify(WF_STATUS_SCHEMA, null, 2)
      );

      // Copy template schemas from checkpoint if they exist
      const templateSchemasDir = this.pathResolver.join(checkpointDir, 'schemas');
      if (await this.fs.exists(templateSchemasDir)) {
        try {
          const schemaFiles = await this.fs.readDir(templateSchemasDir);
          for (const schemaFile of schemaFiles) {
            if (schemaFile.endsWith('.json')) {
              const src = this.pathResolver.join(templateSchemasDir, schemaFile);
              const dest = this.pathResolver.join(schemasDir, schemaFile);
              await this.fs.copyFile(src, dest);
            }
          }
        } catch {
          // Schemas directory may not exist, that's OK
        }
      }

      // Create commands directory and copy commands
      const commandsDir = this.pathResolver.join(phaseDir, 'commands');
      await this.fs.mkdir(commandsDir, { recursive: true });

      // Copy main.md from template phase
      const templatePhaseMainMd = this.pathResolver.join(
        checkpointDir,
        'phases',
        phase.name,
        'commands',
        'main.md'
      );
      if (await this.fs.exists(templatePhaseMainMd)) {
        await this.fs.copyFile(templatePhaseMainMd, this.pathResolver.join(commandsDir, 'main.md'));
      } else {
        // Create a default main.md if not present
        await this.fs.writeFile(
          this.pathResolver.join(commandsDir, 'main.md'),
          `# ${phase.name} Phase\n\n${phase.description}\n`
        );
      }

      // Copy wf.md from template root (agent execution instructions)
      const rootWfMd = this.pathResolver.join(checkpointDir, 'wf.md');
      if (await this.fs.exists(rootWfMd)) {
        await this.fs.copyFile(rootWfMd, this.pathResolver.join(commandsDir, 'wf.md'));
      }

      // Create run subdirectories
      const runSubDir = this.pathResolver.join(phaseDir, 'run');
      await this.fs.mkdir(runSubDir, { recursive: true });
      await this.fs.mkdir(this.pathResolver.join(runSubDir, 'inputs', 'files'), {
        recursive: true,
      });
      await this.fs.mkdir(this.pathResolver.join(runSubDir, 'inputs', 'data'), { recursive: true });
      await this.fs.mkdir(this.pathResolver.join(runSubDir, 'outputs'), { recursive: true });
      await this.fs.mkdir(this.pathResolver.join(runSubDir, 'wf-data'), { recursive: true });
      await this.fs.mkdir(this.pathResolver.join(runSubDir, 'messages'), { recursive: true });
    }

    // 12. Copy root-level agent files (cg.sh, AGENT-START.md)
    const rootFilesToCopy = ['cg.sh', 'AGENT-START.md'];
    for (const filename of rootFilesToCopy) {
      const src = this.pathResolver.join(checkpointDir, filename);
      if (await this.fs.exists(src)) {
        const dest = this.pathResolver.join(runDir, filename);
        await this.fs.copyFile(src, dest);
      }
    }

    // 13. Build result
    const phases: PhaseInfo[] = sortedPhases.map((phase) => ({
      name: phase.name,
      order: phase.order,
      status: 'pending' as const,
    }));

    const result: ComposeResultWithEntity = {
      runDir,
      template: wfDefinition.name,
      phases,
      errors: [],
    };

    // 14. Load Workflow entity if adapter is injected (Phase 6 / DYK-02)
    if (this.workflowAdapter) {
      try {
        result.workflowEntity = await this.workflowAdapter.loadRun(runDir);
      } catch {
        // Entity loading failure is non-fatal - result is still valid
      }
    }

    return result;
  }

  /**
   * Resolve checkpoint from version string.
   *
   * Per DYK-02: Prefix matching with ambiguity guard.
   * - 'v001' matches 'v001-*' (prefix match)
   * - 'v001-abc12345' matches exactly
   * - undefined uses latest checkpoint
   *
   * @param versions - Available checkpoint versions (sorted descending)
   * @param checkpointSpec - Version spec (ordinal or full) or undefined for latest
   * @param slug - Workflow slug (for error messages)
   * @returns Resolved checkpoint or error result
   */
  private resolveCheckpoint(
    versions: CheckpointInfo[],
    checkpointSpec: string | undefined,
    slug: string
  ): { checkpoint: CheckpointInfo } | { error: ComposeResult } {
    // No version specified - use latest
    if (!checkpointSpec) {
      return { checkpoint: versions[0] };
    }

    // Check for ordinal-only format (v###)
    const ordinalMatch = checkpointSpec.match(/^v(\d{3})$/);
    if (ordinalMatch) {
      // Prefix match - find all that start with this ordinal
      const matches = versions.filter((v) => v.version.startsWith(checkpointSpec));

      if (matches.length === 0) {
        const available = versions.map((v) => v.version).join(', ');
        return {
          error: this.createErrorResult(ComposeErrorCodes.VERSION_NOT_FOUND, {
            message: `Checkpoint version not found: ${checkpointSpec}. Available: ${available}`,
            action: `Use 'cg workflow versions ${slug}' to see available versions`,
          }),
        };
      }

      // DYK-02: Ambiguity guard - if multiple match, error
      if (matches.length > 1) {
        const matchList = matches.map((v) => v.version).join(', ');
        return {
          error: this.createErrorResult(ComposeErrorCodes.VERSION_NOT_FOUND, {
            message: `Checkpoint version '${checkpointSpec}' is ambiguous. Matches: ${matchList}`,
            action: `Specify the full version, e.g., --checkpoint ${matches[0].version}`,
          }),
        };
      }

      return { checkpoint: matches[0] };
    }

    // Full version match (v###-hash)
    const exactMatch = versions.find((v) => v.version === checkpointSpec);
    if (!exactMatch) {
      const available = versions.map((v) => v.version).join(', ');
      return {
        error: this.createErrorResult(ComposeErrorCodes.VERSION_NOT_FOUND, {
          message: `Checkpoint version not found: ${checkpointSpec}. Available: ${available}`,
          action: `Use 'cg workflow versions ${slug}' to see available versions`,
        }),
      };
    }

    return { checkpoint: exactMatch };
  }

  /**
   * Expand tilde (~) to home directory.
   * Per DYK-02: Node.js path module does NOT expand tilde.
   */
  private expandTilde(inputPath: string): string {
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1));
    }
    return inputPath;
  }

  /**
   * Check if the input is a path (vs a template name).
   * Per DYK-02: Contains /, starts with ., or is absolute.
   */
  private isPath(input: string): boolean {
    return input.includes('/') || input.startsWith('.') || path.isAbsolute(input);
  }

  /**
   * Resolve template path from name or path.
   *
   * @param template - Template name or path (tilde already expanded)
   * @returns Resolved absolute path to template, or null if not found
   */
  private async resolveTemplatePath(template: string): Promise<string | null> {
    // If it looks like a path, use it directly
    if (this.isPath(template)) {
      const wfYamlPath = path.join(template, 'wf.yaml');
      if (await this.fs.exists(wfYamlPath)) {
        return template;
      }
      return null;
    }

    // Search order for template names:
    // 1. .chainglass/templates/<name>/
    // 2. ~/.config/chainglass/templates/<name>/
    const searchPaths = [
      path.join('.chainglass', 'templates', template),
      path.join(os.homedir(), '.config', 'chainglass', 'templates', template),
    ];

    for (const searchPath of searchPaths) {
      const wfYamlPath = path.join(searchPath, 'wf.yaml');
      if (await this.fs.exists(wfYamlPath)) {
        return searchPath;
      }
    }

    return null;
  }

  /**
   * Get the next run ordinal for a given date.
   * Per DYK-03: IFileSystem.readDir() returns raw entries, must regex filter.
   *
   * @param runsDir - Directory containing run folders
   * @param date - Date string in YYYY-MM-DD format
   * @returns Next ordinal number (1 if no existing runs)
   */
  private async getNextRunOrdinal(runsDir: string, date: string): Promise<number> {
    // Ensure runs directory exists
    if (!(await this.fs.exists(runsDir))) {
      await this.fs.mkdir(runsDir, { recursive: true });
      return 1;
    }

    // List existing entries
    const entries = await this.fs.readDir(runsDir);

    // Filter for this date and extract ordinals
    const pattern = new RegExp(`^run-${date}-(\\d{3})$`);
    const ordinals = entries
      .map((entry) => {
        const match = entry.match(pattern);
        return match ? Number.parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null);

    // Return max + 1, or 1 if none found
    if (ordinals.length === 0) {
      return 1;
    }
    return Math.max(...ordinals) + 1;
  }

  /**
   * Create an error result for compose operation.
   */
  private createErrorResult(
    code: string,
    error: {
      message: string;
      path?: string;
      action?: string;
      expected?: string;
      actual?: string;
    }
  ): ComposeResult {
    return {
      runDir: '',
      template: '',
      phases: [],
      errors: [
        {
          code,
          message: error.message,
          path: error.path,
          action: error.action,
          expected: error.expected,
          actual: error.actual,
        },
      ],
    };
  }
}
