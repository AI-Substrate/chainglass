/**
 * POST /api/event-popper/send-alert
 *
 * CLI-only route. Accepts an alert from an external agent/script.
 * Validates full request body (source + meta + payload) via SendAlertRequestSchema.
 * Returns { alertId } with 201 on success.
 */

// REQUIRED: requireLocalAuth(req) at top before business logic. (Plan 084 Phase 5)
import { handleSendAlert } from '@/features/067-question-popper/lib/route-helpers';
import { getContainer } from '@/lib/bootstrap-singleton';
import { requireLocalAuth } from '@/lib/local-auth';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireLocalAuth(request);
  if (!auth.ok) {
    const status =
      auth.reason === 'not-localhost' ? 403 : auth.reason === 'bootstrap-unavailable' ? 503 : 401;
    return NextResponse.json({ error: auth.reason }, { status });
  }

  const container = getContainer();
  const service = container.resolve<IQuestionPopperService>(
    WORKSPACE_DI_TOKENS.QUESTION_POPPER_SERVICE
  );

  return handleSendAlert(request, service);
}
