/**
 * PR View API Route — aggregated diff data + reviewed state management
 *
 * GET  /api/pr-view?worktree=...&mode=working|branch
 * POST /api/pr-view  { worktree, filePath, action: 'mark'|'unmark' }
 * DELETE /api/pr-view { worktree }
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function validateWorktree(worktree: string | null): Response | null {
  if (!worktree) {
    return NextResponse.json({ error: 'Missing worktree parameter' }, { status: 400 });
  }
  if (!worktree.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(worktree)) {
    return NextResponse.json({ error: 'Invalid worktree path' }, { status: 400 });
  }
  if (worktree.includes('..')) {
    return NextResponse.json({ error: 'Path traversal not allowed' }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const worktree = searchParams.get('worktree');
  const validationError = validateWorktree(worktree);
  if (validationError) return validationError;
  const validWorktree = worktree as string;

  const mode = searchParams.get('mode') ?? 'working';
  if (mode !== 'working' && mode !== 'branch') {
    return NextResponse.json({ error: `Invalid mode: ${mode}` }, { status: 400 });
  }

  try {
    const { aggregatePRViewData } = await import(
      '../../../src/features/071-pr-view/lib/diff-aggregator'
    );
    const data = await aggregatePRViewData(validWorktree, mode);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[/api/pr-view] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch PR view data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { worktree, filePath, action } = body;

    const validationError = validateWorktree(worktree);
    if (validationError) return validationError;

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'Missing filePath' }, { status: 400 });
    }

    if (action === 'mark') {
      const { computeContentHash } = await import(
        '../../../src/features/071-pr-view/lib/content-hash'
      );
      const { markFileReviewed } = await import(
        '../../../src/features/071-pr-view/lib/pr-view-state'
      );
      const hash = await computeContentHash(worktree, filePath);
      markFileReviewed(worktree, filePath, hash);
      return NextResponse.json({ ok: true });
    }

    if (action === 'unmark') {
      const { unmarkFileReviewed } = await import(
        '../../../src/features/071-pr-view/lib/pr-view-state'
      );
      unmarkFileReviewed(worktree, filePath);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[/api/pr-view] POST error:', error);
    return NextResponse.json({ error: 'Failed to update reviewed state' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { worktree } = body;

    const validationError = validateWorktree(worktree);
    if (validationError) return validationError;

    const { clearReviewedState } = await import(
      '../../../src/features/071-pr-view/lib/pr-view-state'
    );
    clearReviewedState(worktree);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[/api/pr-view] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to clear reviewed state' }, { status: 500 });
  }
}
