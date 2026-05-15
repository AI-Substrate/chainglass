/**
 * POST /api/tmux/events
 *
 * Localhost-only route. Receives tmux state change events from the terminal
 * sidecar's monitor loop and broadcasts them via SSE to connected browser tabs.
 *
 * Plan 080: tmux Eventing System
 */

// REQUIRED: requireLocalAuth(req) at top before business logic. (Plan 084 Phase 5)
import { requireLocalAuth } from '@/lib/local-auth';
import { sseManager } from '@/lib/sse-manager';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const VALID_EVENTS = new Set([
  'BELL',
  'BUSY_START',
  'BUSY_END',
  'CMD_CHANGE',
  'TITLE_CHANGE',
  'DIR_CHANGE',
]);

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireLocalAuth(request);
  if (!auth.ok) {
    const status =
      auth.reason === 'not-localhost' ? 403 : auth.reason === 'bootstrap-unavailable' ? 503 : 401;
    return NextResponse.json({ error: auth.reason }, { status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  }

  const { session, pane, event, data } = body as Record<string, unknown>;

  if (typeof session !== 'string' || typeof pane !== 'string' || typeof event !== 'string') {
    return NextResponse.json(
      { error: 'Missing required fields: session, pane, event' },
      { status: 400 }
    );
  }

  if (!VALID_EVENTS.has(event)) {
    return NextResponse.json({ error: `Invalid event type: ${event}` }, { status: 400 });
  }

  sseManager.broadcast('tmux-events', event, {
    session,
    pane,
    data: data ?? {},
    ts: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
