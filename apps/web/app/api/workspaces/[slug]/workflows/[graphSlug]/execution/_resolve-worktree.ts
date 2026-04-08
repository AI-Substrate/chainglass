/**
 * Shared helpers for workflow REST API routes.
 *
 * - Worktree path validation (FT-002 pattern)
 * - Local token auth (DYK #5 — filesystem-based CLI auth)
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import { readServerInfo } from '@chainglass/shared/event-popper';
import type { IWorkspaceService } from '@chainglass/workflow';

import { auth } from '@/auth';

import { getContainer } from '../../../../../../../src/lib/bootstrap-singleton';

/** Validate worktreePath against known workspace worktrees. Returns validated path or null. */
export async function resolveValidatedWorktreePath(
  workspaceSlug: string,
  worktreePath: string
): Promise<string | null> {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const info = await workspaceService.getInfo(workspaceSlug);
  if (!info) return null;
  const match = info.worktrees.find((w) => w.path === worktreePath);
  return match ? match.path : null;
}

/**
 * Authenticate via session (browser) OR X-Local-Token header (CLI).
 * DYK #5: Local token is read from .chainglass/server.json — proves filesystem access.
 */
export async function authenticateRequest(request: Request): Promise<{ authenticated: boolean }> {
  // Check X-Local-Token header first (CLI path)
  const localToken = request.headers.get('X-Local-Token');
  if (localToken) {
    const serverInfo = readServerInfo(process.cwd());
    if (serverInfo?.localToken && serverInfo.localToken === localToken) {
      return { authenticated: true };
    }
  }

  // Fall back to session auth (browser path)
  const session = await auth();
  if (session) {
    return { authenticated: true };
  }

  return { authenticated: false };
}
