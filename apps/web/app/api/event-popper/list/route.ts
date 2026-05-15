/**
 * GET /api/event-popper/list
 *
 * Shared route. Returns all questions + alerts.
 * Supports ?status=pending filter and ?limit=N (default 100, DYK-05).
 *
 * REQUIRED: requireLocalAuth(req) at top before business logic. (Plan 084 Phase 5)
 */

import { handleList } from '@/features/067-question-popper/lib/route-helpers';
import { getContainer } from '@/lib/bootstrap-singleton';
import { requireLocalAuth } from '@/lib/local-auth';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
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

  return handleList(request, service);
}
