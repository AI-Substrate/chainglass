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

import { type IEventStorage, SessionIdValidationError, isValidSessionId } from '@chainglass/shared';
import { type NextRequest, NextResponse } from 'next/server';

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

// Note: In production, this would use the DI container to get EventStorageService
// For now, we export the factory for testing and the actual route handler below

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

  // TODO (T018): Get storage from DI container
  // For now, return a placeholder response
  // This will be wired up in T018 when we register EventStorageService in DI

  // Validate sessionId
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json(
      { error: 'Invalid session ID', code: 'INVALID_SESSION_ID' },
      { status: 400 }
    );
  }

  // Return placeholder until DI is wired
  return NextResponse.json(
    { events: [], count: 0, sessionId, _note: 'DI not yet wired (T018)' },
    { status: 200 }
  );
}
