/**
 * Shared helpers for workflow REST API routes.
 *
 * - Worktree path validation (FT-002 pattern)
 * - Local token auth (DYK #5 — filesystem-based CLI auth)
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import { findWorkspaceRoot } from '@chainglass/shared/auth-bootstrap-code';
import { readServerInfo } from '@chainglass/shared/event-popper';
import type { IWorkspaceService } from '@chainglass/workflow';
import { timingSafeEqual } from 'node:crypto';

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
 *
 * Plan 084 Phase 5 (post-review F001): the canonical `.chainglass/server.json`
 * location is now `findWorkspaceRoot(process.cwd())` (paired with
 * `bootstrap-code.json` per FX003 / matches `apps/web/instrumentation.ts`
 * write path). Try cwd first (back-compat for legacy launches) then walk up
 * to the workspace root. Length-checked timing-safe compare prevents the
 * RangeError attacker probe (parity with `requireLocalAuth`).
 */
export async function authenticateRequest(request: Request): Promise<{ authenticated: boolean }> {
  // Check X-Local-Token header first (CLI path)
  const localToken = request.headers.get('X-Local-Token');
  if (localToken) {
    let workspaceRoot: string | undefined;
    try {
      workspaceRoot = findWorkspaceRoot(process.cwd());
    } catch {
      workspaceRoot = undefined;
    }
    const serverInfo =
      readServerInfo(process.cwd()) ??
      (workspaceRoot !== undefined && workspaceRoot !== process.cwd()
        ? readServerInfo(workspaceRoot)
        : null);
    const expected = serverInfo?.localToken;
    if (
      typeof expected === 'string' &&
      expected.length > 0 &&
      localToken.length === expected.length
    ) {
      const a = Buffer.from(localToken, 'utf-8');
      const b = Buffer.from(expected, 'utf-8');
      if (timingSafeEqual(a, b)) {
        return { authenticated: true };
      }
    }
  }

  // Fall back to session auth (browser path)
  const session = await auth();
  if (session) {
    return { authenticated: true };
  }

  return { authenticated: false };
}
