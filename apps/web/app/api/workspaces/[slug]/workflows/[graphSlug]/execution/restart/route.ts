/**
 * Workflow Execution Restart REST API.
 *
 * Plan 076 Phase 4 Subtask 001: Tier 1 endpoints.
 *
 * POST /api/workspaces/{slug}/workflows/{graphSlug}/execution/restart — restart workflow
 */

import type { NextRequest } from 'next/server';

import { getWorkflowExecutionManager } from '../../../../../../../../src/features/074-workflow-execution/get-manager';
import { authenticateRequest, resolveValidatedWorktreePath } from '../_resolve-worktree';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ slug: string; graphSlug: string }> };

/** POST /execution/restart — Restart a workflow (stop + reset + start). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { authenticated } = await authenticateRequest(request);
  if (!authenticated) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug, graphSlug } = await params;

  let worktreePath: string;
  try {
    const body = await request.json();
    worktreePath = body.worktreePath;
  } catch {
    return Response.json(
      { ok: false, error: 'Request body must include worktreePath' },
      { status: 400 }
    );
  }

  if (!worktreePath || typeof worktreePath !== 'string') {
    return Response.json({ ok: false, error: 'worktreePath is required' }, { status: 400 });
  }

  const validatedPath = await resolveValidatedWorktreePath(slug, worktreePath);
  if (!validatedPath) {
    return Response.json({ ok: false, error: 'Invalid workspace or worktree' }, { status: 400 });
  }

  try {
    const manager = getWorkflowExecutionManager();
    const result = await manager.restart(
      { workspaceSlug: slug, worktreePath: validatedPath },
      graphSlug
    );
    return Response.json({ ok: result.started, key: result.key });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
