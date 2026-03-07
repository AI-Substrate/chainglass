/**
 * POST /api/event-popper/ask-question
 *
 * CLI-only route. Accepts a question from an external agent/script.
 * Validates full request body (source + meta + payload) via AskQuestionRequestSchema.
 * Returns { questionId } with 201 on success.
 */

import { handleAskQuestion } from '@/features/067-question-popper/lib/route-helpers';
import { getContainer } from '@/lib/bootstrap-singleton';
import { localhostGuard } from '@/lib/localhost-guard';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const guard = localhostGuard(request);
  if (guard) return guard;

  const container = getContainer();
  const service = container.resolve<IQuestionPopperService>(
    WORKSPACE_DI_TOKENS.QUESTION_POPPER_SERVICE
  );

  return handleAskQuestion(request, service);
}
