/**
 * ODS types: Orchestration Dispatch Service interface and dependencies.
 *
 * ODS is the "Act" step in the Settle → Decide → Act loop.
 * It receives an OrchestrationRequest from ONBAS and dispatches on type.
 * Only start-node does real work; the rest are no-ops or defensive errors.
 *
 * @see Workshop #12 (12-ods-design.md) — authoritative ODS reference
 * @packageDocumentation
 */

import type { IAgentAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { IPositionalGraphService } from '../../interfaces/positional-graph-service.interface.js';
import type { IAgentContextService } from './agent-context.types.js';
import type { OrchestrationRequest } from './orchestration-request.schema.js';
import type { OrchestrationExecuteResult } from './orchestration-request.types.js';
import type { IPodManager } from './pod-manager.types.js';
import type { PositionalGraphReality } from './reality.types.js';
import type { IScriptRunner } from './script-runner.types.js';

// ── IODS Interface ──────────────────────────────────

/**
 * Orchestration Dispatch Service — executes ONBAS decisions.
 *
 * ODS receives the full OrchestrationRequest from ONBAS and dispatches
 * on request.type. Today only start-node does real work; the rest are
 * no-ops or defensive errors. Fire-and-forget for start-node: reserve
 * the node, launch the pod, return immediately.
 */
export interface IODS {
  execute(
    request: OrchestrationRequest,
    ctx: WorkspaceContext,
    reality: PositionalGraphReality
  ): Promise<OrchestrationExecuteResult>;
}

// ── ODSDependencies ─────────────────────────────────

/**
 * Constructor dependencies for ODS.
 *
 * - graphService: startNode() to reserve the node (pending → starting)
 * - podManager: createPod() to create execution container
 * - contextService: getContextSource() for session inheritance
 * - agentAdapter: passed to podManager.createPod() for agent-type nodes
 * - scriptRunner: passed to podManager.createPod() for code-type nodes
 */
export interface ODSDependencies {
  readonly graphService: IPositionalGraphService;
  readonly podManager: IPodManager;
  readonly contextService: IAgentContextService;
  readonly agentAdapter: IAgentAdapter;
  readonly scriptRunner: IScriptRunner;
}
