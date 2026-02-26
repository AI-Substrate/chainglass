/**
 * Shared types for the workflow-ui domain.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import type { ResultError } from '@chainglass/shared';

export interface WorkflowSummary {
  slug: string;
  description?: string;
  lineCount: number;
  nodeCount: number;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
}

export interface ListWorkflowsResult {
  workflows: WorkflowSummary[];
  errors: ResultError[];
}

export interface LoadWorkflowResult {
  graphStatus?: import('@chainglass/positional-graph').GraphStatusResult;
  definition?: import('@chainglass/positional-graph').PGLoadResult['definition'];
  errors: ResultError[];
}

export interface CreateWorkflowResult {
  graphSlug?: string;
  errors: ResultError[];
}

export interface ListWorkUnitsResult {
  units: import('@chainglass/positional-graph').WorkUnitSummary[];
  errors: ResultError[];
}
