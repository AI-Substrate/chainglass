/**
 * TypeScript types matching wf-status.schema.json
 * Schema for workflow run status tracking (wf-run/wf-status.json)
 */

/**
 * Overall run status
 */
export type RunStatus = 'pending' | 'active' | 'complete' | 'failed';

/**
 * Phase status in the run
 */
export type PhaseRunStatus =
  | 'pending'
  | 'ready'
  | 'active'
  | 'blocked'
  | 'accepted'
  | 'complete'
  | 'failed';

/**
 * Workflow metadata in run status
 */
export interface WfStatusWorkflow {
  /** Workflow template name (slug format) */
  name: string;
  /** Semantic version of the workflow template */
  version: string;
  /** Relative or absolute path to the source template */
  template_path: string;
}

/**
 * Run metadata
 */
export interface WfStatusRun {
  /** Unique run identifier (e.g., 'run-example-001') */
  id: string;
  /** ISO-8601 timestamp when run was created */
  created_at: string;
  /** Overall run status */
  status: RunStatus;
}

/**
 * Phase status entry in run status
 */
export interface WfStatusPhase {
  /** Execution order (1-based) */
  order: number;
  /** Current phase status */
  status: PhaseRunStatus;
  /** ISO-8601 timestamp when phase started */
  started_at?: string;
  /** ISO-8601 timestamp when phase completed */
  completed_at?: string;
}

/**
 * Workflow run status (wf-run/wf-status.json)
 */
export interface WfStatus {
  /** Workflow metadata */
  workflow: WfStatusWorkflow;
  /** Run metadata */
  run: WfStatusRun;
  /** Phase status entries keyed by phase name */
  phases: Record<string, WfStatusPhase>;
}
