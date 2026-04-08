/**
 * Workflow Detailed Status REST API.
 *
 * Plan 076 Phase 4 Subtask 001: Tier 1 endpoints.
 *
 * GET /api/workspaces/{slug}/workflows/{graphSlug}/detailed — rich per-node diagnostics
 *
 * Returns the same structure as `cg wf show --detailed --json`: per-node status with
 * timing, sessions, blockers. Uses getReality() — the sanctioned read-only contract.
 */

import type { NextRequest } from 'next/server';

import type { IOrchestrationService, IPositionalGraphService } from '@chainglass/positional-graph';
import {
  ORCHESTRATION_DI_TOKENS,
  POSITIONAL_GRAPH_DI_TOKENS,
  WORKSPACE_DI_TOKENS,
} from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { authenticateRequest } from '../execution/_resolve-worktree';

import { getContainer } from '../../../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ slug: string; graphSlug: string }> };

/** GET /detailed — Rich per-node diagnostics (timing, sessions, blockers). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { authenticated } = await authenticateRequest(request);
  if (!authenticated) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug, graphSlug } = await params;
  const worktreePath = request.nextUrl.searchParams.get('worktreePath');

  if (!worktreePath) {
    return Response.json(
      { ok: false, error: 'worktreePath query param is required' },
      { status: 400 }
    );
  }

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    // Validate workspace + worktree
    const info = await workspaceService.getInfo(slug);
    if (!info) {
      return Response.json({ ok: false, error: 'Unknown workspace' }, { status: 400 });
    }
    const match = info.worktrees.find((w) => w.path === worktreePath);
    if (!match) {
      return Response.json({ ok: false, error: 'Invalid worktree' }, { status: 400 });
    }

    // Resolve workspace context for service calls
    const ctx = await workspaceService.resolveContextFromParams(slug, match.path);
    if (!ctx) {
      return Response.json(
        { ok: false, error: 'Failed to resolve workspace context' },
        { status: 500 }
      );
    }

    // Get services
    const graphService = container.resolve<IPositionalGraphService>(
      POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE
    );
    const orchestrationService = container.resolve<IOrchestrationService>(
      ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE
    );

    // Build reality — same approach as CLI `wf show --detailed`
    const handle = await orchestrationService.get(ctx, graphSlug);
    const reality = await handle.getReality();
    const state = await graphService.loadGraphState(ctx, graphSlug);
    const statusResult = await graphService.getStatus(ctx, graphSlug);

    // Convert podSessions Map to plain object
    const sessions: Record<string, string> = {};
    for (const [nodeId, sessionId] of reality.podSessions ?? []) {
      sessions[nodeId] = sessionId;
    }

    // Build detailed response — mirrors CLI --detailed output structure
    const detailed = {
      slug: graphSlug,
      execution: {
        status: statusResult.status,
        totalNodes: statusResult.totalNodes,
        completedNodes: statusResult.completedNodes,
        progress:
          statusResult.totalNodes > 0
            ? `${Math.round((statusResult.completedNodes / statusResult.totalNodes) * 100)}%`
            : '0%',
      },
      lines: statusResult.lines.map((line) => ({
        id: line.lineId,
        label: line.label ?? '',
        nodes: line.nodes.map((node) => {
          const nodeState = state?.nodes?.[node.nodeId];
          const nodeReality = reality.nodes.get(node.nodeId);
          const blockedBy: string[] = [];
          if (nodeReality && !nodeReality.ready && nodeReality.readyDetail) {
            if (!nodeReality.readyDetail.precedingLinesComplete) blockedBy.push('preceding-lines');
            if (!nodeReality.readyDetail.inputsAvailable) blockedBy.push('inputs');
            if (!nodeReality.readyDetail.serialNeighborComplete) blockedBy.push('serial-neighbor');
          }
          return {
            id: node.nodeId,
            unitSlug: node.unitSlug,
            type: node.unitType,
            status: node.status,
            startedAt: nodeState?.started_at ?? null,
            completedAt: nodeState?.completed_at ?? null,
            error: nodeState?.error ?? null,
            sessionId: sessions[node.nodeId] ?? null,
            blockedBy,
          };
        }),
      })),
      questions: reality.pendingQuestions ?? [],
      sessions,
      errors: [],
    };

    return Response.json(detailed);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
