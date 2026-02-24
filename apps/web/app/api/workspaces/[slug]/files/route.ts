/**
 * Files API Route — GET /api/workspaces/[slug]/files
 *
 * Returns directory entries for a workspace path.
 * Supports lazy per-directory loading for file tree expansion.
 *
 * Phase 4: File Browser — Plan 041
 * DYK-P4-01: Route handler for client-side directory fetching
 * DYK-P4-03: Lazy per-directory loading
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { IFileSystem } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import { listDirectory } from '../../../../../src/features/041-file-browser/services/directory-listing';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const dir = searchParams.get('dir') ?? '';
  const worktree = searchParams.get('worktree');

  if (!worktree) {
    return Response.json({ error: 'Missing worktree parameter' }, { status: 400 });
  }

  // Security: reject traversal in dir param
  if (dir.includes('..')) {
    return Response.json({ error: 'Path traversal not allowed' }, { status: 403 });
  }

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );
    const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);

    // Verify workspace exists
    const info = await workspaceService.getInfo(slug);
    if (!info) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Security: validate worktree is owned by this workspace
    const ownedPaths = [info.path, ...(info.worktrees ?? []).map((wt) => wt.path)];
    if (!ownedPaths.includes(worktree)) {
      return Response.json({ error: 'Worktree not owned by workspace' }, { status: 403 });
    }

    const result = await listDirectory({
      worktreePath: worktree,
      dirPath: dir,
      isGit: info.hasGit,
      fileSystem,
    });

    return Response.json(result);
  } catch (error) {
    console.error('[/api/workspaces/files] Error:', error);
    return Response.json({ error: 'Failed to list directory' }, { status: 500 });
  }
}
