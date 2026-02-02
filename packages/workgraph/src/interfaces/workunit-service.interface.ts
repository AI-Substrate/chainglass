/**
 * IWorkUnitService interface for managing WorkUnits.
 *
 * WorkUnits are reusable templates stored in `<worktree>/.chainglass/data/units/`.
 * This service provides list, load, create, and validate operations.
 *
 * Per spec AC-14, AC-15: Users can list and view unit details.
 * Per Critical Discovery 02: All methods return results with errors array.
 * Per Plan 021: All methods accept WorkspaceContext as first parameter.
 */

import type { BaseResult, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

// WorkUnit domain types — extracted to @chainglass/workflow (Plan 026, Phase 1)
// Imported from /interfaces subpath to avoid InputDeclaration name collision
// with the workflow-level InputDeclaration (phase inputs) in the top-level barrel.
// Re-exported here for backward compatibility.
import type {
  AgentConfig,
  CodeConfig,
  InputDeclaration,
  OutputDeclaration,
  UserInputConfig,
  UserInputOption,
  WorkUnit,
} from '@chainglass/workflow/interfaces';

export type {
  AgentConfig,
  CodeConfig,
  InputDeclaration,
  OutputDeclaration,
  UserInputConfig,
  UserInputOption,
  WorkUnit,
};

// ============================================
// Result Types
// ============================================

/**
 * Summary of a WorkUnit for listing.
 */
export interface WorkUnitSummary {
  /** Unique unit identifier (matches folder name) */
  slug: string;
  /** Unit type: agent, code, or user-input */
  type: 'agent' | 'code' | 'user-input';
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description?: string;
}

/**
 * Result of listing all available units.
 */
export interface UnitListResult extends BaseResult {
  /** Array of unit summaries */
  units: WorkUnitSummary[];
}

/**
 * Result of loading a single unit.
 */
export interface UnitLoadResult extends BaseResult {
  /** The loaded unit (undefined if errors) */
  unit?: WorkUnit;
}

/**
 * Result of creating a new unit.
 */
export interface UnitCreateResult extends BaseResult {
  /** Created unit slug */
  slug: string;
  /** Path to created unit directory */
  path: string;
}

/**
 * Validation issue found in a unit.
 */
export interface ValidationIssue {
  /** Issue severity */
  severity: 'error' | 'warning';
  /** Error code */
  code: string;
  /** JSON pointer to the invalid field */
  path: string;
  /** Human-readable message */
  message: string;
  /** Suggested fix */
  action?: string;
}

/**
 * Result of validating a unit.
 */
export interface UnitValidateResult extends BaseResult {
  /** Unit slug that was validated */
  slug: string;
  /** Whether the unit is valid */
  valid: boolean;
  /** Validation issues found */
  issues: ValidationIssue[];
}

// ============================================
// Service Interface
// ============================================

/**
 * Service for managing WorkUnits.
 *
 * Per spec AC-14: list() shows all available units.
 * Per spec AC-15: load() returns full unit details.
 */
export interface IWorkUnitService {
  /**
   * List all available WorkUnits.
   *
   * @param ctx - Workspace context for path resolution
   * @returns UnitListResult with array of unit summaries
   */
  list(ctx: WorkspaceContext): Promise<UnitListResult>;

  /**
   * Load a WorkUnit by slug.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Unit identifier to load
   * @returns UnitLoadResult with full unit details or E120 error
   */
  load(ctx: WorkspaceContext, slug: string): Promise<UnitLoadResult>;

  /**
   * Create a new WorkUnit with scaffolding.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Unique identifier for the new unit
   * @param type - Unit type: agent, code, or user-input
   * @returns UnitCreateResult with path to created unit
   */
  create(
    ctx: WorkspaceContext,
    slug: string,
    type: 'agent' | 'code' | 'user-input'
  ): Promise<UnitCreateResult>;

  /**
   * Validate a WorkUnit definition.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Unit identifier to validate
   * @returns UnitValidateResult with validation issues
   */
  validate(ctx: WorkspaceContext, slug: string): Promise<UnitValidateResult>;
}
