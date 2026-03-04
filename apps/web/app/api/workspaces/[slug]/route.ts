/**
 * Workspace Detail API Route - /api/workspaces/[slug]
 *
 * GET handler that returns workspace info with worktrees.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Per DYK-P6-05: DELETE mutation moved to Server Actions.
 */

import { auth } from '@/auth';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { NextResponse } from 'next/server';
import { getContainer } from '../../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * GET handler for workspace detail.
 *
 * @returns JSON response with workspace info including worktrees
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  try {
    const info = await workspaceService.getInfo(slug);

    if (!info) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return Response.json({
      workspace: {
        slug: info.slug,
        name: info.name,
        path: info.path,
        createdAt: info.createdAt.toISOString(),
        hasGit: info.hasGit,
        worktrees: info.worktrees,
      },
    });
  } catch (error) {
    console.error(`[/api/workspaces/${slug}] Error getting workspace:`, error);
    return Response.json({ error: 'Failed to get workspace' }, { status: 500 });
  }
}
