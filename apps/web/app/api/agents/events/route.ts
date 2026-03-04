/**
 * SSE Route Handler - /api/agents/events
 *
 * Server-Sent Events endpoint for real-time agent updates.
 * Per ADR-0007: Single SSE channel at /api/agents/events with agentId filtering.
 * All agent events broadcast to 'agents' channel; clients filter by agentId.
 *
 * Event types:
 * - agent_status: {agentId, status: 'working'|'stopped'|'error'}
 * - agent_intent: {agentId, intent: string}
 * - agent_text_delta: {agentId, delta: string}
 * - agent_text_replace: {agentId, text: string}
 * - agent_text_append: {agentId, text: string}
 * - agent_question: {agentId, question: {...}}
 * - agent_created: {agentId, name, type, workspace}
 * - agent_terminated: {agentId}
 *
 * DYK-04: force-dynamic is required to prevent Next.js static optimization of streaming routes.
 */
import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sseManager } from '../../../../src/lib/sse-manager';

/** Force dynamic rendering - required for SSE streaming (DYK-04) */
export const dynamic = 'force-dynamic';

/** Heartbeat interval in milliseconds (30 seconds) */
const HEARTBEAT_INTERVAL = 30000;

/** Channel name for all agent events (per ADR-0007) */
const AGENTS_CHANNEL = 'agents';

/**
 * GET handler for agent SSE connections
 */
export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Optional agentId query param for server-side filtering (future optimization)
  // Current implementation: all events sent, client filters by agentId

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Add connection to SSEManager on 'agents' channel
      sseManager.addConnection(AGENTS_CHANNEL, controller);

      // Send initial heartbeat to confirm connection
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(': heartbeat\n\n'));

      // Setup heartbeat interval
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Controller might be closed
          clearInterval(heartbeatInterval);
          sseManager.removeConnection(AGENTS_CHANNEL, controller);
        }
      }, HEARTBEAT_INTERVAL);

      // Cleanup function for abort handling
      const cleanup = () => {
        clearInterval(heartbeatInterval);
        sseManager.removeConnection(AGENTS_CHANNEL, controller);
        try {
          controller.close();
        } catch {
          // Controller might already be closed
        }
      };

      // Handle already-aborted signal (P5: edge case)
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      // Register cleanup for future abort
      request.signal.addEventListener('abort', () => {
        cleanup();
      });
    },
    cancel() {
      // Stream was cancelled by client
      // Cleanup is handled by abort listener
    },
  });

  // Return SSE response with appropriate headers
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
