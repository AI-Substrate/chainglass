/**
 * WorkUnit Service Interface
 *
 * Defines the contract for the WorkUnitService which handles loading,
 * listing, and validating work units.
 *
 * Per Plan 029: Agentic Work Units — Phase 2.
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

/**
 * WorkUnit service interface.
 *
 * Provides operations for listing, loading, and validating work units.
 * Returns rich domain objects (AgenticWorkUnitInstance, CodeUnitInstance, UserInputUnitInstance)
 * with type-specific methods for template access.
 */
export interface IWorkUnitService {
  /**
   * List all work units in the workspace.
   *
   * Per DYK #5: Uses skip-and-warn approach - returns valid units and
   * reports errors for units that failed to load.
   *
   * @param ctx - Workspace context
   * @returns Unit summaries and any errors from malformed units
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
   * @param ctx - Workspace context
   * @param slug - Unit slug
   * @returns The unit instance and any errors
   * @throws Error if slug is invalid (before filesystem access)
   *
   * Error codes:
   * - E180: Unit not found
   * - E181: YAML parse error
   * - E182: Schema validation error
   */
  load(ctx: WorkspaceContext, slug: string): Promise<LoadUnitResult>;

  /**
   * Validate a work unit without fully loading it.
   *
   * @param ctx - Workspace context
   * @param slug - Unit slug
   * @returns Validation result
   * @throws Error if slug is invalid
   */
  validate(ctx: WorkspaceContext, slug: string): Promise<ValidateUnitResult>;
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
