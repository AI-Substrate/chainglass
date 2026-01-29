/**
 * WorkGraph Edges API Route - /api/workspaces/[slug]/workgraphs/[graphSlug]/edges
 *
 * POST handler to create edges between nodes.
 * DELETE handler to remove edges between nodes.
 *
 * Part of Plan 022: WorkGraph UI - Phase 3 (T014)
 *
 * Per DYK#5: Uses canConnect() for type validation before persisting
 * Per DYK#4: Uses workspaceService.resolveContextFromParams() per Phase 2 pattern
 */

import { WORKGRAPH_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { IWorkGraphService } from '@chainglass/workgraph';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../../../../../src/lib/bootstrap-singleton';

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

    // Per DYK#5: Check if canConnect() exists and use it for validation
    // If not implemented yet, fall back to direct edge creation
    // TODO: T014a will add canConnect() to IWorkGraphService
    // For now, we'll validate by trying to load the graph and checking types

    // Load the graph to get current state
    const loadResult = await workgraphService.load(context, graphSlug);
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      return Response.json({ connected: false, errors: loadResult.errors }, { status: 404 });
    }

    // Check if both nodes exist
    const graph = loadResult.graph;
    if (!graph.nodes.includes(source)) {
      return Response.json(
        {
          connected: false,
          errors: [{ code: 'E102', message: `Source node '${source}' not found` }],
        },
        { status: 404 }
      );
    }
    if (!graph.nodes.includes(target)) {
      return Response.json(
        {
          connected: false,
          errors: [{ code: 'E102', message: `Target node '${target}' not found` }],
        },
        { status: 404 }
      );
    }

    // Check if edge already exists
    const edgeExists = graph.edges.some((e) => e.from === source && e.to === target);
    if (edgeExists) {
      return Response.json(
        { connected: false, errors: [{ code: 'E105', message: 'Edge already exists' }] },
        { status: 409 }
      );
    }

    // TODO: Proper edge creation via WorkGraphService
    // For now, return not implemented since we need T014a canConnect() first
    // The actual edge creation will wire inputs/outputs based on name matching

    // Temporary: Direct edge addition not supported yet
    // Need to extend WorkGraphService with connectNodes() method
    return Response.json(
      {
        connected: false,
        errors: [
          { code: 'E501', message: 'Direct edge creation not yet implemented - use addNodeAfter' },
        ],
      },
      { status: 501 }
    );
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
