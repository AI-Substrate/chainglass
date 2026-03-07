/**
 * GET /api/event-popper/list
 *
 * Shared route. Returns all questions + alerts.
 * Supports ?status=pending filter and ?limit=N (default 100, DYK-05).
 */

import { auth } from '@/auth';
import { handleList } from '@/features/067-question-popper/lib/route-helpers';
import { getContainer } from '@/lib/bootstrap-singleton';
import { localhostGuard } from '@/lib/localhost-guard';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const guard = localhostGuard(request);
  if (guard) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const container = getContainer();
  const service = container.resolve<IQuestionPopperService>(
    WORKSPACE_DI_TOKENS.QUESTION_POPPER_SERVICE
  );

  return handleList(request, service);
}
