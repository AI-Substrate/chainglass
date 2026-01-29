/**
 * WorkUnit List API Route - /api/workspaces/[slug]/units
 *
 * GET handler that returns available WorkUnits for a workspace's worktree.
 *
 * Part of Plan 022: WorkGraph UI - Phase 3 (T002)
 *
 * Per CD-09: WorkUnit discovery via WorkUnitService.list()
 * Per DYK#4: Uses workspaceService.resolveContextFromParams() per Phase 2 pattern
 */

import { WORKGRAPH_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { IWorkUnitService } from '@chainglass/workgraph';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * GET handler for WorkUnit list.
 *
 * Query params:
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with units array
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const workunitService = container.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json(
        { units: [], errors: [{ code: 'E404', message: 'Workspace not found' }] },
        { status: 404 }
      );
    }

    // List units for the worktree
    const result = await workunitService.list(context);

    if (result.errors.length > 0) {
      return Response.json({ units: [], errors: result.errors }, { status: 500 });
    }

    return Response.json({
      units: result.units,
      errors: [],
    });
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/units] Error listing units:`, error);
    return Response.json(
      { units: [], errors: [{ code: 'E500', message: 'Failed to list units' }] },
      { status: 500 }
    );
  }
}
