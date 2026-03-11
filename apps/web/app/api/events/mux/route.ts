/**
 * SSE Multiplexed Route Handler - /api/events/mux
 *
 * Multiplexed SSE endpoint that registers a single controller on multiple
 * channels. Clients connect with ?channels=a,b,c and receive events from
 * ALL requested channels over one EventSource connection.
 *
 * Plan 072: SSE Multiplexing — Phase 1
 * DYK-04: force-dynamic required to prevent Next.js static optimization.
 * DEV-03: 15s heartbeat (reduced from 30s) to survive proxy idle timeouts.
 */
import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { SSEManager } from '../../../../src/lib/sse-manager';
import { sseManager } from '../../../../src/lib/sse-manager';

export const dynamic = 'force-dynamic';

/** Heartbeat interval — 15s to survive proxy idle timeouts (DEV-03) */
export const HEARTBEAT_INTERVAL = 15_000;

/** Maximum channels per connection */
export const MAX_CHANNELS = 20;

/** Channel name validation pattern */
export const CHANNEL_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Injectable dependencies for testability */
export interface MuxDeps {
  authFn: () => Promise<unknown>;
  manager: SSEManager;
}

const defaultDeps: MuxDeps = {
  authFn: auth,
  manager: sseManager,
};

/**
 * Core handler — injectable for testing.
 * Route GET() delegates here with real deps; tests inject fakes.
 */
export async function handleMuxRequest(
  request: NextRequest,
  deps: MuxDeps = defaultDeps
): Promise<Response> {
  const session = await deps.authFn();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channelsParam = request.nextUrl.searchParams.get('channels');
  if (!channelsParam) {
    return new Response('Missing channels query parameter', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Parse, deduplicate, validate
  const channels = [...new Set(channelsParam.split(',').filter(Boolean))];

  if (channels.length === 0) {
    return new Response('No valid channels provided', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (channels.length > MAX_CHANNELS) {
    return new Response(`Too many channels (max ${MAX_CHANNELS}, got ${channels.length})`, {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  for (const ch of channels) {
    if (!CHANNEL_PATTERN.test(ch)) {
      return new Response(`Invalid channel name: ${ch}`, {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  const { manager } = deps;

  const stream = new ReadableStream({
    start(controller) {
      for (const ch of channels) {
        manager.addConnection(ch, controller);
      }
      console.debug(`[SSE-MUX] Client connected to channels [${channels.join(', ')}]`);

      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(': heartbeat\n\n'));

      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeatInterval);
          manager.removeControllerFromAllChannels(controller);
        }
      }, HEARTBEAT_INTERVAL);

      const cleanup = () => {
        clearInterval(heartbeatInterval);
        const removed = manager.removeControllerFromAllChannels(controller);
        console.debug(`[SSE-MUX] Client disconnected from channels [${removed.join(', ')}]`);
        try {
          controller.close();
        } catch {
          // Controller might already be closed
        }
      };

      if (request.signal.aborted) {
        cleanup();
        return;
      }

      request.signal.addEventListener('abort', () => {
        cleanup();
      });
    },
    cancel() {
      // Stream cancelled by client — cleanup handled by abort listener
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  return handleMuxRequest(request);
}
