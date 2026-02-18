/**
 * ODS — Orchestration Dispatch Service.
 *
 * The "Act" step in the Settle → Decide → Act loop.
 * Receives an OrchestrationRequest from ONBAS and dispatches on type.
 * Only start-node does real work; no-action is a pass-through;
 * resume-node and question-pending are defensive errors (dead code paths).
 *
 * Fire-and-forget: pod.execute() is called but NOT awaited.
 * The agent communicates through events; the loop discovers results via Settle.
 *
 * @see Workshop #12 (12-ods-design.md) — authoritative ODS reference
 * @packageDocumentation
 */

import { join } from 'node:path';
import type { IAgentInstance } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { IODS, ODSDependencies } from './ods.types.js';
import type { OrchestrationRequest, StartNodeRequest } from './orchestration-request.schema.js';
import type { OrchestrationExecuteResult } from './orchestration-request.types.js';
import type { NodeReality, PositionalGraphReality } from './reality.types.js';

export class ODS implements IODS {
  constructor(private readonly deps: ODSDependencies) {}

  async execute(
    request: OrchestrationRequest,
    ctx: WorkspaceContext,
    reality: PositionalGraphReality
  ): Promise<OrchestrationExecuteResult> {
    switch (request.type) {
      case 'start-node':
        return this.handleStartNode(request, ctx, reality);

      case 'no-action':
        return { ok: true, request };

      // Not implemented — Q&A handled by event system (Plan 032), not ODS dispatch
      case 'resume-node':
      case 'question-pending':
        return {
          ok: false,
          error: {
            code: 'UNSUPPORTED_REQUEST_TYPE',
            message: `ODS does not handle '${request.type}'`,
          },
          request,
        };

      default: {
        const _exhaustive: never = request;
        return {
          ok: false,
          error: { code: 'UNKNOWN_REQUEST_TYPE', message: 'Unknown request type' },
          request: _exhaustive,
        };
      }
    }
  }

  private async handleStartNode(
    request: StartNodeRequest,
    ctx: WorkspaceContext,
    reality: PositionalGraphReality
  ): Promise<OrchestrationExecuteResult> {
    const { nodeId } = request;

    // 1. Look up node in reality
    const node = reality.nodes.get(nodeId);
    if (!node) {
      return {
        ok: false,
        error: { code: 'NODE_NOT_FOUND', message: `Node ${nodeId} not in reality`, nodeId },
        request,
      };
    }

    // 2. User-input nodes are a UI concern — ODS does not start them
    if (node.unitType === 'user-input') {
      return { ok: true, request };
    }

    // 3. Validate readiness — ODS does not blindly trust ONBAS
    if (!node.ready) {
      return {
        ok: false,
        error: { code: 'NODE_NOT_READY', message: `Node ${nodeId} is not ready`, nodeId },
        request,
      };
    }

    return this.handleAgentOrCode(request, ctx, reality, node);
  }

  private async handleAgentOrCode(
    request: StartNodeRequest,
    ctx: WorkspaceContext,
    reality: PositionalGraphReality,
    node: NodeReality
  ): Promise<OrchestrationExecuteResult> {
    const { nodeId } = request;

    // 1. Reserve the node (pending → starting or restart-pending → starting)
    const startResult = await this.deps.graphService.startNode(ctx, request.graphSlug, nodeId);
    if (startResult.errors.length > 0) {
      return {
        ok: false,
        error: { code: 'START_NODE_FAILED', message: startResult.errors[0].message, nodeId },
        request,
      };
    }

    // 2. Create pod (agent nodes go through manager, code nodes use runner directly)
    let podParams: Awaited<ReturnType<typeof this.buildPodParams>>;
    try {
      podParams = await this.buildPodParams(node, ctx, reality);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'POD_CREATION_FAILED',
          message: err instanceof Error ? err.message : String(err),
          nodeId,
        },
        request,
      };
    }
    const pod = this.deps.podManager.createPod(nodeId, podParams);

    // 3. Fire and forget — DO NOT await
    pod.execute({
      inputs: request.inputs,
      ctx: { worktreePath: ctx.worktreePath },
      graphSlug: request.graphSlug,
    });

    return { ok: true, request, newStatus: 'starting', sessionId: pod.sessionId };
  }

  private async buildPodParams(
    node: NodeReality,
    ctx: WorkspaceContext,
    reality: PositionalGraphReality
  ) {
    if (node.unitType === 'agent') {
      const agentType = reality.settings?.agentType ?? 'copilot';
      const contextResult = this.deps.contextService.getContextSource(reality, node.nodeId);

      let agentInstance: IAgentInstance | undefined;
      if (contextResult.source === 'inherit') {
        const sessionId = this.deps.podManager.getSessionId(contextResult.fromNodeId);
        if (sessionId) {
          agentInstance = this.deps.agentManager.getWithSessionId(sessionId, {
            name: node.unitSlug,
            type: agentType,
            workspace: ctx.worktreePath,
          });
        }
      }

      if (!agentInstance) {
        agentInstance = this.deps.agentManager.getNew({
          name: node.unitSlug,
          type: agentType,
          workspace: ctx.worktreePath,
        });
      }

      return {
        unitType: 'agent' as const,
        unitSlug: node.unitSlug,
        agentInstance,
      };
    }

    // Code type — resolve script path from work unit config
    const loadResult = await this.deps.workUnitService.load(ctx, node.unitSlug);
    if (loadResult.errors.length > 0 || !loadResult.unit || loadResult.unit.type !== 'code') {
      const msg =
        loadResult.errors[0]?.message ??
        `Work unit '${node.unitSlug}' not found or not a code unit`;
      throw new Error(`SCRIPT_PATH_RESOLUTION_FAILED: ${msg}`);
    }
    const scriptPath = join(
      ctx.worktreePath,
      '.chainglass',
      'units',
      node.unitSlug,
      loadResult.unit.code.script
    );

    return {
      unitType: 'code' as const,
      unitSlug: node.unitSlug,
      runner: this.deps.scriptRunner,
      scriptPath,
    };
  }
}
