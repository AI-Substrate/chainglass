/**
 * DELETE /api/remote-view/sessions/[sessionId] — detach (close) a session (Plan 088 Phase 5, T005).
 *
 * Gated through `requireRemoteViewAccess` (NextAuth session OR Plan-084 `X-Local-Token` for the
 * CLI/MCP flow — F004; 401 before any service work). Detach is terminal + idempotent (the frozen
 * `IRemoteViewService` contract: an unknown/closed id is a no-op), so a successful call always 204s;
 * a daemon failure surfaces as a named 500.
 */
import { requireRemoteViewAccess } from '@/features/088-remote-view/server/remote-view-auth';
import {
  type IRemoteViewService,
  REMOTE_VIEW_SERVICE_TOKEN,
} from '@/features/088-remote-view/server/remote-view-service';
import { getContainer } from '@/lib/bootstrap-singleton';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const gate = await requireRemoteViewAccess(request);
  if (!gate.ok) return gate.response;

  const { sessionId } = await params;
  try {
    const service = getContainer().resolve<IRemoteViewService>(REMOTE_VIEW_SERVICE_TOKEN);
    await service.detach(sessionId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'detach failed';
    return NextResponse.json({ error: 'E_INTERNAL', message }, { status: 500 });
  }
}
