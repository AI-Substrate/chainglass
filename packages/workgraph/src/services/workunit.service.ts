/**
 * WorkUnitService - Real implementation of IWorkUnitService.
 *
 * Manages WorkUnits stored in `.chainglass/units/`.
 * Per Phase 2: Implements list(), load(), create(), validate() operations.
 *
 * Per ADR-0004: Uses constructor injection with useFactory pattern.
 * Per Critical Discovery 02: All methods return results with errors array.
 */

import type { IFileSystem, IPathResolver, IYamlParser } from '@chainglass/shared';
import { YamlParseError } from '@chainglass/shared';

import {
  invalidUnitSlugError,
  schemaValidationError,
  unitAlreadyExistsError,
  unitNotFoundError,
  yamlParseError,
} from '../errors/workgraph-errors.js';
import type {
  IWorkUnitService,
  UnitCreateResult,
  UnitListResult,
  UnitLoadResult,
  UnitValidateResult,
  ValidationIssue,
  WorkUnit,
  WorkUnitSummary,
} from '../interfaces/workunit-service.interface.js';
import { WorkUnitSchema } from '../schemas/workunit.schema.js';

/**
 * Real WorkUnit service implementation.
 *
 * Per spec AC-14: list() shows all available units.
 * Per spec AC-15: load() returns full unit details.
 */
