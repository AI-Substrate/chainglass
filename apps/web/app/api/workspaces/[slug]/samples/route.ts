/**
 * Workspace Samples API Route - /api/workspaces/[slug]/samples
 *
 * GET handler that returns samples for a workspace's worktree.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Per DYK-P6-02: Use WorkspaceService.resolveContextFromParams() for context construction.
 * Per DYK-P6-05: POST mutation moved to Server Actions.
 */

import { auth } from '@/auth';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { ISampleService, IWorkspaceService } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * GET handler for sample list.
 *
 * Query params:
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with samples array
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sampleService = container.resolve<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE);

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // List samples for the worktree
    const samples = await sampleService.list(context);

    return Response.json({
      samples: samples.map((s) => ({
        slug: s.slug,
        name: s.name,
        description: s.description,
        createdAt: s.createdAt.toISOString(),
      })),
      context: {
        workspaceSlug: context.workspaceSlug,
        worktreePath: context.worktreePath,
        worktreeBranch: context.worktreeBranch,
        isMainWorktree: context.isMainWorktree,
      },
    });
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/samples] Error listing samples:`, error);
    return Response.json({ error: 'Failed to list samples' }, { status: 500 });
  }
}
