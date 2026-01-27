/**
 * Agent Events API Route
 *
 * GET /api/agents/sessions/:sessionId/events
 * Returns events for a session, optionally filtered by ?since=<eventId>
 *
 * Per AC19: ?since= returns only events after the specified ID
 * Per DYK-02: Validates sessionId to prevent path traversal
 * Per DYK-05: Uses FakeEventStorage in tests via factory function
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

import { type IEventStorage, isValidSessionId } from '@chainglass/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { getContainer } from '../../../../../../src/lib/bootstrap-singleton';
import { DI_TOKENS } from '../../../../../../src/lib/di-container';

/**
 * Response format for events endpoint.
 */
interface EventsResponse {
  events: unknown[];
  count: number;
  sessionId: string;
}

/**
 * Error response format.
 */
interface ErrorResponse {
  error: string;
  code?: string;
}

/**
 * Query parameters for the events endpoint.
 */
interface QueryParams {
  since?: string;
}

/**
 * Creates a route handler with dependency injection.
 * Used for testing with FakeEventStorage.
 *
 * @param storage IEventStorage implementation
 * @returns Object with GET handler
 */
export function createEventsRouteHandler(storage: IEventStorage) {
  return {
    /**
     * GET handler for retrieving events.
     *
     * @param sessionId Session identifier
     * @param query Query parameters ({ since?: string })
     * @returns Response with events array
     */
    async GET(sessionId: string, query: QueryParams): Promise<Response> {
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

        if (query.since) {
          // Get events since specified ID (AC19)
          try {
            events = await storage.getSince(sessionId, query.since);
          } catch (error) {
            // Event ID not found
            const response: ErrorResponse = {
              error: `Event ID not found: ${query.since}`,
              code: 'EVENT_NOT_FOUND',
            };
            return NextResponse.json(response, { status: 400 });
          }
        } else {
          // Get all events
          events = await storage.getAll(sessionId);
        }

        const response: EventsResponse = {
          events,
          count: events.length,
          sessionId,
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

// ============================================
// Next.js Route Handler
// ============================================

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/sessions/:sessionId/events
 *
 * Query params:
 * - since: Event ID to fetch events after (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  // In Next.js 16, params is a Promise
  const { sessionId } = await params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since') ?? undefined;

  // Get storage from DI container
  const container = getContainer();
  const eventStorage = container.resolve<IEventStorage>(DI_TOKENS.EVENT_STORAGE);

  // Use the factory handler
  const handler = createEventsRouteHandler(eventStorage);
  return handler.GET(sessionId, { since }) as Promise<NextResponse>;
}
