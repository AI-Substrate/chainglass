/**
 * IInstanceService — contract for workflow instance lifecycle queries.
 *
 * Instances are self-contained copies of templates with their own
 * runtime state. This service provides status queries.
 *
 * Per Constitution P2: Interface defined before implementation.
 */

import type { ResultError } from '@chainglass/shared';
import type { InstanceMetadata } from '../schemas/instance-metadata.schema.js';
import type { WorkspaceContext } from './workspace-context.interface.js';

/** Instance status with runtime information */
export interface InstanceStatus {
  metadata: InstanceMetadata;
  graphStatus: 'pending' | 'in_progress' | 'complete' | 'failed' | 'not_created';
  hasActiveRun: boolean;
}

/** Result of getting instance status */
export interface GetStatusResult {
  data: InstanceStatus | null;
  errors: ResultError[];
}

export interface IInstanceService {
  /**
   * Get the status of a workflow instance, including its runtime graph state.
   * Returns metadata + graph execution status + whether a run is active.
   */
  getStatus(
    ctx: WorkspaceContext,
    templateSlug: string,
    instanceId: string
  ): Promise<GetStatusResult>;
}
