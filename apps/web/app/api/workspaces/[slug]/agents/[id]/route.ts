/**
 * Workspace Agent Session API Route - /api/workspaces/[slug]/agents/[id]
 *
 * DELETE handler that removes an agent session and its events.
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 *
 * Per DYK-03 (Phase 3): Uses atomic delete via fs.rmdir(sessionDir, { recursive: true }).
 * Per Discovery 04: Must have `export const dynamic = 'force-dynamic'` for DI container access.
 * Per Discovery 05: Session ID validation handled by adapter.
 * Per Discovery 11: Always await params before accessing route parameters (Next.js 16+).
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IAgentSessionService, IWorkspaceService } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
    id: string;
  }>;
}

/**
 * DELETE handler for removing an agent session.
 *
 * Per AC-14: Hard delete - permanently removes session and all associated events.
 *
 * @returns 204 No Content on success, 404 if session not found
 */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug, id } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sessionService = container.resolve<IAgentSessionService>(
    WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE
  );

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Delete session (atomic delete removes session.json and events.ndjson)
    const result = await sessionService.deleteSession(context, id);

    if (!result.success) {
      return Response.json(
        { error: result.errors[0]?.message || 'Session not found' },
        { status: 404 }
      );
    }

    // 204 No Content
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/agents/${id}] Error deleting session:`, error);
    return Response.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}

/**
 * GET handler for retrieving a single agent session.
 *
 * @returns JSON response with session details
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug, id } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sessionService = container.resolve<IAgentSessionService>(
    WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE
  );

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Get session
    const session = await sessionService.getSession(context, id);

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    return Response.json({
      session: {
        id: session.id,
        type: session.type,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      context: {
        workspaceSlug: context.workspaceSlug,
        worktreePath: context.worktreePath,
        worktreeBranch: context.worktreeBranch,
        isMainWorktree: context.isMainWorktree,
      },
    });
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/agents/${id}] Error getting session:`, error);
    return Response.json({ error: 'Failed to get session' }, { status: 500 });
  }
}
