/**
 * SSE Route Handler - /api/events/[channel]
 *
 * Server-Sent Events endpoint for real-time updates.
 * Clients connect via EventSource to receive workflow_status, task_update, and heartbeat events.
 *
 * DYK-04: force-dynamic is required to prevent Next.js static optimization of streaming routes.
 */
import type { NextRequest } from 'next/server';
import { sseManager } from '../../../../src/lib/sse-manager';

/** Force dynamic rendering - required for SSE streaming (DYK-04) */
export const dynamic = 'force-dynamic';

/** Heartbeat interval in milliseconds (30 seconds) */
const HEARTBEAT_INTERVAL = 30000;

/**
 * GET handler for SSE connections
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
): Promise<Response> {
  const { channel } = await params;

  // Validate channel parameter (P6: security boundary)
  if (!channel || !/^[a-zA-Z0-9_-]+$/.test(channel)) {
    return new Response('Invalid channel name', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Add connection to SSEManager
      sseManager.addConnection(channel, controller);
      console.debug(
        `[SSE] Client connected to channel "${channel}" (total: ${sseManager.getConnectionCount(channel)})`
      );

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
          sseManager.removeConnection(channel, controller);
        }
      }, HEARTBEAT_INTERVAL);

      // Cleanup function for abort handling
      const cleanup = () => {
        clearInterval(heartbeatInterval);
        sseManager.removeConnection(channel, controller);
        console.debug(
          `[SSE] Client disconnected from channel "${channel}" (remaining: ${sseManager.getConnectionCount(channel)})`
        );
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
