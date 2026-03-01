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

import type { IFileSystem, IPathResolver, IYamlParser, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import { atomicWriteFile } from '../../services/atomic-file.js';
import {
  workunitDeleteFailedError,
  workunitNotFoundError,
  workunitSchemaValidationError,
  workunitSlugExistsError,
  workunitYamlParseError,
} from './workunit-errors.js';
import type {
  CreateUnitResult,
  CreateUnitSpec,
  DeleteUnitResult,
  IWorkUnitService,
  ListUnitsResult,
  LoadUnitResult,
  RenameUnitResult,
  UpdateUnitPatch,
  UpdateUnitResult,
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
    private readonly yamlParser: IYamlParser,
    private readonly pathResolver: IPathResolver
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

  /**
   * Build a unit.yaml data object from a CreateUnitSpec.
   * @internal
   */
  private buildUnitYaml(spec: CreateUnitSpec): Record<string, unknown> {
    const base = {
      slug: spec.slug,
      type: spec.type,
      version: spec.version ?? '1.0.0',
      ...(spec.description ? { description: spec.description } : {}),
      inputs: [],
      outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
    };

    switch (spec.type) {
      case 'agent':
        return { ...base, agent: { prompt_template: 'prompts/main.md' } };
      case 'code':
        return { ...base, code: { script: 'scripts/main.sh' } };
      case 'user-input':
        return {
          ...base,
          user_input: { question_type: 'text', prompt: 'Enter a value' },
        };
    }
  }

  // ========== Write Operations (Plan 058 Phase 1) ==========

  async create(ctx: WorkspaceContext, spec: CreateUnitSpec): Promise<CreateUnitResult> {
    this.adapter.validateSlug(spec.slug);

    const exists = await this.adapter.unitExists(ctx, spec.slug);
    if (exists) {
      return { slug: spec.slug, type: spec.type, errors: [workunitSlugExistsError(spec.slug)] };
    }

    await this.adapter.ensureUnitDir(ctx, spec.slug);
    const unitData = this.buildUnitYaml(spec);
    const yamlContent = this.yamlParser.stringify(unitData);
    const yamlPath = this.adapter.getUnitYamlPath(ctx, spec.slug);
    await atomicWriteFile(this.fs, yamlPath, yamlContent);

    // Scaffold type-specific boilerplate
    if (spec.type === 'agent') {
      const promptDir = this.adapter.getTemplatePath(ctx, spec.slug, 'prompts');
      await this.fs.mkdir(promptDir, { recursive: true });
      const promptPath = this.adapter.getTemplatePath(ctx, spec.slug, 'prompts/main.md');
      await this.fs.writeFile(
        promptPath,
        '# Agent Prompt\n\nDescribe what this agent should do.\n\n## Instructions\n\n- Be specific about the task\n- Define expected outputs\n'
      );
    } else if (spec.type === 'code') {
      const scriptDir = this.adapter.getTemplatePath(ctx, spec.slug, 'scripts');
      await this.fs.mkdir(scriptDir, { recursive: true });
      const scriptPath = this.adapter.getTemplatePath(ctx, spec.slug, 'scripts/main.sh');
      await this.fs.writeFile(
        scriptPath,
        '#!/bin/bash\nset -euo pipefail\n\n# Work unit script\n# Inputs are available as environment variables\n# Write outputs to stdout or output files\n\necho "Hello from ${UNIT_SLUG:-unknown}"\n'
      );
    }

    return { slug: spec.slug, type: spec.type, errors: [] };
  }

  async update(
    ctx: WorkspaceContext,
    slug: string,
    patch: UpdateUnitPatch
  ): Promise<UpdateUnitResult> {
    this.adapter.validateSlug(slug);

    const yamlPath = this.adapter.getUnitYamlPath(ctx, slug);
    const exists = await this.fs.exists(yamlPath);
    if (!exists) {
      return { slug, errors: [workunitNotFoundError(slug)] };
    }

    // Read current unit.yaml
    let rawContent: string;
    try {
      rawContent = await this.fs.readFile(yamlPath);
    } catch {
      return { slug, errors: [workunitNotFoundError(slug)] };
    }

    let parsed: unknown;
    try {
      parsed = this.yamlParser.parse(rawContent, yamlPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown parse error';
      return { slug, errors: [workunitYamlParseError(slug, message)] };
    }

    // Apply patch: scalars overwrite, arrays replace, type-config shallow-merge
    const current = parsed as Record<string, unknown>;
    if (patch.description !== undefined) current.description = patch.description;
    if (patch.version !== undefined) current.version = patch.version;
    if (patch.inputs !== undefined) current.inputs = patch.inputs;
    if (patch.outputs !== undefined) current.outputs = patch.outputs;

    // Shallow-merge type-specific config
    if (patch.agent && current.type === 'agent') {
      current.agent = { ...(current.agent as Record<string, unknown>), ...patch.agent };
    }
    if (patch.code && current.type === 'code') {
      current.code = { ...(current.code as Record<string, unknown>), ...patch.code };
    }
    if (patch.user_input && current.type === 'user-input') {
      current.user_input = {
        ...(current.user_input as Record<string, unknown>),
        ...patch.user_input,
      };
    }

    // Re-validate against schema
    const parseResult = WorkUnitSchema.safeParse(current);
    if (!parseResult.success) {
      const formattedErrors = formatZodErrors(parseResult.error, slug);
      return { slug, errors: [workunitSchemaValidationError(slug, formattedErrors)] };
    }

    // Write back
    const updatedYaml = this.yamlParser.stringify(current);
    await atomicWriteFile(this.fs, yamlPath, updatedYaml);

    return { slug, errors: [] };
  }

  async delete(ctx: WorkspaceContext, slug: string): Promise<DeleteUnitResult> {
    this.adapter.validateSlug(slug);
    try {
      await this.adapter.removeUnitDir(ctx, slug);
    } catch (err) {
      return {
        deleted: false,
        errors: [workunitDeleteFailedError(slug, err instanceof Error ? err.message : String(err))],
      };
    }
    return { deleted: true, errors: [] };
  }

  async rename(ctx: WorkspaceContext, oldSlug: string, newSlug: string): Promise<RenameUnitResult> {
    this.adapter.validateSlug(oldSlug);
    this.adapter.validateSlug(newSlug);

    // Verify old exists
    const oldExists = await this.adapter.unitExists(ctx, oldSlug);
    if (!oldExists) {
      return { newSlug, updatedFiles: [], errors: [workunitNotFoundError(oldSlug)] };
    }

    // Verify new doesn't exist
    const newExists = await this.adapter.unitExists(ctx, newSlug);
    if (newExists) {
      return { newSlug, updatedFiles: [], errors: [workunitSlugExistsError(newSlug)] };
    }

    // Rename directory
    await this.adapter.renameUnitDir(ctx, oldSlug, newSlug);

    // Update slug in unit.yaml
    const renameErrors: ResultError[] = [];
    const yamlPath = this.adapter.getUnitYamlPath(ctx, newSlug);
    try {
      const content = await this.fs.readFile(yamlPath);
      // Use string replacement to preserve YAML formatting (per DYK #5)
      const updated = content.replace(
        new RegExp(`^slug:\\s*${oldSlug}\\s*$`, 'm'),
        `slug: ${newSlug}`
      );
      await atomicWriteFile(this.fs, yamlPath, updated);
    } catch (err) {
      renameErrors.push({
        code: 'E190',
        message: 'Failed to update slug in unit.yaml after rename',
        action: String(err instanceof Error ? err.message : err),
      });
    }

    // Cascade unit_slug references in workflow/template node.yaml files
    const cascade = await this.cascadeSlugReferences(ctx, oldSlug, newSlug);

    return {
      newSlug,
      updatedFiles: cascade.updatedFiles,
      errors: [...renameErrors, ...cascade.errors],
    };
  }

  /**
   * Scan workflow and template node.yaml files, updating unit_slug references.
   * Uses string replacement to preserve YAML formatting (per DYK #5).
   */
  private async cascadeSlugReferences(
    ctx: WorkspaceContext,
    oldSlug: string,
    newSlug: string
  ): Promise<{ updatedFiles: string[]; errors: ResultError[] }> {
    const updatedFiles: string[] = [];
    const errors: ResultError[] = [];
    const dirsToScan = [
      this.pathResolver.join(ctx.worktreePath, '.chainglass', 'data', 'workflows'),
      this.pathResolver.join(ctx.worktreePath, '.chainglass', 'templates', 'workflows'),
    ];

    for (const baseDir of dirsToScan) {
      const dirExists = await this.fs.exists(baseDir);
      if (!dirExists) continue;

      let workflows: string[];
      try {
        workflows = await this.fs.readDir(baseDir);
      } catch {
        continue;
      }

      for (const wfSlug of workflows) {
        const nodesDir = this.pathResolver.join(baseDir, wfSlug, 'nodes');
        const nodesDirExists = await this.fs.exists(nodesDir);
        if (!nodesDirExists) continue;

        let nodeIds: string[];
        try {
          nodeIds = await this.fs.readDir(nodesDir);
        } catch {
          continue;
        }

        for (const nodeId of nodeIds) {
          const nodeYamlPath = this.pathResolver.join(nodesDir, nodeId, 'node.yaml');
          try {
            const nodeContent = await this.fs.readFile(nodeYamlPath);
            if (nodeContent.includes(`unit_slug: ${oldSlug}`)) {
              const updatedContent = nodeContent.replace(
                new RegExp(`unit_slug:\\s*${oldSlug}(\\s|$)`, 'gm'),
                `unit_slug: ${newSlug}$1`
              );
              await atomicWriteFile(this.fs, nodeYamlPath, updatedContent);
              updatedFiles.push(nodeYamlPath);
            }
          } catch (err) {
            errors.push({
              code: 'E190',
              message: `Failed to update unit_slug in ${nodeYamlPath}`,
              action: String(err instanceof Error ? err.message : err),
            });
          }
        }
      }
    }

    return { updatedFiles, errors };
  }
}
