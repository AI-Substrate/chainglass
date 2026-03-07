/**
 * GET /api/event-popper/question/[id]
 *
 * Shared route (CLI polls, UI reads). Returns QuestionOut for a specific question.
 * 404 if not found.
 */

import { auth } from '@/auth';
import { handleGetQuestion } from '@/features/067-question-popper/lib/route-helpers';
import { getContainer } from '@/lib/bootstrap-singleton';
import { localhostGuard } from '@/lib/localhost-guard';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  // DYK-R2-04: Localhost first (fast, sync), auth fallback (slow, async)
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

  return handleGetQuestion(service, id);
}
