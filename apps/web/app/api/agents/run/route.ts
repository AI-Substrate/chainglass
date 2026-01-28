/**
 * Agent Run API Route - /api/agents/run
 *
 * ⚠️ DEPRECATED: This route is being migrated to workspace-scoped URL.
 * See Plan 018: Agent Workspace Data Model Migration (T016-T017)
 *
 * New route will be: /api/workspaces/[slug]/agents/run
 *
 * POST handler that invokes AgentService with SSE streaming.
 * Broadcasts events to per-session SSE channel for real-time updates.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat, Subtask 001)
 * Extended for Plan 015: Event persistence (Phase 3: Notification-Fetch)
 *
 * Per DYK-01: SSE connection must be established BEFORE this endpoint is called
 * to avoid missing events (no buffering in SSEManager).
 *
 * Per DYK-05: Uses lazy singleton DI container via getContainer().
 *
 * Phase 3 Pattern (Notification-Fetch):
 * 1. Persist event to storage FIRST (source of truth)
 * 2. Broadcast notification (not full payload)
 * 3. Client fetches state via REST on notification
 */

import type { NextRequest } from 'next/server';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

/**
 * POST handler for agent run requests.
 *
 * @param request - Incoming request with JSON body
 * @returns JSON response with agent result
 */
export async function POST(_request: NextRequest): Promise<Response> {
  // Plan 018 T016: Route migration in progress
  // This route will be migrated to /api/workspaces/[slug]/agents/run
  return Response.json(
    {
      error: 'Route migration in progress',
      code: 'ROUTE_MIGRATING',
      newRoute: '/api/workspaces/[slug]/agents/run',
      migration: 'Plan 018: Agent Workspace Data Model Migration',
    },
    { status: 503 }
  );
}