export class WorkUnitService implements IWorkUnitService {
  /** Base directory for units */
  private readonly unitsDir = '.chainglass/units';

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser
  ) {}

  /**
   * List all available WorkUnits.
   *
   * Scans `.chainglass/units/<slug>/unit.yaml` files and extracts summaries.
   * Invalid units are skipped silently to allow partial results.
   *
   * @returns UnitListResult with array of unit summaries
   */
  async list(): Promise<UnitListResult> {
    const units: WorkUnitSummary[] = [];

    // Use glob to find all unit.yaml files
    const unitFiles = await this.fs.glob('**/unit.yaml', {
      cwd: this.unitsDir,
    });

    for (const relPath of unitFiles) {
      try {
        // Extract slug from path (e.g., "write-poem/unit.yaml" → "write-poem")
        const slug = this.pathResolver.dirname(relPath);
        if (!slug || slug === '.') continue;

        const unitPath = this.pathResolver.join(this.unitsDir, relPath);
        const content = await this.fs.readFile(unitPath);
        const data = this.yamlParser.parse<Record<string, unknown>>(content, unitPath);

        // Extract summary fields
        const summary: WorkUnitSummary = {
          slug: (data.slug as string) || slug,
          type: data.type as 'agent' | 'code' | 'user-input',
          version: data.version as string,
          description: data.description as string | undefined,
        };

        // Only add if we have required fields
        if (summary.slug && summary.type && summary.version) {
          units.push(summary);
        }
      } catch {}
    }

    return {
      units,
      errors: [],
    };
  }

  /**
   * Load a WorkUnit by slug.
   *
   * @param slug - Unit identifier to load
   * @returns UnitLoadResult with full unit details or E120 error
   */
  async load(slug: string): Promise<UnitLoadResult> {
    const unitPath = this.pathResolver.join(this.unitsDir, slug, 'unit.yaml');

    // Check if unit exists
    if (!(await this.fs.exists(unitPath))) {
      return {
        unit: undefined,
        errors: [unitNotFoundError(slug)],
      };
    }

    // Read and parse YAML
    let content: string;
    let data: unknown;
    try {
      content = await this.fs.readFile(unitPath);
      data = this.yamlParser.parse<unknown>(content, unitPath);
    } catch (err) {
      // Check for YamlParseError (by instanceof or by name for cross-package compat)
      if (
        err instanceof YamlParseError ||
        (err instanceof Error && err.name === 'YamlParseError')
      ) {
        return {
          unit: undefined,
          errors: [yamlParseError(unitPath, err.message)],
        };
      }
      throw err;
    }

    // Validate with Zod schema
    const parseResult = WorkUnitSchema.safeParse(data);
    if (!parseResult.success) {
      // Convert Zod errors to E132
      const firstError = parseResult.error.issues[0];
      const path = `/${firstError.path.join('/')}`;
      return {
        unit: undefined,
        errors: [schemaValidationError(path, firstError.message)],
      };
    }

    // Convert Zod result to WorkUnit interface
    const zodUnit = parseResult.data;
    const unit: WorkUnit = {
      slug: zodUnit.slug,
      type: zodUnit.type,
      version: zodUnit.version,
      description: zodUnit.description,
      inputs: zodUnit.inputs.map((i) => ({
        name: i.name,
        type: i.type,
        dataType: i.data_type,
        required: i.required,
        description: i.description,
      })),
      outputs: zodUnit.outputs.map((o) => ({
        name: o.name,
        type: o.type,
        dataType: o.data_type,
        required: o.required,
        description: o.description,
      })),
    };

    // Add type-specific config
    if (zodUnit.type === 'agent' && zodUnit.agent) {
      unit.agent = {
        promptTemplate: zodUnit.agent.prompt_template,
        systemPrompt: zodUnit.agent.system_prompt,
        supportedAgents: zodUnit.agent.supported_agents,
        estimatedTokens: zodUnit.agent.estimated_tokens,
      };
    }
    if (zodUnit.type === 'code' && zodUnit.code) {
      unit.code = {
        timeout: zodUnit.code.timeout,
      };
    }
    if (zodUnit.type === 'user-input' && zodUnit.user_input) {
      unit.userInput = {
        questionType: zodUnit.user_input.question_type,
        prompt: zodUnit.user_input.prompt,
        options: zodUnit.user_input.options,
      };
    }

    return {
      unit,
      errors: [],
    };
  }

  /**
   * Create a new WorkUnit with scaffolding.
   *
   * Creates directory structure and type-specific files:
   * - agent: unit.yaml + commands/main.md
   * - code: unit.yaml
   * - user-input: unit.yaml
   *
   * @param slug - Unique identifier for the new unit
   * @param type - Unit type: agent, code, or user-input
   * @returns UnitCreateResult with path to created unit
   */
  async create(slug: string, type: 'agent' | 'code' | 'user-input'): Promise<UnitCreateResult> {
    // Validate slug format
    if (!this.isValidSlug(slug)) {
      return {
        slug,
        path: '',
        errors: [invalidUnitSlugError(slug)],
      };
    }

    // Check if unit already exists
    const unitPath = this.pathResolver.join(this.unitsDir, slug);
    if (await this.fs.exists(unitPath)) {
      return {
        slug,
        path: unitPath,
        errors: [unitAlreadyExistsError(slug)],
      };
    }

    // Create unit directory
    await this.fs.mkdir(unitPath, { recursive: true });

    // Generate type-specific unit.yaml
    const unitYaml = this.generateUnitYaml(slug, type);
    await this.fs.writeFile(this.pathResolver.join(unitPath, 'unit.yaml'), unitYaml);

    // Create type-specific files
    if (type === 'agent') {
      // Create commands directory with main.md template
      const commandsPath = this.pathResolver.join(unitPath, 'commands');
      await this.fs.mkdir(commandsPath, { recursive: true });
      await this.fs.writeFile(
        this.pathResolver.join(commandsPath, 'main.md'),
        this.generateAgentPromptTemplate(slug)
      );
    }

    return {
      slug,
      path: unitPath,
      errors: [],
    };
  }

  /**
   * Generate unit.yaml content for a new unit.
   */
  private generateUnitYaml(slug: string, type: 'agent' | 'code' | 'user-input'): string {
    const base = {
      slug,
      type,
      version: '1.0.0',
      description: `A ${type} unit`,
    };

    if (type === 'agent') {
      return this.yamlParser.stringify({
        ...base,
        inputs: [
          {
            name: 'topic',
            type: 'data',
            data_type: 'text',
            required: true,
            description: 'Input topic',
          },
        ],
        outputs: [
          {
            name: 'result',
            type: 'data',
            data_type: 'text',
            required: true,
            description: 'Output result',
          },
        ],
        agent: {
          prompt_template: 'commands/main.md',
        },
      });
    }

    if (type === 'code') {
      return this.yamlParser.stringify({
        ...base,
        inputs: [],
        outputs: [
          {
            name: 'result',
            type: 'data',
            data_type: 'json',
            required: true,
            description: 'Output result',
          },
        ],
        code: {
          timeout: 60,
        },
      });
    }

    // user-input
    return this.yamlParser.stringify({
      ...base,
      inputs: [],
      outputs: [
        {
          name: 'response',
          type: 'data',
          data_type: 'text',
          required: true,
          description: 'User response',
        },
      ],
      user_input: {
        question_type: 'text',
        prompt: 'Enter your response:',
      },
    });
  }

  /**
   * Generate default agent prompt template.
   */
  private generateAgentPromptTemplate(slug: string): string {
    return `# ${slug}

You are an AI assistant. Given the input topic, generate a response.

## Input
{{topic}}

## Instructions
Provide a helpful response based on the topic above.
`;
  }

  /**
   * Validate a WorkUnit definition.
   *
   * @param slug - Unit identifier to validate
   * @returns UnitValidateResult with validation issues
   */
  async validate(slug: string): Promise<UnitValidateResult> {
    const unitPath = this.pathResolver.join(this.unitsDir, slug, 'unit.yaml');

    // Check if unit exists
    if (!(await this.fs.exists(unitPath))) {
      return {
        slug,
        valid: false,
        issues: [],
        errors: [unitNotFoundError(slug)],
      };
    }

    // Read and parse YAML
    let content: string;
    let data: unknown;
    try {
      content = await this.fs.readFile(unitPath);
      data = this.yamlParser.parse<unknown>(content, unitPath);
    } catch (err) {
      if (err instanceof YamlParseError) {
        return {
          slug,
          valid: false,
          issues: [
            {
              severity: 'error',
              code: 'E130',
              path: '/',
              message: `YAML parse error: ${err.message}`,
            },
          ],
          errors: [],
        };
      }
      throw err;
    }

    // Validate with Zod schema
    const parseResult = WorkUnitSchema.safeParse(data);
    if (!parseResult.success) {
      const issues: ValidationIssue[] = parseResult.error.issues.map((issue) => ({
        severity: 'error' as const,
        code: 'E132',
        path: `/${issue.path.join('/')}`,
        message: issue.message,
      }));

      return {
        slug,
        valid: false,
        issues,
        errors: [],
      };
    }

    // Additional validation checks could go here (e.g., prompt template exists)

    return {
      slug,
      valid: true,
      issues: [],
      errors: [],
    };
  }

  /**
   * Validate slug format.
   * Per spec: lowercase with hyphens (e.g., my-unit)
   */
  private isValidSlug(slug: string): boolean {
    return /^[a-z][a-z0-9-]*$/.test(slug);
  }
}
