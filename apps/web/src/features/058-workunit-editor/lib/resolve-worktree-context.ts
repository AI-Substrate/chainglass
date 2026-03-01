/**
 * Worktree context resolution — pure function, no DI dependency.
 * Validates worktreePath against known worktrees from WorkspaceInfo.
 * Returns null if worktreePath is missing or not found (no silent fallback).
 *
 * Plan 062: Work Unit Worktree Resolution.
 */

import type { WorkspaceContext, WorkspaceInfo } from '@chainglass/workflow';

export function resolveWorktreeContext(
  info: WorkspaceInfo,
  worktreePath: string | undefined
): WorkspaceContext | null {
  if (!worktreePath) return null;

  const normalized = worktreePath.replace(/\/+$/, '');
  const wt = info.worktrees.find((w) => w.path.replace(/\/+$/, '') === normalized);
  if (!wt) return null;

  return {
    workspaceSlug: info.slug,
    workspaceName: info.name,
    workspacePath: info.path,
    worktreePath: wt.path,
    worktreeBranch: wt.branch ?? null,
    isMainWorktree: wt.path === info.path,
    hasGit: info.hasGit,
  };
}
