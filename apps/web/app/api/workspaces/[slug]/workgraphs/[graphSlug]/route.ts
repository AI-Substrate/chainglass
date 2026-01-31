/**
 * WorkGraph Detail API Route - /api/workspaces/[slug]/workgraphs/[graphSlug]
 *
 * GET handler that returns full workgraph data for visualization.
 *
 * Part of Plan 022: WorkGraph UI - Phase 2
 *
 * Per DYK#1: Routes under /api/workspaces/[slug]/workgraphs/...
 * Per DYK#2: Returns serialized JSON (nodes, edges), not instance
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import type {
  IWorkGraphUIService,
  UIEdge,
  UINodeState,
} from '../../../../../../src/features/022-workgraph-ui';
import { getContainer } from '../../../../../../src/lib/bootstrap-singleton';
import { DI_TOKENS } from '../../../../../../src/lib/di-container';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
    graphSlug: string;
  }>;
}

/**
 * Serialized node for JSON response.
 */
interface SerializedNode {
  id: string;
  status: string;
  position: { x: number; y: number };
  unit?: string;
  type?: 'start';
  questionId?: string;
  errorMessage?: string;
}

/**
 * GET handler for single workgraph.
 *
 * Query params:
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with graph data (nodes, edges)
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug, graphSlug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const workgraphService = container.resolve<IWorkGraphUIService>(DI_TOKENS.WORKGRAPH_UI_SERVICE);

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Get instance for the graph
    const instance = await workgraphService.getInstance(context, graphSlug);

    // Serialize nodes from Map to array
    const nodes: SerializedNode[] = [];
    for (const node of instance.nodes.values()) {
      nodes.push({
        id: node.id,
        status: node.status,
        position: node.position,
        unit: node.unit,
        type: node.type,
        questionId: node.questionId,
        errorMessage: node.errorMessage,
      });
    }

    // Edges are already serializable
    const edges: UIEdge[] = instance.edges;

    return Response.json({
      graphSlug: instance.graphSlug,
      nodes,
      edges,
      context: {
        workspaceSlug: context.workspaceSlug,
        worktreePath: context.worktreePath,
        worktreeBranch: context.worktreeBranch,
        isMainWorktree: context.isMainWorktree,
      },
    });
  } catch (error) {
    // Check if it's a "graph not found" type error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
      return Response.json({ error: `WorkGraph '${graphSlug}' not found` }, { status: 404 });
    }

    console.error(
      `[/api/workspaces/${slug}/workgraphs/${graphSlug}] Error loading workgraph:`,
      error
    );
    return Response.json({ error: 'Failed to load workgraph' }, { status: 500 });
  }
}
