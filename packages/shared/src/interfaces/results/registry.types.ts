/**
 * Workflow registry result types.
 *
 * Per Phase 1 T006: Result types for IWorkflowRegistry operations.
 * Follows the ComposeResult pattern from command.types.ts.
 */

import type { BaseResult } from './base.types.js';

/**
 * Checkpoint version information.
 *
 * Represents a single checkpoint in a workflow's version history.
 */
export interface CheckpointInfo {
  /** Checkpoint ordinal (1, 2, 3, ...) */
  ordinal: number;
  /** Content hash (8-char SHA-256 prefix) */
  hash: string;
  /** Full version string (e.g., "v001-abc12345") */
  version: string;
  /** ISO8601 timestamp when checkpoint was created */
  createdAt: string;
  /** Optional comment describing the checkpoint */
  comment?: string;
}

/**
 * Summary information for a workflow.
 *
 * Used in list() results to provide overview without full details.
 */
export interface WorkflowSummary {
  /** Workflow slug (directory name) */
  slug: string;
  /** Human-readable name from workflow.json */
  name: string;
  /** Workflow description (optional) */
  description?: string;
  /** Number of checkpoints available */
  checkpointCount: number;
}

/**
 * Detailed workflow information.
 *
 * Used in info() results to provide complete workflow details.
 */
export interface WorkflowInfo {
  /** Workflow slug (directory name) */
  slug: string;
  /** Human-readable name from workflow.json */
  name: string;
  /** Workflow description (optional) */
  description?: string;
  /** ISO8601 timestamp when workflow was created */
  createdAt: string;
  /** ISO8601 timestamp of last update (optional) */
  updatedAt?: string;
  /** Array of tags for categorization */
  tags: string[];
  /** Workflow author (optional) */
  author?: string;
  /** Number of checkpoints */
  checkpointCount: number;
  /** Checkpoint version history (sorted by ordinal descending - newest first) */
  versions: CheckpointInfo[];
}

/**
 * Result of IWorkflowRegistry.list() operation.
 *
 * Returns a summary of all workflows in the registry.
 */
export interface ListResult extends BaseResult {
  /** Array of workflow summaries (empty if no workflows) */
  workflows: WorkflowSummary[];
}

/**
 * Result of IWorkflowRegistry.info() operation.
 *
 * Returns detailed information about a specific workflow.
 */
export interface InfoResult extends BaseResult {
  /** Workflow information (undefined if not found - check errors) */
  workflow?: WorkflowInfo;
}

/**
 * Result of IWorkflowRegistry.checkpoint() operation.
 *
 * Returns information about the created checkpoint.
 * (Phase 2 - defined here for type completeness)
 */
export interface CheckpointResult extends BaseResult {
  /** Checkpoint ordinal (e.g., 1, 2, 3) */
  ordinal: number;
  /** Content hash (8-char SHA-256 prefix) */
  hash: string;
  /** Full version string (e.g., "v001-abc12345") */
  version: string;
  /** Path to the created checkpoint directory */
  checkpointPath: string;
  /** ISO8601 timestamp when checkpoint was created */
  createdAt: string;
}

/**
 * Result of IWorkflowRegistry.restore() operation.
 *
 * Returns information about the restored version.
 * (Phase 2 - defined here for type completeness)
 */
export interface RestoreResult extends BaseResult {
  /** Workflow slug */
  slug: string;
  /** Version that was restored */
  version: string;
  /** Path to current/ directory that was updated */
  currentPath: string;
}

/**
 * Result of IWorkflowRegistry.versions() operation.
 *
 * Returns the version history of a workflow.
 * (Phase 2 - defined here for type completeness)
 */
export interface VersionsResult extends BaseResult {
  /** Workflow slug */
  slug: string;
  /** Version history (sorted by ordinal descending) */
  versions: CheckpointInfo[];
}
