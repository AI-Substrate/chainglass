/**
 * Result type exports.
 *
 * Exports all result interfaces for workflow commands.
 */

// Base types
export type { BaseResult, ResultError } from './base.types.js';

// Command-specific result types
export type {
  ComposeResult,
  PrepareResult,
  ValidateResult,
  FinalizeResult,
  // Supporting types
  ResolvedInput,
  CopiedFile,
  ValidatedFile,
  ValidatedOutput, // @deprecated alias
  PhaseInfo,
} from './command.types.js';
