/**
 * Shared types for the workflow-ui domain.
 *
 * Phase 2+3: Canvas Core + Layout, Drag-and-Drop + Persistence — Plan 050
 */

import type {
  GraphStatusResult,
  PGLoadResult,
  WorkUnitSummary,
} from '@chainglass/positional-graph';
import type { ResultError } from '@chainglass/shared';

// ─── Query Results ───────────────────────────────────────────────────

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
  graphStatus?: GraphStatusResult;
  definition?: PGLoadResult['definition'];
  errors: ResultError[];
}

export interface CreateWorkflowResult {
  graphSlug?: string;
  errors: ResultError[];
}

export interface ListWorkUnitsResult {
  units: WorkUnitSummary[];
  errors: ResultError[];
}

// ─── Mutation Results ────────────────────────────────────────────────

export interface MutationResult {
  graphStatus?: GraphStatusResult;
  errors: ResultError[];
}

export interface AddNodeMutationResult extends MutationResult {
  nodeId?: string;
}

export interface TemplateSummary {
  slug: string;
  description?: string;
}

export interface ListTemplatesResult {
  templates: TemplateSummary[];
  errors: ResultError[];
}

export interface InstantiateTemplateResult {
  instanceId?: string;
  graphSlug?: string;
  errors: ResultError[];
}

// ─── DnD Types (Phase 3) ────────────────────────────────────────────

export interface ToolboxDragData {
  type: 'toolbox-unit';
  unitSlug: string;
  unitType: 'agent' | 'code' | 'user-input';
}

export interface NodeDragData {
  type: 'canvas-node';
  nodeId: string;
  lineId: string;
  position: number;
}

export type WorkflowDragData = ToolboxDragData | NodeDragData;
