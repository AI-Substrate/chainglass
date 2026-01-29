/**
 * WorkGraph List API Route - /api/workspaces/[slug]/workgraphs
 *
 * GET handler that returns workgraph list for a workspace's worktree.
 *
 * Part of Plan 022: WorkGraph UI - Phase 2
 *
 * Per DYK#1: Routes under /api/workspaces/[slug]/workgraphs/...
 * Per DYK#5: listGraphs() returns [] (stub) - handled gracefully
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import type { IWorkGraphUIService } from '../../../../../src/features/022-workgraph-ui';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';
import { DI_TOKENS } from '../../../../../src/lib/di-container';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * GET handler for workgraph list.
 *
 * Query params:
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with graphSlugs array
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug } = await params;
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

    // List graphs for the worktree
    const result = await workgraphService.listGraphs(context);

    if (result.errors.length > 0) {
      return Response.json({ error: result.errors[0].message }, { status: 500 });
    }

    return Response.json({
      graphSlugs: result.graphSlugs,
      context: {
        workspaceSlug: context.workspaceSlug,
        worktreePath: context.worktreePath,
        worktreeBranch: context.worktreeBranch,
        isMainWorktree: context.isMainWorktree,
      },
    });
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/workgraphs] Error listing workgraphs:`, error);
    return Response.json({ error: 'Failed to list workgraphs' }, { status: 500 });
  }
}
