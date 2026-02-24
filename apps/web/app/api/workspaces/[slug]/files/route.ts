/**
 * Files API Route — GET /api/workspaces/[slug]/files
 *
 * Returns directory entries for a worktree path.
 * The worktree was already validated by the browser page server component
 * against workspace ownership. This route only needs path safety checks.
 *
 * Phase 4: File Browser — Plan 041
 */

import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { IFileSystem } from '@chainglass/shared';
import type { NextRequest } from 'next/server';
import { listDirectory } from '../../../../../src/features/041-file-browser/services/directory-listing';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  await params; // consume params (required by Next.js)
  const { searchParams } = new URL(request.url);
  const dir = searchParams.get('dir') ?? '';
  const worktree = searchParams.get('worktree');

  if (!worktree) {
    return Response.json({ error: 'Missing worktree parameter' }, { status: 400 });
  }

  // Security: must be absolute path
  if (!worktree.startsWith('/')) {
    return Response.json({ error: 'Invalid worktree path' }, { status: 400 });
  }

  // Security: reject traversal in dir param
  if (dir.includes('..')) {
    return Response.json({ error: 'Path traversal not allowed' }, { status: 403 });
  }

  try {
    const container = getContainer();
    const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);

    // Check worktree path exists on disk
    if (!(await fileSystem.exists(worktree))) {
      return Response.json({ error: 'Worktree path not found' }, { status: 404 });
    }

    const result = await listDirectory({
      worktreePath: worktree,
      dirPath: dir,
      isGit: true, // safe default — listDirectory falls back to readDir if git fails
      fileSystem,
    });

    return Response.json(result);
  } catch (error) {
    console.error('[/api/workspaces/files] Error:', error);
    return Response.json({ error: 'Failed to list directory' }, { status: 500 });
  }
}
