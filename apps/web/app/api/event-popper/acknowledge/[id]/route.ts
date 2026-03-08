/**
 * POST /api/event-popper/acknowledge/[id]
 *
 * Shared route. Acknowledges (marks as read) an alert.
 * Returns updated AlertOut. 404/409 on errors.
 */

import { auth } from '@/auth';
import { handleAcknowledge } from '@/features/067-question-popper/lib/route-helpers';
import { getContainer } from '@/lib/bootstrap-singleton';
import { localhostGuard } from '@/lib/localhost-guard';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const guard = localhostGuard(request);
  if (guard) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const container = getContainer();
  const service = container.resolve<IQuestionPopperService>(
    WORKSPACE_DI_TOKENS.QUESTION_POPPER_SERVICE
  );

  return handleAcknowledge(service, id);
}
