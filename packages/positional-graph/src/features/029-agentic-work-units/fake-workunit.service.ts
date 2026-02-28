/**
 * Fake WorkUnit Service for Testing
 *
 * Test double for WorkUnitService that provides controllable responses.
 * Implements IWorkUnitService for use in Phase 3/4 tests.
 *
 * Per DYK #6: Returns fake unit class instances with controllable template content.
 *
 * @packageDocumentation
 */

import type { ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import { workunitNotFoundError } from './workunit-errors.js';
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
import type {
  AgenticWorkUnitInstance,
  CodeUnitInstance,
  UserInputUnitInstance,
  WorkUnitInstance,
} from './workunit.classes.js';
import type { AgenticWorkUnit, CodeUnit, UserInputUnit, WorkUnit } from './workunit.schema.js';

/**
 * Configuration for a fake agent unit.
 */
export interface FakeAgentUnitConfig {
  type: 'agent';
  slug: string;
  version: string;
  description?: string;
  promptContent: string;
  agent: AgenticWorkUnit['agent'];
  inputs?: WorkUnit['inputs'];
  outputs?: WorkUnit['outputs'];
}

/**
 * Configuration for a fake code unit.
 */
export interface FakeCodeUnitConfig {
  type: 'code';
  slug: string;
  version: string;
  description?: string;
  scriptContent: string;
  code: CodeUnit['code'];
  inputs?: WorkUnit['inputs'];
  outputs?: WorkUnit['outputs'];
}

/**
 * Configuration for a fake user input unit.
 */
export interface FakeUserInputUnitConfig {
  type: 'user-input';
  slug: string;
  version: string;
  description?: string;
  user_input: UserInputUnit['user_input'];
  inputs?: WorkUnit['inputs'];
  outputs?: WorkUnit['outputs'];
}

/**
 * Union type for all fake unit configs.
 */
export type FakeUnitConfig = FakeAgentUnitConfig | FakeCodeUnitConfig | FakeUserInputUnitConfig;

/**
 * Fake WorkUnit service for testing.
 *
 * Provides controllable responses without filesystem access.
 * Use `addUnit()` to register units that can be loaded.
 * Use `setTemplateContent()` to control what `getPrompt()`/`getScript()` returns.
 *
 * @example
 * ```typescript
 * const fake = new FakeWorkUnitService();
 * fake.addUnit({
 *   type: 'agent',
 *   slug: 'my-agent',
 *   version: '1.0.0',
 *   promptContent: 'You are a helpful assistant.',
 *   agent: { prompt_template: 'prompts/main.md' },
 *   outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
 * });
 *
 * const result = await fake.load(ctx, 'my-agent');
 * const unit = result.unit as AgenticWorkUnitInstance;
 * const prompt = await unit.getPrompt(ctx); // 'You are a helpful assistant.'
 * ```
 */
export class FakeWorkUnitService implements IWorkUnitService {
  /** Registered fake units */
  private units = new Map<string, FakeUnitConfig>();

  /** Overridden template content (slug -> content) */
  private templateContent = new Map<string, string>();

  /** Errors to return on next operation (slug -> errors) */
  private errors = new Map<string, ResultError[]>();

  /** Track calls for verification */
  private listCalls: WorkspaceContext[] = [];
  private loadCalls: Array<{ ctx: WorkspaceContext; slug: string }> = [];
  private validateCalls: Array<{ ctx: WorkspaceContext; slug: string }> = [];

  // ========== Test Helpers ==========

  /**
   * Add a fake unit that can be loaded.
   */
  addUnit(config: FakeUnitConfig): void {
    this.units.set(config.slug, config);
  }

  /**
   * Remove a fake unit.
   */
  removeUnit(slug: string): void {
    this.units.delete(slug);
    this.templateContent.delete(slug);
  }

  /**
   * Set/override the template content for a unit.
   * For agent units, this is what `getPrompt()` returns.
   * For code units, this is what `getScript()` returns.
   */
  setTemplateContent(slug: string, content: string): void {
    this.templateContent.set(slug, content);
  }

  /**
   * Set errors to return for a specific unit.
   */
  setErrors(slug: string, errors: ResultError[]): void {
    this.errors.set(slug, errors);
  }

  /**
   * Get list() call history.
   */
  getListCalls(): WorkspaceContext[] {
    return [...this.listCalls];
  }

  /**
   * Get load() call history.
   */
  getLoadCalls(): Array<{ ctx: WorkspaceContext; slug: string }> {
    return [...this.loadCalls];
  }

  /**
   * Get validate() call history.
   */
  getValidateCalls(): Array<{ ctx: WorkspaceContext; slug: string }> {
    return [...this.validateCalls];
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.units.clear();
    this.templateContent.clear();
    this.errors.clear();
    this.listCalls = [];
    this.loadCalls = [];
    this.validateCalls = [];
    this.createCalls = [];
    this.updateCalls = [];
    this.deleteCalls = [];
    this.renameCalls = [];
  }

  // ========== IWorkUnitService Implementation ==========

  async list(ctx: WorkspaceContext): Promise<ListUnitsResult> {
    this.listCalls.push(ctx);

    const units: WorkUnitSummary[] = [];
    const errors: ResultError[] = [];

    for (const config of this.units.values()) {
      // Check if there are preset errors for this unit
      const unitErrors = this.errors.get(config.slug);
      if (unitErrors && unitErrors.length > 0) {
        errors.push(...unitErrors);
        continue;
      }

      units.push({
        slug: config.slug,
        type: config.type,
        version: config.version,
      });
    }

    return { units, errors };
  }

  async load(ctx: WorkspaceContext, slug: string): Promise<LoadUnitResult> {
    this.loadCalls.push({ ctx, slug });

    // Check for preset errors
    const unitErrors = this.errors.get(slug);
    if (unitErrors && unitErrors.length > 0) {
      return { unit: undefined, errors: unitErrors };
    }

    // Check if unit exists
    const config = this.units.get(slug);
    if (!config) {
      return {
        unit: undefined,
        errors: [workunitNotFoundError(slug)],
      };
    }

    // Create fake unit instance based on type
    const unit = this.createFakeInstance(config);

    return { unit, errors: [] };
  }

  async validate(ctx: WorkspaceContext, slug: string): Promise<ValidateUnitResult> {
    this.validateCalls.push({ ctx, slug });

    // Check for preset errors
    const unitErrors = this.errors.get(slug);
    if (unitErrors && unitErrors.length > 0) {
      return { valid: false, errors: unitErrors };
    }

    // Check if unit exists
    if (!this.units.has(slug)) {
      return {
        valid: false,
        errors: [workunitNotFoundError(slug)],
      };
    }

    return { valid: true, errors: [] };
  }

  // ========== Write Operations (Plan 058 — fleshed out in T003) ==========

  /** Track create() calls */
  private createCalls: Array<{ ctx: WorkspaceContext; spec: CreateUnitSpec }> = [];
  /** Track update() calls */
  private updateCalls: Array<{ ctx: WorkspaceContext; slug: string; patch: UpdateUnitPatch }> = [];
  /** Track delete() calls */
  private deleteCalls: Array<{ ctx: WorkspaceContext; slug: string }> = [];
  /** Track rename() calls */
  private renameCalls: Array<{ ctx: WorkspaceContext; oldSlug: string; newSlug: string }> = [];

  async create(ctx: WorkspaceContext, spec: CreateUnitSpec): Promise<CreateUnitResult> {
    this.createCalls.push({ ctx, spec });
    if (this.units.has(spec.slug)) {
      return {
        slug: spec.slug,
        type: spec.type,
        errors: [
          {
            code: 'E188',
            message: `Unit '${spec.slug}' already exists`,
            action: 'Choose a different slug',
          },
        ],
      };
    }
    const defaultOutputs = [
      { name: 'result', type: 'data' as const, data_type: 'text' as const, required: true },
    ];
    const config: FakeUnitConfig =
      spec.type === 'agent'
        ? {
            type: 'agent',
            slug: spec.slug,
            version: spec.version ?? '1.0.0',
            description: spec.description,
            promptContent: '',
            agent: { prompt_template: 'prompts/main.md' },
            outputs: defaultOutputs,
          }
        : spec.type === 'code'
          ? {
              type: 'code',
              slug: spec.slug,
              version: spec.version ?? '1.0.0',
              description: spec.description,
              scriptContent: '',
              code: { script: 'scripts/main.sh' },
              outputs: defaultOutputs,
            }
          : {
              type: 'user-input',
              slug: spec.slug,
              version: spec.version ?? '1.0.0',
              description: spec.description,
              user_input: { question_type: 'text', prompt: 'Enter value' },
              outputs: defaultOutputs,
            };
    this.units.set(spec.slug, config);
    return { slug: spec.slug, type: spec.type, errors: [] };
  }

  async update(
    ctx: WorkspaceContext,
    slug: string,
    patch: UpdateUnitPatch
  ): Promise<UpdateUnitResult> {
    this.updateCalls.push({ ctx, slug, patch });
    const config = this.units.get(slug);
    if (!config) {
      return { slug, errors: [workunitNotFoundError(slug)] };
    }
    if (patch.description !== undefined) config.description = patch.description;
    if (patch.version !== undefined) config.version = patch.version;
    if (patch.inputs !== undefined) config.inputs = patch.inputs;
    if (patch.outputs !== undefined) config.outputs = patch.outputs;
    return { slug, errors: [] };
  }

  async delete(ctx: WorkspaceContext, slug: string): Promise<DeleteUnitResult> {
    this.deleteCalls.push({ ctx, slug });
    this.units.delete(slug);
    this.templateContent.delete(slug);
    return { deleted: true, errors: [] };
  }

  async rename(ctx: WorkspaceContext, oldSlug: string, newSlug: string): Promise<RenameUnitResult> {
    this.renameCalls.push({ ctx, oldSlug, newSlug });
    const config = this.units.get(oldSlug);
    if (!config) {
      return { newSlug, updatedFiles: [], errors: [workunitNotFoundError(oldSlug)] };
    }
    if (this.units.has(newSlug)) {
      return {
        newSlug,
        updatedFiles: [],
        errors: [
          {
            code: 'E188',
            message: `Unit '${newSlug}' already exists`,
            action: 'Choose a different slug',
          },
        ],
      };
    }
    this.units.delete(oldSlug);
    config.slug = newSlug;
    this.units.set(newSlug, config);
    const oldContent = this.templateContent.get(oldSlug);
    if (oldContent) {
      this.templateContent.delete(oldSlug);
      this.templateContent.set(newSlug, oldContent);
    }
    return { newSlug, updatedFiles: [], errors: [] };
  }

  /** Get create() call history */
  getCreateCalls(): Array<{ ctx: WorkspaceContext; spec: CreateUnitSpec }> {
    return [...this.createCalls];
  }
  /** Get update() call history */
  getUpdateCalls(): Array<{ ctx: WorkspaceContext; slug: string; patch: UpdateUnitPatch }> {
    return [...this.updateCalls];
  }
  /** Get delete() call history */
  getDeleteCalls(): Array<{ ctx: WorkspaceContext; slug: string }> {
    return [...this.deleteCalls];
  }
  /** Get rename() call history */
  getRenameCalls(): Array<{ ctx: WorkspaceContext; oldSlug: string; newSlug: string }> {
    return [...this.renameCalls];
  }

  // ========== Private Helpers ==========

  /**
   * Create a fake unit instance from config.
   */
  private createFakeInstance(config: FakeUnitConfig): WorkUnitInstance {
    switch (config.type) {
      case 'agent':
        return this.createFakeAgentInstance(config);
      case 'code':
        return this.createFakeCodeInstance(config);
      case 'user-input':
        return this.createFakeUserInputInstance(config);
    }
  }

  /**
   * Create a fake AgenticWorkUnitInstance.
   */
  private createFakeAgentInstance(config: FakeAgentUnitConfig): AgenticWorkUnitInstance {
    const getContent = () => this.templateContent.get(config.slug) ?? config.promptContent;
    let currentContent = getContent();

    return {
      type: 'agent',
      slug: config.slug,
      version: config.version,
      description: config.description,
      inputs: config.inputs ?? [],
      outputs: config.outputs ?? [
        { name: 'result', type: 'data', data_type: 'text', required: true },
      ],
      agent: config.agent,

      getPrompt: async (_ctx: WorkspaceContext): Promise<string> => {
        return getContent();
      },

      setPrompt: async (_ctx: WorkspaceContext, content: string): Promise<void> => {
        currentContent = content;
        this.templateContent.set(config.slug, content);
      },
    };
  }

  /**
   * Create a fake CodeUnitInstance.
   */
  private createFakeCodeInstance(config: FakeCodeUnitConfig): CodeUnitInstance {
    const getContent = () => this.templateContent.get(config.slug) ?? config.scriptContent;
    let currentContent = getContent();

    return {
      type: 'code',
      slug: config.slug,
      version: config.version,
      description: config.description,
      inputs: config.inputs ?? [],
      outputs: config.outputs ?? [
        { name: 'result', type: 'data', data_type: 'boolean', required: true },
      ],
      code: config.code,

      getScript: async (_ctx: WorkspaceContext): Promise<string> => {
        return getContent();
      },

      setScript: async (_ctx: WorkspaceContext, content: string): Promise<void> => {
        currentContent = content;
        this.templateContent.set(config.slug, content);
      },
    };
  }

  /**
   * Create a fake UserInputUnitInstance.
   */
  private createFakeUserInputInstance(config: FakeUserInputUnitConfig): UserInputUnitInstance {
    const outputs = config.outputs ?? [
      { name: 'answer', type: 'data' as const, data_type: 'text' as const, required: true },
    ];
    return {
      type: 'user-input',
      slug: config.slug,
      version: config.version,
      description: config.description,
      inputs: config.inputs ?? [],
      outputs,
      user_input: config.user_input,
      userInput: {
        prompt: config.user_input.prompt,
        inputType: config.user_input.question_type,
        outputName: outputs[0]?.name ?? 'output',
        options: config.user_input.options,
        default: config.user_input.default,
      },
    };
  }
}
