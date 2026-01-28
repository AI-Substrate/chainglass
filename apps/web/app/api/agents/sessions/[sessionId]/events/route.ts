/**
 * Agent Events API Route
 *
 * GET /api/agents/sessions/:sessionId/events
 *
 * ⚠️ DEPRECATED: This route is being migrated to workspace-scoped URL.
 * See Plan 018: Agent Workspace Data Model Migration (T016-T017)
 *
 * New route will be: /api/workspaces/[slug]/agents/sessions/[sessionId]/events
 *
 * Returns events for a session, optionally filtered by ?since=<eventId>
 *
 * Per AC19: ?since= returns only events after the specified ID
 * Per DYK-02: Validates sessionId to prevent path traversal
 * Per DYK-05: Uses FakeEventStorage in tests via factory function
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

import { type NextRequest, NextResponse } from 'next/server';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/sessions/:sessionId/events
 *
 * Query params:
 * - since: Event ID to fetch events after (optional)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  // In Next.js 16, params is a Promise
  const { sessionId } = await params;

  // Plan 018 T017: Route migration in progress
  // This route will be migrated to /api/workspaces/[slug]/agents/sessions/[sessionId]/events
  return NextResponse.json(
    {
      error: 'Route migration in progress',
      code: 'ROUTE_MIGRATING',
      sessionId,
      newRoute: '/api/workspaces/[slug]/agents/sessions/[sessionId]/events',
      migration: 'Plan 018: Agent Workspace Data Model Migration',
    },
    { status: 503 }
  );
}
