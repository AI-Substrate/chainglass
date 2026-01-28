/**
 * Workspace Agent Events API Route - /api/workspaces/[slug]/agents/[id]/events
 *
 * GET handler that returns events for an agent session.
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 *
 * Per Discovery 04: Must have `export const dynamic = 'force-dynamic'` for DI container access.
 * Per Discovery 11: Always await params before accessing route parameters (Next.js 16+).
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IAgentEventAdapter, IWorkspaceService } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../../../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
    id: string;
  }>;
}

/**
 * GET handler for agent session events.
 *
 * Query params:
 * - since: Event ID to start from (exclusive, for pagination)
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns NDJSON response with events array
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug, id } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;
  const since = searchParams.get('since') ?? undefined;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const eventAdapter = container.resolve<IAgentEventAdapter>(
    WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER
  );

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Check if session exists (events directory exists)
    const exists = await eventAdapter.exists(context, id);
    if (!exists) {
      // Session might exist but have no events yet - that's ok
      // Check if session directory exists at the adapter level
      return Response.json({
        events: [],
        context: {
          workspaceSlug: context.workspaceSlug,
          worktreePath: context.worktreePath,
        },
      });
    }

    // Get events
    const events = since
      ? await eventAdapter.getSince(context, id, since)
      : await eventAdapter.getAll(context, id);

    return Response.json({
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        data: e.data,
      })),
      context: {
        workspaceSlug: context.workspaceSlug,
        worktreePath: context.worktreePath,
      },
    });
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/agents/${id}/events] Error getting events:`, error);
    return Response.json({ error: 'Failed to get events' }, { status: 500 });
  }
}
