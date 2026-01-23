/**
 * WorkflowService implementation for managing workflow compositions.
 *
 * Per Phase 2: Compose Command - Provides the compose() method that creates
 * a new workflow run from a template.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { ComposeResult, IFileSystem, IPathResolver, PhaseInfo } from '@chainglass/shared';
import type { ISchemaValidator, IYamlParser } from '../interfaces/index.js';
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
} as const;

/**
 * WorkflowService implements workflow composition.
 *
 * Depends on:
 * - IFileSystem: File operations (read, write, copy, mkdir)
 * - IYamlParser: Parse wf.yaml
 * - ISchemaValidator: Validate wf.yaml against schema
 * - IPathResolver: Secure path resolution
 */
export class WorkflowService implements IWorkflowService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly yamlParser: IYamlParser,
    private readonly schemaValidator: ISchemaValidator,
    private readonly pathResolver: IPathResolver
  ) {}

  /**
   * Create a new workflow run from a template.
   *
   * @param template - Template slug (name) or path to template directory
   * @param runsDir - Directory where run folders are created
   * @returns ComposeResult with runDir, template name, phases array, and errors
   */
  async compose(template: string, runsDir: string): Promise<ComposeResult> {
    const errors: ComposeResult['errors'] = [];

    // 1. Expand tilde in template path (DYK-02)
    const expandedTemplate = this.expandTilde(template);

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

    // 6. Generate run folder name
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

    // 13. Build result
    const phases: PhaseInfo[] = sortedPhases.map((phase) => ({
      name: phase.name,
      order: phase.order,
      status: 'pending' as const,
    }));

    return {
      runDir,
      template: wfDefinition.name,
      phases,
      errors: [],
    };
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
