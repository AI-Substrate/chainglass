/**
 * Activity Log API Route — GET /api/activity-log
 *
 * Returns activity log entries for a worktree path.
 * Reads from the JSONL file on disk via readActivityLog().
 *
 * Plan 065: Worktree Activity Log — Phase 3
 */

import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readActivityLog } from '../../../src/features/065-activity-log/lib/activity-log-reader';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const worktree = searchParams.get('worktree');

  if (!worktree) {
    return NextResponse.json({ error: 'Missing worktree parameter' }, { status: 400 });
  }
  if (!worktree.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid worktree path' }, { status: 400 });
  }
  if (worktree.includes('..')) {
    return NextResponse.json({ error: 'Path traversal not allowed' }, { status: 403 });
  }

  try {
    const limit = searchParams.get('limit');
    const since = searchParams.get('since');
    const source = searchParams.get('source');

    const entries = readActivityLog(worktree, {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      since: since ?? undefined,
      source: source ?? undefined,
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error('[/api/activity-log] Error:', error);
    return NextResponse.json({ error: 'Failed to read activity log' }, { status: 500 });
  }
}
