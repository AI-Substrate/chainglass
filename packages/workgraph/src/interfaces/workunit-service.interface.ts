/**
 * IWorkUnitService interface for managing WorkUnits.
 *
 * WorkUnits are reusable templates stored in `.chainglass/units/`.
 * This service provides list, load, create, and validate operations.
 *
 * Per spec AC-14, AC-15: Users can list and view unit details.
 * Per Critical Discovery 02: All methods return results with errors array.
 */

import type { BaseResult, ResultError } from '@chainglass/shared';

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
 * Input declaration for a WorkUnit.
 */
export interface InputDeclaration {
  /** Input name (lowercase, underscores allowed) */
  name: string;
  /** Input type: data or file */
  type: 'data' | 'file';
  /** Data type (required when type='data') */
  dataType?: 'text' | 'number' | 'boolean' | 'json';
  /** Whether this input is required */
  required: boolean;
  /** Human-readable description */
  description?: string;
}

/**
 * Output declaration for a WorkUnit.
 */
export interface OutputDeclaration {
  /** Output name (lowercase, underscores allowed) */
  name: string;
  /** Output type: data or file */
  type: 'data' | 'file';
  /** Data type (required when type='data') */
  dataType?: 'text' | 'number' | 'boolean' | 'json';
  /** Whether this output is required */
  required: boolean;
  /** Human-readable description */
  description?: string;
}

/**
 * Agent-specific configuration for AgentUnit.
 */
export interface AgentConfig {
  /** Path to prompt template relative to unit folder */
  promptTemplate: string;
  /** Optional system prompt prefix */
  systemPrompt?: string;
  /** Supported agent types (defaults to all) */
  supportedAgents?: ('claude-code' | 'copilot')[];
  /** Estimated token budget (informational) */
  estimatedTokens?: number;
}

/**
 * Code-specific configuration for CodeUnit.
 */
export interface CodeConfig {
  /** Execution timeout in seconds (default: 60) */
  timeout?: number;
}

/**
 * User input option for single/multi choice questions.
 */
export interface UserInputOption {
  /** Single letter key (A, B, C, etc.) */
  key: string;
  /** Display label */
  label: string;
  /** Optional longer description */
  description?: string;
}

/**
 * User input configuration for UserInputUnit.
 */
export interface UserInputConfig {
  /** Question type */
  questionType: 'text' | 'single' | 'multi' | 'confirm';
  /** Prompt text (may contain {{config.X}} placeholders) */
  prompt: string;
  /** Options for single/multi choice */
  options?: UserInputOption[] | string;
}

/**
 * Full WorkUnit definition.
 */
export interface WorkUnit {
  /** Unique unit identifier */
  slug: string;
  /** Unit type */
  type: 'agent' | 'code' | 'user-input';
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** Input declarations */
  inputs: InputDeclaration[];
  /** Output declarations */
  outputs: OutputDeclaration[];
  /** Agent configuration (when type='agent') */
  agent?: AgentConfig;
  /** Code configuration (when type='code') */
  code?: CodeConfig;
  /** User input configuration (when type='user-input') */
  userInput?: UserInputConfig;
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
   * @returns UnitListResult with array of unit summaries
   */
  list(): Promise<UnitListResult>;

  /**
   * Load a WorkUnit by slug.
   *
   * @param slug - Unit identifier to load
   * @returns UnitLoadResult with full unit details or E120 error
   */
  load(slug: string): Promise<UnitLoadResult>;

  /**
   * Create a new WorkUnit with scaffolding.
   *
   * @param slug - Unique identifier for the new unit
   * @param type - Unit type: agent, code, or user-input
   * @returns UnitCreateResult with path to created unit
   */
  create(slug: string, type: 'agent' | 'code' | 'user-input'): Promise<UnitCreateResult>;

  /**
   * Validate a WorkUnit definition.
   *
   * @param slug - Unit identifier to validate
   * @returns UnitValidateResult with validation issues
   */
  validate(slug: string): Promise<UnitValidateResult>;
}
