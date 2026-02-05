/**
 * WorkUnit Service Implementation
 *
 * Implements IWorkUnitService for loading, listing, and validating work units.
 * Returns rich domain objects (AgenticWorkUnitInstance, CodeUnitInstance, UserInputUnitInstance)
 * with type-specific methods for template access.
 *
 * Per Plan 029: Agentic Work Units — Phase 2.
 *
 * @packageDocumentation
 */

import type { IFileSystem, IYamlParser, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import {
  workunitNotFoundError,
  workunitSchemaValidationError,
  workunitYamlParseError,
} from './workunit-errors.js';
import type {
  IWorkUnitService,
  ListUnitsResult,
  LoadUnitResult,
  ValidateUnitResult,
  WorkUnitSummary,
} from './workunit-service.interface.js';
import type { WorkUnitAdapter } from './workunit.adapter.js';
import {
  type WorkUnitInstance,
  createAgenticWorkUnitInstance,
  createCodeUnitInstance,
  createUserInputUnitInstance,
} from './workunit.classes.js';
import {
  type AgenticWorkUnit,
  type CodeUnit,
  type UserInputUnit,
  type WorkUnit,
  WorkUnitSchema,
  formatZodErrors,
} from './workunit.schema.js';

/**
 * WorkUnit service implementation.
 *
 * Handles loading, listing, and validating work units from the filesystem.
 * Returns rich domain objects with type-specific template methods.
 */
export class WorkUnitService implements IWorkUnitService {
  constructor(
    private readonly adapter: WorkUnitAdapter,
    private readonly fs: IFileSystem,
    private readonly yamlParser: IYamlParser
  ) {}

  /**
   * List all work units in the workspace.
   *
   * Per DYK #5: Uses skip-and-warn approach - returns valid units and
   * reports errors for units that failed to load.
   */
  async list(ctx: WorkspaceContext): Promise<ListUnitsResult> {
    const units: WorkUnitSummary[] = [];
    const errors: ResultError[] = [];

    // Get all unit slugs
    const slugs = await this.adapter.listUnitSlugs(ctx);

    // Load each unit, collecting successes and errors
    for (const slug of slugs) {
      const result = await this.loadInternal(ctx, slug);

      if (result.unit) {
        units.push({
          slug: result.unit.slug,
          type: result.unit.type,
          version: result.unit.version,
        });
      }

      // Collect any errors (skip-and-warn per DYK #5)
      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
    }

    return { units, errors };
  }

  /**
   * Load a work unit by slug.
   *
   * Returns rich domain objects with type-specific methods:
   * - AgenticWorkUnitInstance: getPrompt(), setPrompt()
   * - CodeUnitInstance: getScript(), setScript()
   * - UserInputUnitInstance: (no template methods)
   */
  async load(ctx: WorkspaceContext, slug: string): Promise<LoadUnitResult> {
    // Validate slug format (throws synchronously for invalid format)
    this.adapter.validateSlug(slug);

    return this.loadInternal(ctx, slug);
  }

  /**
   * Validate a work unit without fully loading it.
   */
  async validate(ctx: WorkspaceContext, slug: string): Promise<ValidateUnitResult> {
    // Validate slug format (throws synchronously for invalid format)
    this.adapter.validateSlug(slug);

    const result = await this.loadInternal(ctx, slug);

    return {
      valid: result.unit !== undefined && result.errors.length === 0,
      errors: result.errors,
    };
  }

  /**
   * Internal load implementation used by both load() and list().
   * Does not validate slug format (caller must validate).
   *
   * @internal
   */
  private async loadInternal(ctx: WorkspaceContext, slug: string): Promise<LoadUnitResult> {
    const errors: ResultError[] = [];

    // Check if unit exists
    const exists = await this.adapter.unitExists(ctx, slug);
    if (!exists) {
      return {
        unit: undefined,
        errors: [workunitNotFoundError(slug)],
      };
    }

    // Read YAML file
    const yamlPath = this.adapter.getUnitYamlPath(ctx, slug);
    let yamlContent: string;
    try {
      yamlContent = await this.fs.readFile(yamlPath);
    } catch {
      return {
        unit: undefined,
        errors: [workunitNotFoundError(slug)],
      };
    }

    // Parse YAML
    let parsed: unknown;
    try {
      parsed = this.yamlParser.parse(yamlContent, yamlPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown parse error';
      return {
        unit: undefined,
        errors: [workunitYamlParseError(slug, message)],
      };
    }

    // Validate against schema
    const parseResult = WorkUnitSchema.safeParse(parsed);
    if (!parseResult.success) {
      const formattedErrors = formatZodErrors(parseResult.error, slug);
      return {
        unit: undefined,
        errors: [workunitSchemaValidationError(slug, formattedErrors)],
      };
    }

    // Create rich domain instance based on type
    const data = parseResult.data as WorkUnit;
    let unit: WorkUnitInstance;

    switch (data.type) {
      case 'agent':
        unit = createAgenticWorkUnitInstance(data as AgenticWorkUnit, this.adapter, this.fs);
        break;
      case 'code':
        unit = createCodeUnitInstance(data as CodeUnit, this.adapter, this.fs);
        break;
      case 'user-input':
        unit = createUserInputUnitInstance(data as UserInputUnit);
        break;
    }

    return { unit, errors };
  }
}
