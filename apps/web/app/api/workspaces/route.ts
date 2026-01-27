/**
 * Workspaces API Route - /api/workspaces
 *
 * GET handler that returns list of registered workspaces.
 * Supports ?include=worktrees query param for enriched response.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Per DYK-P6-04: Single enriched endpoint avoids N+1 API calls for sidebar.
 * Per DYK-P6-05: Mutations (POST) moved to Server Actions.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService, WorkspaceInfo } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

/**
 * Response type for workspace list.
 * Matches Workspace.toJSON() output with optional worktrees.
 */
interface WorkspaceListItem {
  slug: string;
  name: string;
  path: string;
  createdAt: string;
  /** Only present when ?include=worktrees is specified */
  worktrees?: Array<{
    path: string;
    head: string;
    branch: string | null;
    isDetached: boolean;
    isBare: boolean;
    isPrunable: boolean;
  }>;
  /** Only present when ?include=worktrees is specified */
  hasGit?: boolean;
}

/**
 * GET handler for workspace list.
 *
 * Query params:
 * - include=worktrees: Include worktree information for each workspace
 *
 * @returns JSON response with workspace list
 */
export async function GET(request: NextRequest): Promise<Response> {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  // Check if enriched response requested
  const { searchParams } = new URL(request.url);
  const includeWorktrees = searchParams.get('include') === 'worktrees';

  try {
    const workspaces = await workspaceService.list();

    if (includeWorktrees) {
      // Fetch worktree info for each workspace
      const enrichedWorkspaces: WorkspaceListItem[] = await Promise.all(
        workspaces.map(async (ws) => {
          const info = await workspaceService.getInfo(ws.slug);
          return {
            slug: ws.slug,
            name: ws.name,
            path: ws.path,
            createdAt: ws.createdAt.toISOString(),
            hasGit: info?.hasGit ?? false,
            worktrees: info?.worktrees ?? [],
          };
        })
      );

      return Response.json({ workspaces: enrichedWorkspaces });
    }

    // Basic response without worktrees
    const basicWorkspaces: WorkspaceListItem[] = workspaces.map((ws) => ({
      slug: ws.slug,
      name: ws.name,
      path: ws.path,
      createdAt: ws.createdAt.toISOString(),
    }));

    return Response.json({ workspaces: basicWorkspaces });
  } catch (error) {
    console.error('[/api/workspaces] Error listing workspaces:', error);
    return Response.json({ error: 'Failed to list workspaces' }, { status: 500 });
  }
}
