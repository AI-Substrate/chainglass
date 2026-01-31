/**
 * WorkGraph Nodes API Route - /api/workspaces/[slug]/workgraphs/[graphSlug]/nodes
 *
 * POST handler to add nodes to a workgraph.
 * DELETE handler to remove nodes from a workgraph.
 *
 * Part of Plan 022: WorkGraph UI - Phase 3 (T012, T013)
 *
 * Per DYK#2: Two add patterns - addUnconnectedNode (UI) and addNodeAfter (CLI/agents)
 * Per DYK#4: Uses workspaceService.resolveContextFromParams() per Phase 2 pattern
 */

import { WORKGRAPH_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { IWorkGraphService } from '@chainglass/workgraph';
import type { NextRequest } from 'next/server';
import { broadcastGraphUpdated } from '../../../../../../../src/features/022-workgraph-ui/sse-broadcast';
import { getContainer } from '../../../../../../../src/lib/bootstrap-singleton';
import { isValidPath } from '../../../../../../../src/lib/utils';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
    graphSlug: string;
  }>;
}

/**
 * POST handler for adding a node to the graph.
 *
 * Body (CLI/agent pattern):
 * - afterNodeId: string - Node to add after
 * - unitSlug: string - Unit to instantiate
 *
 * Body (UI pattern - future):
 * - unitSlug: string - Unit to instantiate
 * - position: {x, y} - Position for the node
 *
 * Query params:
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with {nodeId, inputs} on success
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug, graphSlug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  // Validate worktree path to prevent path traversal
  if (!isValidPath(worktreePath ?? null)) {
    return Response.json(
      { errors: [{ code: 'E400', message: 'Invalid worktree path' }] },
      { status: 400 }
    );
  }

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const workgraphService = container.resolve<IWorkGraphService>(
    WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE
  );

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json(
        { errors: [{ code: 'E404', message: 'Workspace not found' }] },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { afterNodeId, unitSlug, position } = body;

    if (!unitSlug) {
      return Response.json(
        { errors: [{ code: 'E400', message: 'unitSlug is required' }] },
        { status: 400 }
      );
    }

    // Determine which add pattern to use
    if (afterNodeId) {
      // CLI/agent pattern: addNodeAfter
      const result = await workgraphService.addNodeAfter(context, graphSlug, afterNodeId, unitSlug);

      if (result.errors.length > 0) {
        const status = result.errors[0].code === 'E103' ? 400 : 500;
        return Response.json({ errors: result.errors }, { status });
      }

      // Broadcast SSE notification (per ADR-0007)
      broadcastGraphUpdated(graphSlug);

      return Response.json({
        nodeId: result.nodeId,
        inputs: result.inputs,
        errors: [],
      });
    }
    if (position) {
      // UI pattern: addUnconnectedNode
      const result = await workgraphService.addUnconnectedNode(context, graphSlug, unitSlug);

      if (result.errors.length > 0) {
        const status = result.errors[0].code === 'E120' ? 404 : 500;
        return Response.json({ errors: result.errors }, { status });
      }

      // Broadcast SSE notification (per ADR-0007)
      broadcastGraphUpdated(graphSlug);

      return Response.json({
        nodeId: result.nodeId,
        errors: [],
      });
    }
    return Response.json(
      { errors: [{ code: 'E400', message: 'Either afterNodeId or position is required' }] },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      `[/api/workspaces/${slug}/workgraphs/${graphSlug}/nodes] Error adding node:`,
      error
    );
    return Response.json(
      { errors: [{ code: 'E500', message: 'Internal server error' }] },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for removing a node from the graph.
 *
 * Query params:
 * - nodeId: string - Node to remove (required)
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with {removedNodes} on success
 */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug, graphSlug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;
  const nodeId = searchParams.get('nodeId');

  // Validate worktree path to prevent path traversal
  if (!isValidPath(worktreePath ?? null)) {
    return Response.json(
      { errors: [{ code: 'E400', message: 'Invalid worktree path' }] },
      { status: 400 }
    );
  }

  if (!nodeId) {
    return Response.json(
      { errors: [{ code: 'E400', message: 'nodeId query parameter is required' }] },
      { status: 400 }
    );
  }

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const workgraphService = container.resolve<IWorkGraphService>(
    WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE
  );

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json(
        { errors: [{ code: 'E404', message: 'Workspace not found' }] },
        { status: 404 }
      );
    }

    // Remove the node (no cascade per Phase 3 scope)
    const result = await workgraphService.removeNode(context, graphSlug, nodeId, {
      cascade: false,
    });

    if (result.errors.length > 0) {
      const status = result.errors[0].code === 'E102' ? 409 : 500; // E102 = has dependents
      return Response.json({ errors: result.errors }, { status });
    }

    // Broadcast SSE notification (per ADR-0007)
    broadcastGraphUpdated(graphSlug);

    return Response.json({
      removedNodes: result.removedNodes,
      errors: [],
    });
  } catch (error) {
    console.error(
      `[/api/workspaces/${slug}/workgraphs/${graphSlug}/nodes] Error removing node:`,
      error
    );
    return Response.json(
      { errors: [{ code: 'E500', message: 'Failed to remove node' }] },
      { status: 500 }
    );
  }
}
