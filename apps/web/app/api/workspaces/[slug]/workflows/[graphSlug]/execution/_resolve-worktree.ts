/**
 * Shared worktree path validation for workflow REST API routes.
 *
 * Extracted from workflow-execution-actions.ts (FT-002 pattern).
 * Validates worktreePath against registered workspace worktrees.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';

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
