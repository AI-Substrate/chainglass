/**
 * Plan 037: Test Graph Infrastructure — Assertions
 *
 * Graph-specific assertion functions for integration tests.
 * Throw descriptive errors on failure, pass silently on success.
 */

import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import type { WorkspaceContext } from '@chainglass/workflow';

/**
 * Asserts the graph status is 'complete'.
 * Uses getStatus() which computes status from all node states.
 */
export async function assertGraphComplete(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string
): Promise<void> {
  const status = await service.getStatus(ctx, graphSlug);
  if (status.status !== 'complete') {
    const detail = `completedNodes=${status.completedNodes}/${status.totalNodes}`;
    throw new Error(
      `Expected graph '${graphSlug}' to be complete, but status is '${status.status}' (${detail})`
    );
  }
}

/**
 * Asserts a specific node has status 'complete'.
 */
export async function assertNodeComplete(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string
): Promise<void> {
  const nodeStatus = await service.getNodeStatus(ctx, graphSlug, nodeId);
  if (nodeStatus.status !== 'complete') {
    throw new Error(
      `Expected node '${nodeId}' to be complete, but status is '${nodeStatus.status}'`
    );
  }
}

/**
 * Asserts a specific output has been saved on a node.
 * Uses canEnd() which reports savedOutputs and missingOutputs.
 */
export async function assertOutputExists(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  outputName: string
): Promise<void> {
  const canEnd = await service.canEnd(ctx, graphSlug, nodeId);
  if (!canEnd.savedOutputs.includes(outputName)) {
    throw new Error(
      `Expected output '${outputName}' on node '${nodeId}', but saved outputs are: [${canEnd.savedOutputs.join(', ')}]`
    );
  }
}

/**
 * Asserts a specific node has status 'blocked-error'.
 */
export async function assertNodeFailed(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string
): Promise<void> {
  const nodeStatus = await service.getNodeStatus(ctx, graphSlug, nodeId);
  if (nodeStatus.status !== 'blocked-error') {
    throw new Error(
      `Expected node '${nodeId}' to be blocked-error, but status is '${nodeStatus.status}'`
    );
  }
}

/**
 * Asserts a specific node has status 'waiting-question'.
 */
export async function assertNodeWaitingQuestion(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string
): Promise<void> {
  const nodeStatus = await service.getNodeStatus(ctx, graphSlug, nodeId);
  if (nodeStatus.status !== 'waiting-question') {
    throw new Error(
      `Expected node '${nodeId}' to be waiting-question, but status is '${nodeStatus.status}'`
    );
  }
}
