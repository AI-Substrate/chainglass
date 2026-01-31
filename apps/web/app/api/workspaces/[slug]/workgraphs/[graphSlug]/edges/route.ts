/**
 * WorkGraph Edges API Route - /api/workspaces/[slug]/workgraphs/[graphSlug]/edges
 *
 * POST handler to create edges between nodes.
 * DELETE handler to remove edges between nodes.
 *
 * Part of Plan 022: WorkGraph UI - Phase 3 (T014, T014a)
 *
 * Per DYK#5: Uses canConnect() for type validation before persisting
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
 * POST handler for creating an edge between nodes.
 *
 * Body:
 * - source: string - Source node ID
 * - sourceHandle: string - Output handle name
 * - target: string - Target node ID
 * - targetHandle: string - Input handle name
 *
 * Query params:
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with {connected: true} on success, E103 on type mismatch
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug, graphSlug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  // Validate worktree path to prevent path traversal
  if (!isValidPath(worktreePath ?? null)) {
    return Response.json(
      { connected: false, errors: [{ code: 'E400', message: 'Invalid worktree path' }] },
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
        { connected: false, errors: [{ code: 'E404', message: 'Workspace not found' }] },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { source, sourceHandle, target, targetHandle } = body;

    if (!source || !target) {
      return Response.json(
        { connected: false, errors: [{ code: 'E400', message: 'source and target are required' }] },
        { status: 400 }
      );
    }

    // Default handles to empty string if not provided
    const srcHandle = sourceHandle ?? '';
    const tgtHandle = targetHandle ?? '';

    // Per DYK#5: Use canConnect() for validation
    const canConnectResult = await workgraphService.canConnect(
      context,
      graphSlug,
      source,
      srcHandle,
      target,
      tgtHandle
    );

    if (!canConnectResult.valid) {
      return Response.json({ connected: false, errors: canConnectResult.errors }, { status: 400 });
    }

    // Load the graph to check for existing edge
    const loadResult = await workgraphService.load(context, graphSlug);
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      return Response.json({ connected: false, errors: loadResult.errors }, { status: 404 });
    }

    // Check if edge already exists
    const graph = loadResult.graph;
    const edgeExists = graph.edges.some((e) => e.from === source && e.to === target);
    if (edgeExists) {
      return Response.json(
        { connected: false, errors: [{ code: 'E105', message: 'Edge already exists' }] },
        { status: 409 }
      );
    }

    // Create edge via WorkGraphService.connectNodes()
    const connectResult = await workgraphService.connectNodes(context, graphSlug, source, target);

    if (connectResult.errors.length > 0) {
      const status = connectResult.errors[0].code === 'E107' ? 404 : 400;
      return Response.json({ connected: false, errors: connectResult.errors }, { status });
    }

    // Broadcast SSE notification (per ADR-0007)
    broadcastGraphUpdated(graphSlug);

    return Response.json({
      connected: true,
      edgeId: connectResult.edgeId,
      errors: [],
    });
  } catch (error) {
    console.error(
      `[/api/workspaces/${slug}/workgraphs/${graphSlug}/edges] Error creating edge:`,
      error
    );
    return Response.json(
      { connected: false, errors: [{ code: 'E500', message: 'Failed to create edge' }] },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for removing an edge between nodes.
 *
 * Query params:
 * - source: string - Source node ID
 * - target: string - Target node ID
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with {removed: true} on success
 */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug, graphSlug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;
  const source = searchParams.get('source');
  const target = searchParams.get('target');

  // Validate worktree path to prevent path traversal
  if (!isValidPath(worktreePath ?? null)) {
    return Response.json(
      { removed: false, errors: [{ code: 'E400', message: 'Invalid worktree path' }] },
      { status: 400 }
    );
  }

  if (!source || !target) {
    return Response.json(
      {
        removed: false,
        errors: [{ code: 'E400', message: 'source and target query params required' }],
      },
      { status: 400 }
    );
  }

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const workgraphService = container.resolve<IWorkGraphService>(
    WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE
  );

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json(
        { removed: false, errors: [{ code: 'E404', message: 'Workspace not found' }] },
        { status: 404 }
      );
    }

    // TODO: Implement edge removal via WorkGraphService
    // Need to extend WorkGraphService with disconnectNodes() method
    return Response.json(
      {
        removed: false,
        errors: [{ code: 'E501', message: 'Edge removal not yet implemented' }],
      },
      { status: 501 }
    );
  } catch (error) {
    console.error(
      `[/api/workspaces/${slug}/workgraphs/${graphSlug}/edges] Error removing edge:`,
      error
    );
    return Response.json(
      { removed: false, errors: [{ code: 'E500', message: 'Failed to remove edge' }] },
      { status: 500 }
    );
  }
}
