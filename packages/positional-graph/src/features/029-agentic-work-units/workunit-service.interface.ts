/**
 * WorkUnit Service Interface
 *
 * Defines the contract for the WorkUnitService which handles loading,
 * listing, validating, and mutating work units.
 *
 * Per Plan 029: Agentic Work Units — Phase 2 (read operations).
 * Per Plan 058: Work Unit Editor — Phase 1 (write operations).
 *
 * @packageDocumentation
 */

import type { ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import type {
  AgenticWorkUnitInstance,
  CodeUnitInstance,
  UserInputUnitInstance,
  WorkUnitInstance,
} from './workunit.classes.js';

/**
 * Summary of a work unit for list() results.
 */
export interface WorkUnitSummary {
  /** Unit slug */
  slug: string;
  /** Unit type discriminator */
  type: 'agent' | 'code' | 'user-input';
  /** Unit version */
  version: string;
}

/**
 * Result from list() operation.
 */
export interface ListUnitsResult {
  /** Successfully loaded unit summaries */
  units: WorkUnitSummary[];
  /** Errors from units that failed to load (skip-and-warn per DYK #5) */
  errors: ResultError[];
}

/**
 * Result from load() operation.
 */
export interface LoadUnitResult {
  /** The loaded unit instance, or undefined if load failed */
  unit?: WorkUnitInstance;
  /** Errors encountered during load */
  errors: ResultError[];
}

/**
 * Result from validate() operation.
 */
export interface ValidateUnitResult {
  /** Whether the unit is valid */
  valid: boolean;
  /** Validation errors if not valid */
  errors: ResultError[];
}

// ============================================
// Write Operation Types (Plan 058 Phase 1)
// ============================================

/**
 * Specification for creating a new work unit.
 * Per W004 Decision 3: Spec object, not positional args.
 */
export interface CreateUnitSpec {
  /** Unit slug (kebab-case, /^[a-z][a-z0-9-]*$/) */
  slug: string;
  /** Unit type */
  type: 'agent' | 'code' | 'user-input';
  /** Optional description */
  description?: string;
  /** Optional version (defaults to '1.0.0') */
  version?: string;
}

/**
 * Result from create() operation.
 */
export interface CreateUnitResult {
  /** Created unit slug */
  slug: string;
  /** Unit type */
  type: 'agent' | 'code' | 'user-input';
  /** Errors encountered during creation */
  errors: ResultError[];
}

/**
 * Partial patch for updating a work unit.
 * Per W004 Decision 4: Scalars overwrite, arrays replace wholesale.
 */
export interface UpdateUnitPatch {
  /** Update description */
  description?: string;
  /** Update version */
  version?: string;
  /** Replace entire inputs array */
  inputs?: Array<{
    name: string;
    type: 'data' | 'file';
    data_type?: 'text' | 'number' | 'boolean' | 'json';
    required: boolean;
    description?: string;
  }>;
  /** Replace entire outputs array */
  outputs?: Array<{
    name: string;
    type: 'data' | 'file';
    data_type?: 'text' | 'number' | 'boolean' | 'json';
    required: boolean;
    description?: string;
  }>;
  /** Shallow-merge type-specific config */
  agent?: Partial<{
    prompt_template: string;
    system_prompt: string;
    supported_agents: ('claude-code' | 'copilot')[];
    estimated_tokens: number;
  }>;
  /** Shallow-merge type-specific config */
  code?: Partial<{
    script: string;
    timeout: number;
  }>;
  /** Shallow-merge type-specific config */
  user_input?: Partial<{
    question_type: 'text' | 'single' | 'multi' | 'confirm';
    prompt: string;
    options?: Array<{ key: string; label: string; description?: string }>;
    default?: string | boolean;
  }>;
}

/**
 * Result from update() operation.
 */
export interface UpdateUnitResult {
  /** Updated unit slug */
  slug: string;
  /** Errors encountered during update */
  errors: ResultError[];
}

/**
 * Result from delete() operation.
 */
export interface DeleteUnitResult {
  /** Whether the unit was deleted (true even if didn't exist — idempotent) */
  deleted: boolean;
  /** Errors encountered during deletion */
  errors: ResultError[];
}

/**
 * Result from rename() operation.
 */
export interface RenameUnitResult {
  /** New slug after rename */
  newSlug: string;
  /** Files that had unit_slug references updated */
  updatedFiles: string[];
  /** Errors encountered during rename or cascade */
  errors: ResultError[];
}

/**
 * WorkUnit service interface.
 *
 * Provides operations for listing, loading, validating, and mutating work units.
 * Returns rich domain objects (AgenticWorkUnitInstance, CodeUnitInstance, UserInputUnitInstance)
 * with type-specific methods for template access.
 */
export interface IWorkUnitService {
  // ========== Read Operations (Plan 029) ==========

  /**
   * List all work units in the workspace.
   *
   * Per DYK #5: Uses skip-and-warn approach - returns valid units and
   * reports errors for units that failed to load.
   */
  list(ctx: WorkspaceContext): Promise<ListUnitsResult>;

  /**
   * Load a work unit by slug.
   *
   * Returns rich domain objects with type-specific methods:
   * - AgenticWorkUnitInstance: getPrompt(), setPrompt()
   * - CodeUnitInstance: getScript(), setScript()
   * - UserInputUnitInstance: (no template methods)
   *
   * Error codes: E180 (not found), E181 (YAML parse), E182 (schema validation)
   */
  load(ctx: WorkspaceContext, slug: string): Promise<LoadUnitResult>;

  /**
   * Validate a work unit without fully loading it.
   */
  validate(ctx: WorkspaceContext, slug: string): Promise<ValidateUnitResult>;

  // ========== Write Operations (Plan 058) ==========

  /**
   * Create a new work unit.
   *
   * Scaffolds the directory structure, unit.yaml, and type-specific
   * boilerplate template files (prompt for agent, script for code).
   *
   * Error codes: E187 (invalid slug), E188 (slug exists)
   */
  create(ctx: WorkspaceContext, spec: CreateUnitSpec): Promise<CreateUnitResult>;

  /**
   * Update an existing work unit.
   *
   * Applies a partial patch: scalars overwrite, arrays (inputs/outputs)
   * replace wholesale, type-specific config shallow-merges.
   * Re-validates against Zod schema after merge.
   *
   * Error codes: E180 (not found), E182 (validation after merge)
   */
  update(ctx: WorkspaceContext, slug: string, patch: UpdateUnitPatch): Promise<UpdateUnitResult>;

  /**
   * Delete a work unit.
   *
   * Removes the entire unit directory. Idempotent: deleting a non-existent
   * unit returns { deleted: true }, not an error.
   */
  delete(ctx: WorkspaceContext, slug: string): Promise<DeleteUnitResult>;

  /**
   * Rename a work unit.
   *
   * Renames the directory, updates slug in unit.yaml, and delegates cascade
   * of unit_slug references in workflow node.yaml files to the graph service.
   *
   * Error codes: E187 (invalid slug), E188 (new slug exists), E180 (old slug not found)
   */
  rename(ctx: WorkspaceContext, oldSlug: string, newSlug: string): Promise<RenameUnitResult>;
}

/**
 * Type guard for AgenticWorkUnitInstance.
 */
export function isAgenticWorkUnit(unit: WorkUnitInstance): unit is AgenticWorkUnitInstance {
  return unit.type === 'agent';
}

/**
 * Type guard for CodeUnitInstance.
 */
export function isCodeUnit(unit: WorkUnitInstance): unit is CodeUnitInstance {
  return unit.type === 'code';
}

/**
 * Type guard for UserInputUnitInstance.
 */
export function isUserInputUnit(unit: WorkUnitInstance): unit is UserInputUnitInstance {
  return unit.type === 'user-input';
}
