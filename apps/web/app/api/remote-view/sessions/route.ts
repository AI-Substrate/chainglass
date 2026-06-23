/**
 * /api/remote-view/sessions — session CRUD proxy (Plan 088 Phase 5, T005).
 *
 * NextAuth-gated through the shared `requireRemoteViewSession` gate — the 401 is returned
 * BEFORE any service work (a route that skipped the gate could not reach the session table).
 * GET lists the active sessions; POST `{ windowId }` attaches/creates one. Attach is **idempotent
 * per window** (the frozen `IRemoteViewService` contract — single-viewer v1), and POST is the
 * create path the Phase 3 session hook's R6 auto-recreate calls. The route proxies the DI-resolved
 * `IRemoteViewService` (the daemon-backed adapter in prod, `FakeRemoteViewService` in tests); a
 * malformed body is a named 400 `E_BAD_BODY` (mirrors the daemon), a daemon failure a named 500.
 */
import { requireRemoteViewSession } from '@/features/088-remote-view/server/remote-view-auth';
import {
  type IRemoteViewService,
  REMOTE_VIEW_SERVICE_TOKEN,
} from '@/features/088-remote-view/server/remote-view-service';
import { getContainer } from '@/lib/bootstrap-singleton';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** `POST /sessions` body — `{ windowId }` is the only field (mirrors the daemon's create contract). */
const AttachBodySchema = z.object({ windowId: z.number().int() });

export async function GET(): Promise<NextResponse> {
  const gate = await requireRemoteViewSession();
  if (!gate.ok) return gate.response;

  try {
    const service = getContainer().resolve<IRemoteViewService>(REMOTE_VIEW_SERVICE_TOKEN);
    return NextResponse.json({ sessions: service.list() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'session list failed';
    return NextResponse.json({ error: 'E_INTERNAL', message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireRemoteViewSession();
  if (!gate.ok) return gate.response;

  const parsed = AttachBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'E_BAD_BODY', message: 'expected { windowId: number }' },
      { status: 400 }
    );
  }

  try {
    const service = getContainer().resolve<IRemoteViewService>(REMOTE_VIEW_SERVICE_TOKEN);
    const summary = await service.attach(parsed.data.windowId);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'attach failed';
    return NextResponse.json({ error: 'E_INTERNAL', message }, { status: 500 });
  }
}
