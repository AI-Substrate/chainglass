/**
 * Workflow SDK barrel export.
 *
 * Import as: import { WorkflowApiClient, type IWorkflowApiClient } from '@chainglass/shared/sdk/workflow'
 *
 * Plan 076 Phase 4 Subtask 002: CG CLI Server Mode.
 */

// Interface + types
export type {
  IWorkflowApiClient,
  WorkflowApiClientConfig,
  WorkflowRunResult,
  WorkflowStopResult,
  WorkflowExecutionStatus,
  WorkflowDetailedStatus,
  DetailedNode,
  DetailedLine,
} from './workflow-api-client.interface.js';
export { WorkflowApiError } from './workflow-api-client.interface.js';

// Implementation
export { WorkflowApiClient } from './workflow-api-client.js';
