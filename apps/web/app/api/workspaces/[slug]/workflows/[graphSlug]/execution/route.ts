/**
 * Workflow Execution REST API — start / status / stop.
 *
 * Plan 076 Phase 4 Subtask 001: Tier 1 endpoints.
 *
 * POST   /api/workspaces/{slug}/workflows/{graphSlug}/execution — start workflow
 * GET    /api/workspaces/{slug}/workflows/{graphSlug}/execution — poll execution status
 * DELETE /api/workspaces/{slug}/workflows/{graphSlug}/execution — stop workflow
 *
 * Thin wrappers around WorkflowExecutionManager — same logic as the server actions
 * but callable via HTTP (harness SDK, curl, future CLI --server mode).
 */

import type { NextRequest } from 'next/server';

import { auth } from '@/auth';

import { getWorkflowExecutionManager } from '../../../../../../../src/features/074-workflow-execution/get-manager';
import { resolveValidatedWorktreePath } from './_resolve-worktree';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ slug: string; graphSlug: string }> };

/** POST /execution — Start a workflow execution. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const session = await auth();
  if (!session) {
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
    const result = await manager.start(
      { workspaceSlug: slug, worktreePath: validatedPath },
      graphSlug
    );
    return Response.json(
      { ok: result.started, key: result.key, already: result.already },
      { status: result.already ? 409 : 200 }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/** GET /execution — Poll current execution status. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug, graphSlug } = await params;
  const worktreePath = request.nextUrl.searchParams.get('worktreePath');

  if (!worktreePath) {
    return Response.json(
      { ok: false, error: 'worktreePath query param is required' },
      { status: 400 }
    );
  }

  const validatedPath = await resolveValidatedWorktreePath(slug, worktreePath);
  if (!validatedPath) {
    return Response.json({ ok: false, error: 'Invalid workspace or worktree' }, { status: 400 });
  }

  try {
    const manager = getWorkflowExecutionManager();
    const status = manager.getSerializableStatus(validatedPath, graphSlug);
    return Response.json(status ?? null);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/** DELETE /execution — Stop a running workflow. */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const session = await auth();
  if (!session) {
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
    const result = await manager.stop(validatedPath, graphSlug);
    return Response.json({ ok: true, stopped: result.stopped });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
