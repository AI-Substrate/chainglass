/**
 * Agent Events API Route - /api/workspaces/[slug]/agents/sessions/[sessionId]/events
 *
 * GET handler that returns events for a session, optionally filtered by ?since=<eventId>
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 2)
 * Migrated from /api/agents/sessions/[sessionId]/events to workspace-scoped URL.
 *
 * Per AC19: ?since= returns only events after the specified ID
 * Per DYK-02: Validates sessionId to prevent path traversal
 * Per DYK-05: Uses FakeAgentEventAdapter in tests via DI container
 */

import { WORKSPACE_DI_TOKENS, isValidSessionId } from '@chainglass/shared';
import type { IAgentEventAdapter, IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';
import { type NextRequest, NextResponse } from 'next/server';
import { getContainer } from '../../../../../../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
    sessionId: string;
  }>;
}

/**
 * Response format for events endpoint.
 */
interface EventsResponse {
  events: unknown[];
  count: number;
  sessionId: string;
  context: {
    workspaceSlug: string;
    worktreePath: string;
    worktreeBranch: string | null;
    isMainWorktree: boolean;
  };
}

/**
 * Error response format.
 */
interface ErrorResponse {
  error: string;
  code?: string;
}

/**
 * Creates a route handler with dependency injection.
 * Used for testing with FakeAgentEventAdapter.
 *
 * @param eventAdapter IAgentEventAdapter implementation
 * @returns Object with GET handler
 */
export function createEventsRouteHandler(eventAdapter: IAgentEventAdapter) {
  return {
    /**
     * GET handler for retrieving events.
     *
     * @param context Workspace context
     * @param sessionId Session identifier
     * @param since Optional event ID to fetch events after
     * @returns Response with events array
     */
    async GET(
      context: WorkspaceContext,
      sessionId: string,
      since?: string
    ): Promise<NextResponse<EventsResponse | ErrorResponse>> {
      // Validate sessionId
      if (!isValidSessionId(sessionId)) {
        const response: ErrorResponse = {
          error: 'Invalid session ID',
          code: 'INVALID_SESSION_ID',
        };
        return NextResponse.json(response, { status: 400 });
      }

      try {
        let events: unknown[];

        if (since) {
          // Get events since specified ID (AC19)
          // getSince throws if event ID not found
          try {
            events = await eventAdapter.getSince(context, sessionId, since);
          } catch (error) {
            // Event ID not found
            const response: ErrorResponse = {
              error: `Event ID not found: ${since}`,
              code: 'EVENT_NOT_FOUND',
            };
            return NextResponse.json(response, { status: 400 });
          }
        } else {
          // Get all events
          events = await eventAdapter.getAll(context, sessionId);
        }

        const response: EventsResponse = {
          events,
          count: events.length,
          sessionId,
          context: {
            workspaceSlug: context.workspaceSlug,
            worktreePath: context.worktreePath,
            worktreeBranch: context.worktreeBranch,
            isMainWorktree: context.isMainWorktree,
          },
        };

        return NextResponse.json(response, { status: 200 });
      } catch (error) {
        // Unexpected error
        console.error('[events/route] Error fetching events:', error);
        const response: ErrorResponse = {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        };
        return NextResponse.json(response, { status: 500 });
      }
    },
  };
}

/**
 * GET /api/workspaces/[slug]/agents/sessions/[sessionId]/events
 *
 * Query params:
 * - since: Event ID to fetch events after (optional)
 * - worktree: Path to worktree (defaults to main worktree)
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { slug, sessionId } = await params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since') ?? undefined;
  const worktreePath = searchParams.get('worktree') ?? undefined;

  // Get services from DI container
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const eventAdapter = container.resolve<IAgentEventAdapter>(
    WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER
  );

  // Resolve workspace context from URL params
  let context: WorkspaceContext | null;
  try {
    context = await workspaceService.resolveContextFromParams(slug, worktreePath);
  } catch (error) {
    console.error(
      `[/api/workspaces/${slug}/agents/sessions/${sessionId}/events] Failed to resolve workspace:`,
      error
    );
    return NextResponse.json({ error: 'Failed to resolve workspace' }, { status: 500 });
  }

  if (!context) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Use the factory handler
  const handler = createEventsRouteHandler(eventAdapter);
  return handler.GET(context, sessionId, since);
}
