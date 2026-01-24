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
 * Validated file information.
 * (Renamed from ValidatedOutput per DYK Insight #2 - used for both inputs and outputs)
 */
export interface ValidatedFile {
  /** File name */
  name: string;
  /** Full path to the file */
  path: string;
  /** Whether the file passed schema validation (if schema exists) */
  valid: boolean;
}

/**
 * @deprecated Use ValidatedFile instead. Kept for backward compatibility.
 */
export type ValidatedOutput = ValidatedFile;

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
 * Per DYK Insight #2: Added `check` field, renamed `outputs` → `files`.
 */
export interface ValidateResult extends BaseResult {
  /** Phase name being validated */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** What was validated: 'inputs' or 'outputs' */
  check: 'inputs' | 'outputs';
  /** File validation results */
  files: {
    /** List of required file names from wf-phase.yaml */
    required: string[];
    /** Validated files */
    validated: ValidatedFile[];
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

// ==================== Handover Command Results ====================
// Per Phase 3 Subtask 002: Accept/Handover/Preflight CLI Commands

/**
 * Facilitator type - who currently controls the phase.
 */
export type Facilitator = 'agent' | 'orchestrator';

/**
 * Phase state values for accept/handover operations.
 */
export type PhaseState =
  | 'pending'
  | 'ready'
  | 'active'
  | 'accepted'
  | 'blocked'
  | 'complete'
  | 'failed';

/**
 * Status entry recorded in wf-phase.json.
 */
export interface StatusEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Who performed the action */
  from: Facilitator;
  /** Action type */
  action: string;
  /** Optional comment/reason */
  comment?: string;
  /** Optional additional data */
  data?: Record<string, unknown>;
}

/**
 * Result of `cg phase accept` command.
 *
 * Per Phase 3 Subtask 002: Agent logs taking control of a phase.
 */
export interface AcceptResult extends BaseResult {
  /** Phase name being accepted */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Current facilitator (should be 'agent' after accept) */
  facilitator: Facilitator;
  /** Phase state after accept */
  state: PhaseState;
  /** Status entry that was appended */
  statusEntry: StatusEntry;
}

/**
 * Preflight check results.
 */
export interface PreflightChecks {
  /** Whether phase config is valid */
  configValid: boolean;
  /** Whether all required inputs exist */
  inputsExist: boolean;
  /** Whether all inputs with schemas are valid */
  schemasValid: boolean;
}

/**
 * Result of `cg phase preflight` command.
 *
 * Per Phase 3 Subtask 002: Agent validates readiness before work.
 */
export interface PreflightResult extends BaseResult {
  /** Phase name being preflighted */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Preflight check results */
  checks: PreflightChecks;
  /** Status entry that was appended */
  statusEntry: StatusEntry;
}

/**
 * Result of `cg phase handover` command.
 *
 * Per Phase 3 Subtask 002: Transfer control between agent and orchestrator.
 */
export interface HandoverResult extends BaseResult {
  /** Phase name being handed over */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Who had control before handover */
  fromFacilitator: Facilitator;
  /** Who has control after handover */
  toFacilitator: Facilitator;
  /** Phase state after handover */
  state: PhaseState;
  /** Status entry that was appended */
  statusEntry: StatusEntry;
}

// Re-export base types for convenience
export type { BaseResult, ResultError };
