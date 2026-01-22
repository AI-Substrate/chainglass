/**
 * Command-specific result types.
 *
 * Each workflow/phase command has its own result type extending BaseResult.
 * Per spec § Output Adapter Architecture.
 */

import type { BaseResult, ResultError } from './base.types.js';

/**
 * Resolved input file information.
 */
export interface ResolvedInput {
  /** File name */
  name: string;
  /** Full path to the file */
  path: string;
  /** Whether the file exists */
  exists: boolean;
}

/**
 * File copied from a prior phase.
 */
export interface CopiedFile {
  /** Source file path */
  from: string;
  /** Destination file path */
  to: string;
}

/**
 * Validated output file information.
 */
export interface ValidatedOutput {
  /** File name */
  name: string;
  /** Full path to the file */
  path: string;
  /** Whether the file passed schema validation (if schema exists) */
  valid: boolean;
}

/**
 * Phase info returned in ComposeResult.
 */
export interface PhaseInfo {
  /** Phase name */
  name: string;
  /** Phase status after compose */
  status: 'pending';
  /** Phase order (1-based) */
  order: number;
}

/**
 * Result of `cg wf compose` command.
 *
 * Per AC-07a: Returns runDir, template, and phases array.
 */
export interface ComposeResult extends BaseResult {
  /** Path to the created run directory */
  runDir: string;
  /** Template slug that was used */
  template: string;
  /** List of phases created */
  phases: PhaseInfo[];
}

/**
 * Result of `cg phase prepare` command.
 *
 * Per spec § Output Adapter Architecture.
 */
export interface PrepareResult extends BaseResult {
  /** Phase name being prepared */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Preparation status */
  status: 'ready' | 'failed';
  /** Input file information */
  inputs: {
    /** List of required input names from wf.yaml */
    required: string[];
    /** Resolved input files */
    resolved: ResolvedInput[];
  };
  /** Files copied from prior phase outputs */
  copiedFromPrior: CopiedFile[];
}

/**
 * Result of `cg phase validate` command.
 *
 * Per spec § Output Adapter Architecture.
 */
export interface ValidateResult extends BaseResult {
  /** Phase name being validated */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Output file information */
  outputs: {
    /** List of required output names from wf.yaml */
    required: string[];
    /** Validated output files */
    validated: ValidatedOutput[];
  };
}

/**
 * Result of `cg phase finalize` command.
 *
 * Per spec § Output Adapter Architecture.
 */
export interface FinalizeResult extends BaseResult {
  /** Phase name being finalized */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Parameters extracted from outputs */
  extractedParams: Record<string, unknown>;
  /** Phase status after finalize */
  phaseStatus: 'complete';
}

// Re-export base types for convenience
export type { BaseResult, ResultError };
