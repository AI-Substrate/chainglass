/**
 * Extended result types for WorkflowService with optional Workflow entity.
 *
 * Per Phase 6: Service Unification & Validation.
 * Per DYK-01: Keep Result types, add optional `workflowEntity?: Workflow` field.
 *
 * These types extend the base Result types from @chainglass/shared to include
 * the Workflow entity when IWorkflowAdapter is injected into WorkflowService.
 *
 * Using separate types avoids circular dependency:
 * - @chainglass/shared defines base Result types (no Workflow reference)
 * - @chainglass/workflow defines extended types with Workflow entity
 */

import type { ComposeResult } from '@chainglass/shared';
import type { Workflow } from '../entities/workflow.js';

/**
 * ComposeResult with optional Workflow entity.
 *
 * When WorkflowService is constructed with IWorkflowAdapter, the compose() method
 * will load and include the Workflow entity reflecting the created run state.
 */
export interface ComposeResultWithEntity extends ComposeResult {
  /** Workflow entity loaded after compose (only present if IWorkflowAdapter injected) */
  workflowEntity?: Workflow;
}
