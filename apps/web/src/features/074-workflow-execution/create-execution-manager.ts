/**
 * Factory: creates WorkflowExecutionManager from DI container.
 * Plan 074: Workflow Execution from Web UI — Phase 2.
 *
 * Called from instrumentation.ts during server bootstrap.
 * Resolves all deps from the web DI container.
 */

import type { IOrchestrationService, IPositionalGraphService } from '@chainglass/positional-graph';
import {
  ORCHESTRATION_DI_TOKENS,
  POSITIONAL_GRAPH_DI_TOKENS,
  WORKSPACE_DI_TOKENS,
} from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { SSEManagerBroadcaster } from '../../features/019-agent-manager-refactor/sse-manager-broadcaster';
import { getContainer } from '../../lib/bootstrap-singleton';
import { sseManager } from '../../lib/sse-manager';
import { createFileExecutionRegistry } from './execution-registry';
import { WorkflowExecutionManager } from './workflow-execution-manager';

export async function createWorkflowExecutionManager(): Promise<WorkflowExecutionManager> {
  const container = getContainer();

  const deps = {
    orchestrationService: container.resolve<IOrchestrationService>(
      ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE
    ),
    graphService: container.resolve<IPositionalGraphService>(
      POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE
    ),
    workspaceService: container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE),
    broadcaster: new SSEManagerBroadcaster(sseManager),
    registry: createFileExecutionRegistry(),
  };

  return new WorkflowExecutionManager(deps);
}
